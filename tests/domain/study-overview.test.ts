import { describe, expect, it } from "vitest";
import { initialData } from "../../src/domain/fixtures";
import type {
  Attempt,
  LearningData,
  RevisionPlan,
} from "../../src/domain/model";
import {
  learningOverview,
  nextStudySession,
  preparationStatus,
} from "../../src/domain/study-overview";

const today = "2026-11-15";
function data(): LearningData {
  return structuredClone(initialData);
}
function attempt(overrides: Partial<Attempt> = {}): Attempt {
  const series = initialData.series[0];
  return {
    id: "attempt",
    seriesId: series.id,
    seriesTitle: "Titre réellement présenté",
    subjectId: series.subjectId,
    startedAt: "2026-11-14T10:00:00Z",
    questions: structuredClone(series.questions),
    answers: [],
    ...overrides,
  };
}
function plan(): RevisionPlan {
  const series = initialData.series[0];
  return {
    id: "plan",
    title: "Contrôle de maths",
    status: "published",
    subjectId: series.subjectId,
    examDate: "2026-11-20",
    dailyMinutes: 15,
    courseIds: series.courseIds,
    steps: [
      {
        id: "step",
        title: "Contrôle blanc",
        date: today,
        kind: "mock",
        minutes: 15,
        courseIds: series.courseIds,
        seriesId: series.id,
      },
    ],
  };
}

describe("prochaine séance", () => {
  it("reprend l’instantané et le plan d’un essai commencé avant les nouvelles activités", () => {
    const state = data();
    state.plans = [plan()];
    state.attempts = [
      attempt({ mode: "exam", planId: "plan", stepId: "step" }),
    ];
    expect(nextStudySession(state, today)).toMatchObject({
      title: "Titre réellement présenté",
      resume: true,
    });
    expect(nextStudySession(state, today)?.destination).toBe(
      `/student/exercise/${state.series[0].id}?attemptId=attempt&mode=exam&planId=plan&stepId=step`,
    );
  });
  it("ouvre la fiche de conjugaison publiée et reprend la bonne tentative", () => {
    const be = { verb: "be", tense: "present-simple" };
    const have = { verb: "have", tense: "past-simple" };
    const state: LearningData = {
      version: 1,
      courses: [],
      series: [],
      reviewedCourseIds: [],
      attempts: [],
      conjugationSheets: [be, have],
    };
    expect(nextStudySession(state, today)).toMatchObject({
      subjectId: "english",
      resume: false,
      title: "be · Présent simple",
      destination:
        "/student/conjugation?verb=be&tense=present-simple&mode=learn",
    });
    state.attempts = [
      attempt({
        id: "essai 2",
        seriesId: "conjugation:have:past-simple",
        subjectId: "english",
      }),
    ];
    expect(nextStudySession(state, today)).toMatchObject({
      resume: true,
      destination:
        "/student/conjugation?verb=have&tense=past-simple&mode=practice&attemptId=essai%202",
    });
    state.conjugationSheets = [be];
    expect(nextStudySession(state, today)?.destination).toBe(
      "/student/conjugation?verb=be&tense=present-simple&mode=learn",
    );
    state.conjugationSheets = [];
    expect(nextStudySession(state, today)).toBeNull();
  });
  it("ouvre la séance due avec son contexte et sa durée de contrôle blanc", () => {
    const state = data();
    state.plans = [plan()];
    expect(nextStudySession(state, today)).toMatchObject({
      title: "Contrôle blanc",
      minutes: 15,
      estimated: false,
      destination: `/student/exercise/${state.series[0].id}?planId=plan&stepId=step&mode=exam&minutes=15`,
    });
  });
  it("privilégie une relecture arrivée à échéance sur une nouvelle série", () => {
    const state = data();
    state.spacedReviews = [
      { courseId: state.courses[0].id, dueDate: today, interval: 2 },
    ];
    expect(nextStudySession(state, today)?.destination).toBe(
      `/student/course/${state.courses[0].id}`,
    );
  });
  it("n’expose aucun contenu en brouillon, même via un exercice publié ou un plan", () => {
    const state = data();
    state.courses.forEach((course) => (course.status = "draft"));
    state.plans = [plan()];
    state.attempts = [attempt()];
    expect(nextStudySession(state, today)).toBeNull();
  });
  it("ne propose ni un ancien essai inachevé remplacé, ni une fiche déjà relue", () => {
    const state = data();
    state.reviewedCourseIds = state.courses
      .filter((course) => course.status === "published")
      .map((course) => course.id);
    state.attempts = state.series.map((series, index) =>
      attempt({
        id: `done-${index}`,
        seriesId: series.id,
        startedAt: "2026-11-15T10:00:00Z",
        completedAt: "2026-11-15T10:10:00Z",
      }),
    );
    state.attempts.unshift(attempt());
    expect(nextStudySession(state, today)).toBeNull();
  });
  it("ne recommande pas un contrôle blanc prévu dans le futur", () => {
    const state = data();
    state.series = [
      { ...state.series[0], mode: "exam", dueDate: "2026-11-20" },
    ];
    state.reviewedCourseIds = state.courses.map((course) => course.id);
    expect(nextStudySession(state, today)).toBeNull();
  });
});

describe("suivi pédagogique", () => {
  it("conserve la question et la correction vues, sans les remplacer par la série actuelle", () => {
    const state = data();
    const failed = attempt({ completedAt: "2026-11-14T10:05:00Z" });
    failed.answers = [
      {
        questionId: failed.questions[0].id,
        choiceId: "incorrect",
        isCorrect: false,
        usedHint: false,
        answeredAt: failed.completedAt!,
      },
    ];
    state.attempts = [failed];
    state.series[0].questions[0].explanation = "Nouvelle correction";
    const overview = learningOverview(state);
    expect(overview.concepts[0].question.explanation).toBe(
      failed.questions[0].explanation,
    );
    expect(overview.answered).toBe(1);
    expect(overview.concepts).toHaveLength(1);
  });
  it("affiche le libellé choisi plutôt que son identifiant interne", () => {
    const state = data();
    const failed = attempt({ completedAt: "2026-11-14T10:05:00Z" });
    const choice = failed.questions[0].choices.find(
      (choice) => choice.id !== failed.questions[0].correctChoiceId,
    )!;
    failed.answers = [
      {
        questionId: failed.questions[0].id,
        choiceId: choice.id,
        response: choice.id,
        isCorrect: false,
        usedHint: false,
        answeredAt: failed.completedAt!,
      },
    ];
    state.attempts = [failed];
    expect(learningOverview(state).concepts[0].response).toBe(choice.label);
  });
  it("retire les anciennes erreurs corrigées du dernier essai et ignore les essais en cours pour les résultats", () => {
    const state = data();
    const failed = attempt({ completedAt: "2026-11-14T10:05:00Z" });
    failed.answers = [
      {
        questionId: failed.questions[0].id,
        choiceId: "incorrect",
        isCorrect: false,
        usedHint: false,
        answeredAt: failed.completedAt!,
      },
    ];
    const passed = structuredClone(failed);
    passed.id = "passed";
    passed.startedAt = "2026-11-15T10:00:00Z";
    passed.completedAt = "2026-11-15T10:05:00Z";
    passed.answers[0].isCorrect = true;
    state.attempts = [
      passed,
      failed,
      attempt({ id: "ongoing", startedAt: "2026-11-15T11:00:00Z" }),
    ];
    expect(learningOverview(state)).toMatchObject({
      answered: 1,
      correct: 1,
      concepts: [],
    });
  });
  it("compte les erreurs répétées sans confondre les matières", () => {
    const state = data();
    const failed = attempt({ completedAt: "2026-11-14T10:05:00Z" });
    failed.answers = [
      {
        questionId: failed.questions[0].id,
        choiceId: "incorrect",
        isCorrect: false,
        usedHint: false,
        answeredAt: failed.completedAt!,
      },
    ];
    state.attempts = [
      failed,
      {
        ...structuredClone(failed),
        id: "again",
        startedAt: "2026-11-15T10:00:00Z",
        completedAt: "2026-11-15T10:05:00Z",
      },
      {
        ...structuredClone(failed),
        id: "english",
        seriesId: "english",
        subjectId: "english",
      },
    ];
    expect(
      learningOverview(state).concepts.map((item) => [
        item.subjectId,
        item.errors,
      ]),
    ).toEqual([
      [failed.subjectId, 2],
      ["english", 1],
    ]);
  });
  it("distingue le brouillon vide, le contenu à vérifier et le contenu publié", () => {
    const state = data();
    const course = state.courses[0];
    expect(preparationStatus(course)).toBe("Publié");
    course.status = "draft";
    expect(preparationStatus(course)).toBe("À vérifier");
    course.sections = [];
    expect(preparationStatus(course)).toBe("Brouillon");
  });
});
