import type {
  Answer,
  Attempt,
  Course,
  ExerciseSeries,
  LearningData,
  Question,
} from "./model";
import { subjects } from "./fixtures";
import { evaluateAnswer } from "./answers";
import { extendedDataFields, validateExtendedData } from "./extended-data";
export type PublicationResult = { ok: boolean; error?: string };
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const knownSubject = (id: string) =>
  subjects.some((subject) => subject.id === id);
const unique = (ids: string[]) => new Set(ids).size === ids.length;
const text = (value: unknown): value is string => typeof value === "string";
const nonempty = (value: unknown): value is string =>
  text(value) && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const date = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));
export function questionError(question: Question): string | null {
  if (!nonempty(question.id) || !nonempty(question.prompt))
    return "Chaque question doit avoir un énoncé.";
  const textual =
    question.type && !["single-choice", "true-false"].includes(question.type);
  if (textual) {
    if (
      !question.expectedAnswers?.length ||
      !question.expectedAnswers.every(nonempty)
    )
      return "Prévoyez au moins une réponse attendue pour chaque question écrite.";
    if (
      question.tolerance !== undefined &&
      (!Number.isFinite(question.tolerance) || question.tolerance < 0)
    )
      return "La tolérance numérique doit être positive.";
  }
  if (!textual && question.choices.length < 2)
    return "Chaque question doit proposer au moins deux réponses.";
  if (
    !question.choices.every(
      (choice) => nonempty(choice.id) && nonempty(choice.label),
    )
  )
    return "Complétez toutes les réponses proposées.";
  if (!unique(question.choices.map((choice) => choice.id)))
    return "Les identifiants des réponses doivent être distincts.";
  if (
    !unique(
      question.choices.map((choice) =>
        choice.label.trim().toLocaleLowerCase("fr"),
      ),
    )
  )
    return "Les réponses proposées doivent être différentes.";
  if (
    !textual &&
    !question.choices.some((choice) => choice.id === question.correctChoiceId)
  )
    return "Sélectionnez une bonne réponse valide pour chaque question.";
  if (!nonempty(question.explanation))
    return "Ajoutez une correction expliquée à chaque question.";
  if (!nonempty(question.concept))
    return "Indiquez la notion travaillée pour chaque question.";
  return null;
}
export function coursePublicationError(course: Course): string | null {
  if (!knownSubject(course.subjectId)) return "Choisissez une matière valide.";
  if (!nonempty(course.title)) return "Ajoutez un titre au cours.";
  if (
    !course.sections.some(
      (section) => section.kind === "essential" && nonempty(section.content),
    )
  )
    return "Complétez la partie « essentiel » avant de publier.";
  if (
    !unique(course.sections.map((section) => section.id)) ||
    course.sections.some((section) => !nonempty(section.id))
  )
    return "Les sections du cours doivent avoir des identifiants distincts.";
  if (
    course.sections.some(
      (section) => !nonempty(section.title) || !nonempty(section.content),
    )
  )
    return "Complétez ou retirez les sections vides avant de publier.";
  return null;
}
export function seriesPublicationError(
  series: ExerciseSeries,
  courses: Course[],
): string | null {
  if (!knownSubject(series.subjectId)) return "Choisissez une matière valide.";
  if (!nonempty(series.title)) return "Ajoutez un titre à la série.";
  if (!series.courseIds.length || !unique(series.courseIds))
    return "Choisissez au moins un cours, sans doublon.";
  if (
    series.courseIds.some(
      (id) =>
        !courses.some(
          (course) =>
            course.id === id &&
            course.status === "published" &&
            course.subjectId === series.subjectId,
        ),
    )
  )
    return "Tous les cours liés doivent être publiés et appartenir à la même matière.";
  if (!series.questions.length) return "Ajoutez au moins une question.";
  if (!unique(series.questions.map((question) => question.id)))
    return "Les questions doivent avoir des identifiants distincts.";
  for (const question of series.questions) {
    const error = questionError(question);
    if (error) return error;
  }
  return null;
}
export function publishCourseInData(
  data: LearningData,
  courseId: string,
): { data: LearningData; result: PublicationResult } {
  const course = data.courses.find((item) => item.id === courseId);
  const error = course
    ? coursePublicationError(course)
    : "Ce cours est introuvable.";
  if (error) return { data, result: { ok: false, error } };
  if (course!.status === "published") return { data, result: { ok: true } };
  return {
    data: {
      ...data,
      courses: data.courses.map((item) =>
        item.id === courseId ? { ...item, status: "published" } : item,
      ),
    },
    result: { ok: true },
  };
}
export function publishSeriesInData(
  data: LearningData,
  seriesId: string,
): { data: LearningData; result: PublicationResult } {
  const series = data.series.find((item) => item.id === seriesId);
  const error = series
    ? seriesPublicationError(series, data.courses)
    : "Cette série est introuvable.";
  if (error) return { data, result: { ok: false, error } };
  if (series!.status === "published") return { data, result: { ok: true } };
  return {
    data: {
      ...data,
      series: data.series.map((item) =>
        item.id === seriesId ? { ...item, status: "published" } : item,
      ),
    },
    result: { ok: true },
  };
}
export function startAttemptInData(
  data: LearningData,
  seriesId: string,
  id: string,
  now: string,
  restart = false,
  options?: {
    mode?: "practice" | "exam";
    timeLimitSeconds?: number;
    profileId?: string;
    planId?: string;
    stepId?: string;
  },
): { data: LearningData; attemptId: string | null } {
  const series = data.series.find(
    (item) => item.id === seriesId && item.status === "published",
  );
  if (!series || seriesPublicationError(series, data.courses))
    return { data, attemptId: null };
  const unfinished = [...data.attempts]
    .reverse()
    .find(
      (attempt) =>
        attempt.seriesId === seriesId &&
        !attempt.completedAt &&
        (attempt.mode ?? "practice") ===
          (options?.mode ?? series.mode ?? "practice") &&
        attempt.planId === options?.planId &&
        attempt.stepId === options?.stepId,
    );
  if (unfinished && !restart) return { data, attemptId: unfinished.id };
  if (data.attempts.some((attempt) => attempt.id === id))
    return { data, attemptId: null };
  const attempt: Attempt = {
    id,
    seriesId,
    startedAt: now,
    answers: [],
    questions: clone(series.questions),
    seriesTitle: series.title,
    subjectId: series.subjectId,
    mode: options?.mode ?? series.mode ?? "practice",
    ...(options?.planId
      ? { planId: options.planId, stepId: options.stepId }
      : {}),
    ...(options?.profileId ? { profileId: options.profileId } : {}),
    ...((options?.timeLimitSeconds ?? series.timeLimitSeconds)
      ? {
          deadlineAt: new Date(
            Date.parse(now) +
              (options?.timeLimitSeconds ?? series.timeLimitSeconds)! * 1000,
          ).toISOString(),
        }
      : {}),
  };
  return {
    data: { ...data, attempts: [...data.attempts, attempt] },
    attemptId: id,
  };
}
export function answerQuestionInData(
  data: LearningData,
  attemptId: string,
  questionId: string,
  choiceId: string,
  usedHint: boolean,
  now: string,
): LearningData {
  const attempt = data.attempts.find((item) => item.id === attemptId);
  if (
    !attempt ||
    attempt.completedAt ||
    attempt.answers.some((answer) => answer.questionId === questionId)
  )
    return data;
  const question = attempt.questions.find((item) => item.id === questionId);
  if (
    !question ||
    (!(
      question.type && !["single-choice", "true-false"].includes(question.type)
    ) &&
      !question.choices.some((choice) => choice.id === choiceId)) ||
    !choiceId.trim()
  )
    return data;
  const answer: Answer = {
    questionId,
    choiceId,
    isCorrect: evaluateAnswer(question, choiceId),
    usedHint,
    answeredAt: now,
    response: choiceId,
  };
  return {
    ...data,
    attempts: data.attempts.map((item) =>
      item.id === attemptId
        ? { ...item, answers: [...item.answers, answer] }
        : item,
    ),
  };
}
export function completeAttemptInData(
  data: LearningData,
  attemptId: string,
  now: string,
): LearningData {
  const attempt = data.attempts.find((item) => item.id === attemptId);
  if (
    !attempt ||
    attempt.completedAt ||
    !attempt.questions.length ||
    !attempt.questions.every((question) =>
      attempt.answers.some((answer) => answer.questionId === question.id),
    )
  )
    return data;
  return {
    ...data,
    attempts: data.attempts.map((item) =>
      item.id === attemptId ? { ...item, completedAt: now } : item,
    ),
  };
}
export function markReviewedInData(
  data: LearningData,
  courseId: string,
): LearningData {
  if (
    data.reviewedCourseIds.includes(courseId) ||
    !data.courses.some(
      (course) => course.id === courseId && course.status === "published",
    )
  )
    return data;
  return { ...data, reviewedCourseIds: [...data.reviewedCourseIds, courseId] };
}
export function getAttemptScore(attempt: Attempt) {
  const correct = attempt.answers.filter((answer) => answer.isCorrect).length;
  const total = attempt.questions.length;
  return {
    correct,
    total,
    answered: attempt.answers.length,
    percentage: total ? Math.round((correct / total) * 100) : 0,
  };
}
function isQuestion(value: unknown): value is Question {
  if (
    !record(value) ||
    !nonempty(value.id) ||
    !text(value.prompt) ||
    !text(value.correctChoiceId) ||
    !text(value.explanation) ||
    !text(value.hint) ||
    !text(value.concept) ||
    !Array.isArray(value.choices)
  )
    return false;
  if (
    value.type !== undefined &&
    ![
      "single-choice",
      "true-false",
      "fill-blank",
      "short-answer",
      "problem",
    ].includes(String(value.type))
  )
    return false;
  if (
    value.expectedAnswers !== undefined &&
    (!Array.isArray(value.expectedAnswers) ||
      !value.expectedAnswers.every(text))
  )
    return false;
  return value.choices.every(
    (choice) => record(choice) && nonempty(choice.id) && text(choice.label),
  );
}
function isCourse(value: unknown): value is Course {
  if (
    !record(value) ||
    !nonempty(value.id) ||
    !text(value.subjectId) ||
    !knownSubject(value.subjectId) ||
    !text(value.title) ||
    !text(value.description) ||
    !date(value.updatedAt) ||
    !["draft", "published"].includes(String(value.status)) ||
    !Array.isArray(value.sections) ||
    !Array.isArray(value.sources)
  )
    return false;
  return (
    value.sections.every(
      (section) =>
        record(section) &&
        nonempty(section.id) &&
        text(section.title) &&
        text(section.content) &&
        ["essential", "vocabulary", "method", "warning"].includes(
          String(section.kind),
        ) &&
        (section.example === undefined || text(section.example)),
    ) &&
    unique(value.sections.map((section) => (section as { id: string }).id)) &&
    value.sources.every(
      (source) =>
        record(source) &&
        nonempty(source.id) &&
        text(source.name) &&
        (source.uri === undefined || text(source.uri)) &&
        (source.mimeType === undefined || text(source.mimeType)),
    )
  );
}
function isSeries(value: unknown): value is ExerciseSeries {
  return (
    record(value) &&
    nonempty(value.id) &&
    text(value.title) &&
    text(value.subjectId) &&
    knownSubject(value.subjectId) &&
    ["draft", "published"].includes(String(value.status)) &&
    ["discovery", "practice", "challenge"].includes(String(value.level)) &&
    (value.dueDate === undefined || date(value.dueDate)) &&
    Array.isArray(value.courseIds) &&
    value.courseIds.every(nonempty) &&
    unique(value.courseIds) &&
    Array.isArray(value.questions) &&
    value.questions.every(isQuestion) &&
    unique(value.questions.map((question) => question.id))
  );
}
function isAttempt(value: unknown): value is Attempt {
  if (
    !record(value) ||
    !nonempty(value.id) ||
    !nonempty(value.seriesId) ||
    !nonempty(value.seriesTitle) ||
    !text(value.subjectId) ||
    !knownSubject(value.subjectId) ||
    !date(value.startedAt) ||
    (value.completedAt !== undefined && !date(value.completedAt)) ||
    !Array.isArray(value.questions) ||
    !value.questions.length ||
    !value.questions.every(isQuestion) ||
    value.questions.some((question) => questionError(question)) ||
    !unique(value.questions.map((question) => question.id)) ||
    !Array.isArray(value.answers)
  )
    return false;
  const questions = value.questions as Question[];
  const validAnswers = value.answers.every((answer) => {
    if (
      !record(answer) ||
      !nonempty(answer.questionId) ||
      !text(answer.choiceId) ||
      typeof answer.isCorrect !== "boolean" ||
      typeof answer.usedHint !== "boolean" ||
      !date(answer.answeredAt)
    )
      return false;
    return questions.some(
      (question) =>
        question.id === answer.questionId &&
        ((question.type &&
          !["single-choice", "true-false"].includes(question.type)) ||
          question.choices.some((choice) => choice.id === answer.choiceId) ||
          answer.choiceId === ""),
    );
  });
  return (
    validAnswers &&
    unique(value.answers.map((answer) => (answer as Answer).questionId)) &&
    (value.completedAt === undefined ||
      value.answers.length === questions.length)
  );
}
export function parseLearningData(raw: string): LearningData {
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1)
    throw new Error("Version de sauvegarde non prise en charge.");
  if (
    !Array.isArray(value.courses) ||
    !value.courses.every(isCourse) ||
    !unique(value.courses.map((course) => course.id)) ||
    !Array.isArray(value.series) ||
    !value.series.every(isSeries) ||
    !unique(value.series.map((series) => series.id)) ||
    !Array.isArray(value.attempts) ||
    !value.attempts.every(isAttempt) ||
    !unique(value.attempts.map((attempt) => attempt.id)) ||
    !Array.isArray(value.reviewedCourseIds) ||
    !value.reviewedCourseIds.every(nonempty)
  )
    throw new Error("Sauvegarde locale incomplète ou invalide.");
  const data = value as unknown as LearningData;
  validateExtendedData(value, data.courses, data.series);
  if (
    data.courses.some(
      (course) =>
        course.status === "published" && coursePublicationError(course),
    ) ||
    data.series.some(
      (series) =>
        series.courseIds.some(
          (id) => !data.courses.some((course) => course.id === id),
        ) ||
        (series.status === "published" &&
          seriesPublicationError(series, data.courses)),
    )
  )
    throw new Error("Les contenus de la sauvegarde sont incohérents.");
  return {
    ...clone(extendedDataFields(data)),
    version: 1,
    courses: clone(data.courses),
    series: clone(data.series),
    attempts: data.attempts.map((attempt) => ({
      ...clone(attempt),
      answers: attempt.answers.map((answer) => ({
        ...answer,
        isCorrect: evaluateAnswer(
          attempt.questions.find(
            (question) => question.id === answer.questionId,
          )!,
          answer.choiceId,
        ),
      })),
    })),
    reviewedCourseIds: [
      ...new Set(
        data.reviewedCourseIds.filter((id) =>
          data.courses.some(
            (course) => course.id === id && course.status === "published",
          ),
        ),
      ),
    ],
  };
}
