import { describe, expect, it } from "vitest";
import { initialData, subjects } from "../../src/domain/fixtures";
import {
  answerQuestionInData,
  clone,
  completeAttemptInData,
  coursePublicationError,
  getAttemptScore,
  markReviewedInData,
  parseLearningData,
  publishCourseInData,
  publishSeriesInData,
  questionError,
  seriesPublicationError,
  startAttemptInData,
} from "../../src/domain/learning";
const NOW = "2026-11-08T20:00:00.000Z";
const start = () =>
  startAttemptInData(
    clone(initialData),
    "maths-relative-practice",
    "attempt-one",
    NOW,
  ).data;

describe("contenus de démonstration", () => {
  it("propose douze matières, six cours publiés et une première série vierge de cinq questions", () => {
    expect(subjects).toHaveLength(12);
    expect(
      initialData.courses.filter((course) => course.status === "published"),
    ).toHaveLength(6);
    expect(
      initialData.courses.filter((course) => course.status === "draft"),
    ).toHaveLength(1);
    expect(initialData.series).toHaveLength(3);
    expect(initialData.series[0].questions).toHaveLength(5);
    expect(initialData.attempts).toEqual([]);
    for (const course of initialData.courses.filter(
      (course) => course.status === "published",
    ))
      expect(coursePublicationError(course)).toBeNull();
    for (const series of initialData.series)
      expect(seriesPublicationError(series, initialData.courses)).toBeNull();
    expect(parseLearningData(JSON.stringify(initialData))).toEqual(initialData);
  });
});
describe("publication relue", () => {
  it("refuse une fiche sans essentiel puis accepte une fiche complétée", () => {
    const data = clone(initialData);
    const course = data.courses.find((item) => item.status === "draft")!;
    course.sections[0].content = "  ";
    expect(publishCourseInData(data, course.id).result.ok).toBe(false);
    expect(course.status).toBe("draft");
    course.sections[0].content = "Une fiche relue par le parent.";
    const result = publishCourseInData(data, course.id);
    expect(result.result.ok).toBe(true);
    expect(
      result.data.courses.find((item) => item.id === course.id)?.status,
    ).toBe("published");
    expect(course.status).toBe("draft");
  });
  it("refuse un titre vide et une section présente mais vide", () => {
    expect(
      coursePublicationError({ ...initialData.courses[0], title: " " }),
    ).toBeTruthy();
    const course = clone(initialData.courses[0]);
    course.sections[1].content = "";
    expect(coursePublicationError(course)).toBeTruthy();
  });
  it("refuse une série liée à un brouillon ou une autre matière", () => {
    const data = clone(initialData);
    const series = data.series[0];
    series.status = "draft";
    series.courseIds = ["history-middle-ages-draft"];
    expect(publishSeriesInData(data, series.id).result.ok).toBe(false);
    series.courseIds = ["french-past-simple"];
    expect(publishSeriesInData(data, series.id).result.ok).toBe(false);
    series.courseIds = ["maths-relative-numbers"];
    expect(publishSeriesInData(data, series.id).result.ok).toBe(true);
  });
  it("refuse une correction absente, ambiguë ou un identifiant de bonne réponse invalide", () => {
    const question = clone(initialData.series[0].questions[0]);
    expect(
      questionError({ ...question, correctChoiceId: "absent" }),
    ).toBeTruthy();
    expect(questionError({ ...question, explanation: " " })).toBeTruthy();
    question.choices[1].label = question.choices[0].label;
    expect(questionError(question)).toBeTruthy();
  });
  it("refuse une série vide et des questions dupliquées", () => {
    const series = clone(initialData.series[0]);
    expect(
      seriesPublicationError({ ...series, questions: [] }, initialData.courses),
    ).toBeTruthy();
    expect(
      seriesPublicationError(
        { ...series, questions: [series.questions[0], series.questions[0]] },
        initialData.courses,
      ),
    ).toBeTruthy();
  });
});
describe("séances, correction et reprise", () => {
  it("ne crée aucune séance pour une série absente ou en brouillon", () => {
    const data = clone(initialData);
    expect(startAttemptInData(data, "absent", "a", NOW).attemptId).toBeNull();
    data.series[0].status = "draft";
    expect(
      startAttemptInData(data, data.series[0].id, "a", NOW).attemptId,
    ).toBeNull();
  });
  it("reprend une séance inachevée sans doublon, sauf redémarrage explicite", () => {
    const data = start();
    const resumed = startAttemptInData(
      data,
      "maths-relative-practice",
      "unused-id",
      NOW,
    );
    expect(resumed.attemptId).toBe("attempt-one");
    expect(resumed.data).toBe(data);
    const restarted = startAttemptInData(
      data,
      "maths-relative-practice",
      "attempt-two",
      NOW,
      true,
    );
    expect(restarted.attemptId).toBe("attempt-two");
    expect(restarted.data.attempts).toHaveLength(2);
  });
  it("corrige depuis un snapshot indépendant du contenu courant", () => {
    let data = start();
    const snapshot = clone(data.attempts[0].questions[0]);
    data.series[0].questions[0].correctChoiceId = "0";
    data.series[0].questions[0].explanation =
      "Nouvelle correction de la série.";
    expect(data.attempts[0].questions[0]).toEqual(snapshot);
    data = answerQuestionInData(
      data,
      "attempt-one",
      snapshot.id,
      snapshot.correctChoiceId,
      true,
      NOW,
    );
    expect(data.attempts[0].answers[0]).toMatchObject({
      isCorrect: true,
      usedHint: true,
    });
    expect(getAttemptScore(data.attempts[0])).toMatchObject({
      correct: 1,
      total: 5,
      answered: 1,
      percentage: 20,
    });
  });
  it("enregistre une seule réponse et refuse les questions ou choix inconnus", () => {
    const data = start();
    const question = data.attempts[0].questions[0];
    expect(
      answerQuestionInData(
        data,
        "attempt-one",
        question.id,
        "unknown",
        false,
        NOW,
      ),
    ).toBe(data);
    expect(
      answerQuestionInData(
        data,
        "attempt-one",
        "unknown",
        question.correctChoiceId,
        false,
        NOW,
      ),
    ).toBe(data);
    const answered = answerQuestionInData(
      data,
      "attempt-one",
      question.id,
      question.correctChoiceId,
      false,
      NOW,
    );
    expect(
      answerQuestionInData(
        answered,
        "attempt-one",
        question.id,
        "0",
        true,
        NOW,
      ),
    ).toBe(answered);
    expect(answered.attempts[0].answers).toHaveLength(1);
  });
  it("termine seulement lorsque toutes les questions ont une réponse et reste idempotent", () => {
    let data = start();
    expect(completeAttemptInData(data, "attempt-one", NOW)).toBe(data);
    for (const question of data.attempts[0].questions)
      data = answerQuestionInData(
        data,
        "attempt-one",
        question.id,
        question.correctChoiceId,
        false,
        NOW,
      );
    data = completeAttemptInData(data, "attempt-one", NOW);
    expect(data.attempts[0].completedAt).toBe(NOW);
    expect(getAttemptScore(data.attempts[0]).percentage).toBe(100);
    expect(
      completeAttemptInData(data, "attempt-one", "2026-11-09T00:00:00.000Z"),
    ).toBe(data);
    expect(
      answerQuestionInData(
        data,
        "attempt-one",
        data.attempts[0].questions[0].id,
        "0",
        false,
        NOW,
      ),
    ).toBe(data);
  });
  it("restaure une séance partielle et recalcule les drapeaux de correction depuis son snapshot", () => {
    let data = start();
    const question = data.attempts[0].questions[0];
    data = answerQuestionInData(
      data,
      "attempt-one",
      question.id,
      question.correctChoiceId,
      false,
      NOW,
    );
    data.attempts[0].answers[0].isCorrect = false;
    const restored = parseLearningData(JSON.stringify(data));
    expect(restored.attempts[0].answers[0].isCorrect).toBe(true);
    expect(
      startAttemptInData(restored, "maths-relative-practice", "unused", NOW)
        .attemptId,
    ).toBe("attempt-one");
    expect(restored.attempts[0].answers).toHaveLength(1);
  });
  it("ne marque révisés que des cours publiés, sans doublon", () => {
    const data = clone(initialData);
    expect(markReviewedInData(data, "history-middle-ages-draft")).toBe(data);
    const reviewed = markReviewedInData(data, "maths-relative-numbers");
    expect(reviewed.reviewedCourseIds).toEqual(["maths-relative-numbers"]);
    expect(markReviewedInData(reviewed, "maths-relative-numbers")).toBe(
      reviewed,
    );
  });
});
describe("résistance aux sauvegardes invalides", () => {
  it.each([
    "{",
    "{}",
    '{"version":2}',
    JSON.stringify({ ...initialData, courses: null }),
  ])("rejette un format invalide : %s", (raw) => {
    expect(() => parseLearningData(raw)).toThrow();
  });
  it("rejette une réponse dupliquée et une clôture prématurée", () => {
    let data = start();
    const question = data.attempts[0].questions[0];
    data = answerQuestionInData(
      data,
      "attempt-one",
      question.id,
      question.correctChoiceId,
      false,
      NOW,
    );
    data.attempts[0].answers.push(clone(data.attempts[0].answers[0]));
    expect(() => parseLearningData(JSON.stringify(data))).toThrow();
    data.attempts[0].answers.pop();
    data.attempts[0].completedAt = NOW;
    expect(() => parseLearningData(JSON.stringify(data))).toThrow();
  });
});
