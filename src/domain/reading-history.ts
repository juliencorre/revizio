import type { Course, SpacedReview } from "./model";

export function publishedReadingEditions(courses: Course[]) {
  const ids = new Map<string, string>();
  for (const course of courses) {
    if (course.status !== "published") continue;
    for (const oldId of course.replacedCourseIds ?? [])
      ids.set(oldId, course.id);
    ids.set(course.id, course.id);
  }
  return ids;
}

export function latestSpacedReviews(
  records: SpacedReview[],
  editions?: Map<string, string>,
): SpacedReview[] {
  const latest = new Map<string, SpacedReview>();
  for (const record of records) {
    const id = editions?.get(record.courseId) ?? record.courseId;
    const previous = latest.get(id);
    const time = Date.parse(record.lastReviewedAt ?? "") || 0;
    const previousTime = Date.parse(previous?.lastReviewedAt ?? "") || 0;
    if (
      !previous ||
      time > previousTime ||
      (time === previousTime && !time && record.dueDate > previous.dueDate)
    )
      latest.set(
        id,
        id === record.courseId ? record : { ...record, courseId: id },
      );
  }
  return [...latest.values()];
}
