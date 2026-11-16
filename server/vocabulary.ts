import type { LearningData, VocabularySession } from "../src/domain/model";
import { clone } from "../src/domain/learning";
import {
  evaluateVocabularyAnswer,
  legacyEnglishListId,
  legacyEnglishVocabulary,
  retainRemovedVocabulary,
  vocabularyListsFor,
  vocabularyQuestions,
} from "../src/domain/vocabulary";
import { validGeneralReviewContent } from "../src/domain/vocabulary-repertoire";
import { HttpError } from "./types";
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** Cached clients that predate this module must not erase its lists or history. */
export function preserveVocabularyForLegacyClient(
  current: LearningData,
  incoming: LearningData,
  raw: Record<string, unknown>,
  child: boolean,
): LearningData {
  const next = { ...incoming };
  if (raw.vocabularyLists === undefined) {
    const lists = vocabularyListsFor(current);
    if (child)
      next.vocabularyLists = clone(
        lists.filter((list) => list.status === "published"),
      );
    else {
      if (!incoming.english) next.english = current.english;
      const wordsChanged = !same(
        next.english?.words ?? [],
        current.english?.words ?? [],
      );
      if (next.english)
        next.english = {
          ...next.english,
          wordsRevision:
            (current.english?.wordsRevision ?? 0) + (wordsChanged ? 1 : 0),
        };
      next.vocabularyLists = wordsChanged
        ? [
            ...lists.filter((list) => list.id !== legacyEnglishListId),
            ...legacyEnglishVocabulary(next.english).map((list) => ({
              ...list,
              title:
                lists.find((previous) => previous.id === list.id)?.title ??
                list.title,
            })),
          ]
        : clone(lists);
    }
  }
  if (raw.vocabularySessions === undefined)
    next.vocabularySessions = clone(current.vocabularySessions ?? []);
  if (child) {
    if (
      raw.vocabularyRetainedWords !== undefined &&
      !same(
        next.vocabularyRetainedWords ?? [],
        current.vocabularyRetainedWords ?? [],
      )
    )
      throw new HttpError(403, "Seul un parent peut modifier le répertoire.");
    next.vocabularyRetainedWords = current.vocabularyRetainedWords;
    return next;
  }
  return retainRemovedVocabulary(current, next);
}
/** The parent owns lists; the server owns snapshots and grades, even for offline submissions. */
export function mergeVocabularySessions(
  current: LearningData,
  incoming: LearningData,
): VocabularySession[] {
  const sessions = clone(current.vocabularySessions ?? []);
  for (const supplied of incoming.vocabularySessions ?? []) {
    const existing = sessions.find((session) => session.id === supplied.id);
    if (existing) {
      const context = ({
        answers,
        completedAt,
        ...snapshot
      }: VocabularySession) =>
        snapshot.source === "repertoire"
          ? {
              ...snapshot,
              questions: snapshot.questions.filter((q) => !q.retryOf),
            }
          : snapshot;
      if (!same(context(supplied), context(existing)))
        throw new HttpError(
          403,
          "Une séance de vocabulaire conserve les mots et traductions réellement présentés.",
        );
      if (existing.completedAt && !same(supplied, existing))
        throw new HttpError(
          403,
          "Une séance de vocabulaire terminée ne peut pas être réécrite.",
        );
      if (
        !same(
          supplied.answers.slice(0, existing.answers.length),
          existing.answers,
        )
      )
        throw new HttpError(
          403,
          "Les réponses de vocabulaire enregistrées ne peuvent pas être réécrites.",
        );
    } else if (supplied.source === "repertoire") {
      if (!validGeneralReviewContent(current, supplied))
        throw new HttpError(
          403,
          "Cette question ne correspond pas au répertoire publié.",
        );
    } else {
      const list = vocabularyListsFor(current).find(
        (list) =>
          list.id === supplied.listId &&
          list.status === "published" &&
          !list.archived,
      );
      if (
        !list ||
        list.language !== supplied.language ||
        list.title !== supplied.listTitle
      )
        throw new HttpError(
          403,
          "Cette liste de vocabulaire n’est pas disponible.",
        );
      const canonical = vocabularyQuestions(list, supplied.mode);
      const allowed = new Map(
        canonical.map((question) => [question.id, question]),
      );
      if (
        (supplied.scope === "all" && !same(supplied.questions, canonical)) ||
        supplied.questions.some(
          (question) => !same(question, allowed.get(question.id)),
        )
      )
        throw new HttpError(
          403,
          "Les exercices doivent utiliser les mots et traductions de la liste publiée.",
        );
    }
    const questions = new Map(
      supplied.questions.map((question) => [question.id, question]),
    );
    const next: VocabularySession = {
      ...clone(supplied),
      answers: supplied.answers.map((answer) => ({
        ...answer,
        isCorrect: evaluateVocabularyAnswer(
          questions.get(answer.questionId)!,
          answer.choiceId,
        ),
      })),
    };
    const index = sessions.findIndex((session) => session.id === next.id);
    if (index < 0) sessions.push(next);
    else sessions[index] = next;
  }
  return sessions;
}
