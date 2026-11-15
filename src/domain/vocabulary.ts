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
export const vocabularyLanguage = (value: unknown): VocabularyLanguage =>
  vocabularyLanguages.some((item) => item.id === value)
    ? (value as VocabularyLanguage)
    : "english";
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
    vocabularyLanguages.some((item) => item.id === value.language) &&
    text(value.title) &&
    value.title.length <= 160 &&
    ["draft", "published"].includes(String(value.status)) &&
    Array.isArray(value.words) &&
    value.words.length <= 200 &&
    value.words.every(
      (word) =>
        object(word) &&
        id(word.id) &&
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
  const terms = list.words.flatMap((word) =>
    vocabularyVariants(word.term).map(normalizeAnswer),
  );
  if (!unique(terms))
    return "Un mot apparaît dans plusieurs lignes. Regroupez ses traductions sur une seule ligne, séparées par un point-virgule.";
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
  const directions: VocabularyDirection[] =
    mode === "both" ? ["to-french", "from-french"] : [mode];
  // All outward translations come before the reverse round: the correction is not the next answer.
  return directions.flatMap((direction) =>
    list.words.map((word) => {
      const promptKey = direction === "to-french" ? "term" : "translation";
      const answerKey = direction === "to-french" ? "translation" : "term";
      const prompt = vocabularyVariants(word[promptKey])[0];
      // Two approved synonyms with the same prompt must never mark a valid translation wrong.
      const expectedAnswers = [
        ...new Map(
          list.words
            .filter((candidate) =>
              vocabularyVariants(candidate[promptKey]).some(
                (variant) =>
                  normalizeAnswer(variant) === normalizeAnswer(prompt),
              ),
            )
            .flatMap((candidate) => vocabularyVariants(candidate[answerKey]))
            .map((answer) => [normalizeAnswer(answer), answer]),
        ).values(),
      ];
      return {
        id: `${word.id}:${direction}`,
        wordId: word.id,
        term: word.term,
        translation: word.translation,
        direction,
        prompt,
        expectedAnswers,
      };
    }),
  );
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
}
export interface VocabularyWordProgress {
  word: VocabularyWord;
  status: VocabularyWordStatus;
  directions: Record<VocabularyDirection, VocabularyDirectionProgress>;
}
const wordKey = (word: Pick<VocabularyWord, "term" | "translation">) =>
  JSON.stringify(
    [word.term, word.translation].map((value) =>
      vocabularyVariants(value).map(normalizeAnswer).sort(),
    ),
  );
export function vocabularyProgress(
  list: VocabularyList,
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
        "to-french": { answered: 0, streak: 0 },
        "from-french": { answered: 0, streak: 0 },
      },
    }));
  const entries = new Map(
    progress.map((entry) => [
      entry.word.id,
      { entry, key: wordKey(entry.word) },
    ]),
  );
  const events = sessions
    .filter(
      (session) =>
        session.listId === list.id && session.language === list.language,
    )
    .flatMap((session) => {
      const questions = new Map(
        session.questions.map((question) => [question.id, question]),
      );
      return session.answers.flatMap((answer) => {
        const question = questions.get(answer.questionId);
        const current = question && entries.get(question.wordId);
        return question && current && wordKey(question) === current.key
          ? [{ question, answer, entry: current.entry }]
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
  if (list.status !== "published" || !vocabularyModes.includes(input.mode))
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
  return {
    ...session,
    answers: [
      ...session.answers,
      {
        questionId,
        choiceId: response,
        response,
        isCorrect: evaluateVocabularyAnswer(question, response),
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
    value.questions.length > 400 ||
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
    value.completedAt === undefined ||
    value.answers.length === value.questions.length
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
