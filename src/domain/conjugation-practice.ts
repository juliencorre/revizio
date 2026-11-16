import { evaluateAnswer } from "./answers";
import { conjugationForms, type ConjugationSheet } from "./conjugation";
import { englishTenses } from "./english";
import type { Answer, Attempt, LearningData, Question } from "./model";

export const conjugationSeriesId = (sheet: ConjugationSheet) =>
  `conjugation:${sheet.verb}:${sheet.tense}`;

export const isConjugationSeries = (id: string) =>
  id.startsWith("conjugation:");

export function conjugationTitle(sheet: ConjugationSheet) {
  const tense = englishTenses.find((item) => item.id === sheet.tense);
  return `${sheet.verb} · ${tense?.label ?? sheet.tense}`;
}

export function conjugationQuestions(sheet: ConjugationSheet): Question[] {
  return conjugationForms(sheet).map(({ pronoun, form, plural }) => {
    const subject = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
    return {
      id: `${plural ? "plural" : "singular"}-${pronoun.toLowerCase()}`,
      prompt: subject + " ___",
      type: "fill-blank",
      choices: [],
      correctChoiceId: "",
      expectedAnswers: [form],
      explanation: `${subject} ${form}`,
      hint: pronoun.toLowerCase() === "you" ? (plural ? "Vous" : "Tu") : "",
      concept: conjugationTitle(sheet) + " · " + pronoun,
    };
  });
}

export function questionsWithConjugationRetries(
  questions: Question[],
  answers: Answer[],
) {
  const originals = questions.filter(
    (question) => !question.id.endsWith("-retry"),
  );
  const retries: Question[] = [];
  for (const answer of answers) {
    const original = originals.find(
      (question) => question.id === answer.questionId,
    );
    if (original && !evaluateAnswer(original, answer.choiceId))
      retries.push({ ...original, id: original.id + "-retry" });
  }
  return [...originals, ...retries];
}

export function startConjugationInData(
  data: LearningData,
  sheet: ConjugationSheet,
  id: string,
  startedAt: string,
  profileId?: string,
): { data: LearningData; attemptId: string | null } {
  const seriesId = conjugationSeriesId(sheet);
  if (
    !data.conjugationSheets?.some(
      (item) => conjugationSeriesId(item) === seriesId,
    )
  )
    return { data, attemptId: null };
  const pending = [...data.attempts]
    .reverse()
    .find((attempt) => attempt.seriesId === seriesId && !attempt.completedAt);
  if (pending) return { data, attemptId: pending.id };
  const questions = conjugationQuestions(sheet);
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  const attempt: Attempt = {
    id,
    seriesId,
    seriesTitle: conjugationTitle(sheet),
    subjectId: "english",
    startedAt,
    profileId,
    mode: "practice",
    questions,
    answers: [],
  };
  return {
    data: { ...data, attempts: [...data.attempts, attempt] },
    attemptId: id,
  };
}
