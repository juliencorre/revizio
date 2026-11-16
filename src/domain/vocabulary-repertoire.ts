import { normalizeAnswer } from "./answers";
import type {
  LearningData,
  VocabularyDirection,
  VocabularyLanguage,
  VocabularyList,
  VocabularySession,
  VocabularyWord,
} from "./model";
import {
  generalReviewSize,
  repertoireTitle,
  vocabularyListsFor,
  vocabularyProgress,
  vocabularyVariants,
  wordKey,
  writtenVocabularyQuestions,
  type VocabularyDirectionProgress,
} from "./vocabulary";

type VocabularyData = Pick<
  LearningData,
  "vocabularyLists" | "vocabularyRetainedWords" | "english"
>;

export function vocabularyRepertoire(
  data: VocabularyData,
  language: VocabularyLanguage,
) {
  const bySense = new Map<string, VocabularyWord>();
  const sources = new Map<string, string>();
  function include(word: VocabularyWord, title: string) {
    const key = wordKey(word);
    const existing = bySense.get(key);
    if (existing) {
      if (!existing.context && word.context) existing.context = word.context;
      return;
    }
    bySense.set(key, { ...word, id: "word-" + bySense.size });
    sources.set(key, title);
  }
  for (const list of vocabularyListsFor(data)) {
    if (list.language === language && list.status === "published")
      for (const word of list.words) include(word, list.title);
  }
  for (const word of data.vocabularyRetainedWords ?? []) {
    if (word.language === language) include(word, word.sourceTitle);
  }
  return { language, words: [...bySense.values()], sources };
}

export function publicationPreview(
  list: VocabularyList,
  repertoire: ReturnType<typeof vocabularyRepertoire>,
) {
  const senses = new Set(repertoire.words.map(wordKey));
  const translations = new Map<string, Set<string>>();
  for (const word of repertoire.words) {
    for (const term of vocabularyVariants(word.term).map(normalizeAnswer)) {
      const group = translations.get(term) ?? new Set<string>();
      group.add(word.translation);
      translations.set(term, group);
    }
  }
  const otherSenses = new Map<string, string[]>();
  const seen = new Set<string>();
  let existing = 0;
  for (const word of list.words) {
    if (
      !vocabularyVariants(word.term).length ||
      !vocabularyVariants(word.translation).length
    )
      continue;
    const key = wordKey(word);
    if (seen.has(key)) continue;
    seen.add(key);
    if (senses.has(key)) {
      existing++;
    } else {
      const known = new Set(
        vocabularyVariants(word.term).flatMap((term) => [
          ...(translations.get(normalizeAnswer(term)) ?? []),
        ]),
      );
      if (known.size) otherSenses.set(word.id, [...known]);
    }
  }
  return { existing, added: seen.size - existing, otherSenses };
}

function repertoireQuestions(
  repertoire: ReturnType<typeof vocabularyRepertoire>,
) {
  // The source title supplies context for old lists with homonyms and no explicit clue.
  const terms = new Map<string, number>();
  for (const word of repertoire.words) {
    for (const term of vocabularyVariants(word.term)) {
      const key = normalizeAnswer(term);
      terms.set(key, (terms.get(key) ?? 0) + 1);
    }
  }
  return writtenVocabularyQuestions(
    repertoire.words,
    "both",
    (word, direction) => {
      if (word.context?.trim()) return word.context.trim();
      const prompt = normalizeAnswer(vocabularyVariants(word.term)[0]);
      if (direction === "to-french" && (terms.get(prompt) ?? 0) > 1)
        return repertoire.sources.get(wordKey(word));
      return undefined;
    },
  );
}

function priority(progress: VocabularyDirectionProgress, now: number) {
  if (progress.nextReviewAt !== undefined && progress.nextReviewAt <= now)
    return progress.lastCorrect === false ? 0 : 1;
  if (!progress.answered) return 2;
  return 3;
}

export function createGeneralReview(
  data: VocabularyData,
  sessions: VocabularySession[],
  language: VocabularyLanguage,
  id: string,
  startedAt: string,
): VocabularySession | null {
  const repertoire = vocabularyRepertoire(data, language);
  if (!repertoire.words.length) return null;
  const now = Date.parse(startedAt);
  const progress = vocabularyProgress(repertoire, sessions);
  function rank(result: VocabularyDirectionProgress) {
    return [priority(result, now), result.nextReviewAt ?? 0];
  }
  const compare = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1];
  const questions = new Map(
    repertoireQuestions(repertoire).map((q) => [q.id, q]),
  );
  const sourceCounts = new Map<string, number>();
  const candidates = progress
    .map((item) => {
      const forward = rank(item.directions["to-french"]);
      const reverse = rank(item.directions["from-french"]);
      // If two senses still share the same clue and prompt, asking for the
      // French translation cannot distinguish them. Use the reverse prompt.
      const q = questions.get(item.word.id + ":to-french")!;
      const translations = new Set(
        vocabularyVariants(item.word.translation).map(normalizeAnswer),
      );
      const ambiguous = q.expectedAnswers.some(
        (answer) => !translations.has(normalizeAnswer(answer)),
      );
      const direction: VocabularyDirection =
        !ambiguous && compare(forward, reverse) <= 0
          ? "to-french"
          : "from-french";
      const source = repertoire.sources.get(wordKey(item.word))!;
      const positionInSource = sourceCounts.get(source) ?? 0;
      sourceCounts.set(source, positionInSource + 1);
      return {
        item,
        direction,
        positionInSource,
        rank: direction === "to-french" ? forward : reverse,
      };
    })
    .sort(
      (a, b) =>
        compare(a.rank, b.rank) || a.positionInSource - b.positionInSource,
    );
  const selected = candidates.slice(0, generalReviewSize);
  // Keep one place for maintenance when today's selection is all new or fragile.
  const older = candidates.find(({ item }) => item.status === "known");
  if (
    older &&
    selected.length === generalReviewSize &&
    !selected.some(({ item }) => item.status === "known")
  )
    selected[selected.length - 1] = older;
  return {
    id,
    startedAt,
    language,
    source: "repertoire",
    listId: "repertoire-" + language,
    listTitle: repertoireTitle(language),
    mode: "both",
    scope: "review",
    answers: [],
    questions: selected.map(({ item, direction }, index) => {
      const q = questions.get(item.word.id + ":" + direction)!;
      return { ...q, id: "recall-" + index };
    }),
  };
}

// Offline devices may have different review dates or list ordering. Validate each
// original prompt against published content rather than rerunning the scheduler.
export function validGeneralReviewContent(
  data: VocabularyData,
  session: VocabularySession,
) {
  const available = repertoireQuestions(
    vocabularyRepertoire(data, session.language),
  );
  const index = new Map(available.map((q) => [wordKey(q) + q.direction, q]));
  return session.questions
    .filter((q) => !q.retryOf)
    .every((q) => {
      const match = index.get(wordKey(q) + q.direction);
      return (
        match &&
        q.prompt === match.prompt &&
        q.context === match.context &&
        q.term === match.term &&
        q.translation === match.translation &&
        JSON.stringify(q.expectedAnswers) ===
          JSON.stringify(match.expectedAnswers)
      );
    });
}
