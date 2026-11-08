import type { Course, ExerciseSeries, PlanStep, RevisionPlan } from "./model";

export type RevisionStepInput = Pick<
  RevisionPlan,
  "title" | "subjectId" | "examDate" | "courseIds" | "dailyMinutes"
> & {
  courses: Course[];
  series?: ExerciseSeries[];
  today?: string;
};

export const planStepLabels: Record<PlanStep["kind"], string> = {
  read: "Relire une fiche",
  practice: "S’entraîner",
  mistakes: "Revoir les erreurs",
  mock: "Contrôle blanc",
  summary: "Relire l’essentiel",
};

/** Date-only arithmetic is performed at noon UTC, independently from DST. */
export function dateOnly(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function validPlanDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
function dayNumber(value: string): number {
  return Math.floor(Date.parse(`${value}T12:00:00Z`) / 86_400_000);
}
function dayString(value: number): string {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}
export function daysUntil(date: string, today = dateOnly()): number {
  return dayNumber(date) - dayNumber(today);
}

export function planValidation(
  plan: RevisionPlan,
  courses: Course[],
  today?: string,
): string | null {
  if (!plan.title.trim()) return "Donnez un titre au contrôle.";
  if (!validPlanDate(plan.examDate))
    return "Choisissez une date de contrôle valide (AAAA-MM-JJ).";
  if (today && plan.examDate < today)
    return "La date du contrôle est passée. Choisissez une nouvelle date.";
  if (
    !Number.isInteger(plan.dailyMinutes) ||
    plan.dailyMinutes < 5 ||
    plan.dailyMinutes > 120
  )
    return "Prévoyez entre 5 et 120 minutes de révision par jour.";
  if (
    !plan.courseIds.length ||
    new Set(plan.courseIds).size !== plan.courseIds.length
  )
    return "Choisissez au moins un chapitre, sans doublon.";
  if (
    plan.courseIds.some(
      (id) =>
        !courses.some(
          (course) =>
            course.id === id &&
            course.subjectId === plan.subjectId &&
            course.status === "published",
        ),
    )
  )
    return "Les chapitres doivent être publiés et appartenir à la matière choisie.";
  if (!plan.steps.length) return "Préparez au moins une séance de révision.";
  if (new Set(plan.steps.map((step) => step.id)).size !== plan.steps.length)
    return "Chaque séance doit avoir un identifiant distinct.";
  const dailyTotals = new Map<string, number>();
  for (const step of plan.steps) {
    if (
      !step.id ||
      !step.title.trim() ||
      !Object.hasOwn(planStepLabels, step.kind)
    )
      return "Complétez le titre et le type de chaque séance.";
    if (!validPlanDate(step.date) || step.date > plan.examDate)
      return "Toutes les séances doivent avoir lieu au plus tard le jour du contrôle.";
    if (
      !Number.isInteger(step.minutes) ||
      step.minutes < 1 ||
      step.minutes > 120
    )
      return "La durée d’une séance doit être comprise entre 1 et 120 minutes.";
    if (
      !step.courseIds.length ||
      step.courseIds.some((id) => !plan.courseIds.includes(id))
    )
      return "Chaque séance doit porter sur les chapitres du contrôle.";
    dailyTotals.set(
      step.date,
      (dailyTotals.get(step.date) ?? 0) + step.minutes,
    );
  }
  if ([...dailyTotals.values()].some((total) => total > plan.dailyMinutes))
    return "Le total des séances d’une journée dépasse le temps disponible. Ajustez les durées ou les dates.";
  return null;
}

/** A transparent rule-based proposal, never presented as an AI output. */
export function buildRevisionSteps(input: RevisionStepInput): PlanStep[] {
  const today = input.today ?? dateOnly();
  if (!validPlanDate(today) || !validPlanDate(input.examDate))
    throw new Error("Choisissez une date valide.");
  const days = daysUntil(input.examDate, today);
  if (days < 0) throw new Error("La date du contrôle est passée.");
  if (days > 365)
    throw new Error("Préparez les contrôles des douze prochains mois.");
  if (!input.courseIds.length)
    throw new Error("Choisissez les chapitres à réviser.");
  if (
    !Number.isInteger(input.dailyMinutes) ||
    input.dailyMinutes < 5 ||
    input.dailyMinutes > 120
  )
    throw new Error("Prévoyez entre 5 et 120 minutes de révision par jour.");
  const courses = input.courses.filter((course) =>
    input.courseIds.includes(course.id),
  );
  if (
    courses.length !== input.courseIds.length ||
    courses.some(
      (course) =>
        course.status !== "published" || course.subjectId !== input.subjectId,
    )
  )
    throw new Error("Choisissez des chapitres publiés de la même matière.");
  const minutes = Math.max(5, Math.min(120, Math.round(input.dailyMinutes)));
  const stages: Array<{
    kind: PlanStep["kind"];
    title: string;
    offset: number;
  }> =
    days === 0
      ? [{ kind: "summary", title: "Jour J : relire l’essentiel", offset: 0 }]
      : days === 1
        ? [
            {
              kind: "practice",
              title: "Relire puis s’entraîner sur les chapitres",
              offset: 0,
            },
            {
              kind: "summary",
              title: "Jour J : relire l’essentiel",
              offset: 1,
            },
          ]
        : days === 2
          ? [
              {
                kind: "read",
                title: "Retrouver les notions et les méthodes",
                offset: 0,
              },
              { kind: "mock", title: "Se tester avant le contrôle", offset: 1 },
              {
                kind: "summary",
                title: "Jour J : relire l’essentiel",
                offset: 2,
              },
            ]
          : days === 3
            ? [
                {
                  kind: "read",
                  title: "Relire les fiches et leurs exemples",
                  offset: 0,
                },
                {
                  kind: "practice",
                  title: "S’entraîner sur les chapitres",
                  offset: 1,
                },
                { kind: "mock", title: "Contrôle blanc", offset: 2 },
                {
                  kind: "summary",
                  title: "Jour J : relire l’essentiel",
                  offset: 3,
                },
              ]
            : [
                {
                  kind: "read",
                  title: "Relire les fiches et leurs exemples",
                  offset: 0,
                },
                {
                  kind: "practice",
                  title: "S’entraîner sur les chapitres",
                  offset: Math.max(1, Math.floor(days / 4)),
                },
                {
                  kind: "mistakes",
                  title: "Revoir les erreurs et essayer à nouveau",
                  offset: Math.max(2, Math.floor(days / 2)),
                },
                { kind: "mock", title: "Contrôle blanc", offset: days - 1 },
                {
                  kind: "summary",
                  title: "Jour J : relire l’essentiel",
                  offset: days,
                },
              ];
  const approvedSeries =
    input.series?.filter(
      (series) =>
        series.status === "published" &&
        series.subjectId === input.subjectId &&
        series.courseIds.length > 0 &&
        series.courseIds.every((id) => input.courseIds.includes(id)),
    ) ?? [];
  return stages.map((stage, index) => ({
    id: `step-${today}-${stage.kind}-${index}`,
    date: dayString(dayNumber(today) + stage.offset),
    title: stage.title,
    kind: stage.kind,
    minutes:
      stage.kind === "summary"
        ? Math.min(5, minutes)
        : stage.kind === "mistakes"
          ? Math.min(15, minutes)
          : minutes,
    courseIds: [...input.courseIds],
    ...(["practice", "mistakes", "mock"].includes(stage.kind) &&
    approvedSeries.length
      ? { seriesId: approvedSeries[index % approvedSeries.length].id }
      : {}),
  }));
}

/** Preserve completed work and spread remaining sessions before the new exam. */
export function reschedulePlan(
  plan: RevisionPlan,
  newExamDate: string,
  today = dateOnly(),
): RevisionPlan {
  if (
    !validPlanDate(today) ||
    !validPlanDate(newExamDate) ||
    newExamDate < today
  )
    throw new Error("Choisissez une date à partir d’aujourd’hui.");
  const span = daysUntil(newExamDate, today);
  if (span > 365)
    throw new Error(
      "La nouvelle date doit être dans les douze prochains mois.",
    );
  const pending = plan.steps.filter((step) => !step.completedAt);
  const dates = pending.map((_, index) =>
    dayString(
      dayNumber(today) +
        (pending.length <= 1
          ? span
          : Math.round((index * span) / (pending.length - 1))),
    ),
  );
  const perDate = dates.reduce<Record<string, number>>(
    (map, day) => ({ ...map, [day]: (map[day] ?? 0) + 1 }),
    {},
  );
  let index = 0;
  return {
    ...plan,
    status: "draft",
    examDate: newExamDate,
    steps: plan.steps.map((step) => {
      if (step.completedAt) return { ...step };
      const date = dates[index++];
      return {
        ...step,
        date,
        minutes: Math.min(
          step.minutes,
          Math.max(1, Math.floor(plan.dailyMinutes / perDate[date])),
        ),
      };
    }),
  };
}

export function stepIsLate(step: PlanStep, today = dateOnly()): boolean {
  return !step.completedAt && step.date < today;
}
