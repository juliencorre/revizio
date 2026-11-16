import { evaluateAnswer, normalizeAnswer } from "./answers";
import type {
  AnswerReview,
  Attempt,
  ExerciseSeries,
  LearningData,
  Question,
} from "./model";

type ReviewTarget = Pick<AnswerReview, "attemptId" | "questionId">;
export const answerReviewId = (attemptId: string, questionId: string) =>
  JSON.stringify([attemptId, questionId]);

export function reviewDetails(attempts: Attempt[], target: ReviewTarget) {
  const attempt = attempts.find((item) => item.id === target.attemptId);
  const question = attempt?.questions.find(
    (item) => item.id === target.questionId,
  );
  const answer = attempt?.answers.find(
    (item) => item.questionId === target.questionId,
  );
  if (
    !attempt ||
    !question ||
    !answer ||
    !answer.choiceId.trim() ||
    !question.type ||
    !["short-answer", "fill-blank", "problem"].includes(question.type) ||
    (attempt.mode === "exam" && !attempt.completedAt) ||
    evaluateAnswer(question, answer.choiceId)
  )
    return null;
  return { attempt, question, response: answer.choiceId };
}

export function validateAnswerReviews(value: unknown, attempts: Attempt[]) {
  if (value === undefined) return;
  if (!Array.isArray(value))
    throw new Error("Demandes de vérification invalides.");
  const seen = new Set<string>();
  for (const review of value) {
    if (
      !review ||
      typeof review !== "object" ||
      typeof review.attemptId !== "string" ||
      typeof review.questionId !== "string" ||
      review.id !== answerReviewId(review.attemptId, review.questionId) ||
      !["pending", "accepted", "declined"].includes(review.status) ||
      (review.previouslyAccepted !== undefined &&
        review.previouslyAccepted !== true) ||
      seen.has(review.id) ||
      !reviewDetails(attempts, review)
    )
      throw new Error("Demande de vérification invalide.");
    seen.add(review.id);
  }
}

export function requestAnswerReview(
  data: LearningData,
  attemptId: string,
  questionId: string,
): LearningData {
  const review: AnswerReview = {
    id: answerReviewId(attemptId, questionId),
    attemptId,
    questionId,
    status: "pending",
  };
  if (
    !reviewDetails(data.attempts, review) ||
    data.answerReviews?.some((item) => item.id === review.id)
  )
    return data;
  return { ...data, answerReviews: [...(data.answerReviews ?? []), review] };
}

export function decideAnswerReview(
  data: LearningData,
  id: string,
  status: "accepted" | "declined",
): LearningData {
  const review = data.answerReviews?.find((item) => item.id === id);
  if (review?.status !== "pending") return data;
  return {
    ...data,
    answerReviews: data.answerReviews!.map((item) =>
      item.id === id ? { ...item, status } : item,
    ),
  };
}

export function mergeChildReviews(
  current: AnswerReview[] | undefined,
  incoming: AnswerReview[] | undefined,
  attempts: Attempt[],
) {
  if (!incoming) return current;
  validateAnswerReviews(incoming, attempts);
  const reviews = new Map((current ?? []).map((review) => [review.id, review]));
  for (const review of incoming) {
    const existing = reviews.get(review.id);
    if (review.status !== "pending" && review.status !== existing?.status)
      throw new Error("Décision parentale requise.");
    if (!existing) {
      if (review.previouslyAccepted)
        throw new Error("Décision parentale requise.");
      reviews.set(review.id, {
        id: review.id,
        attemptId: review.attemptId,
        questionId: review.questionId,
        status: "pending",
      });
    }
  }
  return [...reviews.values()];
}

export function preserveReviewDecisions(
  current: AnswerReview[] | undefined,
  incoming: AnswerReview[] | undefined,
) {
  if (!incoming) return current;
  const original = new Map(
    (current ?? []).map((review) => [review.id, review]),
  );
  return incoming.map(
    ({ previouslyAccepted: _history, ...review }): AnswerReview => {
      const old = original.get(review.id);
      if (
        old?.previouslyAccepted ||
        (old?.status === "accepted" && review.status !== "accepted")
      )
        return { ...review, previouslyAccepted: true };
      return review;
    },
  );
}

export function questionsForNewAttempt(
  data: LearningData,
  series: ExerciseSeries,
) {
  return questionsWithVariants(data, series, false);
}

function questionsWithVariants(
  data: LearningData,
  series: ExerciseSeries,
  historical: boolean,
): Question[] {
  const variants = new Map<string, string[]>();
  for (const review of data.answerReviews ?? []) {
    if (
      review.status !== "accepted" &&
      !(historical && review.previouslyAccepted)
    )
      continue;
    const details = reviewDetails(data.attempts, review);
    if (!details || details.attempt.seriesId !== series.id) continue;
    const published = series.questions.find((q) => q.id === review.questionId);
    if (
      !published ||
      published.prompt !== details.question.prompt ||
      published.type !== details.question.type
    )
      continue;
    const answers = variants.get(published.id) ?? [
      ...(published.expectedAnswers ?? []),
    ];
    if (
      !answers.some(
        (answer) =>
          normalizeAnswer(answer) === normalizeAnswer(details.response),
      )
    )
      answers.push(details.response);
    variants.set(published.id, answers);
  }
  return series.questions.map((question) =>
    variants.has(question.id)
      ? { ...question, expectedAnswers: variants.get(question.id) }
      : question,
  );
}

// An offline device may have started before receiving a newly approved variant.
// All original answers are required, and every additional answer must be approved.
export function matchesPublishedQuestions(
  data: LearningData,
  series: ExerciseSeries,
  supplied: Question[],
): boolean {
  const approved = questionsWithVariants(data, series, true);
  return (
    supplied.length === series.questions.length &&
    supplied.every((question, index) => {
      const original = series.questions[index];
      if (JSON.stringify(question) === JSON.stringify(original)) return true;
      const { expectedAnswers, ...content } = question;
      const { expectedAnswers: originalAnswers, ...published } = original;
      if (JSON.stringify(content) !== JSON.stringify(published)) return false;
      if (!originalAnswers) return expectedAnswers === undefined;
      return (
        !!expectedAnswers &&
        originalAnswers.every((answer, i) => expectedAnswers[i] === answer) &&
        expectedAnswers.every((answer) =>
          approved[index].expectedAnswers?.includes(answer),
        ) &&
        new Set(expectedAnswers).size === expectedAnswers.length
      );
    })
  );
}
