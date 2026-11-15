import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { createApp } from "../../server/app";
import type { LearningData, VocabularySession } from "../../src/domain/model";
import {
  answerVocabularySession,
  createVocabularySession,
} from "../../src/domain/vocabulary";

let app: FastifyInstance,
  root: string,
  parentToken: string,
  childToken: string,
  profileId: string;
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
async function envelope(token: string, profile = profileId) {
  const result = await app.inject({
    url: `/api/data?profileId=${profile}`,
    headers: headers(token),
  });
  expect(result.statusCode, result.body).toBe(200);
  return result.json() as { data: LearningData; revision: number };
}
async function save(
  token: string,
  value: { data: LearningData; revision: number },
  profile = profileId,
) {
  return app.inject({
    method: "PUT",
    url: "/api/data",
    headers: headers(token),
    payload: { ...value, profileId: profile },
  });
}
function practice(data: LearningData, id: string) {
  return createVocabularySession(
    data.vocabularyLists![0],
    data.vocabularySessions ?? [],
    { id, mode: "both", scope: "all", startedAt: "2026-11-15T10:00:00.000Z" },
  )!;
}
function complete(session: VocabularySession) {
  const answered = session.questions.reduce(
    (current, question) =>
      answerVocabularySession(
        current,
        question.id,
        question.expectedAnswers[0],
        "2026-11-15T10:00:01.000Z",
      ),
    session,
  );
  return { ...answered, completedAt: "2026-11-15T10:00:02.000Z" };
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "revizo-vocabulary-"));
  app = await createApp({
    dataDir: root,
    staticDir: join(root, "no-static"),
    rateLimit: false,
  });
  const setup = await app.inject({
    method: "POST",
    url: "/api/setup",
    payload: {
      parentName: "Parent",
      email: "vocabulary@example.test",
      password: "Vocabulaire-test-42!",
      childName: "Camille",
      grade: "5e",
      pin: "4268",
    },
  });
  parentToken = setup.json().token;
  profileId = setup.json().profiles[0].id;
  const initial = await envelope(parentToken);
  initial.data.vocabularyLists = [
    {
      id: "spanish-list",
      language: "spanish",
      title: "Mes mots espagnols",
      status: "published",
      words: [{ id: "casa", term: "casa", translation: "maison" }],
    },
    {
      id: "private-list",
      language: "latin",
      title: "Ma préparation privée",
      status: "draft",
      words: [
        { id: "private-word", term: "secretum", translation: "non partagé" },
      ],
    },
  ];
  expect((await save(parentToken, initial)).statusCode).toBe(200);
  const login = await app.inject({
    method: "POST",
    url: "/api/child-login",
    payload: { profileId, pin: "4268" },
  });
  childToken = login.json().token;
});
afterEach(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
});

describe("vocabulaire familial protégé par le serveur", () => {
  it("cache les listes privées et interdit leur modification ou leur entraînement par un enfant", async () => {
    const child = await envelope(childToken);
    expect(child.data.vocabularyLists!.map((list) => list.id)).toEqual([
      "spanish-list",
    ]);
    expect(JSON.stringify(child.data)).not.toContain("secretum");
    child.data.vocabularyLists![0].words[0].translation = "faux";
    expect((await save(childToken, child)).statusCode).toBe(403);
    const parent = await envelope(parentToken);
    const next = await envelope(childToken);
    const draft = {
      ...parent.data.vocabularyLists![1],
      status: "published" as const,
    };
    next.data.vocabularySessions = [
      createVocabularySession(draft, [], {
        id: "private-attempt",
        mode: "both",
        scope: "all",
        startedAt: "2026-11-15T10:00:00.000Z",
      })!,
    ];
    expect((await save(childToken, next)).statusCode).toBe(403);
  });
  it("recalcule la correction, conserve la reprise et refuse de falsifier les questions ou réponses", async () => {
    const child = await envelope(childToken);
    const pending = practice(child.data, "session-1");
    const wrong = answerVocabularySession(
      pending,
      pending.questions[0].id,
      "chat",
      "2026-11-15T10:00:01.000Z",
    );
    wrong.answers[0].isCorrect = true;
    child.data.vocabularySessions = [wrong];
    const result = await save(childToken, child);
    expect(result.statusCode, result.body).toBe(200);
    const reloaded = await envelope(childToken);
    expect(reloaded.data.vocabularySessions![0].answers[0].isCorrect).toBe(
      false,
    );
    expect(reloaded.data.vocabularySessions![0].questions).toEqual(
      pending.questions,
    );
    const snapshot = await envelope(childToken);
    snapshot.data.vocabularySessions![0].questions[0].expectedAnswers = [
      "chat",
    ];
    expect((await save(childToken, snapshot)).statusCode).toBe(403);
    const rewritten = await envelope(childToken);
    rewritten.data.vocabularySessions![0].answers[0].choiceId = "maison";
    rewritten.data.vocabularySessions![0].answers[0].response = "maison";
    expect((await save(childToken, rewritten)).statusCode).toBe(403);
    const forged = await envelope(childToken);
    const altered = practice(forged.data, "forged");
    altered.questions[0].expectedAnswers = ["chat"];
    forged.data.vocabularySessions!.push(altered);
    expect((await save(childToken, forged)).statusCode).toBe(403);
  });
  it("préserve le snapshot d’une séance commencée avant modification de la liste", async () => {
    const child = await envelope(childToken);
    child.data.vocabularySessions = [practice(child.data, "old-snapshot")];
    expect((await save(childToken, child)).statusCode).toBe(200);
    const parent = await envelope(parentToken);
    parent.data.vocabularyLists![0].words[0].translation = "foyer";
    expect((await save(parentToken, parent)).statusCode).toBe(200);
    const reloaded = await envelope(childToken);
    reloaded.data.vocabularySessions = [
      complete(reloaded.data.vocabularySessions![0]),
    ];
    const saved = await save(childToken, reloaded);
    expect(saved.statusCode, saved.body).toBe(200);
    const after = await envelope(parentToken);
    expect(
      after.data.vocabularySessions![0].questions[0].expectedAnswers,
    ).toEqual(["maison"]);
    expect(
      after.data.vocabularySessions![0].answers.every(
        (answer) => answer.isCorrect,
      ),
    ).toBe(true);
    const completed = await envelope(childToken);
    completed.data.vocabularySessions![0].completedAt =
      "2026-11-15T10:00:03.000Z";
    expect((await save(childToken, completed)).statusCode).toBe(403);
  });
  it("isole le vocabulaire par profil et le conserve dans une sauvegarde restaurable", async () => {
    const child = await envelope(childToken);
    child.data.vocabularySessions = [
      complete(practice(child.data, "saved-session")),
    ];
    expect((await save(childToken, child)).statusCode).toBe(200);
    const other = await app.inject({
      method: "POST",
      url: "/api/profiles",
      headers: headers(parentToken),
      payload: { name: "Autre enfant", grade: "6e", pin: "1234" },
    });
    const otherId = other.json().profile.id;
    expect(
      (await envelope(parentToken, otherId)).data.vocabularyLists ?? [],
    ).toEqual([]);
    expect(
      (
        await app.inject({
          url: `/api/data?profileId=${otherId}`,
          headers: headers(childToken),
        })
      ).statusCode,
    ).toBe(403);
    const backup = await app.inject({
      url: "/api/backup",
      headers: headers(parentToken),
    });
    expect(backup.statusCode).toBe(200);
    const source = backup
      .json()
      .profiles.find((profile: { id: string }) => profile.id === profileId);
    expect(source.data.vocabularySessions[0].id).toBe("saved-session");
    const restore = await app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: headers(parentToken),
      payload: { backup: backup.json() },
    });
    expect(restore.statusCode, restore.body).toBe(200);
    expect(
      (await envelope(parentToken)).data.vocabularySessions![0].questions,
    ).toEqual(source.data.vocabularySessions[0].questions);
  });
});
