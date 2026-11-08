import { describe, expect, it } from "vitest";
import { initialData } from "../../src/domain/fixtures";
import {
  answerQuestionInData,
  clone,
  completeAttemptInData,
  coursePublicationError,
  parseLearningData,
  startAttemptInData,
} from "../../src/domain/learning";
import { restoreLearningData } from "../../src/state/persistence";
import type { LearningData } from "../../src/domain/model";

const startedAt = "2026-11-09T08:00:00.000Z";
const finishedAt = "2026-11-09T08:01:00.000Z";
function timedData(): LearningData {
  return startAttemptInData(
    clone(initialData),
    "maths-relative-practice",
    "timed",
    startedAt,
    false,
    {
      mode: "exam",
      timeLimitSeconds: 300,
      profileId: "child",
      planId: "old-plan",
      stepId: "old-step",
    },
  ).data;
}

describe("restauration des champs étendus v1", () => {
  it("conserve les métadonnées des documents, citations, schémas et contrôles terminés", () => {
    let data = clone(initialData);
    const course = data.courses[0],
      question = data.series[0].questions[0];
    Object.assign(course, {
      sourceText: "Le cours complet.",
      originId: "original",
      revision: 2,
      profileId: "child",
      generationJobId: "job-1",
      generationAppliedJobId: "job-2",
    });
    course.sources = [
      {
        id: "source-page-2",
        name: "Cours.pdf",
        uri: "/api/uploads/source",
        mimeType: "application/pdf",
        storageId: "source",
        page: 2,
        rotation: 90,
        extractedText: "Le texte de la page.",
        uncertain: true,
        cachedUri: "blob:cached-source",
      },
    ];
    course.sections[0].sourceRefs = [
      { sourceId: "source", page: 2, excerpt: "Le texte de la page." },
    ];
    course.sections[0].diagram = {
      type: "number-line",
      min: -5,
      max: 5,
      points: [{ value: -3, label: "A" }],
    };
    question.rubric = "Une réponse correcte.";
    question.tolerance = 0;
    question.sourceRefs = [{ sourceId: "source", page: 2 }];
    Object.assign(data.series[0], {
      mode: "exam",
      timeLimitSeconds: 300,
      profileId: "child",
      generationJobId: "job-3",
    });
    data = startAttemptInData(
      data,
      data.series[0].id,
      "timed",
      startedAt,
      false,
      { profileId: "child", planId: "old-plan", stepId: "old-step" },
    ).data;
    for (const q of data.attempts[0].questions)
      data = answerQuestionInData(
        data,
        "timed",
        q.id,
        q.correctChoiceId,
        false,
        finishedAt,
      );
    data = completeAttemptInData(data, "timed", finishedAt);
    data.attempts[0].submittedAt = finishedAt;
    // Historical attempts remain valid when their plan is no longer present.
    expect(parseLearningData(JSON.stringify(data))).toEqual(data);
  });
  it("accepte les anciens snapshots sans champs optionnels et les brouillons en cours de saisie", () => {
    const data = startAttemptInData(
      clone(initialData),
      "maths-relative-practice",
      "old",
      startedAt,
    ).data;
    delete data.attempts[0].mode;
    const draft = data.courses.find((course) => course.status === "draft")!;
    draft.title = "";
    draft.description = "";
    draft.sourceText = "";
    draft.sections[0].title = "";
    draft.sections[0].content = "";
    draft.sections[0].sourceRefs = [{ sourceId: "draft-source", excerpt: "" }];
    draft.sections[0].diagram = { type: "fraction" };
    draft.sources = [
      {
        id: "draft-source",
        name: "",
        uri: "",
        cachedUri: "",
        mimeType: "",
        extractedText: "",
        uncertain: false,
        rotation: 0,
      },
    ];
    data.series.push({
      id: "unfinished",
      title: "",
      courseIds: [],
      subjectId: "maths",
      status: "draft",
      level: "practice",
      questions: [
        {
          id: "unfinished-question",
          type: "fill-blank",
          prompt: "",
          choices: [],
          correctChoiceId: "",
          expectedAnswers: [],
          tolerance: 0,
          explanation: "",
          hint: "",
          concept: "",
          rubric: "",
          sourceRefs: [],
        },
      ],
    });
    expect(parseLearningData(JSON.stringify(data))).toEqual(data);
  });
  it.each([
    ["citations non itérables", { sourceRefs: "page 1" }],
    ["points non itérables", { diagram: { type: "number-line", points: {} } }],
    ["point nul", { diagram: { type: "timeline", points: [null] } }],
    [
      "libellé React invalide",
      { diagram: { type: "number-line", points: [{ value: 2, label: {} }] } },
    ],
    ["page source impossible", { sourceRefs: [{ sourceId: "page", page: 0 }] }],
  ])("refuse avant rendu : %s", (_name, patch) => {
    const data = clone(initialData);
    Object.assign(data.courses[0].sections[0], patch);
    expect(() => parseLearningData(JSON.stringify(data))).toThrow(
      "incomplète ou invalide",
    );
    const restored = restoreLearningData(JSON.stringify(data));
    expect(restored.error).toBeTruthy();
    expect(restored.data).toEqual(initialData);
  });
  it.each([
    ["cache URI objet", { cachedUri: {} }],
    ["texte extrait objet", { extractedText: { text: "cours" } }],
    ["identité stockage tableau", { storageId: ["source"] }],
    ["rotation inexploitable", { rotation: 45 }],
    ["page non entière", { page: 1.5 }],
    ["incertitude textuelle", { uncertain: "false" }],
  ])("refuse un document restauré incohérent : %s", (_name, patch) => {
    const data = clone(initialData);
    data.courses[0].sources = [{ id: "source", name: "Cours" }];
    Object.assign(data.courses[0].sources[0], patch);
    expect(() => parseLearningData(JSON.stringify(data))).toThrow(
      "incomplète ou invalide",
    );
  });
  it("refuse des options de correction qui changeraient implicitement de type", () => {
    for (const patch of [
      { type: ["single-choice"] },
      { rubric: {} },
      { tolerance: "1000" },
      { tolerance: -1 },
      { sourceRefs: [null] },
    ]) {
      const data = clone(initialData);
      data.series[0].status = "draft";
      Object.assign(data.series[0].questions[0], patch);
      expect(() => parseLearningData(JSON.stringify(data))).toThrow(
        "incomplète ou invalide",
      );
    }
  });
  it.each([
    ["échéance illisible", { deadlineAt: "demain" }],
    ["échéance absente", { deadlineAt: undefined }],
    ["échéance antérieure", { deadlineAt: "2026-11-09T07:00:00.000Z" }],
    [
      "durée au-delà des deux heures de l’interface",
      { deadlineAt: "2026-11-10T08:00:00.000Z" },
    ],
    ["mode objet", { mode: { name: "exam" } }],
    ["étape sans identité de plan", { planId: undefined }],
    ["identité de plan non textuelle", { planId: {} }],
    ["soumission sans clôture", { submittedAt: finishedAt }],
  ])("n’hydrate pas un contrôle sans chrono fiable : %s", (_name, patch) => {
    const data = timedData();
    Object.assign(data.attempts[0], patch);
    expect(() => parseLearningData(JSON.stringify(data))).toThrow(
      "incomplète ou invalide",
    );
  });
  it("rejette les durées de série invalides et les nouvelles identités mal typées", () => {
    for (const patch of [
      { mode: ["exam"] },
      { timeLimitSeconds: 0 },
      { timeLimitSeconds: "60" },
      { timeLimitSeconds: 7201 },
      { profileId: {} },
      { generationJobId: {} },
    ]) {
      const data = clone(initialData);
      Object.assign(data.series[0], patch);
      expect(() => parseLearningData(JSON.stringify(data))).toThrow();
    }
    for (const patch of [
      { sourceText: {} },
      { revision: "2" },
      { revision: 0 },
      { originId: {} },
      { generationAppliedJobId: [] },
    ]) {
      const data = clone(initialData);
      Object.assign(data.courses[0], patch);
      expect(() => parseLearningData(JSON.stringify(data))).toThrow();
    }
  });
  it("crée un contrôle chronométré de 20 minutes par défaut et refuse une durée inexploitable", () => {
    const exam = startAttemptInData(
      clone(initialData),
      "maths-relative-practice",
      "default-exam",
      startedAt,
      false,
      { mode: "exam" },
    );
    expect(exam.data.attempts[0].deadlineAt).toBe("2026-11-09T08:20:00.000Z");
    expect(parseLearningData(JSON.stringify(exam.data))).toEqual(exam.data);
    for (const timeLimitSeconds of [0, -1, 0.5, 7201])
      expect(
        startAttemptInData(
          clone(initialData),
          "maths-relative-practice",
          "invalid-exam",
          startedAt,
          false,
          { mode: "exam", timeLimitSeconds },
        ).attemptId,
      ).toBeNull();
  });
  it("garde les schémas incomplets en brouillon et exige un rendu cohérent avant publication", () => {
    const course = clone(initialData.courses[0]);
    for (const diagram of [
      { type: "fraction" as const },
      { type: "fraction" as const, numerator: 3, denominator: 2 },
      { type: "fraction" as const, numerator: 1, denominator: 25 },
      { type: "number-line" as const, min: 5, max: -5 },
      { type: "timeline" as const, min: -1_000_001, max: 5 },
      {
        type: "number-line" as const,
        points: [{ value: 10, label: "En dehors" }],
      },
      { type: "number-line" as const, points: [{ value: 0, label: "" }] },
      {
        type: "number-line" as const,
        points: Array.from({ length: 13 }, (_, value) => ({
          value: 0,
          label: String(value),
        })),
      },
    ]) {
      course.sections[0].diagram = diagram;
      course.status = "draft";
      const data = clone(initialData);
      data.courses[0] = course;
      // Other published series require this course: leave them as drafts while editing it.
      data.series.forEach((series) => {
        series.status = "draft";
      });
      expect(() => parseLearningData(JSON.stringify(data))).not.toThrow();
      expect(coursePublicationError(course)).toBeTruthy();
    }
    for (const diagram of [
      { type: "fraction" as const, numerator: 3, denominator: 8 },
      { type: "timeline" as const, points: [{ value: 0, label: "Repère" }] },
    ]) {
      course.sections[0].diagram = diagram;
      expect(coursePublicationError(course)).toBeNull();
    }
  });
});
