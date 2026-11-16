import { normalizeAnswer } from "./answers";
import type {
  EnglishSettings,
  LearningData,
  VocabularyDirection,
  VocabularyLanguage,
  VocabularyList,
  VocabularyMode,
  VocabularyQuestion,
  VocabularySession,
  VocabularyWord,
} from "./model";

export const vocabularyLanguages = [
  { id: "english", label: "Anglais", termLabel: "Mot en anglais" },
  { id: "spanish", label: "Espagnol", termLabel: "Mot en espagnol" },
  { id: "latin", label: "Latin", termLabel: "Mot en latin" },
] as const;
export const legacyEnglishListId = "english-repertoire-vocabulary";
export const vocabularyKnownStreak = 2;
export const vocabularyModes: VocabularyMode[] = [
  "both",
  "to-french",
  "from-french",
];
export const vocabularyVariants = (text: string) => [
  ...new Map(
    text
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => [normalizeAnswer(part), part]),
  ).values(),
];
export const isVocabularyLanguage = (
  value: unknown,
): value is VocabularyLanguage =>
  vocabularyLanguages.some((item) => item.id === value);
export const vocabularyLanguage = (value: unknown): VocabularyLanguage =>
  isVocabularyLanguage(value) ? value : "english";
export const languageLabel = (language: VocabularyLanguage) =>
  vocabularyLanguages.find((item) => item.id === language)!.label;
export function directionLabel(
  language: VocabularyLanguage,
  mode: VocabularyMode,
) {
  const label = languageLabel(language);
  return mode === "both"
    ? "Les deux sens"
    : mode === "to-french"
      ? `${label} → Français`
      : `Français → ${label}`;
}
export function legacyEnglishVocabulary(
  english?: EnglishSettings,
): VocabularyList[] {
  if (!english?.words.length) return [];
  const list: VocabularyList = {
    englishWordsRevision: english.wordsRevision ?? 0,
    id: legacyEnglishListId,
    language: "english",
    title: "Mon répertoire d’anglais",
    status: "published",
    words: english.words.map((word) => ({
      id: word.id,
      term: word.en,
      translation: word.fr,
    })),
  };
  if (vocabularyListError(list)) list.status = "draft";
  return [list];
}
/** An absent field is an old save. An explicit empty array must remain empty. */
export function vocabularyListsFor(
  data: Pick<LearningData, "english" | "vocabularyLists">,
): VocabularyList[] {
  return data.vocabularyLists ?? legacyEnglishVocabulary(data.english);
}
/** Preserve removed published rows. An edit to an existing row corrects that sense. */
export function retainRemovedVocabulary(
  previous: LearningData,
  next: LearningData,
): LearningData {
  const remaining = new Map(
    vocabularyListsFor(next).map((list) => [list.id, list]),
  );
  const retained = new Map(
    (previous.vocabularyRetainedWords ?? []).map((word) => [word.id, word]),
  );
  for (const word of next.vocabularyRetainedWords ?? [])
    retained.set(word.id, word);
  for (const list of vocabularyListsFor(previous)) {
    const replacement = remaining.get(list.id);
    if (
      list.status !== "published" ||
      replacement?.status === "draft" ||
      replacement === list
    )
      continue;
    const currentIds = new Set(replacement?.words.map((word) => word.id));
    for (const word of list.words) {
      if (currentIds.has(word.id)) continue;
      const id = list.language + ":" + wordKey(word);
      if (!retained.has(id))
        retained.set(id, {
          ...word,
          id,
          language: list.language,
          sourceTitle: list.title,
        });
    }
  }
  return retained.size
    ? { ...next, vocabularyRetainedWords: [...retained.values()] }
    : next;
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const id = (v: unknown): v is string =>
  text(v) && !!v.trim() && v.length <= 160;
const date = (v: unknown): v is string =>
  text(v) && Number.isFinite(Date.parse(v));
const unique = (values: string[]) => new Set(values).size === values.length;
export function isVocabularyList(value: unknown): value is VocabularyList {
  return (
    object(value) &&
    id(value.id) &&
    (value.archived === undefined ||
      (typeof value.archived === "boolean" &&
        (!value.archived || value.status === "published"))) &&
    vocabularyLanguages.some((item) => item.id === value.language) &&
    (value.id !== legacyEnglishListId || value.language === "english") &&
    text(value.title) &&
    (value.englishWordsRevision === undefined ||
      (Number.isSafeInteger(value.englishWordsRevision) &&
        Number(value.englishWordsRevision) >= 0)) &&
    value.title.length <= 160 &&
    ["draft", "published"].includes(String(value.status)) &&
    Array.isArray(value.words) &&
    (value.words.length <= 200 || value.id === legacyEnglishListId) &&
    value.words.every(
      (word) =>
        object(word) &&
        id(word.id) &&
        (word.context === undefined ||
          (text(word.context) && word.context.length <= 160)) &&
        text(word.term) &&
        text(word.translation) &&
        word.term.length <= 300 &&
        word.translation.length <= 300,
    ) &&
    unique(value.words.map((word) => word.id))
  );
}
export function vocabularyListError(list: VocabularyList): string | null {
  if (!isVocabularyList(list))
    return "Cette liste de vocabulaire est invalide (200 mots maximum).";
  if (!list.title.trim()) return "Donnez un titre à la liste.";
  if (!list.words.length) return "Ajoutez au moins un mot à la liste.";
  if (
    list.words.some(
      (word) =>
        !vocabularyVariants(word.term).length ||
        !vocabularyVariants(word.translation).length,
    )
  )
    return "Complétez chaque mot et sa traduction avant de publier.";
  const contexts = new Map<string, Set<string>>();
  for (const word of list.words) {
    const context = normalizeAnswer(word.context ?? "");
    for (const term of vocabularyVariants(word.term).map(normalizeAnswer)) {
      const previous = contexts.get(term) ?? new Set<string>();
      if (
        previous.size &&
        (!context || previous.has("") || previous.has(context))
      )
        return "Un mot apparaît dans plusieurs lignes. Regroupez ses variantes ou précisez un contexte différent pour chaque sens.";
      previous.add(context);
      contexts.set(term, previous);
    }
  }
  if (!unique(list.words.map(wordKey)))
    return "Cette liste contient deux fois le même mot avec la même traduction.";
  return null;
}
export function normalizeVocabularyList(list: VocabularyList): VocabularyList {
  return {
    ...list,
    title: list.title.trim(),
    words: list.words.map((word) => ({
      ...word,
      term: vocabularyVariants(word.term).join(" ; "),
      translation: vocabularyVariants(word.translation).join(" ; "),
    })),
  };
}
export function evaluateVocabularyAnswer(
  question: VocabularyQuestion,
  response: string,
): boolean {
  return (
    !!normalizeAnswer(response) &&
    question.expectedAnswers.some(
      (answer) => normalizeAnswer(answer) === normalizeAnswer(response),
    )
  );
}
/** Written recall only. Accents remain significant; case and surrounding spaces do not. */
export function vocabularyQuestions(
  list: VocabularyList,
  mode: VocabularyMode,
): VocabularyQuestion[] {
  const error = vocabularyListError(list);
  if (error) throw new Error(error);
  return writtenVocabularyQuestions(list.words, mode);
}

export function writtenVocabularyQuestions(
  words: VocabularyWord[],
  mode: VocabularyMode,
  contextFor = (word: VocabularyWord, _direction: VocabularyDirection) =>
    word.context?.trim(),
): VocabularyQuestion[] {
  const directions: VocabularyDirection[] =
    mode === "both" ? ["to-french", "from-french"] : [mode];
  return directions.flatMap((direction) => {
    const promptKey = direction === "to-french" ? "term" : "translation";
    const answerKey = direction === "to-french" ? "translation" : "term";
    const accepted = new Map<string, Map<string, string>>();
    const key = (prompt: string, context?: string) =>
      JSON.stringify([normalizeAnswer(prompt), normalizeAnswer(context ?? "")]);
    for (const word of words) {
      const context = contextFor(word, direction);
      for (const variant of vocabularyVariants(word[promptKey])) {
        const bucket = key(variant, context);
        const answers = accepted.get(bucket) ?? new Map<string, string>();
        for (const answer of vocabularyVariants(word[answerKey]))
          answers.set(normalizeAnswer(answer), answer);
        accepted.set(bucket, answers);
      }
    }
    return words.map((word) => {
      const prompt = vocabularyVariants(word[promptKey])[0];
      const context = contextFor(word, direction);
      return {
        id: `${word.id}:${direction}`,
        wordId: word.id,
        term: word.term,
        translation: word.translation,
        direction,
        prompt,
        ...(context ? { context } : {}),
        expectedAnswers: [...accepted.get(key(prompt, context))!.values()],
      };
    });
  });
}
export type VocabularyWordStatus = "new" | "learning" | "review" | "known";
export const vocabularyStatusLabels: Record<VocabularyWordStatus, string> = {
  new: "À découvrir",
  learning: "En cours",
  review: "À revoir",
  known: "Connu",
};
export interface VocabularyDirectionProgress {
  answered: number;
  streak: number;
  lastCorrect?: boolean;
  lastAnsweredAt?: string;
  nextReviewAt?: number;
  spacedSuccesses: number;
}
export interface VocabularyWordProgress {
  word: VocabularyWord;
  status: VocabularyWordStatus;
  directions: Record<VocabularyDirection, VocabularyDirectionProgress>;
}
export const wordKey = (word: Pick<VocabularyWord, "term" | "translation">) =>
  JSON.stringify(
    [word.term, word.translation].map((value) =>
      vocabularyVariants(value).map(normalizeAnswer).sort(),
    ),
  );
export function vocabularyProgress(
  list: Pick<VocabularyList, "words" | "language">,
  sessions: VocabularySession[],
): VocabularyWordProgress[] {
  const progress: VocabularyWordProgress[] = list.words
    .filter(
      (word) =>
        vocabularyVariants(word.term).length &&
        vocabularyVariants(word.translation).length,
    )
    .map((word) => ({
      word,
      status: "new",
      directions: {
        "to-french": { answered: 0, streak: 0, spacedSuccesses: 0 },
        "from-french": { answered: 0, streak: 0, spacedSuccesses: 0 },
      },
    }));
  const entries = new Map(
    progress.map((entry) => [wordKey(entry.word), entry]),
  );
  const events = sessions
    .filter((session) => session.language === list.language)
    .flatMap((session) => {
      const questions = new Map(
        session.questions.map((question) => [question.id, question]),
      );
      return session.answers.flatMap((answer) => {
        const question = questions.get(answer.questionId);
        const entry = question && entries.get(wordKey(question));
        return question && entry && !question.retryOf
          ? [{ question, answer, entry }]
          : [];
      });
    })
    .sort(
      (a, b) =>
        Date.parse(a.answer.answeredAt) - Date.parse(b.answer.answeredAt),
    );
  for (const { question, answer, entry } of events) {
    const direction = entry.directions[question.direction];
    const correct =
      evaluateVocabularyAnswer(question, answer.choiceId) && !answer.usedHint;
    const time = Date.parse(answer.answeredAt);
    const previousDay =
      direction.lastAnsweredAt &&
      new Date(direction.lastAnsweredAt).toISOString().slice(0, 10);
    const day = new Date(time).toISOString().slice(0, 10);
    if (!correct) direction.spacedSuccesses = 0;
    else if (previousDay !== day) direction.spacedSuccesses++;
    if (
      !correct ||
      previousDay !== day ||
      direction.nextReviewAt === undefined
    ) {
      const intervals = [1, 1, 3, 7, 14, 30];
      direction.nextReviewAt =
        time +
        intervals[Math.min(direction.spacedSuccesses, intervals.length - 1)] *
          86400000;
    }
    direction.lastAnsweredAt = answer.answeredAt;
    direction.answered++;
    direction.streak = correct ? direction.streak + 1 : 0;
    direction.lastCorrect = correct;
  }
  for (const entry of progress) {
    const values = Object.values(entry.directions);
    entry.status = values.every((item) => item.streak >= vocabularyKnownStreak)
      ? "known"
      : values.some((item) => item.lastCorrect === false)
        ? "review"
        : values.some((item) => item.answered)
          ? "learning"
          : "new";
  }
  return progress;
}
export function createVocabularySession(
  list: VocabularyList,
  sessions: VocabularySession[],
  input: {
    id: string;
    mode: VocabularyMode;
    scope: "all" | "review";
    startedAt: string;
  },
): VocabularySession | null {
  if (
    list.archived ||
    list.status !== "published" ||
    !vocabularyModes.includes(input.mode)
  )
    return null;
  let questions = vocabularyQuestions(list, input.mode);
  if (input.scope === "review") {
    const known = new Set(
      vocabularyProgress(list, sessions)
        .filter((item) => item.status === "known")
        .map((item) => item.word.id),
    );
    questions = questions.filter((question) => !known.has(question.wordId));
  }
  return questions.length
    ? {
        ...input,
        listId: list.id,
        language: list.language,
        listTitle: list.title,
        questions,
        answers: [],
      }
    : null;
}
export const generalReviewSize = 8;
export const repertoireTitle = (language: VocabularyLanguage) =>
  "Révision générale · " + languageLabel(language);

function retryQuestion(
  questions: VocabularyQuestion[],
  index: number,
  correct: boolean,
) {
  const q = questions[index];
  if (
    correct ||
    q.retryOf ||
    questions.length - index - 1 < 2 ||
    questions.filter((item) => item.retryOf).length >= 2
  )
    return null;
  return { ...q, id: "retry-" + q.id, retryOf: q.id };
}

function validGeneralReviewStructure(session: VocabularySession) {
  const original = session.questions.filter((q) => !q.retryOf);
  if (
    !original.length ||
    original.length > generalReviewSize ||
    session.mode !== "both" ||
    session.scope !== "review" ||
    session.listId !== "repertoire-" + session.language ||
    session.listTitle !== repertoireTitle(session.language) ||
    !unique(original.map(wordKey)) ||
    original.some((q, index) => q.id !== "recall-" + index)
  )
    return false;
  const expected = [...original];
  for (const [index, answer] of session.answers.entries()) {
    const q = expected[index];
    if (!q || q.id !== answer.questionId) return false;
    const retry = retryQuestion(
      expected,
      index,
      evaluateVocabularyAnswer(q, answer.choiceId),
    );
    if (retry) expected.push(retry);
  }
  return JSON.stringify(expected) === JSON.stringify(session.questions);
}

export function answerVocabularySession(
  session: VocabularySession,
  questionId: string,
  response: string,
  answeredAt: string,
): VocabularySession {
  const question = session.questions[session.answers.length];
  if (
    session.completedAt ||
    !question ||
    question.id !== questionId ||
    !response.trim() ||
    response.length > 300
  )
    return session;
  const isCorrect = evaluateVocabularyAnswer(question, response);
  const retry =
    session.source === "repertoire" &&
    retryQuestion(session.questions, session.answers.length, isCorrect);
  return {
    ...session,
    ...(retry ? { questions: [...session.questions, retry] } : {}),
    answers: [
      ...session.answers,
      {
        questionId,
        choiceId: response,
        response,
        isCorrect,
        usedHint: false,
        answeredAt,
      },
    ],
  };
}
export function isVocabularySession(
  value: unknown,
): value is VocabularySession {
  if (
    !object(value) ||
    !id(value.id) ||
    !id(value.listId) ||
    (value.source !== undefined && value.source !== "repertoire") ||
    !text(value.listTitle) ||
    !value.listTitle.trim() ||
    value.listTitle.length > 160 ||
    !vocabularyLanguages.some((item) => item.id === value.language) ||
    !vocabularyModes.includes(value.mode as VocabularyMode) ||
    !["all", "review"].includes(String(value.scope)) ||
    !date(value.startedAt) ||
    (value.completedAt !== undefined &&
      (!date(value.completedAt) ||
        Date.parse(value.completedAt) < Date.parse(value.startedAt))) ||
    !Array.isArray(value.questions) ||
    !value.questions.length ||
    (value.questions.length > 400 && value.listId !== legacyEnglishListId) ||
    !Array.isArray(value.answers)
  )
    return false;
  if (
    !value.questions.every(
      (q) =>
        object(q) &&
        text(q.id) &&
        !!q.id.trim() &&
        q.id.length <= 200 &&
        id(q.wordId) &&
        text(q.term) &&
        q.term.length <= 300 &&
        text(q.translation) &&
        q.translation.length <= 300 &&
        (q.context === undefined ||
          (text(q.context) && q.context.length <= 160)) &&
        (q.retryOf === undefined ||
          (value.source === "repertoire" && id(q.retryOf))) &&
        text(q.prompt) &&
        !!q.prompt.trim() &&
        q.prompt.length <= 300 &&
        ["to-french", "from-french"].includes(String(q.direction)) &&
        (value.mode === "both" || q.direction === value.mode) &&
        Array.isArray(q.expectedAnswers) &&
        q.expectedAnswers.length > 0 &&
        q.expectedAnswers.every((answer) => text(answer) && !!answer.trim()),
    ) ||
    !unique(value.questions.map((q) => q.id))
  )
    return false;
  const questions = value.questions;
  const startedAt = value.startedAt;
  if (
    value.answers.length > questions.length ||
    !value.answers.every(
      (answer, index) =>
        object(answer) &&
        answer.questionId === questions[index].id &&
        text(answer.choiceId) &&
        !!answer.choiceId.trim() &&
        answer.choiceId.length <= 300 &&
        (answer.response === undefined ||
          answer.response === answer.choiceId) &&
        typeof answer.isCorrect === "boolean" &&
        answer.usedHint === false &&
        date(answer.answeredAt) &&
        Date.parse(answer.answeredAt) >= Date.parse(startedAt),
    )
  )
    return false;
  return (
    (value.completedAt === undefined ||
      value.answers.length === value.questions.length) &&
    (value.source !== "repertoire" ||
      validGeneralReviewStructure(value as unknown as VocabularySession))
  );
}
export function validateVocabularyData(value: Record<string, unknown>) {
  if (
    value.vocabularyLists !== undefined &&
    (!Array.isArray(value.vocabularyLists) ||
      !value.vocabularyLists.every(isVocabularyList) ||
      !unique(value.vocabularyLists.map((list) => list.id)) ||
      value.vocabularyLists.some(
        (list) => list.status === "published" && vocabularyListError(list),
      ))
  )
    throw new Error("Les listes de vocabulaire sont invalides.");
  if (
    value.vocabularyRetainedWords !== undefined &&
    (!Array.isArray(value.vocabularyRetainedWords) ||
      !value.vocabularyRetainedWords.every(
        (word) =>
          object(word) &&
          isVocabularyLanguage(word.language) &&
          text(word.sourceTitle) &&
          !!word.sourceTitle.trim() &&
          word.sourceTitle.length <= 160 &&
          text(word.term) &&
          word.term.length <= 300 &&
          vocabularyVariants(word.term).length &&
          text(word.translation) &&
          word.translation.length <= 300 &&
          vocabularyVariants(word.translation).length &&
          (word.context === undefined ||
            (text(word.context) && word.context.length <= 160)) &&
          word.id ===
            word.language +
              ":" +
              wordKey({ term: word.term, translation: word.translation }),
      ) ||
      !unique(value.vocabularyRetainedWords.map((word) => word.id)))
  )
    throw new Error("Le répertoire de vocabulaire est invalide.");
  if (
    value.vocabularySessions !== undefined &&
    (!Array.isArray(value.vocabularySessions) ||
      !value.vocabularySessions.every(isVocabularySession) ||
      !unique(value.vocabularySessions.map((session) => session.id)))
  )
    throw new Error("Les séances de vocabulaire sont invalides.");
}
export function restoredVocabularySessions(
  sessions: VocabularySession[] = [],
): VocabularySession[] {
  return sessions.map((session) => {
    const questions = new Map(
      session.questions.map((question) => [question.id, question]),
    );
    return {
      ...session,
      answers: session.answers.map((answer) => ({
        ...answer,
        isCorrect: evaluateVocabularyAnswer(
          questions.get(answer.questionId)!,
          answer.choiceId,
        ),
      })),
    };
  });
}

export function parseVocabularyLines(
  input: string,
): { term: string; translation: string }[] {
  return input
    .split(/\r?\n/)
    .map((line, index) => {
      if (!line.trim()) return null;
      const separator = line.includes("\t") ? "\t" : "=";
      const parts = line.split(separator);
      if (parts.length !== 2 || !parts.every((part) => part.trim()))
        throw new Error(
          `Ligne ${index + 1} : utilisez le format « mot = traduction ».`,
        );
      return { term: parts[0].trim(), translation: parts[1].trim() };
    })
    .filter(
      (word): word is { term: string; translation: string } => word !== null,
    );
}

/** Identical to the publication rule for variants, but never overwrites a parent's word. */
export function reviewVocabularyPhoto(
  existing: VocabularyWord[],
  proposals: (Pick<VocabularyWord, "term" | "translation"> & { id?: string })[],
): ("ready" | "duplicate" | "incomplete")[] {
  const keys = (term: string) => vocabularyVariants(term).map(normalizeAnswer);
  const seen = new Set(existing.flatMap((word) => keys(word.term)));
  const ids = new Set(existing.map((word) => word.id));
  return proposals.map(({ id, term, translation }) => {
    const variants = keys(term);
    if ((id && ids.has(id)) || variants.some((key) => seen.has(key)))
      return "duplicate";
    if (!variants.length || !vocabularyVariants(translation).length)
      return "incomplete";
    variants.forEach((key) => seen.add(key));
    return "ready";
  });
}
