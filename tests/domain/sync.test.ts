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
