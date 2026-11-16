import { describe, expect, it } from "vitest";
import { childData, mergeChildData } from "../../server/access";
import { startConjugationInData } from "../../src/domain/conjugation-practice";
import {
  answerQuestionInData,
  completeAttemptInData,
  parseLearningData,
} from "../../src/domain/learning";
import { mergeLearningData } from "../../src/domain/sync";
import type { LearningData } from "../../src/domain/model";

const be = { verb: "be", tense: "present-simple" };
const have = { verb: "have", tense: "past-simple" };
const now = "2026-11-16T20:00:00.000Z";
const base: LearningData = {
  version: 1,
  courses: [],
  series: [],
  reviewedCourseIds: [],
  attempts: [],
};
const published = { ...base, conjugationSheets: [be] };
const start = (data: LearningData) =>
  startConjugationInData(data, be, "session", now, "alex");
const restore = (data: LearningData) => parseLearningData(JSON.stringify(data));

describe("fiches de conjugaison d’un enfant", () => {
  it("préserve les anciennes sauvegardes et fusionne deux sélections parent indépendantes", () => {
    expect(restore(base).conjugationSheets).toBeUndefined();
    expect(restore(published).conjugationSheets).toEqual([be]);
    expect(() => restore({ ...base, conjugationSheets: [be, be] })).toThrow(
      /conjugaison/,
    );
    expect(() =>
      restore({ ...base, conjugationSheets: [{ ...be, tense: "imparfait" }] }),
    ).toThrow(/conjugaison/);
    const added = { ...base, conjugationSheets: [have] };
    expect(
      mergeLearningData(base, added, published).data.conjugationSheets,
    ).toEqual([be, have]);
    const merge = mergeLearningData(
      published,
      { ...base, conjugationSheets: [] },
      { ...base, conjugationSheets: [be, have] },
    );
    expect(merge.conflicts).toEqual([]);
    expect(merge.data.conjugationSheets).toEqual([have]);
  });

  it("reprend la même séance et synchronise chaque correction jusqu’à la reprise de la personne manquée", () => {
    let local = start(childData(published)).data;
    let remote = mergeChildData(published, restore(local), "alex");
    const first = local.attempts[0].questions[0];
    local = answerQuestionInData(
      local,
      "session",
      first.id,
      "erreur",
      false,
      now,
    );
    expect(local.attempts[0].questions.at(-1)).toEqual({
      ...first,
      id: first.id + "-retry",
    });
    expect(start(restore(local)).data.attempts).toEqual(local.attempts);
    remote = mergeChildData(remote, restore(local), "alex");
    local = answerQuestionInData(
      local,
      "session",
      first.id,
      "réponse en double",
      false,
      now,
    );
    for (const question of local.attempts[0].questions.slice(1))
      local = answerQuestionInData(
        local,
        "session",
        question.id,
        question.expectedAnswers![0],
        false,
        now,
      );
    local = completeAttemptInData(local, "session", now);
    // A child's first connection may be after the entire offline session.
    expect(mergeChildData(published, restore(local), "alex").attempts).toEqual(
      local.attempts,
    );
    expect(mergeChildData(remote, restore(local), "alex").attempts).toEqual(
      local.attempts,
    );
    expect(local.attempts[0].answers.map((a) => a.isCorrect)).toEqual([
      false,
      ...Array(8).fill(true),
    ]);
    // Removing the sheet prevents new sessions, and leaves a previously recorded snapshot readable.
    const removed = { ...remote, conjugationSheets: [] };
    expect(start(removed).attemptId).toBeNull();
    expect(
      mergeChildData(removed, { ...local, conjugationSheets: [] }, "alex")
        .attempts,
    ).toEqual(local.attempts);
  });

  it("vérifie la publication, les questions et les reprises avant d’enregistrer une séance", () => {
    const local = start(childData(published)).data;
    expect(start(base).attemptId).toBeNull();
    expect(() => mergeChildData(base, local, "alex")).toThrow(/parent/);
    expect(() =>
      mergeChildData(base, { ...local, conjugationSheets: [] }, "alex"),
    ).toThrow(/publiée/);
    const altered = restore(local);
    altered.attempts[0].questions[0].explanation = "I is";
    expect(() => mergeChildData(published, altered, "alex")).toThrow(/formes/);
    const first = local.attempts[0].questions[0];
    const answered = answerQuestionInData(
      local,
      "session",
      first.id,
      "incorrect",
      false,
      now,
    );
    answered.attempts[0].questions.pop();
    expect(() => mergeChildData(published, answered, "alex")).toThrow(
      /reprises/,
    );
  });
});
