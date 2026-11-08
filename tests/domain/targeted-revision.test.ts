import { describe, expect, it } from "vitest";
import { buildTargetedRevision } from "../../src/domain/targeted-revision";
import type { Attempt, ExerciseSeries, Question } from "../../src/domain/model";

function question(id = "addition"): Question {
  return {
    id,
    prompt: "Combien vaut 2 + 3 ?",
    type: "single-choice",
    choices: [
      { id: "four", label: "4" },
      { id: "five", label: "5" },
    ],
    correctChoiceId: "five",
    explanation: "En avançant de 3 depuis 2, on arrive à 5.",
    hint: "Avance de trois unités.",
    concept: "Addition",
    sourceRefs: [{ sourceId: "page-source", page: 1, excerpt: "2 + 3 = 5" }],
  };
}
function series(id = "approved", questions = [question()]): ExerciseSeries {
  return {
    id,
    title: "Addition",
    subjectId: "maths",
    status: "published",
    courseIds: ["chapter"],
    level: "practice",
    questions,
  };
}
function attempt(
  id: string,
  seriesId: string,
  questions = [question()],
  correct = false,
  completedAt = "2026-11-09T18:00:00Z",
): Attempt {
  return {
    id,
    seriesId,
    seriesTitle: "Addition",
    subjectId: "maths",
    startedAt: "2026-11-09T17:00:00Z",
    completedAt,
    questions,
    answers: questions.map((question) => ({
      questionId: question.id,
      choiceId: correct ? "five" : "four",
      isCorrect: correct,
      usedHint: false,
      answeredAt: completedAt,
    })),
  };
}
describe("séance ciblée sur les erreurs connues", () => {
  it("utilise le dernier essai terminé de chaque série et ignore l’essai encore ouvert", () => {
    const correct = attempt(
      "latest",
      "approved",
      [question()],
      true,
      "2026-11-09T20:00:00Z",
    );
    const unfinished = {
      ...attempt("unfinished", "approved"),
      startedAt: "2026-11-09T21:00:00Z",
      completedAt: undefined,
    };
    const result = buildTargetedRevision(
      [series()],
      [unfinished, correct, attempt("old-error", "approved")],
    );
    expect(result.questions).toEqual([]);
    expect(result.latestAttemptIds).toEqual(["latest"]);
  });
  it("compare les fins réelles plutôt que le début des tentatives", () => {
    const earlierStart = {
      ...attempt(
        "finished-last",
        "approved",
        [question()],
        false,
        "2026-11-09T21:00:00Z",
      ),
      startedAt: "2026-11-08T10:00:00Z",
    };
    const laterStart = attempt(
      "finished-first",
      "approved",
      [question()],
      true,
      "2026-11-09T20:00:00Z",
    );
    const result = buildTargetedRevision(
      [series()],
      [earlierStart, laterStart],
    );
    expect(result.latestAttemptIds).toEqual(["finished-last"]);
    expect(result.questions).toHaveLength(1);
  });
  it("conserve l’énoncé, la réponse et la correction du snapshot même si la série a changé", () => {
    const original = question();
    const source = attempt("old-version", "approved", [original]);
    const changed = {
      ...original,
      prompt: "Combien vaut 6 + 3 ?",
      choices: [
        { id: "nine", label: "9" },
        { id: "ten", label: "10" },
      ],
      correctChoiceId: "nine",
      explanation: "6 + 3 = 9.",
    };
    const result = buildTargetedRevision(
      [series("approved", [changed])],
      [source],
    );
    expect(result.questions[0]).toEqual(original);
    result.questions[0].choices[0].label = "Copie modifiée";
    expect(source.questions[0].choices[0].label).toBe("4");
  });
  it("inclut les réponses fausses et les questions laissées blanches d’un examen terminé", () => {
    const written: Question = {
      ...question("written"),
      prompt: "Écris le résultat de 7 − 2.",
      type: "fill-blank",
      choices: [],
      correctChoiceId: "",
      expectedAnswers: ["5"],
      rubric: "Le résultat attendu est 5.",
      explanation: "7 − 2 = 5.",
    };
    const value = attempt("exam", "approved", [
      question(),
      written,
      { ...question("missing"), prompt: "Combien vaut 3 + 2 ?" },
    ]);
    value.mode = "exam";
    value.answers[1] = {
      ...value.answers[1],
      choiceId: "",
      response: "",
      isCorrect: false,
    };
    value.answers.pop();
    const result = buildTargetedRevision([series()], [value]);
    expect(result.questions.map((question) => question.prompt)).toEqual(
      value.questions.map((question) => question.prompt),
    );
    expect(result.questions[1].expectedAnswers).toEqual(["5"]);
    expect(result.questions[1].rubric).toBe(written.rubric);
  });
  it("déduplique les mêmes questions approuvées sans collision entre identifiants historiques", () => {
    const different = {
      ...question(),
      prompt: "Combien vaut 2 × 3 ?",
      explanation: "2 × 3 = 6.",
      choices: [
        { id: "five", label: "5" },
        { id: "six", label: "6" },
      ],
      correctChoiceId: "six",
    };
    const result = buildTargetedRevision(
      [series("a"), series("b"), series("c")],
      [
        attempt("one", "a", [question()]),
        attempt("two", "b", [different]),
        attempt("three", "c", [question("different-id")]),
      ],
    );
    expect(result.questions).toHaveLength(2);
    expect(new Set(result.questions.map((question) => question.id)).size).toBe(
      2,
    );
  });
  it("n’utilise ni brouillon, ni série extérieure, ni erreur d’un essai antérieur déjà réussi", () => {
    const result = buildTargetedRevision(
      [{ ...series("draft"), status: "draft" }, series()],
      [
        attempt("outside", "outside"),
        attempt("draft", "draft"),
        attempt("previous", "approved"),
        attempt(
          "corrected",
          "approved",
          [question()],
          true,
          "2026-11-09T22:00:00Z",
        ),
      ],
    );
    expect(result.questions).toEqual([]);
    expect(result.latestAttemptIds).toEqual(["corrected"]);
  });
});
