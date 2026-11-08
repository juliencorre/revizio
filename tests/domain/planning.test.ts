import { describe, expect, it } from "vitest";
import { initialData } from "../../src/domain/fixtures";
import {
  buildRevisionSteps,
  daysUntil,
  planValidation,
  reschedulePlan,
  stepIsLate,
  validPlanDate,
} from "../../src/domain/planning";
import type { RevisionPlan } from "../../src/domain/model";

const input = {
  title: "Contrôle de maths",
  subjectId: "maths",
  examDate: "2026-11-12",
  courseIds: ["maths-relative-numbers", "maths-priorities"],
  dailyMinutes: 20,
  courses: initialData.courses,
  series: initialData.series,
  today: "2026-11-08",
};
function plan(): RevisionPlan {
  return {
    id: "plan-test",
    status: "draft",
    title: input.title,
    subjectId: input.subjectId,
    examDate: input.examDate,
    courseIds: input.courseIds,
    dailyMinutes: input.dailyMinutes,
    steps: buildRevisionSteps(input),
  };
}
describe("proposition de plan", () => {
  it("propose lecture, pratique, erreurs, contrôle blanc puis résumé avant la date choisie", () => {
    const result = plan();
    expect(result.steps.map((step) => step.kind)).toEqual([
      "read",
      "practice",
      "mistakes",
      "mock",
      "summary",
    ]);
    expect(result.steps[0].date).toBe("2026-11-08");
    expect(result.steps.at(-1)?.date).toBe("2026-11-12");
    expect(planValidation(result, initialData.courses, input.today)).toBeNull();
    expect(
      result.steps.every(
        (step) => step.minutes <= 20 && step.date <= result.examDate,
      ),
    ).toBe(true);
  });
  it("adapte la proposition quand le contrôle est aujourd’hui ou demain", () => {
    expect(
      buildRevisionSteps({ ...input, examDate: input.today }),
    ).toMatchObject([{ kind: "summary", minutes: 5 }]);
    expect(
      buildRevisionSteps({ ...input, examDate: "2026-11-09" }),
    ).toHaveLength(2);
    expect(() =>
      buildRevisionSteps({ ...input, examDate: "2026-11-07" }),
    ).toThrow();
  });
  it("ne déborde pas le jour disponible lors du passage à l’heure d’été", () => {
    expect(daysUntil("2027-03-29", "2027-03-27")).toBe(2);
    expect(
      buildRevisionSteps({
        ...input,
        today: "2027-03-27",
        examDate: "2027-03-29",
      }).map((step) => step.date),
    ).toEqual(["2027-03-27", "2027-03-28", "2027-03-29"]);
  });
  it("refuse les dates impossibles et les chapitres non publiés", () => {
    expect(validPlanDate("2026-02-30")).toBe(false);
    expect(validPlanDate("2028-02-29")).toBe(true);
    expect(() =>
      buildRevisionSteps({
        ...input,
        courseIds: ["history-middle-ages-draft"],
        subjectId: "history-geography",
      }),
    ).toThrow();
  });
  it("exclut une série qui contient un chapitre extérieur au contrôle", () => {
    const series = initialData.series[0];
    const result = buildRevisionSteps({
      ...input,
      series: [
        {
          ...series,
          id: "outside",
          courseIds: [input.courseIds[0], "hors-controle"],
        },
        { ...series, id: "empty", courseIds: [] },
        { ...series, id: "included", courseIds: [...input.courseIds] },
      ],
    });
    const exercises = result.filter((step) =>
      ["practice", "mistakes", "mock"].includes(step.kind),
    );
    expect(exercises).toHaveLength(3);
    expect(exercises.every((step) => step.seriesId === "included")).toBe(true);
  });
});
describe("édition et report", () => {
  it("conserve le travail terminé et redistribue les séances restantes avant le nouveau contrôle", () => {
    const value = plan();
    value.status = "published";
    value.steps[0].completedAt = "2026-11-08T18:00:00Z";
    const updated = reschedulePlan(value, "2026-11-16", "2026-11-10");
    expect(updated.steps[0]).toEqual(value.steps[0]);
    expect(
      updated.steps
        .slice(1)
        .every(
          (step) => step.date >= "2026-11-10" && step.date <= "2026-11-16",
        ),
    ).toBe(true);
    expect(updated.examDate).toBe("2026-11-16");
    expect(updated.status).toBe("draft");
    expect(value.examDate).toBe("2026-11-12");
    expect(planValidation(updated, initialData.courses)).toBeNull();
  });
  it("répartit le temps disponible si plusieurs séances doivent être faites le même jour", () => {
    const value = reschedulePlan(plan(), "2026-11-10", "2026-11-10");
    expect(
      value.steps.reduce((sum, step) => sum + step.minutes, 0),
    ).toBeLessThanOrEqual(20);
    expect(planValidation(value, initialData.courses)).toBeNull();
  });
  it("réserve le budget des séances terminées aujourd’hui et à une date future", () => {
    const value = plan();
    value.status = "published";
    value.steps[0].completedAt = "2026-11-08T18:00:00Z";
    value.steps[3].completedAt = "2026-11-08T18:30:00Z";
    const updated = reschedulePlan(value, "2026-11-16", input.today);
    expect(updated.steps[0]).toEqual(value.steps[0]);
    expect(updated.steps[3]).toEqual(value.steps[3]);
    expect(
      updated.steps
        .filter((step) => !step.completedAt)
        .every(
          (step) =>
            step.date !== value.steps[0].date &&
            step.date !== value.steps[3].date,
        ),
    ).toBe(true);
    expect(planValidation(updated, initialData.courses)).toBeNull();
    expect(updated.status).toBe("draft");
  });
  it("partage seulement les minutes qui restent et refuse une période déjà pleine", () => {
    const value = plan();
    value.examDate = input.today;
    value.steps = value.steps
      .slice(0, 3)
      .map((step) => ({ ...step, date: input.today }));
    value.steps[0] = {
      ...value.steps[0],
      minutes: 17,
      completedAt: "2026-11-08T18:00:00Z",
    };
    const updated = reschedulePlan(value, input.today, input.today);
    expect(updated.steps[0]).toEqual(value.steps[0]);
    expect(updated.steps.slice(1).map((step) => step.minutes)).toEqual([1, 1]);
    expect(planValidation(updated, initialData.courses)).toBeNull();
    value.steps[0].minutes = 20;
    expect(() => reschedulePlan(value, input.today, input.today)).toThrow(
      "pas assez de temps",
    );
  });
  it("signale les séances manquées et les durées incompatibles", () => {
    const value = plan();
    expect(stepIsLate(value.steps[0], "2026-11-09")).toBe(true);
    value.steps[0].completedAt = "2026-11-08T18:00:00Z";
    expect(stepIsLate(value.steps[0], "2026-11-09")).toBe(false);
    value.steps[1].date = value.steps[0].date;
    expect(planValidation(value, initialData.courses)).toContain("total");
    expect(() => reschedulePlan(value, "2026-11-07", "2026-11-08")).toThrow();
  });
});
