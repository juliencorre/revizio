import { describe, expect, it } from "vitest";
import { evaluateAnswer } from "../../src/domain/answers";
import { initialData } from "../../src/domain/fixtures";
import {
  clone,
  parseLearningData,
  questionError,
  startAttemptInData,
  answerQuestionInData,
} from "../../src/domain/learning";
import type { Question } from "../../src/domain/model";
const textQuestion: Question = {
  id: "text",
  type: "fill-blank",
  prompt: "Combien vaut 1 divisé par 2 ?",
  choices: [],
  correctChoiceId: "",
  expectedAnswers: ["0,5"],
  explanation: "La moitié vaut 0,5.",
  concept: "Fractions",
  hint: "Une moitié.",
};
describe("formats de réponses", () => {
  it("accepte une réponse décimale ou une fraction équivalente sans confondre les unités", () => {
    expect(evaluateAnswer(textQuestion, "1/2")).toBe(true);
    expect(evaluateAnswer(textQuestion, "0.5")).toBe(true);
    expect(evaluateAnswer(textQuestion, "0,6")).toBe(false);
    expect(evaluateAnswer(textQuestion, "0,5 kg")).toBe(false);
  });
  it("normalise espaces et apostrophes sans effacer des accents significatifs", () => {
    const q = { ...textQuestion, expectedAnswers: ["didn't"] };
    expect(evaluateAnswer(q, "  DIDN’T  ")).toBe(true);
    expect(evaluateAnswer({ ...q, expectedAnswers: ["à"] }, "a")).toBe(false);
  });
  it("exige une réponse attendue et une correction avant publication", () => {
    expect(questionError(textQuestion)).toBeNull();
    expect(
      questionError({ ...textQuestion, expectedAnswers: [] }),
    ).toBeTruthy();
    expect(questionError({ ...textQuestion, explanation: "" })).toBeTruthy();
  });
  it("sauvegarde puis restaure une réponse écrite sur son snapshot", () => {
    const initial = clone(initialData);
    initial.series[0].questions = [textQuestion];
    let data = startAttemptInData(
      initial,
      initial.series[0].id,
      "attempt-text",
      "2026-11-08T21:00:00Z",
    ).data;
    data = answerQuestionInData(
      data,
      "attempt-text",
      "text",
      "1/2",
      false,
      "2026-11-08T21:01:00Z",
    );
    data.attempts[0].answers[0].isCorrect = false;
    expect(
      parseLearningData(JSON.stringify(data)).attempts[0].answers[0].isCorrect,
    ).toBe(true);
  });
  it("une échéance de contrôle blanc est figée au démarrage", () => {
    const started = startAttemptInData(
      clone(initialData),
      "maths-relative-practice",
      "exam",
      "2026-11-08T21:00:00Z",
      false,
      { mode: "exam", timeLimitSeconds: 300 },
    );
    expect(started.data.attempts[0].mode).toBe("exam");
    expect(started.data.attempts[0].deadlineAt).toBe(
      "2026-11-08T21:05:00.000Z",
    );
  });
});
