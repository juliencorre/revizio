import type { Attempt, LearningData, RevisionPlan } from "../src/domain/model";
import { parseLearningData } from "../src/domain/learning";
import { evaluateAnswer } from "../src/domain/answers";
import { clone } from "../src/domain/learning";
import { HttpError } from "./types";
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function childData(data: LearningData): LearningData {
  const courses = data.courses.filter(
    (course) => course.status === "published",
  );
  const ids = new Set(courses.map((c) => c.id));
  return {
    ...clone(data),
    courses,
    series: data.series.filter(
      (series) =>
        series.status === "published" &&
        series.courseIds.every((id) => ids.has(id)),
    ),
    plans: (data.plans ?? []).filter((plan) => plan.status === "published"),
  };
}
/** Child writes are checked against the server copy, not trusted client snapshots. */
export function mergeChildData(
  current: LearningData,
  incoming: LearningData,
): LearningData {
  const view = childData(current);
  for (const key of ["courses", "series", "english"] as const)
    if (
      !same(
        incoming[key] ??
          (key === "english"
            ? { words: [], verbs: [], tenses: [], toolWords: [] }
            : []),
        view[key] ??
          (key === "english"
            ? { words: [], verbs: [], tenses: [], toolWords: [] }
            : []),
      )
    )
      throw new HttpError(
        403,
        "Seul un parent peut modifier les cours, les exercices ou le programme d’anglais.",
      );
  const attempts: Attempt[] = [...current.attempts];
  for (const supplied of incoming.attempts) {
    const existing = current.attempts.find((a) => a.id === supplied.id);
    const series = current.series.find(
      (s) => s.id === supplied.seriesId && s.status === "published",
    );
    if (!existing && !series)
      throw new HttpError(403, "Cette série n’est pas disponible.");
    const questions = existing?.questions ?? series!.questions;
    if (
      !same(supplied.questions, questions) ||
      supplied.subjectId !== (existing?.subjectId ?? series!.subjectId) ||
      supplied.seriesTitle !== (existing?.seriesTitle ?? series!.title) ||
      (existing && supplied.startedAt !== existing.startedAt)
    )
      throw new HttpError(
        403,
        "Une tentative conserve les questions réellement présentées.",
      );
    if (existing?.completedAt) {
      if (!same(supplied, existing))
        throw new HttpError(
          403,
          "Une séance terminée ne peut pas être réécrite.",
        );
      continue;
    }
    if (
      existing?.answers.some(
        (answer) => !supplied.answers.some((next) => same(next, answer)),
      )
    )
      throw new HttpError(
        403,
        "Les réponses enregistrées ne peuvent pas être réécrites.",
      );
    const next = {
      ...clone(supplied),
      questions: clone(questions),
      answers: supplied.answers.map((answer) => {
        const question = questions.find((q) => q.id === answer.questionId);
        if (!question)
          throw new HttpError(
            400,
            "Une réponse ne correspond à aucune question.",
          );
        return {
          ...answer,
          isCorrect: evaluateAnswer(question, answer.choiceId),
        };
      }),
    };
    const index = attempts.findIndex((a) => a.id === next.id);
    if (index >= 0) attempts[index] = next;
    else attempts.push(next);
  }
  const publishedIds = new Set(view.courses.map((c) => c.id));
  if (incoming.reviewedCourseIds.some((id) => !publishedIds.has(id)))
    throw new HttpError(403, "Cette fiche n’est pas publiée.");
  const completedPlans = new Map(
    (incoming.plans ?? []).map((plan) => [plan.id, plan]),
  );
  const plans = (current.plans ?? []).map((plan) => {
    const supplied = completedPlans.get(plan.id);
    if (!supplied) return plan;
    const clearCompletions = (p: RevisionPlan) => ({
      ...p,
      steps: p.steps.map(({ completedAt, ...step }) => step),
    });
    if (
      plan.status !== "published" ||
      !same(clearCompletions(plan), clearCompletions(supplied))
    )
      throw new HttpError(
        403,
        "Seul un parent peut modifier le plan de révision.",
      );
    return {
      ...plan,
      steps: plan.steps.map((step) => ({
        ...step,
        ...(step.completedAt
          ? {}
          : supplied.steps.find((s) => s.id === step.id)?.completedAt
            ? {
                completedAt: supplied.steps.find((s) => s.id === step.id)!
                  .completedAt,
              }
            : {}),
      })),
    };
  });
  if (
    (incoming.plans ?? []).some(
      (plan) => !view.plans?.some((p) => p.id === plan.id),
    )
  )
    throw new HttpError(403, "Ce plan n’est pas disponible.");
  const readingRecords = [...(current.readingRecords ?? [])];
  for (const record of incoming.readingRecords ?? []) {
    if (!publishedIds.has(record.courseId))
      throw new HttpError(
        403,
        "Cette lecture ne correspond pas à une fiche publiée.",
      );
    if (
      !readingRecords.some(
        (r) =>
          r.courseId === record.courseId && r.reviewedAt === record.reviewedAt,
      )
    )
      readingRecords.push(record);
  }
  const spacedReviews = [...(current.spacedReviews ?? [])];
  for (const record of incoming.spacedReviews ?? []) {
    if (!publishedIds.has(record.courseId))
      throw new HttpError(
        403,
        "Cette révision ne correspond pas à une fiche publiée.",
      );
    const index = spacedReviews.findIndex(
      (r) => r.courseId === record.courseId,
    );
    if (index >= 0) spacedReviews[index] = record;
    else spacedReviews.push(record);
  }
  return parseLearningData(
    JSON.stringify({
      ...current,
      attempts,
      reviewedCourseIds: [
        ...new Set([
          ...current.reviewedCourseIds,
          ...incoming.reviewedCourseIds,
        ]),
      ],
      plans,
      readingRecords,
      spacedReviews,
    }),
  );
}
