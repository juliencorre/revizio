import type { ApiRoutes, ApiRequest, ApiReply } from "./http";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { join } from "node:path";
import type {
  ChildProfile,
  LearningData,
  SessionUser,
} from "../src/domain/model";
import { preserveReviewDecisions } from "../src/domain/answer-reviews";
import { parseLearningData } from "../src/domain/learning";
import { subjects } from "../src/domain/fixtures";
import { isVocabularyLanguage } from "../src/domain/vocabulary";
import {
  FAMILY_LIMITS,
  INITIAL_CHILD_GRADES,
  normalizeChildName,
} from "../src/domain/family";
import type { ServerRuntime } from "./runtime";
import { childData, mergeChildData } from "./access";
import { preserveVocabularyForLegacyClient } from "./vocabulary";
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
import { publicJob } from "./jobs";
import { BackupTransfers, backupManifest } from "./backup-transfer";
import { backupEstimate, exportBackup, restoreBackup } from "./backup";
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

export async function configureServerRoutes(
  app: ApiRoutes,
  runtime: ServerRuntime,
  options: ServerOptions = {},
) {
  const { database, ai, queue, images } = runtime;
  const defaults = runtime.aiDefaults;
  const provider =
    runtime.aiProvider === "anthropic"
      ? "anthropic"
      : (runtime.deployment ?? "local");
  const managedAi =
    provider === "anthropic" || runtime.deployment === "cloudflare";
  const aiSettings = (familyId: string) =>
    managedAi ? defaults : database.settings(familyId);
  const secure = options.secureCookies ?? process.env.SECURE_COOKIES === "true";
  const origins = new Set(
    options.allowedOrigins ??
      (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
  );
  const originAllowed = (request: ApiRequest, origin: string) =>
    origins.has(origin) ||
    origin === `${request.protocol}://${request.headers.host}`;
  app.onRequest(async (request, reply) => {
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
  app.onSend(async (request, reply, payload) => {
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
  function auth(request: ApiRequest, parent = false): AuthSession {
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
  function issue(user: SessionUser, reply: ApiReply) {
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
          : aiSettings(
              database.profiles()[0]?.familyId ??
                String(
                  database.db.prepare("SELECT id FROM families LIMIT 1").get()
                    ?.id,
                ),
            ),
      ),
      model: database.needsSetup()
        ? defaults.model
        : aiSettings(
            String(
              database.db.prepare("SELECT id FROM families LIMIT 1").get()?.id,
            ),
          ).model,
    },
    version: process.env.REVIZIO_VERSION ?? "1.0.0",
    deployment: runtime.deployment ?? "local",
    setupProtected: runtime.deployment === "cloudflare" || !!runtime.setupToken,
    demoAvailable:
      options.allowDemo === true && runtime.deployment !== "cloudflare",
    familyLimits: FAMILY_LIMITS,
  }));
  app.post("/api/setup", async (request, reply) => {
    const body = objectBody(request.body);
    if (
      (runtime.deployment === "cloudflare" || !!runtime.setupToken) &&
      (!runtime.setupToken ||
        typeof body.setupCode !== "string" ||
        body.setupCode.length > 256 ||
        !timingSafeEqual(
          Buffer.from(tokenDigest(body.setupCode)),
          Buffer.from(tokenDigest(runtime.setupToken)),
        ))
    )
      throw new HttpError(
        403,
        "Votre invitation familiale est absente ou incorrecte. Ouvrez votre lien privé pour créer votre espace.",
      );
    let children:
      { name: string; grade: string; pinHash: string }[] | undefined;
    if (body.children !== undefined) {
      if (
        !Array.isArray(body.children) ||
        body.children.length !== FAMILY_LIMITS.children
      )
        throw new HttpError(400, "Créez les deux profils enfants : CM1 et 5e.");
      const entries = body.children.map((value, index) => {
        const child = objectBody(value);
        return {
          name: requiredString(child.name, "Le prénom enfant", 80),
          grade: INITIAL_CHILD_GRADES[index],
          pin: validatePin(child.pin),
        };
      });
      if (
        normalizeChildName(entries[0].name) ===
        normalizeChildName(entries[1].name)
      )
        throw new HttpError(
          400,
          "Chaque enfant doit avoir un prénom de connexion distinct.",
        );
      children = await Promise.all(
        entries.map(async ({ pin, ...child }) => ({
          ...child,
          pinHash: await hashSecret(pin),
        })),
      );
    }
    const input = {
      parentName: requiredString(body.parentName, "Votre nom", 80),
      email: validateEmail(body.email),
      passwordHash: await hashSecret(validatePassword(body.password)),
      childName:
        children?.[0].name ??
        requiredString(body.childName, "Le prénom enfant", 80),
      grade:
        children?.[0].grade ??
        requiredString(body.grade ?? "CM1", "La classe", 32),
      pinHash:
        children?.[0].pinHash ?? (await hashSecret(validatePin(body.pin))),
      children,
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
  app.get("/api/profiles", async (request) => {
    const { user } = auth(request);
    return {
      profiles: database.profiles(user.familyId).map((profile) => ({
        id: profile.id,
        name: profile.name,
        grade: profile.grade,
      })),
    };
  });
  app.post(
    "/api/child-login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = objectBody(request.body);
      const profile =
        typeof body.childName === "string"
          ? database
              .profiles()
              .find(
                (profile) =>
                  normalizeChildName(profile.name) ===
                  normalizeChildName(
                    requiredString(body.childName, "Le prénom", 80),
                  ),
              )
          : database.profile(requiredString(body.profileId, "Le profil"));
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
    return {
      profile: publicProfile(
        database.addProfile(user.familyId, {
          name: requiredString(body.name, "Le prénom", 80),
          grade: requiredString(
            body.grade ??
              (database.profiles(user.familyId).some((p) => p.grade === "CM1")
                ? "5e"
                : "CM1"),
            "La classe",
            32,
          ),
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
    for (const source of sources) await removeUploadFiles(database, source);
    return { ok: true };
  });
  app.get("/api/data", async (request) => {
    const { user } = auth(request);
    const profile = profileFor(
      user,
      (request.query as { profileId?: string }).profileId,
    );
    const since = (request.query as { since?: string }).since;
    if (since !== undefined && /^\d+$/.test(since)) {
      const row = database.db
        .prepare("SELECT revision FROM learning WHERE profile_id=?")
        .get(profile.id);
      if (row && Number(row.revision) === Number(since))
        return { revision: Number(since), unchanged: true };
    }
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
    if (
      user.role === "parent" &&
      (current.data.answerReviews || data.answerReviews)
    )
      data.answerReviews = preserveReviewDecisions(
        current.data.answerReviews,
        data.answerReviews,
      );
    data = preserveVocabularyForLegacyClient(
      current.data,
      data,
      body.data as Record<string, unknown>,
      user.role === "child",
    );
    if (user.role === "child")
      data = mergeChildData(current.data, data, profile.id);
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
        images,
      ),
    );
  });
  app.get("/api/uploads/:id", async (request, reply) => {
    const { user } = auth(request);
    const upload = uploadFor(user, (request.params as { id: string }).id);
    const query = request.query as { original?: string; page?: string };
    const original = query.original === "1";
    if (original && user.role !== "parent")
      throw new HttpError(403, "L’original est réservé au parent.");
    reply
      .type(
        original
          ? "application/octet-stream"
          : upload.mimeType === "text/plain"
            ? "text/plain; charset=utf-8"
            : upload.mimeType,
      )
      .header(
        "Content-Disposition",
        `${original ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(upload.name)}`,
      );
    const bytes = await database.files.read(
      original ? upload.originalPath : upload.path,
    );
    const expected = (request.query as { sha256?: string }).sha256;
    if (
      expected &&
      createHash("sha256").update(bytes).digest("hex") !== expected
    )
      throw new HttpError(
        409,
        "Le document a changé pendant la sauvegarde. Relancez l’export.",
      );
    if (query.page === undefined) return reply.send(bytes);
    const page = Number(query.page);
    if (
      original ||
      upload.mimeType !== "application/pdf" ||
      !Number.isSafeInteger(page) ||
      page < 1
    )
      throw new HttpError(400, "Choisissez une page valide du PDF.");
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(Uint8Array.from(bytes));
    try {
      if (page > pdf.numPages)
        throw new HttpError(404, "Cette page est introuvable.");
      // Send only the cited page. Embedded PDF viewers on iPad can ignore URL fragments.
      const result = await pdf.extractPages([
        { document: null, includePages: [page - 1] },
      ]);
      return reply.send(Buffer.from(result));
    } finally {
      await pdf.loadingTask.destroy();
    }
  });
  app.patch("/api/uploads/:id", async (request) => {
    const { user } = auth(request, true);
    const upload = uploadFor(user, (request.params as { id: string }).id);
    return sourceFor(
      await rotateUpload(
        database,
        upload,
        Number(objectBody(request.body).rotation),
        images,
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
    await removeUploadFiles(database, upload);
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
  for (const kind of ["course", "exercises", "english", "vocabulary"] as const)
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
      if (kind === "vocabulary") {
        if (!isVocabularyLanguage(body.subjectId))
          throw new HttpError(400, "Choisissez la langue de la liste.");
        payload.listId = requiredString(
          body.listId,
          "La liste de vocabulaire",
          160,
        );
        if (body.title)
          payload.title = requiredString(body.title, "Le titre", 160);
        const sourceIds = validSourceIds(user, profile.id, body.sourceIds);
        if (!sourceIds.length)
          throw new HttpError(
            400,
            "Ajoutez au moins une image ou un fichier de vocabulaire.",
          );
        payload.sourceIds = sourceIds;
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
  app.get("/api/parents", async (request) => {
    const { user } = auth(request, true);
    return { parents: database.parents(user.familyId) };
  });
  app.post("/api/parents", async (request) => {
    const { user } = auth(request, true);
    const body = objectBody(request.body);
    const current = database.parentByEmail(user.email!);
    if (
      !current ||
      typeof body.currentPassword !== "string" ||
      body.currentPassword.length > 256 ||
      !(await verifySecret(body.currentPassword, current.passwordHash))
    )
      throw new HttpError(401, "Confirmez votre mot de passe actuel.");
    const input = {
      name: requiredString(body.name, "Le nom du conjoint", 80),
      email: validateEmail(body.email),
      passwordHash: await hashSecret(validatePassword(body.password)),
    };
    return {
      parent: database.transaction(() =>
        database.addParent(user.familyId, input),
      ),
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
      const existing = database.parentByEmail(email);
      if (existing && existing.id !== user.id)
        throw new HttpError(409, "Cette adresse e-mail est déjà utilisée.");
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
    const settings = aiSettings(user.familyId);
    return {
      ...settings,
      provider,
      available: await ai.available(settings),
    };
  });
  app.patch("/api/settings", async (request) => {
    const { user } = auth(request, true);
    const body = objectBody(request.body);
    const current = database.settings(user.familyId);
    if (managedAi) {
      // Hosted inference settings are controlled by the server, never a client URL.
      return {
        ...defaults,
        provider,
        available: await ai.available(defaults),
      };
    }
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
  const backups = new BackupTransfers(database);
  app.get("/api/backup/estimate", async (request) => {
    const { user } = auth(request, true);
    return {
      ...(await backupEstimate(database, user.familyId)),
      jsonLimit: runtime.backupLimitBytes ?? 100 * 1024 * 1024,
      jsonBodyLimit: runtime.backupBodyLimitBytes ?? 144 * 1024 * 1024,
    };
  });
  app.get("/api/backup/manifest", async (request) => {
    const { user } = auth(request, true);
    return backupManifest(database, user.familyId);
  });
  app.post("/api/backup/transfers", async (request) =>
    backups.start(
      auth(request, true).user.familyId,
      (request.body as { bytes?: number } | undefined)?.bytes,
    ),
  );
  app.post("/api/backup/transfers/:id/parts/:part", async (request) => {
    const { user } = auth(request, true);
    const { id, part } = request.params as { id: string; part: string };
    const file = await request.file();
    if (!file) throw new HttpError(400, "Le fichier est manquant.");
    const hash = (request.query as { sha256?: string }).sha256 || "";
    return backups.add(id, user.familyId, part, hash, await file.toBuffer());
  });
  app.post(
    "/api/backup/transfers/:id/finish",
    { bodyLimit: 10 * 1024 * 1024 },
    async (request) => {
      const { user } = auth(request, true);
      return backups.finish(
        (request.params as { id: string }).id,
        user.familyId,
        request.body,
        images,
        runtime.backupLimitBytes,
      );
    },
  );
  app.delete("/api/backup/transfers/:id", async (request) =>
    backups.cancel(
      (request.params as { id: string }).id,
      auth(request, true).user.familyId,
    ),
  );
  app.get("/api/backup", async (request, reply) => {
    const { user } = auth(request, true);
    reply.header(
      "Content-Disposition",
      `attachment; filename="revizio-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return exportBackup(database, user.familyId, runtime.backupLimitBytes);
  });
  app.post(
    "/api/backup/restore",
    { bodyLimit: runtime.backupBodyLimitBytes ?? 144 * 1024 * 1024 },
    async (request) => {
      const { user } = auth(request, true);
      const body = objectBody(request.body);
      return restoreBackup(
        database,
        user.familyId,
        body.backup ?? body,
        images,
        runtime.backupLimitBytes,
      );
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
    database.db
      .prepare(
        "DELETE FROM backup_parts WHERE transfer IN (SELECT id FROM backup_transfers WHERE family=?)",
      )
      .run(user.familyId);
    database.db
      .prepare("DELETE FROM backup_transfers WHERE family=?")
      .run(user.familyId);
    database.deleteFamily(user.familyId);
    for (const upload of uploads) await removeUploadFiles(database, upload);
    await database.files.removeDirectory(join(database.dataDir, "restores"));
    await database.files.removeDirectory(join(database.dataDir, "backups"));
    return { ok: true };
  });
  app.onClose(async () => {
    await queue.close();
    database.close();
  });
  queue.start();
}
