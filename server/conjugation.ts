import {
  conjugationQuestions,
  conjugationSeriesId,
  conjugationTitle,
  questionsWithConjugationRetries,
} from "../src/domain/conjugation-practice";
import type { Attempt, LearningData } from "../src/domain/model";
import { HttpError } from "./types";

/** A new session uses the published forms in any order. An ongoing session keeps its original answers and corrections. */
export function verifyConjugationAttempt(
  current: LearningData,
  supplied: Attempt,
  existing?: Attempt,
) {
  const sheet = current.conjugationSheets?.find(
    (item) => conjugationSeriesId(item) === supplied.seriesId,
  );
  if (!existing && !sheet)
    throw new HttpError(403, "Cette fiche de conjugaison n’est pas publiée.");
  if (
    supplied.mode !== "practice" ||
    supplied.planId ||
    supplied.deadlineAt ||
    supplied.submittedAt
  )
    throw new HttpError(403, "Cette séance de conjugaison est invalide.");

  const originals = supplied.questions.filter(
    (question) => !question.id.endsWith("-retry"),
  );
  const reference = existing
    ? existing.questions.filter((question) => !question.id.endsWith("-retry"))
    : conjugationQuestions(sheet!);
  const expected = existing
    ? reference
    : originals.map((q) => reference.find((item) => item.id === q.id));
  if (
    reference.length !== originals.length ||
    JSON.stringify(expected) !== JSON.stringify(originals)
  )
    throw new HttpError(
      403,
      "Cette séance doit conserver les formes apprises.",
    );
  const questions = questionsWithConjugationRetries(
    originals,
    supplied.answers,
  );
  if (
    JSON.stringify(questions) !== JSON.stringify(supplied.questions) ||
    supplied.answers.some(
      (answer, index) => answer.questionId !== questions[index]?.id,
    ) ||
    (existing &&
      JSON.stringify(existing.answers) !==
        JSON.stringify(supplied.answers.slice(0, existing.answers.length)))
  )
    throw new HttpError(
      403,
      "Les reprises correspondent aux personnes à revoir en fin de séance.",
    );
  return {
    questions,
    subjectId: "english",
    title: existing?.seriesTitle ?? conjugationTitle(sheet!),
  };
}
