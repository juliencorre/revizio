import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import type { AiClient, AiMessage, AiSettings } from "../../server/types";
import { createApp } from "../../server/app";
import { initialData } from "../../src/domain/fixtures";
import { clone, startAttemptInData } from "../../src/domain/learning";
import type { Course, LearningData } from "../../src/domain/model";

class FixtureAi implements AiClient {
  failNext = false;
  available = async () => true;
  async json(
    _settings: AiSettings,
    _messages: AiMessage[],
    schema: Record<string, unknown>,
  ): Promise<unknown> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Erreur IA de test, relance possible.");
    }
    const props = schema.properties as Record<string, unknown>;
    if (props.text)
      return {
        text: "Un nombre relatif est positif, négatif ou nul. Pour additionner deux nombres de même signe, on additionne les distances à zéro et on garde le signe.",
        uncertain: false,
      };
    if (props.sections)
      return {
        title: "Les nombres relatifs",
        description: "Une fiche préparée à partir du cours fourni.",
        sections: [
          {
            kind: "essential",
            title: "L’essentiel",
            content: "Un nombre relatif est positif, négatif ou nul.",
            example: "−2 < 0 < +3",
            sourceRefs: [],
          },
        ],
      };
    if (props.questions) {
      const questionSet = props.questions as {
        minItems: number;
        items: { properties: { type: { enum: string[] } } };
      };
      return {
        questions: Array.from({ length: questionSet.minItems }, (_, index) => {
          const type =
            questionSet.items.properties.type.enum[
              index % questionSet.items.properties.type.enum.length
            ];
          const choice = ["single-choice", "true-false"].includes(type);
          return {
            type,
            prompt: `Question ${index + 1} : combien vaut 2 + 3 ?`,
            choices:
              type === "true-false"
                ? ["Vrai", "Faux"]
                : choice
                  ? ["4", "5"]
                  : [],
            correctChoiceIndex: 1,
            expectedAnswers: choice ? [] : ["5"],
            explanation: "2 + 3 = 5.",
            hint: "Avance de trois unités.",
            concept: "Addition",
            rubric: "Réponse finale 5",
            englishText: [],
            sourceRefs: [],
          };
        }),
      };
    }
    return {
      words: [{ en: "castle", fr: "château" }],
      verbs: [],
      tenses: ["Prétérit simple"],
      toolWords: ["the"],
    };
  }
}
let app: FastifyInstance, dir: string, ai: FixtureAi;
const password = "Parent-testing-42!";
async function setup() {
  const response = await app.inject({
    method: "POST",
    url: "/api/setup",
    payload: {
      parentName: "Parent test",
      email: "parent@example.test",
      password,
      childName: "Camille",
      grade: "5e",
      pin: "4268",
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json() as {
    token: string;
    user: { id: string; familyId: string };
    profiles: { id: string; name: string }[];
  };
}
const bearer = (token: string) => ({ authorization: "Bearer " + token });
async function envelope(token: string, profileId?: string) {
  const r = await app.inject({
    url: "/api/data" + (profileId ? "?profileId=" + profileId : ""),
    headers: bearer(token),
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as { data: LearningData; revision: number };
}
async function save(
  token: string,
  data: LearningData,
  revision: number,
  profileId?: string,
) {
  return app.inject({
    method: "PUT",
    url: "/api/data",
    headers: bearer(token),
    payload: { data, revision, profileId },
  });
}
async function child(profileId: string, pin = "4268") {
  const r = await app.inject({
    method: "POST",
    url: "/api/child-login",
    payload: { profileId, pin },
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json().token as string;
}
async function upload(
  token: string,
  profileId: string,
  name = "page.png",
  bytes?: Buffer,
) {
  const png =
    bytes ??
    (await sharp({
      create: { width: 32, height: 64, channels: 3, background: "#EEE" },
    })
      .png()
      .toBuffer());
  const boundary = "revizio-test-boundary";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: "POST",
    url: "/api/uploads?profileId=" + profileId,
    headers: {
      ...bearer(token),
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload,
  });
}
async function job(token: string, id: string) {
  let result: Record<string, unknown> = {};
  await vi.waitFor(
    async () => {
      const r = await app.inject({
        url: "/api/jobs/" + id,
        headers: bearer(token),
      });
      expect(r.statusCode).toBe(200);
      result = r.json().job;
      expect(["succeeded", "failed"]).toContain(result.status);
    },
    { timeout: 3000, interval: 15 },
  );
  return result;
}
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "revizio-server-"));
  ai = new FixtureAi();
  app = await createApp({
    dataDir: dir,
    staticDir: join(dir, "no-static"),
    aiClient: ai,
    rateLimit: false,
  });
});
afterEach(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

describe("compte et sessions serveur", () => {
  it("crée une famille vide avec session HttpOnly, sans stocker les mots de passe en clair", async () => {
    const health = await app.inject("/api/health");
    expect(health.json().needsSetup).toBe(true);
    const r = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: {
        parentName: "Parent test",
        email: "parent@example.test",
        password,
        childName: "Camille",
        grade: "5e",
        pin: "4268",
      },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers["set-cookie"]).toContain("HttpOnly");
    expect(r.headers["set-cookie"]).toContain("SameSite=Strict");
    const session = r.json();
    const data = await envelope(session.token);
    expect(data.data.courses).toEqual([]);
    expect(data.data.series).toEqual([]);
    expect((await app.inject("/api/health")).json().needsSetup).toBe(false);
    const bytes = await readFile(join(dir, "family.sqlite"));
    expect(bytes.includes(Buffer.from(password))).toBe(false);
    expect((await app.inject("/api/profiles")).json().profiles[0]).toEqual({
      id: session.profiles[0].id,
      name: "Camille",
      grade: "5e",
    });
  });
  it("refuse une seconde création et un mauvais mot de passe, puis révoque une session déconnectée", async () => {
    const session = await setup();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/setup",
          payload: {
            parentName: "Autre",
            email: "other@example.test",
            password,
            childName: "Autre",
            grade: "5e",
            pin: "4268",
          },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          payload: { email: "parent@example.test", password: "wrong" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/logout",
          headers: bearer(session.token),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: "/api/session",
          headers: bearer(session.token),
        })
      ).statusCode,
    ).toBe(401);
  });
  it("retrouve la famille et les sessions après redémarrage du serveur", async () => {
    const session = await setup();
    await app.close();
    app = await createApp({ dataDir: dir, aiClient: ai, rateLimit: false });
    const r = await app.inject({
      url: "/api/session",
      headers: bearer(session.token),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().user.name).toBe("Parent test");
  });
  it("bloque les mutations cross-origin et protège les routes parent", async () => {
    const session = await setup();
    const token = await child(session.profiles[0].id);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/logout",
          headers: {
            ...bearer(session.token),
            origin: "https://malicious.test",
          },
        })
      ).statusCode,
    ).toBe(403);
    for (const url of ["/api/settings", "/api/backup", "/api/jobs"])
      expect(
        (await app.inject({ url, headers: bearer(token) })).statusCode,
      ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/ai/course",
          headers: bearer(token),
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  it("isole les profils et refuse de supprimer le dernier", async () => {
    const session = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/api/profiles",
      headers: bearer(session.token),
      payload: { name: "Noé", grade: "6e", pin: "7531" },
    });
    expect(created.statusCode, created.body).toBe(200);
    const second = created.json().profile;
    const token = await child(session.profiles[0].id);
    expect(
      (
        await app.inject({
          url: "/api/data?profileId=" + second.id,
          headers: bearer(token),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/profiles/" + second.id,
          headers: bearer(token),
          payload: { pin: "1111" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/profiles/" + second.id,
          headers: bearer(session.token),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/profiles/" + session.profiles[0].id,
          headers: bearer(session.token),
        })
      ).statusCode,
    ).toBe(409);
  });
  it("change un code enfant et invalide ses anciennes sessions", async () => {
    const session = await setup();
    const token = await child(session.profiles[0].id);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/profiles/" + session.profiles[0].id,
          headers: bearer(session.token),
          payload: { pin: "9876" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/session", headers: bearer(token) }))
        .statusCode,
    ).toBe(401);
    await child(session.profiles[0].id, "9876");
  });
  it("change le mot de passe parent en vérifiant le précédent", async () => {
    const session = await setup();
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/account",
          headers: bearer(session.token),
          payload: {
            currentPassword: "bad",
            newPassword: "Updated-password-42",
          },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/account",
          headers: bearer(session.token),
          payload: {
            parentName: "Nouveau parent",
            currentPassword: password,
            newPassword: "Updated-password-42",
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          payload: { email: "parent@example.test", password },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          payload: {
            email: "parent@example.test",
            password: "Updated-password-42",
          },
        })
      ).statusCode,
    ).toBe(200);
  });
});

describe("contenus publiés, réponses et concurrence", () => {
  it("filtre les brouillons pour l’enfant et refuse une modification de contenu", async () => {
    const session = await setup();
    const data = clone(initialData);
    expect((await save(session.token, data, 0)).statusCode).toBe(200);
    const token = await child(session.profiles[0].id);
    const childView = await envelope(token);
    expect(childView.data.courses.every((c) => c.status === "published")).toBe(
      true,
    );
    expect(childView.data.courses).toHaveLength(6);
    childView.data.courses[0].title = "Modification interdite";
    expect(
      (await save(token, childView.data, childView.revision)).statusCode,
    ).toBe(403);
  });
  it("recalcule les corrections côté serveur et protège le snapshot d’une tentative", async () => {
    const session = await setup();
    await save(session.token, clone(initialData), 0);
    const token = await child(session.profiles[0].id);
    let current = await envelope(token);
    const outcome = startAttemptInData(
      current.data,
      "maths-relative-practice",
      "server-attempt",
      new Date().toISOString(),
    );
    const attempt = outcome.data.attempts[0],
      question = attempt.questions[0];
    attempt.answers = [
      {
        questionId: question.id,
        choiceId: "0",
        isCorrect: true,
        usedHint: false,
        answeredAt: new Date().toISOString(),
      },
    ];
    const saved = await save(token, outcome.data, current.revision);
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().data.attempts[0].answers[0].isCorrect).toBe(false);
    for (const patch of [
      { mode: "exam", deadlineAt: new Date(Date.now() + 60000).toISOString() },
      { deadlineAt: new Date(Date.now() + 60000).toISOString() },
      { planId: "invented", stepId: "invented" },
    ]) {
      const immutable = await envelope(token);
      Object.assign(immutable.data.attempts[0], patch);
      expect(
        (await save(token, immutable.data, immutable.revision)).statusCode,
      ).toBe(403);
    }
    current = await envelope(token);
    current.data.attempts[0].questions[0].correctChoiceId = "0";
    expect((await save(token, current.data, current.revision)).statusCode).toBe(
      403,
    );
    const wrongPlan = await envelope(token);
    const second = startAttemptInData(
      wrongPlan.data,
      "maths-relative-practice",
      "invalid-plan-attempt",
      new Date().toISOString(),
      true,
    );
    Object.assign(second.data.attempts.at(-1)!, {
      planId: "invented",
      stepId: "invented",
    });
    expect(
      (await save(token, second.data, wrongPlan.revision)).statusCode,
    ).toBe(403);
  });
  it("répond 409 avec les données accessibles au profil lors d’un conflit", async () => {
    const session = await setup();
    await save(session.token, clone(initialData), 0);
    const token = await child(session.profiles[0].id);
    const old = await envelope(token);
    const latest = await envelope(session.token);
    latest.data.courses[0].title = "Titre changé par le parent";
    await save(session.token, latest.data, latest.revision);
    const conflict = await save(token, old.data, old.revision);
    expect(conflict.statusCode, conflict.body).toBe(409);
    expect(conflict.json().revision).toBe(2);
    expect(
      conflict
        .json()
        .data.courses.every(
          (c: { status: string }) => c.status === "published",
        ),
    ).toBe(true);
  });
  it("accepte une séance d’une étape publiée et refuse ensuite de changer son contexte", async () => {
    const session = await setup();
    const data = clone(initialData),
      series = data.series.find(
        (item) => item.id === "maths-relative-practice",
      )!;
    data.plans = [
      {
        id: "plan-test",
        title: "Mon contrôle",
        subjectId: series.subjectId,
        examDate: "2026-12-02",
        courseIds: series.courseIds,
        dailyMinutes: 20,
        status: "published",
        steps: [
          {
            id: "step-test",
            date: "2026-12-01",
            title: "S’entraîner",
            kind: "practice",
            minutes: 20,
            courseIds: series.courseIds,
            seriesId: series.id,
          },
        ],
      },
    ];
    expect((await save(session.token, data, 0)).statusCode).toBe(200);
    const token = await child(session.profiles[0].id),
      current = await envelope(token);
    const next = startAttemptInData(
      current.data,
      series.id,
      "plan-attempt",
      new Date().toISOString(),
      true,
    );
    Object.assign(next.data.attempts.at(-1)!, {
      planId: "plan-test",
      stepId: "step-test",
    });
    expect((await save(token, next.data, current.revision)).statusCode).toBe(
      200,
    );
    const saved = await envelope(token);
    Object.assign(saved.data.attempts.at(-1)!, { stepId: "another-step" });
    expect((await save(token, saved.data, saved.revision)).statusCode).toBe(
      403,
    );
  });
});

describe("fichiers privés et sauvegarde", () => {
  it("conserve une image normalisée, la fait pivoter et l’ouvre à l’enfant après publication seulement", async () => {
    const session = await setup();
    const response = await upload(session.token, session.profiles[0].id);
    expect(response.statusCode, response.body).toBe(200);
    const source = response.json();
    expect(source.mimeType).toBe("image/png");
    expect((await app.inject(source.uri)).statusCode).toBe(401);
    const token = await child(session.profiles[0].id);
    expect(
      (await app.inject({ url: source.uri, headers: bearer(token) }))
        .statusCode,
    ).toBe(404);
    const data = clone(initialData);
    data.courses[0].sources = [source];
    await save(session.token, data, 0);
    expect(
      (await app.inject({ url: source.uri, headers: bearer(token) }))
        .statusCode,
    ).toBe(200);
    const rotated = await app.inject({
      method: "PATCH",
      url: source.uri,
      headers: bearer(session.token),
      payload: { rotation: 90 },
    });
    expect(rotated.statusCode, rotated.body).toBe(200);
    const image = await app.inject({
      url: source.uri,
      headers: bearer(session.token),
    });
    const meta = await sharp(image.rawPayload).metadata();
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(32);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: source.uri,
          headers: bearer(session.token),
        })
      ).statusCode,
    ).toBe(409);
  });
  it("refuse un fichier déguisé en image", async () => {
    const session = await setup();
    expect(
      (
        await upload(
          session.token,
          session.profiles[0].id,
          "fake.png",
          Buffer.from("<script>alert(1)</script>"),
        )
      ).statusCode,
    ).toBe(415);
  });
  it("exporte et restaure données et documents sans secrets ni chemins arbitraires", async () => {
    const session = await setup();
    const source = (await upload(session.token, session.profiles[0].id)).json();
    const data = clone(initialData);
    data.courses[0].sources = [source];
    await save(session.token, data, 0);
    const exported = await app.inject({
      url: "/api/backup",
      headers: bearer(session.token),
    });
    expect(exported.statusCode, exported.body).toBe(200);
    const backup = exported.json();
    expect(backup.format).toBe("revizio-backup");
    expect(JSON.stringify(backup)).not.toContain(password);
    expect(JSON.stringify(backup)).not.toContain("passwordHash");
    expect(backup.profiles[0]).not.toHaveProperty("pinHash");
    const current = await envelope(session.token);
    current.data.courses[0].title = "À remplacer";
    await save(session.token, current.data, current.revision);
    const restored = await app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: bearer(session.token),
      payload: { backup },
    });
    expect(restored.statusCode, restored.body).toBe(200);
    expect((await envelope(session.token)).data.courses[0].title).toBe(
      data.courses[0].title,
    );
    expect(
      (await app.inject({ url: source.uri, headers: bearer(session.token) }))
        .statusCode,
    ).toBe(200);
    await child(session.profiles[0].id);
    backup.uploads[0].id = "../../escape";
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/backup/restore",
          headers: bearer(session.token),
          payload: { backup },
        })
      ).statusCode,
    ).toBe(400);
    expect((await envelope(session.token)).data.courses[0].title).toBe(
      data.courses[0].title,
    );
  });
  it("supprime l’espace et ses archives privées uniquement après vérification du mot de passe", async () => {
    const session = await setup(),
      headers = bearer(session.token);
    const source = (await upload(session.token, session.profiles[0].id)).json();
    const backup = (await app.inject({ url: "/api/backup", headers })).json();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/backup/restore",
          headers,
          payload: { backup },
        })
      ).statusCode,
    ).toBe(200);
    expect((await readdir(join(dir, "backups"))).length).toBe(1);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/family",
          headers,
          payload: { password: "wrong-password" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/family",
          headers,
          payload: { password },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject("/api/health")).json().needsSetup).toBe(true);
    expect((await app.inject({ url: source.uri, headers })).statusCode).toBe(
      401,
    );
    await expect(readdir(join(dir, "backups"))).rejects.toHaveProperty(
      "code",
      "ENOENT",
    );
  });
});

describe("jobs IA asynchrones — moteur de test explicite", () => {
  it("régénère depuis l’OCR corrigé, lit les nouveaux fichiers et conserve la version du brouillon", async () => {
    const session = await setup(),
      headers = bearer(session.token);
    const first = (
      await upload(session.token, session.profiles[0].id, "premier.png")
    ).json();
    const appended = (
      await upload(session.token, session.profiles[0].id, "nouveau.png")
    ).json();
    const corrected =
      "Texte corrigé par le parent : pour additionner deux nombres de même signe, on additionne les distances à zéro et on conserve leur signe commun.";
    const newText =
      "Un document ajouté indique que pour des signes contraires on soustrait les distances à zéro et on garde le signe du nombre le plus éloigné de zéro.";
    const sourceText = `[premier.png · page 1 · source ${first.id}]\n${corrected}`;
    const state = await envelope(session.token);
    state.data.courses.push({
      id: "corrected-draft",
      subjectId: "maths",
      title: "Ma fiche corrigée",
      description: "",
      status: "draft",
      updatedAt: new Date().toISOString(),
      revision: 1,
      sections: [],
      sources: [
        { ...first, page: 1, extractedText: corrected, uncertain: false },
      ],
      sourceText,
    });
    expect(
      (await save(session.token, state.data, state.revision)).statusCode,
    ).toBe(200);
    let visionCalls = 0;
    const generations: {
      sourceText: string;
      pages: { sourceId: string; page: number; text: string }[];
    }[] = [];
    vi.spyOn(ai, "json").mockImplementation(
      async (_settings, messages, schema) => {
        const properties = schema.properties as Record<string, unknown>;
        if (properties.text) {
          visionCalls++;
          return { text: newText, uncertain: false };
        }
        const input = JSON.parse(
          messages.find((message) => message.role === "user")!.content,
        );
        generations.push(input);
        const page = input.pages[0];
        return {
          title: input.title,
          description: "",
          sections: [
            {
              kind: "essential",
              title: "L’essentiel",
              content: page.text,
              example: "",
              sourceRefs: [
                {
                  sourceId: page.sourceId,
                  page: page.page,
                  excerpt: page.text,
                },
              ],
            },
          ],
        };
      },
    );
    async function regenerate(text: string) {
      const response = await app.inject({
        method: "POST",
        url: "/api/ai/course",
        headers,
        payload: {
          profileId: session.profiles[0].id,
          existingCourseId: "corrected-draft",
          subjectId: "maths",
          title: "Ma fiche corrigée",
          sourceIds: [first.id, appended.id],
          sourceText: text,
        },
      });
      expect(response.statusCode, response.body).toBe(200);
      const outcome = await job(session.token, response.json().job.id);
      expect(outcome.status, String(outcome.error)).toBe("succeeded");
      return (outcome.result as { course: Course }).course;
    }
    const proposal = await regenerate(sourceText);
    expect(visionCalls).toBe(1);
    expect(generations[0].pages).toEqual([
      {
        sourceId: first.id,
        name: "premier.png",
        page: 1,
        text: corrected,
        uncertain: false,
      },
      {
        sourceId: appended.id,
        name: "nouveau.png",
        page: 1,
        text: newText,
        uncertain: false,
      },
    ]);
    expect(proposal.sourceText!.split(corrected)).toHaveLength(2);
    expect(proposal.sourceText!.split(newText)).toHaveLength(2);
    expect(proposal).toMatchObject({
      title: "Ma fiche corrigée",
      status: "draft",
      revision: 1,
    });
    expect(proposal.originId).toBeUndefined();
    expect(proposal.sources.map((source) => source.extractedText)).toEqual([
      corrected,
      newText,
    ]);
    const unchanged = await envelope(session.token);
    expect(unchanged.data.courses[0]).toEqual(state.data.courses[0]);
    // Adoption is explicit, then regenerating the same draft performs no OCR.
    unchanged.data.courses[0] = { ...unchanged.data.courses[0], ...proposal };
    expect(
      (await save(session.token, unchanged.data, unchanged.revision))
        .statusCode,
    ).toBe(200);
    const regenerated = await regenerate(proposal.sourceText!);
    expect(visionCalls).toBe(1);
    expect(regenerated.sourceText).toBe(proposal.sourceText);
    expect(regenerated.revision).toBe(1);
    // A published original is never modified; only its proposed revision grows.
    const published = await envelope(session.token);
    published.data.courses[0].status = "published";
    expect(
      (await save(session.token, published.data, published.revision))
        .statusCode,
    ).toBe(200);
    const version = await regenerate(proposal.sourceText!);
    expect(version).toMatchObject({
      status: "draft",
      revision: 2,
      originId: "corrected-draft",
    });
    expect((await envelope(session.token)).data.courses[0]).toEqual(
      published.data.courses[0],
    );
  });
  it("prépare un brouillon sans publier de cours et conserve le résultat dans les jobs", async () => {
    const session = await setup();
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/course",
      headers: bearer(session.token),
      payload: {
        profileId: session.profiles[0].id,
        subjectId: "maths",
        title: "Les nombres relatifs",
        sourceIds: [],
        sourceText:
          "Un nombre relatif est positif, négatif ou nul. Pour additionner deux nombres de même signe, on additionne les distances à zéro et on garde le signe.",
      },
    });
    expect(r.statusCode, r.body).toBe(200);
    const result = await job(session.token, r.json().job.id);
    expect(result.status).toBe("succeeded");
    expect(
      (result.result as { course: { status: string } }).course.status,
    ).toBe("draft");
    expect((await envelope(session.token)).data.courses).toEqual([]);
    const list = (
      await app.inject({ url: "/api/jobs", headers: bearer(session.token) })
    ).json().jobs;
    expect(list[0].id).toBe(result.id);
  });
  it("signale un échec puis relance le même job sans perdre les sources", async () => {
    const session = await setup();
    const source = (await upload(session.token, session.profiles[0].id)).json();
    const state = await envelope(session.token);
    state.data.courses.push({
      id: "draft-with-source",
      subjectId: "maths",
      title: "Les nombres relatifs",
      description: "",
      status: "draft",
      updatedAt: new Date().toISOString(),
      sections: [],
      sources: [source],
    });
    expect(
      (await save(session.token, state.data, state.revision)).statusCode,
    ).toBe(200);
    ai.failNext = true;
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/course",
      headers: bearer(session.token),
      payload: {
        profileId: session.profiles[0].id,
        subjectId: "maths",
        title: "Les nombres relatifs",
        sourceIds: [source.id],
        existingCourseId: "draft-with-source",
      },
    });
    const id = r.json().job.id;
    expect((await job(session.token, id)).status).toBe("failed");
    expect(
      (await app.inject({ url: source.uri, headers: bearer(session.token) }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/jobs/" + id + "/retry",
          headers: bearer(session.token),
        })
      ).statusCode,
    ).toBe(200);
    const recovered = await job(session.token, id);
    expect(recovered.status).toBe("succeeded");
    const result = recovered.result as {
      course: {
        sources: { id: string; extractedText?: string; page?: number }[];
      };
    };
    expect(result.course.sources).toHaveLength(1);
    expect(result.course.sources[0].extractedText).toContain("nombre relatif");
    expect(result.course.sources[0].page).toBe(1);
  });
  it("génère les cinq formats demandés avec leurs corrections", async () => {
    const session = await setup();
    await save(session.token, clone(initialData), 0);
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/exercises",
      headers: bearer(session.token),
      payload: {
        profileId: session.profiles[0].id,
        courseIds: ["maths-relative-numbers"],
        types: [
          "single-choice",
          "true-false",
          "fill-blank",
          "short-answer",
          "problem",
        ],
        level: "practice",
        count: 5,
      },
    });
    expect(r.statusCode, r.body).toBe(200);
    const result = await job(session.token, r.json().job.id);
    expect(result.status, result.error as string).toBe("succeeded");
    expect(
      (result.result as { questions: { type: string }[] }).questions.map(
        (q) => q.type,
      ),
    ).toEqual([
      "single-choice",
      "true-false",
      "fill-blank",
      "short-answer",
      "problem",
    ]);
  });
});
