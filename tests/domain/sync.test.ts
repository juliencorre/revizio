import { describe, expect, it } from "vitest";
import { clone } from "../../src/domain/learning";
import { initialData } from "../../src/domain/fixtures";
import { mergeLearningData } from "../../src/domain/sync";
describe("synchronisation familiale", () => {
  it("fusionne une modification parent et une lecture enfant sans perdre aucune action", () => {
    const base = clone(initialData),
      local = clone(base),
      remote = clone(base);
    local.courses[0].description = "Version préparée par le parent";
    remote.reviewedCourseIds = [base.courses[0].id];
    const merged = mergeLearningData(base, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.data.courses[0].description).toBe(
      local.courses[0].description,
    );
    expect(merged.data.reviewedCourseIds).toEqual(remote.reviewedCourseIds);
  });
  it("garde les lectures concurrentes de deux éditions et le dernier rappel reçu", () => {
    const base = clone(initialData);
    const first = base.courses[0];
    const local = clone(base);
    const remote = clone(base);
    const earlier = {
      courseId: first.id,
      reviewedAt: "2026-11-18T14:00:00.000Z",
    };
    const later = { courseId: "v2", reviewedAt: "2026-11-19T14:00:00.000Z" };
    local.readingRecords = [earlier];
    local.spacedReviews = [
      {
        courseId: first.id,
        lastReviewedAt: earlier.reviewedAt,
        dueDate: "2026-11-20",
        interval: 2,
      },
    ];
    remote.courses[0] = { ...first, status: "archived" };
    remote.courses.push({ ...first, id: "v2", replacedCourseIds: [first.id] });
    remote.readingRecords = [later];
    remote.spacedReviews = [
      {
        courseId: "v2",
        lastReviewedAt: later.reviewedAt,
        dueDate: "2026-11-22",
        interval: 3,
      },
    ];
    const merged = mergeLearningData(base, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.data.readingRecords).toEqual([later, earlier]);
    expect(merged.data.spacedReviews).toEqual(remote.spacedReviews);
  });
  it("signale des modifications concurrentes du même contenu et laisse un choix explicite", () => {
    const base = clone(initialData),
      local = clone(base),
      remote = clone(base);
    local.courses[0].description = "Local";
    remote.courses[0].description = "Serveur";
    expect(mergeLearningData(base, local, remote).conflicts).toContain(
      "courses.maths-relative-numbers.description",
    );
    expect(
      mergeLearningData(base, local, remote, "local").data.courses[0]
        .description,
    ).toBe("Local");
  });
  it("conserve la suppression locale si le serveur n’a pas modifié le même cours", () => {
    const base = clone(initialData),
      local = clone(base),
      remote = clone(base);
    local.courses = local.courses.filter((c) => c.id !== "svt-digestion");
    remote.reviewedCourseIds = ["maths-fractions"];
    const result = mergeLearningData(base, local, remote);
    expect(result.conflicts).toHaveLength(0);
    expect(result.data.courses.some((c) => c.id === "svt-digestion")).toBe(
      false,
    );
  });
});
