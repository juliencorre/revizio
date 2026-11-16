import type { LearningData } from "./model";
import { vocabularyListsFor } from "./vocabulary";

/** Projection used by the family screens. Keep the stored profile intact. */
export function visibleLearningData(data: LearningData): LearningData {
  const visibility = data.subjectVisibility;
  if (!visibility || !Object.values(visibility).includes(false)) return data;
  const visible = (id: string) => visibility[id] !== false;
  const courses = data.courses.filter((item) => visible(item.subjectId));
  const attempts = data.attempts.filter((item) => visible(item.subjectId));
  const courseIds = new Set(
    courses.flatMap((item) => [item.id, ...(item.replacedCourseIds ?? [])]),
  );
  const attemptIds = new Set(attempts.map((item) => item.id));
  return {
    ...data,
    courses,
    series: data.series.filter((item) => visible(item.subjectId)),
    attempts,
    plans: data.plans?.filter((item) => visible(item.subjectId)),
    answerReviews: data.answerReviews?.filter((item) =>
      attemptIds.has(item.attemptId),
    ),
    reviewedCourseIds: data.reviewedCourseIds.filter((id) => courseIds.has(id)),
    readingRecords: data.readingRecords?.filter((item) =>
      courseIds.has(item.courseId),
    ),
    spacedReviews: data.spacedReviews?.filter((item) =>
      courseIds.has(item.courseId),
    ),
    english: visible("english") ? data.english : undefined,
    conjugationSheets: visible("english") ? data.conjugationSheets : undefined,
    vocabularyLists: vocabularyListsFor(data).filter((item) =>
      visible(item.language),
    ),
    vocabularyRetainedWords: data.vocabularyRetainedWords?.filter((item) =>
      visible(item.language),
    ),
    vocabularySessions: data.vocabularySessions?.filter((item) =>
      visible(item.language),
    ),
  };
}
