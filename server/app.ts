import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import type {
  ChildProfile,
  LearningData,
  SessionUser,
} from "../src/domain/model";
import { parseLearningData } from "../src/domain/learning";
import { subjects } from "../src/domain/fixtures";
import { FamilyDatabase } from "./database";
import { childData, mergeChildData } from "./access";
import {
  hashSecret,
  newToken,
  objectBody,
  requiredString,
  tokenDigest,
  validateEmail,
  validatePassword,
  validatePin,
  verifySecret,
} from "./security";
import {
  canReadUpload,
  removeUploadFiles,
  rotateUpload,
  sourceFor,
  storeUpload,
} from "./uploads";
import {
  HttpError,
  type AuthSession,
  type ServerOptions,
  type StoredProfile,
} from "./types";
import { OllamaClient } from "./ai";
import { JobQueue, publicJob } from "./jobs";
import { exportBackup, restoreBackup } from "./backup";
const COOKIE = "revizio_session";
const publicProfile = (
  profile: StoredProfile,
): ChildProfile & { needsPin: boolean } => ({
  id: profile.id,
  name: profile.name,
  grade: profile.grade,
  needsPin: !profile.pinHash,
});
const allowedTypes = [
  "single-choice",
  "true-false",
  "fill-blank",
  "short-answer",
  "problem",
];

export async function createApp(options: ServerOptions = {}) {
  const database = new FamilyDatabase(
    resolve(options.dataDir ?? process.env.REVIZIO_DATA_DIR ?? ".revizio"),
  );
  const ai = options.aiClient ?? new OllamaClient();
  const defaults = {
    baseUrl: (
      options.ollamaUrl ??
      process.env.OLLAMA_BASE_URL ??
      "http://127.0.0.1:11434"
    ).replace(/\/$/, ""),
    model: options.ollamaModel ?? process.env.OLLAMA_MODEL ?? "ministral-3:8b",
  };
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 8 * 1024 * 1024,
    requestTimeout: 120000,
    trustProxy: false,
  });
  const queue = new JobQueue(database, ai);
  const secure = options.secureCookies ?? process.env.SECURE_COOKIES === "true";
  const origins = new Set(
    options.allowedOrigins ??
      (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
  );
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 4, parts: 5 },
  });
  if (options.rateLimit !== false)
    await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  const originAllowed = (request: FastifyRequest, origin: string) =>
    origins.has(origin) ||
    origin === `${request.protocol}://${request.headers.host}`;
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && originAllowed(request, origin)) {
      reply
        .header("Access-Control-Allow-Origin", origin)
        .header("Access-Control-Allow-Credentials", "true")
        .header("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      if (origin && !originAllowed(request, origin))
        throw new HttpError(403, "Cette origine n’est pas autorisée.");
      reply
        .header(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        )
        .header("Access-Control-Allow-Headers", "Content-Type,Authorization");
      return reply.code(204).send();
    }
    if (
      origin &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      !originAllowed(request, origin)
    )
      throw new HttpError(
        403,
        "Cette requête provient d’une origine non autorisée.",
      );
  });
  app.addHook("onSend", async (request, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin");
    if (request.url.startsWith("/api/"))
      reply.header("Cache-Control", "no-store");
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    const status =
      error instanceof HttpError
        ? error.statusCode
        : ((error as { statusCode?: number }).statusCode ?? 500);
    const message =
      error instanceof HttpError
        ? error.message
        : status === 429
          ? "Trop de tentatives. Patientez un instant avant de réessayer."
          : status === 413
            ? "Ce fichier ou ces données sont trop volumineux."
            : status < 500
              ? "Les données envoyées ne sont pas valides."
              : "Le serveur n’a pas pu terminer cette action. Vos données déjà enregistrées sont conservées.";
    if (status >= 500)
      app.log.error(
        { err: error, requestId: request.id },
        "Une action a échoué.",
      );
    reply.code(status).send({
      error: message,
      ...(error instanceof HttpError ? error.extra : {}),
    });
  });
  function auth(request: FastifyRequest, parent = false): AuthSession {
    const bearer = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : undefined;
    const token = bearer ?? request.cookies[COOKIE];
    if (!token)
      throw new HttpError(401, "Connectez-vous pour accéder à votre espace.");
    const session = database.session(tokenDigest(token));
    if (!session)
      throw new HttpError(
        401,
        "Votre session a expiré. Connectez-vous à nouveau.",
      );
    if (parent && session.user.role !== "parent")
      throw new HttpError(403, "Cette action est réservée à un parent.");
    return session;
  }
  function profileFor(user: SessionUser, id?: unknown): StoredProfile {
    const requested =
      typeof id === "string" && id
        ? id
        : (user.profileId ?? database.profiles(user.familyId)[0]?.id);
    if (!requested)
      throw new HttpError(404, "Ajoutez un profil enfant pour commencer.");
    const profile = database.profile(requested);
    if (!profile || profile.familyId !== user.familyId)
      throw new HttpError(404, "Ce profil est introuvable.");
    if (user.role === "child" && requested !== user.profileId)
      throw new HttpError(403, "Ce profil n’est pas le vôtre.");
    return profile;
  }
  function issue(user: SessionUser, reply: FastifyReply) {
    const token = newToken();
    const days = user.role === "parent" ? (options.sessionDays ?? 7) : 1;
    database.createSession(
      tokenDigest(token),
      user,
      new Date(Date.now() + days * 86400000).toISOString(),
    );
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure,
      path: "/",
      maxAge: days * 86400,
    });
    return {
      user,
      profiles: database.profiles(user.familyId).map(publicProfile),
      token,
    };
  }
  function uploadFor(user: SessionUser, id: string) {
    const upload = database.upload(id);
    if (!upload || !canReadUpload(database, user, upload))
      throw new HttpError(404, "Ce document n’est pas disponible.");
    return upload;
  }
  function validSourceIds(
    user: SessionUser,
    profileId: string,
    value: unknown,
  ): string[] {
    if (
      !Array.isArray(value) ||
      value.length > 30 ||
      !value.every((id) => typeof id === "string")
    )
      throw new HttpError(400, "Sélectionnez au maximum 30 documents.");
    for (const id of value) {
      const source = database.upload(id);
      if (
        !source ||
        source.familyId !== user.familyId ||
        source.profileId !== profileId
      )
        throw new HttpError(
          404,
          "Un document n’est pas disponible pour ce profil.",
        );
    }
    return [...new Set(value)] as string[];
  }
  app.get("/api/health", async () => ({
    needsSetup: database.needsSetup(),
    ai: {
      available: await ai.available(
        database.needsSetup()
          ? defaults
          : database.settings(
              database.profiles()[0]?.familyId ??
                String(
                  database.db.prepare("SELECT id FROM families LIMIT 1").get()
                    ?.id,
                ),
            ),
      ),
      model: database.needsSetup()
        ? defaults.model
        : database.settings(
            String(
              database.db.prepare("SELECT id FROM families LIMIT 1").get()?.id,
            ),
          ).model,
    },
    version: process.env.REVIZIO_VERSION ?? "1.0.0",
  }));
  app.post("/api/setup", async (request, reply) => {
    const body = objectBody(request.body);
    const input = {
      parentName: requiredString(body.parentName, "Votre nom", 80),
      email: validateEmail(body.email),
      passwordHash: await hashSecret(validatePassword(body.password)),
      childName: requiredString(body.childName, "Le prénom enfant", 80),
      grade: requiredString(body.grade ?? "5e", "La classe", 32),
      pinHash: await hashSecret(validatePin(body.pin)),
      settings: defaults,
    };
    return issue(database.setup(input), reply);
  });
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = objectBody(request.body);
      const email = validateEmail(body.email);
      const password =
        typeof body.password === "string" && body.password.length <= 256
          ? body.password
          : "";
      const parent = database.parentByEmail(email);
      if (!parent || !(await verifySecret(password, parent.passwordHash)))
        throw new HttpError(
          401,
          "L’adresse e-mail ou le mot de passe est incorrect.",
        );
      const { passwordHash, ...user } = parent;
      return issue(user, reply);
    },
  );
  app.get("/api/profiles", async () => ({
    profiles: database.profiles().map((profile) => ({
      id: profile.id,
      name: profile.name,
      grade: profile.grade,
    })),
  }));
  app.post(
    "/api/child-login",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = objectBody(request.body);
      const profile = database.profile(
        requiredString(body.profileId, "Le profil"),
      );
      const pin = validatePin(body.pin);
      if (!profile || !(await verifySecret(pin, profile.pinHash)))
        throw new HttpError(401, "Le profil ou le code enfant est incorrect.");
      return issue(
        {
          id: profile.id,
          profileId: profile.id,
          familyId: profile.familyId,
          name: profile.name,
          role: "child",
        },
        reply,
      );
    },
  );
  app.get("/api/session", async (request) => {
    const { user } = auth(request);
    return {
      user,
      profiles: database.profiles(user.familyId).map(publicProfile),
    };
  });
  app.post("/api/logout", async (request, reply) => {
    const session = auth(request);
    database.deleteSession(session.tokenHash);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });
  app.post("/api/profiles", async (request) => {
    const { user } = auth(request, true);
    const body = objectBody(request.body);
    if (database.profiles(user.familyId).length >= 12)
      throw new HttpError(400, "Cet espace contient déjà 12 profils.");
    return {
      profile: publicProfile(
        database.addProfile(user.familyId, {
          name: requiredString(body.name, "Le prénom", 80),
          grade: requiredString(body.grade ?? "5e", "La classe", 32),
          pinHash: await hashSecret(validatePin(body.pin)),
        }),
      ),
    };
  });
  app.patch("/api/profiles/:id", async (request) => {
    const { user } = auth(request, true);
    const current = profileFor(user, (request.params as { id: string }).id);
    const body = objectBody(request.body);
    return {
      profile: publicProfile(
        database.updateProfile(current.id, {
          name:
            body.name === undefined
              ? current.name
              : requiredString(body.name, "Le prénom", 80),
          grade:
            body.grade === undefined
              ? current.grade
              : requiredString(body.grade, "La classe", 32),
          ...(body.pin !== undefined
            ? { pinHash: await hashSecret(validatePin(body.pin)) }
            : {}),
        }),
      ),
    };
  });
  app.delete("/api/profiles/:id", async (request) => {
    const { user } = auth(request, true);
    const profile = profileFor(user, (request.params as { id: string }).id);
    const sources = database
      .uploads(user.familyId)
      .filter((upload) => upload.profileId === profile.id);
    if (database.profiles(user.familyId).length <= 1)
      throw new HttpError(
        409,
        "Conservez au moins un profil enfant dans cet espace.",
      );
    database.deleteProfile(profile.id);
    for (const source of sources) await removeUploadFiles(source);
    return { ok: true };
  });
  app.get("/api/data", async (request) => {
    const { user } = auth(request);
    const profile = profileFor(
      user,
      (request.query as { profileId?: string }).profileId,
    );
    const current = database.data(profile.id);
    return {
      ...current,
      data: user.role === "child" ? childData(current.data) : current.data,
    };
  });
  app.put("/api/data", async (request) => {
    const { user } = auth(request);
    const body = objectBody(request.body);
    const profile = profileFor(user, body.profileId);
    if (!Number.isInteger(body.revision) || Number(body.revision) < 0)
      throw new HttpError(400, "La version des données est manquante.");
    let data: LearningData;
    try {
      data = parseLearningData(JSON.stringify(body.data));
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error
          ? error.message
          : "Ces données ne sont pas valides.",
      );
    }
    const current = database.data(profile.id);
    if (current.revision !== Number(body.revision))
      throw new HttpError(
        409,
        "Les données ont changé sur un autre appareil. Votre travail est conservé pour fusion.",
        {
          revision: current.revision,
          data: user.role === "child" ? childData(current.data) : current.data,
        },
      );
    if (user.role === "child") data = mergeChildData(current.data, data, profile.id);
    else
      for (const course of data.courses)
        for (const source of course.sources) {
          const id =
            source.storageId ??
            (source.uri?.startsWith("/api/uploads/")
              ? source.uri.split("/").pop()
              : undefined);
          if (id) {
            const upload = database.upload(id);
            if (
              !upload ||
              upload.familyId !== user.familyId ||
              upload.profileId !== profile.id
            )
              throw new HttpError(
                400,
                "Une pièce jointe n’appartient pas à ce profil.",
              );
            source.uri = `/api/uploads/${id}`;
            source.storageId = id;
            delete source.cachedUri;
          } else if (source.uri && !source.uri.startsWith("/api/"))
            throw new HttpError(
              400,
              "Importez les pièces jointes sur le serveur avant de synchroniser la fiche.",
            );
        }
    try {
      const saved = database.saveData(profile.id, data, Number(body.revision));
      return {
        ...saved,
        data: user.role === "child" ? childData(saved.data) : saved.data,
      };
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 409) {
        const current = database.data(profile.id);
        throw new HttpError(409, error.message, {
          revision: current.revision,
          data: user.role === "child" ? childData(current.data) : current.data,
        });
      }
      throw error;
    }
  });
  app.post("/api/uploads", async (request) => {
    const { user } = auth(request, true);
    const profile = profileFor(
      user,
      (request.query as { profileId?: string }).profileId,
    );
    const file = await request.file();
    if (!file) throw new HttpError(400, "Choisissez un fichier à importer.");
    const buffer = await file.toBuffer();
    return sourceFor(
      await storeUpload(
        database,
        user,
        profile.id,
        buffer,
        file.filename,
        file.mimetype,
      ),
    );
  });
  app.get("/api/uploads/:id", async (request, reply) => {
    const { user } = auth(request);
    const upload = uploadFor(user, (request.params as { id: string }).id);
    const original = (request.query as { original?: string }).original === "1";
    if (original && user.role !== "parent")
      throw new HttpError(403, "L’original est réservé au parent.");
    reply
      .type(original ? "application/octet-stream" : upload.mimeType)
      .header(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(upload.name)}`,
      );
    return reply.send(
      await readFile(original ? upload.originalPath : upload.path),
    );
  });
  app.patch("/api/uploads/:id", async (request) => {
    const { user } = auth(request, true);
    const upload = uploadFor(user, (request.params as { id: string }).id);
    return sourceFor(
      await rotateUpload(
        database,
        upload,
        Number(objectBody(request.body).rotation),
      ),
    );
  });
  app.delete("/api/uploads/:id", async (request) => {
    const { user } = auth(request, true);
    const upload = uploadFor(user, (request.params as { id: string }).id);
    const used = database
      .profiles(user.familyId)
      .some((profile) =>
        database
          .data(profile.id)
          .data.courses.some((course) =>
            course.sources.some(
              (source) => (source.storageId ?? source.id) === upload.id,
            ),
          ),
      );
    if (used)
      throw new HttpError(
        409,
        "Ce document appartient à un cours. Retirez-le de la fiche avant de le supprimer.",
      );
    database.deleteUpload(upload.id);
    await removeUploadFiles(upload);
    return { ok: true };
  });
  app.get("/api/jobs", async (request) => {
    const { user } = auth(request, true);
    const profileId = (request.query as { profileId?: string }).profileId;
    return {
      jobs: database
        .jobs(user.familyId)
        .filter((job) => !profileId || job.profileId === profileId)
        .slice(0, 100)
        .map(publicJob),
    };
  });
  app.get("/api/jobs/:id", async (request) => {
    const { user } = auth(request, true);
    const job = database.job((request.params as { id: string }).id);
    if (!job || job.familyId !== user.familyId)
      throw new HttpError(404, "Cette génération est introuvable.");
    return { job: publicJob(job) };
  });
  app.post("/api/jobs/:id/retry", async (request) => {
    const { user } = auth(request, true);
    const job = database.job((request.params as { id: string }).id);
    if (!job || job.familyId !== user.familyId)
      throw new HttpError(404, "Cette génération est introuvable.");
    return { job: publicJob(queue.retry(job.id)) };
  });
  for (const kind of ["course", "exercises", "english"] as const)
    app.post(`/api/ai/${kind}`, async (request) => {
      const { user } = auth(request, true);
      const body = objectBody(request.body);
      const profile = profileFor(user, body.profileId);
      const payload: Record<string, unknown> = {
        ...body,
        profileId: profile.id,
      };
      if (kind === "course") {
        if (
          !body.existingCourseId &&
          (!subjects.some((subject) => subject.id === body.subjectId) ||
            typeof body.title !== "string" ||
            !body.title.trim())
        )
          throw new HttpError(
            400,
            "Choisissez la matière et le titre du cours.",
          );
        if (
          body.existingCourseId &&
          !database
            .data(profile.id)
            .data.courses.some((course) => course.id === body.existingCourseId)
        )
          throw new HttpError(404, "Le cours à compléter est introuvable.");
        payload.sourceIds = validSourceIds(
          user,
          profile.id,
          body.sourceIds ?? [],
        );
        if (
          body.subjectId !== undefined &&
          !subjects.some((subject) => subject.id === body.subjectId)
        )
          throw new HttpError(400, "Choisissez une matière valide.");
        if (
          body.sourceText !== undefined &&
          (typeof body.sourceText !== "string" ||
            body.sourceText.length > 150000)
        )
          throw new HttpError(400, "Le texte du cours est trop volumineux.");
        if (
          !(payload.sourceIds as string[]).length &&
          !String(body.sourceText ?? "").trim() &&
          !body.existingCourseId
        )
          throw new HttpError(400, "Ajoutez une source ou le texte du cours.");
      }
      if (kind === "english") {
        payload.sourceIds = validSourceIds(
          user,
          profile.id,
          body.sourceIds ?? [],
        );
        if (!(payload.sourceIds as string[]).length)
          throw new HttpError(400, "Ajoutez un document en anglais.");
      }
      if (kind === "exercises") {
        if (
          Array.isArray(body.courseIds) &&
          (new Set(body.courseIds).size !== body.courseIds.length ||
            body.courseIds.length > Number(body.count))
        )
          throw new HttpError(
            400,
            "Prévoyez au moins une question par cours sélectionné, sans doublon.",
          );
        if (
          body.level !== undefined &&
          !["discovery", "practice", "challenge"].includes(String(body.level))
        )
          throw new HttpError(
            400,
            "Choisissez un niveau de difficulté valide.",
          );
        if (
          !Array.isArray(body.courseIds) ||
          !body.courseIds.length ||
          body.courseIds.length > 12 ||
          !body.courseIds.every((id) => typeof id === "string")
        )
          throw new HttpError(400, "Choisissez les cours à utiliser.");
        if (
          !Array.isArray(body.types) ||
          !body.types.length ||
          !body.types.every((type) => allowedTypes.includes(String(type))) ||
          ![5, 10, 15, 20].includes(Number(body.count))
        )
          throw new HttpError(
            400,
            "Choisissez les formats et 5, 10, 15 ou 20 questions.",
          );
        if (body.english) {
          const candidate = {
            ...database.data(profile.id).data,
            english: body.english,
          };
          try {
            parseLearningData(JSON.stringify(candidate));
          } catch {
            throw new HttpError(400, "Le programme d’anglais est invalide.");
          }
        }
      }
      return {
        job: publicJob(queue.enqueue(user.familyId, profile.id, kind, payload)),
      };
    });
  app.patch("/api/account", async (request) => {
    const session = auth(request, true);
    const { user } = session;
    const body = objectBody(request.body);
    const parent = database.parentByEmail(user.email!);
    if (
      !parent ||
      typeof body.currentPassword !== "string" ||
      !(await verifySecret(body.currentPassword, parent.passwordHash))
    )
      throw new HttpError(401, "Confirmez votre mot de passe actuel.");
    const name =
      body.parentName === undefined
        ? user.name
        : requiredString(body.parentName, "Votre nom", 80);
    const email =
      body.email === undefined ? user.email! : validateEmail(body.email);
    const passwordHash =
      body.newPassword === undefined || body.newPassword === ""
        ? parent.passwordHash
        : await hashSecret(validatePassword(body.newPassword));
    database.transaction(() => {
      database.db
        .prepare("UPDATE parents SET name=?,email=?,password_hash=? WHERE id=?")
        .run(name, email, passwordHash, user.id);
      if (passwordHash !== parent.passwordHash)
        database.db
          .prepare("DELETE FROM sessions WHERE parent_id=? AND token_hash<>?")
          .run(user.id, session.tokenHash);
    });
    return {
      user: { ...user, name, email },
      profiles: database.profiles(user.familyId).map(publicProfile),
    };
  });
  app.get("/api/settings", async (request) => {
    const { user } = auth(request, true);
    const settings = database.settings(user.familyId);
    return { ...settings, available: await ai.available(settings) };
  });
  app.patch("/api/settings", async (request) => {
    const { user } = auth(request, true);
    const body = objectBody(request.body);
    const current = database.settings(user.familyId);
    const baseUrl =
      body.baseUrl === undefined
        ? current.baseUrl
        : requiredString(body.baseUrl, "L’adresse Ollama", 500).replace(
            /\/$/,
            "",
          );
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new HttpError(400, "L’adresse du service IA est invalide.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new HttpError(
        400,
        "Utilisez une adresse HTTP(S) sans identifiants ni paramètres.",
      );
    const model =
      body.model === undefined
        ? current.model
        : requiredString(body.model, "Le modèle", 120);
    database.saveSettings(user.familyId, { baseUrl, model });
    return {
      baseUrl,
      model,
      available: await ai.available({ baseUrl, model }),
    };
  });
  app.get("/api/backup", async (request, reply) => {
    const { user } = auth(request, true);
    reply.header(
      "Content-Disposition",
      `attachment; filename="revizio-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return exportBackup(database, user.familyId);
  });
  app.post(
    "/api/backup/restore",
    { bodyLimit: 128 * 1024 * 1024 },
    async (request) => {
      const { user } = auth(request, true);
      const body = objectBody(request.body);
      return restoreBackup(database, user.familyId, body.backup ?? body);
    },
  );
  app.delete("/api/family", async (request) => {
    const { user } = auth(request, true);
    const body = objectBody(request.body);
    const parent = database.parentByEmail(user.email!);
    if (
      !parent ||
      typeof body.password !== "string" ||
      !(await verifySecret(body.password, parent.passwordHash))
    )
      throw new HttpError(
        401,
        "Confirmez votre mot de passe pour supprimer l’espace.",
      );
    const uploads = database.uploads(user.familyId);
    database.deleteFamily(user.familyId);
    for (const upload of uploads) await removeUploadFiles(upload);
    await rm(join(database.dataDir, "backups"), { recursive: true, force: true });
    return { ok: true };
  });
  const staticDir = resolve(options.staticDir ?? "dist");
  if (existsSync(join(staticDir, "index.html"))) {
    await app.register(staticPlugin, {
      root: staticDir,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.url.startsWith("/api/") ||
        /\.[a-z0-9]+(?:\?|$)/i.test(request.url)
      )
        return reply
          .code(404)
          .send({ error: "Cette ressource est introuvable." });
      return reply.sendFile("index.html");
    });
  }
  app.addHook("onClose", async () => {
    await queue.close();
    database.close();
  });
  await app.ready();
  queue.start();
  return app;
}
