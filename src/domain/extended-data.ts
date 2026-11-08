import type { Course, ExerciseSeries, LearningData } from "./model";

const obj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const txt = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const day = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value));
const ids = (values: unknown): values is string[] =>
  Array.isArray(values) &&
  values.every(txt) &&
  new Set(values).size === values.length;
const date = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function validateExtendedData(
  data: Record<string, unknown>,
  courses: Course[],
  series: ExerciseSeries[],
): void {
  if (data.plans !== undefined) {
    if (
      !Array.isArray(data.plans) ||
      !ids(data.plans.map((plan) => (obj(plan) ? plan.id : null)))
    )
      throw new Error("Plans de révision invalides.");
    for (const plan of data.plans) {
      if (
        !obj(plan) ||
        !txt(plan.title) ||
        !txt(plan.subjectId) ||
        !day(plan.examDate) ||
        !ids(plan.courseIds) ||
        !["draft", "published"].includes(String(plan.status)) ||
        typeof plan.dailyMinutes !== "number" ||
        !Number.isInteger(plan.dailyMinutes) ||
        plan.dailyMinutes < 1 ||
        plan.dailyMinutes > 180 ||
        !Array.isArray(plan.steps) ||
        !ids(plan.steps.map((step) => (obj(step) ? step.id : null)))
      )
        throw new Error("Un plan de révision est incomplet.");
      if (
        plan.courseIds.some(
          (id) =>
            !courses.some(
              (course) =>
                course.id === id && course.subjectId === plan.subjectId,
            ),
        )
      )
        throw new Error("Un chapitre du plan est introuvable.");
      const planCourseIds = plan.courseIds as string[];
      for (const step of plan.steps) {
        if (
          !obj(step) ||
          !txt(step.title) ||
          !day(step.date) ||
          !["read", "practice", "mistakes", "mock", "summary"].includes(
            String(step.kind),
          ) ||
          typeof step.minutes !== "number" ||
          !Number.isInteger(step.minutes) ||
          step.minutes < 1 ||
          step.minutes > 180 ||
          !ids(step.courseIds) ||
          step.courseIds.some((id) => !planCourseIds.includes(id)) ||
          (step.completedAt !== undefined && !date(step.completedAt)) ||
          (step.seriesId !== undefined &&
            !series.some((item) => item.id === step.seriesId))
        )
          throw new Error("Une étape du plan est invalide.");
      }
    }
  }
  if (data.english !== undefined) {
    const english = data.english;
    if (
      !obj(english) ||
      !Array.isArray(english.words) ||
      !Array.isArray(english.verbs) ||
      !ids(english.tenses) ||
      !Array.isArray(english.toolWords) ||
      !english.toolWords.every(txt)
    )
      throw new Error("Le répertoire anglais est invalide.");
    if (
      !ids(english.words.map((word) => (obj(word) ? word.id : null))) ||
      !english.words.every((word) => obj(word) && txt(word.en) && txt(word.fr))
    )
      throw new Error("Un mot du répertoire est incomplet.");
    if (
      !ids(english.verbs.map((verb) => (obj(verb) ? verb.id : null))) ||
      !english.verbs.every(
        (verb) =>
          obj(verb) &&
          ["base", "past", "participle", "meaning"].every((key) =>
            txt(verb[key]),
          ),
      )
    )
      throw new Error("Un verbe du répertoire est incomplet.");
  }
  if (
    data.readingRecords !== undefined &&
    (!Array.isArray(data.readingRecords) ||
      !data.readingRecords.every(
        (item) => obj(item) && txt(item.courseId) && date(item.reviewedAt),
      ))
  )
    throw new Error("Historique de lecture invalide.");
  if (
    data.spacedReviews !== undefined &&
    (!Array.isArray(data.spacedReviews) ||
      !data.spacedReviews.every(
        (item) =>
          obj(item) &&
          txt(item.courseId) &&
          day(item.dueDate) &&
          typeof item.interval === "number" &&
          item.interval >= 1 &&
          item.interval <= 36500,
      ))
  )
    throw new Error("Calendrier de révision invalide.");
}

export function extendedDataFields(data: LearningData): Partial<LearningData> {
  return {
    ...(data.plans ? { plans: data.plans } : {}),
    ...(data.english ? { english: data.english } : {}),
    ...(data.readingRecords ? { readingRecords: data.readingRecords } : {}),
    ...(data.spacedReviews ? { spacedReviews: data.spacedReviews } : {}),
  };
}
