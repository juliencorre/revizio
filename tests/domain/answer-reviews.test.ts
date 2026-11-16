import { describe, it, expect } from "vitest";
import { initialData } from "../../src/domain/fixtures";
import {
  answerQuestionInData,
  clone,
  completeAttemptInData,
  parseLearningData,
  startAttemptInData,
} from "../../src/domain/learning";
import {
  answerReviewId,
  decideAnswerReview,
  matchesPublishedQuestions,
  mergeChildReviews,
  requestAnswerReview,
} from "../../src/domain/answer-reviews";
import type { LearningData } from "../../src/domain/model";
const time = "2026-11-16T14:00:00.000Z";

function setup() {
  const data = clone(initialData);
  const series = data.series.find((item) => item.status === "published")!;
  const question = {
    ...series.questions[0],
    type: "short-answer" as const,
    choices: [],
    correctChoiceId: "",
    expectedAnswers: ["un demi"],
  };
  series.questions = [question];
  const started = startAttemptInData(data, series.id, "old", time, true).data;
  const answered = answerQuestionInData(
    started,
    "old",
    question.id,
    "une moitié",
    false,
    time,
  );
  const finished = completeAttemptInData(answered, "old", time);
  const requested = requestAnswerReview(finished, "old", question.id);
  return { data, series, question, finished, requested };
}

describe("vérification parentale des réponses écrites", () => {
  it("garde la correction historique et applique la variante uniquement aux nouveaux essais", () => {
    const { series, question, requested, finished } = setup();
    const id = answerReviewId("old", question.id);
    expect(requestAnswerReview(requested, "old", question.id)).toBe(requested);
    const accepted = decideAnswerReview(requested, id, "accepted");
    const next = startAttemptInData(
      accepted,
      series.id,
      "new",
      time,
      true,
    ).data;
    const result = answerQuestionInData(
      next,
      "new",
      question.id,
      "Une moitié",
      false,
      time,
    );
    const restored = parseLearningData(JSON.stringify(result));
    expect(restored.attempts.find((a) => a.id === "old")).toEqual(
      finished.attempts.find((a) => a.id === "old"),
    );
    expect(
      restored.attempts.find((a) => a.id === "new")?.answers[0].isCorrect,
    ).toBe(true);
    expect(
      restored.series.find((s) => s.id === series.id)?.questions[0]
        .expectedAnswers,
    ).toEqual(["un demi"]);
    expect(restored.answerReviews?.[0].status).toBe("accepted");
    const declined = decideAnswerReview(requested, id, "declined");
    const later = startAttemptInData(
      declined,
      series.id,
      "new",
      time,
      true,
    ).data;
    expect(
      later.attempts.find((a) => a.id === "new")?.questions[0].expectedAnswers,
    ).toEqual(["un demi"]);
  });
  it("synchronise la demande et les essais hors ligne selon les variantes approuvées", () => {
    const { series, question, requested, finished } = setup();
    const accepted = decideAnswerReview(
      requested,
      answerReviewId("old", question.id),
      "accepted",
    );
    expect(
      mergeChildReviews(undefined, requested.answerReviews, finished.attempts),
    ).toEqual(requested.answerReviews);
    expect(
      mergeChildReviews(
        accepted.answerReviews,
        requested.answerReviews,
        finished.attempts,
      ),
    ).toEqual(accepted.answerReviews);
    const fresh = startAttemptInData(
      accepted,
      series.id,
      "new",
      time,
      true,
    ).data;
    expect(matchesPublishedQuestions(accepted, series, series.questions)).toBe(
      true,
    );
    expect(
      matchesPublishedQuestions(
        accepted,
        series,
        fresh.attempts.find((a) => a.id === "new")!.questions,
      ),
    ).toBe(true);
  });
  it("refuse une demande orpheline, une bonne réponse ou un examen en cours", () => {
    const { requested, series, question, data } = setup();
    expect(() =>
      parseLearningData(JSON.stringify({ ...requested, attempts: [] })),
    ).toThrow();
    const good = startAttemptInData(data, series.id, "good", time, true).data;
    const correct = answerQuestionInData(
      good,
      "good",
      question.id,
      "un demi",
      false,
      time,
    );
    expect(requestAnswerReview(correct, "good", question.id)).toBe(correct);
    const exam = startAttemptInData(data, series.id, "exam", time, true, {
      mode: "exam",
    }).data;
    const examAnswer = answerQuestionInData(
      exam,
      "exam",
      question.id,
      "une moitié",
      false,
      time,
    );
    expect(requestAnswerReview(examAnswer, "exam", question.id)).toBe(
      examAnswer,
    );
    const legacy: LearningData = parseLearningData(JSON.stringify(data));
    expect(legacy.answerReviews).toBeUndefined();
  });
});
