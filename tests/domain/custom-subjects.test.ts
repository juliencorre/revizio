import { expect, it } from "vitest";
import { initialData } from "../../src/domain/fixtures";
import {
  parseLearningData,
  publishCourseInData,
  publishSeriesInData,
  startAttemptInData,
} from "../../src/domain/learning";
import { newCustomSubject, subjectCatalog } from "../../src/domain/subjects";
import { mergeLearningData } from "../../src/domain/sync";

it("préserve la matière dans les cours, exercices, tentatives et sauvegardes", () => {
  const subject = newCustomSubject("  Étude   du milieu  ");
  const example = initialData.series[0];
  const courses = initialData.courses
    .filter((course) => example.courseIds.includes(course.id))
    .map((course) => ({
      ...course,
      subjectId: subject.id,
      status: "draft" as const,
    }));
  let data = parseLearningData(
    JSON.stringify({
      version: 1,
      customSubjects: [subject],
      subjectVisibility: { [subject.id]: true },
      courses,
      reviewedCourseIds: [],
      attempts: [],
      series: [{ ...example, subjectId: subject.id, status: "draft" }],
    }),
  );
  for (const course of courses) {
    const published = publishCourseInData(data, course.id);
    expect(published.result.ok).toBe(true);
    data = published.data;
  }
  const series = publishSeriesInData(data, example.id);
  expect(series.result.ok).toBe(true);
  const started = startAttemptInData(
    series.data,
    example.id,
    "attempt",
    new Date().toISOString(),
  );
  expect(started.attemptId).toBe("attempt");
  const restored = parseLearningData(JSON.stringify(started.data));
  expect(restored.attempts[0].subjectId).toBe(subject.id);
  expect(subjectCatalog(restored.customSubjects)).toContainEqual(
    expect.objectContaining({ title: "Étude du milieu", id: subject.id }),
  );
  expect(() =>
    parseLearningData(JSON.stringify({ ...restored, customSubjects: [] })),
  ).toThrow();
});

it("reconnaît les doublons, y compris après une synchronisation et dans un ancien catalogue", () => {
  const first = newCustomSubject("Économie");
  expect(() => newCustomSubject(" economie ", [first])).toThrow(/existe déjà/);
  for (const title of [" Français ", "espagnol", "maths"])
    expect(() => newCustomSubject(title)).toThrow(/existe déjà/);
  expect(newCustomSubject("C++").id).not.toBe(newCustomSubject("C").id);
  expect(newCustomSubject("日本語").id).toMatch(/^custom-[a-z0-9_-]+$/);
  const second = newCustomSubject("Géologie");
  const local = { ...initialData, customSubjects: [first] };
  const remote = { ...initialData, customSubjects: [second, first] };
  const merged = mergeLearningData(initialData, local, remote);
  expect(merged.conflicts).toEqual([]);
  expect(merged.data.customSubjects).toEqual([second, first]);
  expect(() =>
    parseLearningData(
      JSON.stringify({ ...local, customSubjects: [first, first] }),
    ),
  ).toThrow();
  expect(() =>
    parseLearningData(
      JSON.stringify({ ...local, customSubjects: [{ ...first, id: "maths" }] }),
    ),
  ).toThrow();
});
