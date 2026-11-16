import type { Attempt, LearningData, RevisionPlan } from "../src/domain/model";
import { parseLearningData } from "../src/domain/learning";
import {
  latestSpacedReviews,
  publishedReadingEditions,
} from "../src/domain/reading-history";
import { evaluateAnswer } from "../src/domain/answers";
import { clone } from "../src/domain/learning";
import { HttpError } from "./types";
import { vocabularyListsFor } from "../src/domain/vocabulary";
import {
  matchesPublishedQuestions,
  mergeChildReviews,
} from "../src/domain/answer-reviews";
import { isConjugationSeries } from "../src/domain/conjugation-practice";
import { verifyConjugationAttempt } from "./conjugation";
import { mergeVocabularySessions } from "./vocabulary";
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
    vocabularyLists: vocabularyListsFor(data).filter(
      (list) => list.status === "published",
    ),
  };
}
/** Child writes are checked against the server copy, not trusted client snapshots. */
export function mergeChildData(
  current: LearningData,
  incoming: LearningData,
  profileId?: string,
): LearningData {
  const view = childData(current);
  if (!same(incoming.customSubjects ?? [], current.customSubjects ?? []))
    throw new HttpError(403, "Seul un parent peut modifier les matières de cet enfant.");
  if (
    Object.keys({
      ...current.subjectVisibility,
      ...incoming.subjectVisibility,
    }).some(
      (id) =>
        (incoming.subjectVisibility?.[id] ?? true) !==
        (current.subjectVisibility?.[id] ?? true),
    )
  )
    throw new HttpError(403, "Seul un parent peut choisir les matières.");
  if (!same(vocabularyListsFor(incoming), vocabularyListsFor(view)))
    throw new HttpError(
      403,
      "Seul un parent peut modifier les listes de vocabulaire.",
    );
  for (const key of [
    "courses",
    "series",
    "english",
    "conjugationSheets",
  ] as const)
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
    const context = supplied as Attempt & { planId?: string; stepId?: string };
    const oldContext = existing as
      (Attempt & { planId?: string; stepId?: string }) | undefined;
    if (profileId && supplied.profileId && supplied.profileId !== profileId)
      throw new HttpError(403, "Cette tentative n’appartient pas à ce profil.");
    const series = current.series.find(
      (s) => s.id === supplied.seriesId && s.status === "published",
    );
    const conjugation = isConjugationSeries(supplied.seriesId)
      ? verifyConjugationAttempt(current, supplied, existing)
      : undefined;
    const source = conjugation ?? series;
    if (!existing && !source)
      throw new HttpError(403, "Cette série n’est pas disponible.");
    if (
      !existing &&
      !conjugation &&
      !matchesPublishedQuestions(current, series!, supplied.questions)
    )
      throw new HttpError(
        403,
        "Cette tentative doit utiliser les questions publiées.",
      );
    const questions =
      conjugation?.questions ?? existing?.questions ?? supplied.questions;
    if (
      !same(supplied.questions, questions) ||
      supplied.subjectId !== (existing?.subjectId ?? source!.subjectId) ||
      supplied.seriesTitle !== (existing?.seriesTitle ?? source!.title) ||
      (existing &&
        (supplied.startedAt !== existing.startedAt ||
          supplied.seriesId !== existing.seriesId ||
          supplied.mode !== existing.mode ||
          supplied.deadlineAt !== existing.deadlineAt ||
          supplied.profileId !== existing.profileId ||
          context.planId !== oldContext?.planId ||
          context.stepId !== oldContext?.stepId))
    )
      throw new HttpError(
        403,
        "Une tentative conserve les questions réellement présentées.",
      );
    if (!existing && (context.planId || context.stepId)) {
      const plan = view.plans?.find((plan) => plan.id === context.planId);
      const step = plan?.steps.find((step) => step.id === context.stepId);
      if (
        !plan ||
        !step ||
        !["practice", "mistakes", "mock"].includes(step.kind) ||
        (step.seriesId && step.seriesId !== supplied.seriesId) ||
        !series!.courseIds.every((id) => step.courseIds.includes(id)) ||
        (step.kind === "mock" && supplied.mode !== "exam")
      )
        throw new HttpError(
          403,
          "Cette tentative ne correspond pas à une étape publiée du plan.",
        );
    }
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
  let answerReviews;
  try {
    answerReviews = mergeChildReviews(
      current.answerReviews,
      incoming.answerReviews,
      attempts,
    );
  } catch {
    throw new HttpError(
      403,
      "Seul un parent peut décider d’une demande de vérification.",
    );
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
  const readingEditions = publishedReadingEditions(view.courses);
  const readingRecords = [...(current.readingRecords ?? [])];
  for (const record of incoming.readingRecords ?? []) {
    if (
      !readingEditions.has(record.courseId) &&
      !readingRecords.some(
        (existing) =>
          existing.courseId === record.courseId &&
          existing.reviewedAt === record.reviewedAt,
      )
    )
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
  if (
    (incoming.spacedReviews ?? []).some(
      (record) => !readingEditions.has(record.courseId),
    )
  )
    throw new HttpError(
      403,
      "Cette révision ne correspond pas à une fiche publiée.",
    );
  const spacedReviews = latestSpacedReviews(
    [...(current.spacedReviews ?? []), ...(incoming.spacedReviews ?? [])],
    readingEditions,
  );
  return parseLearningData(
    JSON.stringify({
      ...current,
      ...(answerReviews ? { answerReviews } : {}),
      vocabularySessions: mergeVocabularySessions(current, incoming),
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
