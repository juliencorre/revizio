import { expect, it } from "vitest";
import { initialData, subjects } from "../../src/domain/fixtures";
import { nextStudySession } from "../../src/domain/study-overview";
import { visibleLearningData } from "../../src/domain/subject-visibility";
import { mergeLearningData } from "../../src/domain/sync";

it("masque tous les contenus et suggestions et permet de retrouver le profil complet", () => {
  const subjectVisibility = Object.fromEntries(
    subjects.map(({ id }) => [id, false]),
  );
  const stored = { ...initialData, subjectVisibility };
  const hidden = visibleLearningData(stored);
  expect(hidden.courses).toEqual([]);
  expect(hidden.series).toEqual([]);
  expect(hidden.vocabularyLists).toEqual([]);
  expect(nextStudySession(hidden)).toBeNull();
  expect(
    visibleLearningData({ ...stored, subjectVisibility: {} }),
  ).toMatchObject(initialData);
});

it("réunit les choix de matières indépendants de deux parents", () => {
  const result = mergeLearningData(
    initialData,
    { ...initialData, subjectVisibility: { maths: false } },
    { ...initialData, subjectVisibility: { english: false } },
  );
  expect(result.conflicts).toEqual([]);
  expect(result.data.subjectVisibility).toEqual({
    maths: false,
    english: false,
  });
});
