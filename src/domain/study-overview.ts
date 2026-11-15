import type {
  Attempt,
  Course,
  ExerciseSeries,
  LearningData,
  Question,
} from "./model";
import { dateOnly } from "./planning";

export function latestAttempts(
  attempts: Attempt[],
  completedOnly = false,
): Attempt[] {
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    if (completedOnly && !attempt.completedAt) continue;
    const previous = latest.get(attempt.seriesId);
    const time = completedOnly ? attempt.completedAt! : attempt.startedAt;
    const previousTime =
      previous && (completedOnly ? previous.completedAt! : previous.startedAt);
    if (
      !previous ||
      time > previousTime! ||
      (time === previousTime && attempt.startedAt > previous.startedAt)
    ) {
      latest.set(attempt.seriesId, attempt);
    }
  }
  return [...latest.values()];
}

/** Display-only preparation stages; publication still requires explicit parent review. */
export function preparationStatus(
  content: Course | ExerciseSeries,
): "Brouillon" | "À vérifier" | "Publié" {
  if (content.status === "published") return "Publié";
  const hasContent =
    "sections" in content
      ? content.sections.some((section) => section.content.trim())
      : content.questions.length > 0;
  return hasContent ? "À vérifier" : "Brouillon";
}

export interface NextSession {
  title: string;
  reason: string;
  minutes: number;
  estimated: boolean;
  resume: boolean;
  subjectId: string;
  destination: string;
}

/** A deterministic recommendation using only published content, never an AI claim. */
export function nextStudySession(
  data: LearningData,
  today = dateOnly(),
): NextSession | null {
  const courses = data.courses.filter(
    (course) => course.status === "published",
  );
  const courseIds = new Set(courses.map((course) => course.id));
  const series = data.series.filter(
    (item) =>
      item.status === "published" &&
      item.questions.length > 0 &&
      item.courseIds.every((id) => courseIds.has(id)),
  );
  const attempts = latestAttempts(data.attempts);
  const exerciseSession = (
    item: ExerciseSeries,
    attempt?: Attempt,
  ): NextSession => ({
    title: attempt?.seriesTitle ?? item.title,
    reason: attempt
      ? "Tu peux continuer là où tu t’es arrêté."
      : "Une série pour t’entraîner sur ton cours.",
    minutes: Math.max(
      1,
      Math.ceil(
        item.timeLimitSeconds
          ? item.timeLimitSeconds / 60
          : ((attempt?.questions.length ?? item.questions.length) -
              (attempt?.answers.length ?? 0)) *
              2,
      ),
    ),
    estimated: !item.timeLimitSeconds,
    resume: !!attempt,
    subjectId: item.subjectId,
    destination: `/student/exercise/${encodeURIComponent(item.id)}${attempt ? `?attemptId=${encodeURIComponent(attempt.id)}${attempt.mode === "exam" ? "&mode=exam" : ""}` : ""}`,
  });
  const unfinished = attempts
    .filter(
      (attempt) =>
        !attempt.completedAt &&
        series.some((item) => item.id === attempt.seriesId),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (unfinished) {
    const session = exerciseSession(
      series.find((item) => item.id === unfinished.seriesId)!,
      unfinished,
    );
    // Preserve the plan association when resuming an exercise from the home screen.
    if (unfinished.planId && unfinished.stepId) {
      session.destination += `&planId=${encodeURIComponent(unfinished.planId)}&stepId=${encodeURIComponent(unfinished.stepId)}`;
    }
    return session;
  }
  const planned = (data.plans ?? [])
    .filter((plan) => plan.status === "published" && plan.examDate >= today)
    .flatMap((plan) =>
      plan.steps
        .filter(
          (step) =>
            !step.completedAt &&
            step.date <= today &&
            step.courseIds.every((id) => courseIds.has(id)),
        )
        .map((step) => ({ plan, step })),
    )
    .sort(
      (a, b) =>
        a.step.date.localeCompare(b.step.date) ||
        a.plan.examDate.localeCompare(b.plan.examDate),
    )[0];
  if (planned) {
    const { plan, step } = planned;
    const item = series.find((item) => item.id === step.seriesId);
    const destination =
      item && ["practice", "mistakes", "mock"].includes(step.kind)
        ? `/student/exercise/${encodeURIComponent(item.id)}?planId=${encodeURIComponent(plan.id)}&stepId=${encodeURIComponent(step.id)}${step.kind === "mock" ? `&mode=exam&minutes=${step.minutes}` : ""}`
        : `/student/plans?id=${encodeURIComponent(plan.id)}`;
    return {
      title: step.title,
      reason: `Prévu pour ton contrôle : ${plan.title}.`,
      minutes: step.minutes,
      estimated: false,
      resume: false,
      subjectId: plan.subjectId,
      destination,
    };
  }
  const review = [...(data.spacedReviews ?? [])]
    .filter(
      (review) => review.dueDate <= today && courseIds.has(review.courseId),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const course = review
    ? courses.find((course) => course.id === review.courseId)
    : undefined;
  if (course)
    return {
      title: course.title,
      reason: "Une petite relecture pour garder les idées en mémoire.",
      minutes: 5,
      estimated: true,
      resume: false,
      subjectId: course.subjectId,
      destination: `/student/course/${encodeURIComponent(course.id)}`,
    };
  const pending = [...series]
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .find(
      (item) =>
        (item.mode !== "exam" || (!!item.dueDate && item.dueDate <= today)) &&
        !attempts.some(
          (attempt) => attempt.seriesId === item.id && attempt.completedAt,
        ),
    );
  if (pending) return exerciseSession(pending);
  const unread = courses.find(
    (course) => !data.reviewedCourseIds.includes(course.id),
  );
  return unread
    ? {
        title: unread.title,
        reason: "Une fiche à découvrir à ton rythme.",
        minutes: 5,
        estimated: true,
        resume: false,
        subjectId: unread.subjectId,
        destination: `/student/course/${encodeURIComponent(unread.id)}`,
      }
    : null;
}

export interface ConceptToReview {
  concept: string;
  subjectId: string;
  errors: number;
  question: Question;
  response: string;
  courseIds: string[];
}

/** Results and explanations come from the snapshots actually shown to the child. */
export function learningOverview(data: LearningData) {
  const completed = data.attempts.filter((attempt) => attempt.completedAt);
  const latest = latestAttempts(completed, true);
  const answers = latest.flatMap((attempt) => attempt.answers);
  const keyFor = (attempt: Attempt, question: Question) =>
    `${attempt.subjectId}:${question.concept || question.prompt}`;
  const counts = new Map<string, number>();
  for (const attempt of completed) {
    for (const question of attempt.questions) {
      if (
        !attempt.answers.some(
          (answer) => answer.questionId === question.id && !answer.isCorrect,
        )
      )
        continue;
      const key = keyFor(attempt, question);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const concepts = new Map<string, ConceptToReview>();
  for (const attempt of [...latest].sort((a, b) =>
    b.completedAt!.localeCompare(a.completedAt!),
  )) {
    for (const question of attempt.questions) {
      const answer = attempt.answers.find(
        (answer) => answer.questionId === question.id,
      );
      const key = keyFor(attempt, question);
      if (!answer || answer.isCorrect || concepts.has(key)) continue;
      concepts.set(key, {
        concept: question.concept || question.prompt,
        subjectId: attempt.subjectId,
        errors: counts.get(key) ?? 1,
        question,
        response:
          question.choices.find((choice) => choice.id === answer.choiceId)
            ?.label ??
          answer.response ??
          answer.choiceId,
        courseIds:
          data.series.find((series) => series.id === attempt.seriesId)
            ?.courseIds ?? [],
      });
    }
  }
  return {
    completed,
    latest,
    answered: answers.length,
    correct: answers.filter((answer) => answer.isCorrect).length,
    concepts: [...concepts.values()].sort((a, b) => b.errors - a.errors),
  };
}
