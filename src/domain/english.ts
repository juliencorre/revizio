import type {
  Course,
  EnglishSettings,
  ExerciseSeries,
  Question,
} from "./model";

export const englishTenses = [
  { id: "present-simple", label: "Présent simple", example: "I play" },
  {
    id: "present-continuous",
    label: "Présent en be + -ing",
    example: "I am playing",
  },
  { id: "past-simple", label: "Prétérit simple", example: "I played" },
  {
    id: "past-continuous",
    label: "Prétérit en be + -ing",
    example: "I was playing",
  },
  { id: "future-will", label: "Futur avec will", example: "I will play" },
  { id: "present-perfect", label: "Present perfect", example: "I have played" },
] as const;
export const emptyEnglishSettings: EnglishSettings = {
  words: [],
  verbs: [],
  tenses: [],
  toolWords: [],
};
export const defaultToolWords = [
  "a",
  "an",
  "the",
  "I",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "to",
  "and",
  "in",
  "on",
  "at",
  "is",
  "are",
  "was",
  "were",
  "did",
  "not",
  "have",
  "has",
  "will",
];
const normalize = (value: string) =>
  value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
const unique = (values: string[]) =>
  new Set(values.map(normalize)).size === values.length;
export function englishValidation(settings: EnglishSettings): string | null {
  if (
    !Array.isArray(settings.words) ||
    !Array.isArray(settings.verbs) ||
    !Array.isArray(settings.tenses) ||
    !Array.isArray(settings.toolWords)
  )
    return "La liste d’anglais est incomplète.";
  if (
    settings.words.some(
      (word) => !word.id || !word.en.trim() || !word.fr.trim(),
    )
  )
    return "Complétez chaque mot et sa traduction.";
  if (!unique(settings.words.map((word) => word.en)))
    return "Un mot anglais apparaît plusieurs fois.";
  if (!unique(settings.words.map((word) => word.id)))
    return "Chaque mot doit avoir son propre identifiant.";
  if (
    settings.verbs.some(
      (verb) =>
        !verb.id ||
        !verb.base.trim() ||
        !verb.past.trim() ||
        !verb.participle.trim() ||
        !verb.meaning.trim(),
    )
  )
    return "Complétez les quatre colonnes de chaque verbe.";
  if (
    !unique(settings.verbs.map((verb) => verb.base)) ||
    !unique(settings.verbs.map((verb) => verb.id))
  )
    return "Un verbe apparaît plusieurs fois.";
  if (
    settings.tenses.some(
      (tense) => !englishTenses.some((item) => item.id === tense),
    ) ||
    !unique(settings.tenses)
  )
    return "Sélectionnez des temps distincts parmi ceux proposés.";
  if (
    settings.toolWords.some((word) => !word.trim()) ||
    !unique(settings.toolWords)
  )
    return "Les mots outils doivent être distincts et non vides.";
  return null;
}

export function normalizeEnglish(settings: EnglishSettings): EnglishSettings {
  return {
    words: settings.words.map((word) => ({
      ...word,
      en: word.en.trim(),
      fr: word.fr.trim(),
    })),
    verbs: settings.verbs.map((verb) => ({
      ...verb,
      base: verb.base.trim(),
      past: verb.past.trim(),
      participle: verb.participle.trim(),
      meaning: verb.meaning.trim(),
    })),
    tenses: [...new Set(settings.tenses)],
    toolWords: [
      ...new Map(
        settings.toolWords.map((word) => [normalize(word), word.trim()]),
      ).values(),
    ].filter(Boolean),
  };
}

/** Reusable cards contain only words and verb forms explicitly approved by parent. */
export function englishFlashcards(settings: EnglishSettings) {
  return [
    ...settings.words.map((word) => ({
      id: word.id,
      front: word.en,
      back: word.fr,
      kind: "Mot",
    })),
    ...settings.verbs.map((verb) => ({
      id: verb.id,
      front: verb.base,
      back: verb.meaning,
      kind: "Verbe",
    })),
    ...(settings.tenses.includes("past-simple")
      ? settings.verbs.map((verb) => ({
          id: verb.id + "-past",
          front: verb.base,
          back: verb.past,
          kind: "Prétérit",
        }))
      : []),
    ...(settings.tenses.includes("present-perfect")
      ? settings.verbs.map((verb) => ({
          id: verb.id + "-participle",
          front: verb.base,
          back: verb.participle,
          kind: "Participe passé",
        }))
      : []),
  ];
}

function choiceQuestion(
  id: string,
  prompt: string,
  correct: string,
  candidates: string[],
  concept: string,
): Question {
  const labels = [
    ...new Map(
      [correct, ...candidates].map((label) => [normalize(label), label]),
    ).values(),
  ].slice(0, 4);
  // Put the right answer at alternating positions without changing the approved text.
  const rotation =
    [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % labels.length;
  const rotated = [...labels.slice(rotation), ...labels.slice(0, rotation)];
  if (rotated.length < 2)
    return {
      id,
      prompt,
      type: "fill-blank",
      choices: [],
      correctChoiceId: "",
      expectedAnswers: [correct],
      explanation: `La réponse attendue est « ${correct} », d’après la liste vérifiée.`,
      hint: "Retrouve cet élément dans tes cartes d’anglais.",
      concept,
    };
  const choices = rotated.map((label, index) => ({
    id: `${id}-choice-${index}`,
    label,
  }));
  return {
    id,
    prompt,
    type: "single-choice",
    choices,
    correctChoiceId: choices.find((choice) => choice.label === correct)!.id,
    explanation: `La réponse attendue est « ${correct} », d’après la liste vérifiée.`,
    hint: "Retrouve cet élément dans tes cartes d’anglais.",
    concept,
  };
}

/** A bounded, deterministic quiz. It is not an AI generation. */
export function generateBoundedQuiz(
  settings: EnglishSettings,
  count = 10,
): Question[] {
  const error = englishValidation(settings);
  if (error) throw new Error(error);
  const normalized = normalizeEnglish(settings);
  const questions: Question[] = [];
  for (const word of normalized.words) {
    questions.push(
      choiceQuestion(
        `english-word-${word.id}`,
        `Comment dit-on « ${word.fr} » en anglais ?`,
        word.en,
        normalized.words.map((item) => item.en),
        "Vocabulaire : " + word.en,
      ),
    );
    questions.push(
      choiceQuestion(
        `english-meaning-${word.id}`,
        `Que signifie « ${word.en} » ?`,
        word.fr,
        normalized.words.map((item) => item.fr),
        "Vocabulaire : " + word.en,
      ),
    );
  }
  const forms = [
    ...normalized.verbs.flatMap((verb) => [
      verb.base,
      ...(normalized.tenses.includes("past-simple") ? [verb.past] : []),
      ...(normalized.tenses.includes("present-perfect")
        ? [verb.participle]
        : []),
    ]),
  ];
  for (const verb of normalized.verbs) {
    questions.push(
      choiceQuestion(
        `english-verb-${verb.id}`,
        `Quel verbe signifie « ${verb.meaning} » ?`,
        verb.base,
        normalized.verbs.map((item) => item.base),
        "Verbe : " + verb.base,
      ),
    );
    if (normalized.tenses.includes("past-simple"))
      questions.push(
        choiceQuestion(
          `english-past-${verb.id}`,
          `Quel est le prétérit de « ${verb.base} » ?`,
          verb.past,
          forms,
          "Prétérit : " + verb.base,
        ),
      );
    if (normalized.tenses.includes("present-perfect"))
      questions.push(
        choiceQuestion(
          `english-participle-${verb.id}`,
          `Quel est le participe passé de « ${verb.base} » ?`,
          verb.participle,
          forms,
          "Participe passé : " + verb.base,
        ),
      );
  }
  // Interleave by alternating ends so a short series includes several notions.
  const interleaved: Question[] = [];
  let left = 0,
    right = questions.length - 1;
  while (left <= right) {
    interleaved.push(questions[left++]);
    if (left <= right) interleaved.push(questions[right--]);
  }
  return interleaved.slice(0, Math.max(1, Math.min(20, Math.round(count))));
}

export function buildEnglishMaterial(
  settings: EnglishSettings,
): { course: Course; series: ExerciseSeries } | null {
  const normalized = normalizeEnglish(settings);
  const questions = generateBoundedQuiz(normalized, 20);
  if (!questions.length) return null;
  const course: Course = {
    id: "english-repertoire-course",
    subjectId: "english",
    title: "Mon répertoire d’anglais",
    description: "Les mots, verbes et temps vérifiés par un parent.",
    status: "published",
    updatedAt: new Date().toISOString(),
    sources: [],
    sections: [
      {
        id: "english-bank-essential",
        kind: "essential",
        title: "Mon vocabulaire",
        content: normalized.words.length
          ? normalized.words.map((word) => `${word.en} → ${word.fr}`).join("\n")
          : "Les verbes ci-dessous sont ceux étudiés en classe.",
      },
      ...(normalized.verbs.length
        ? [
            {
              id: "english-bank-verbs",
              kind: "vocabulary" as const,
              title: "Les verbes à connaître",
              content: normalized.verbs
                .map(
                  (verb) =>
                    `${verb.base} — ${verb.past} — ${verb.participle} : ${verb.meaning}`,
                )
                .join("\n"),
            },
          ]
        : []),
      ...(normalized.tenses.length
        ? [
            {
              id: "english-bank-tenses",
              kind: "method" as const,
              title: "Les temps étudiés",
              content: englishTenses
                .filter((tense) => normalized.tenses.includes(tense.id))
                .map((tense) => tense.label)
                .join("\n"),
            },
          ]
        : []),
    ],
  };
  const series: ExerciseSeries = {
    id: "english-repertoire-practice",
    title: "Je révise mon répertoire d’anglais",
    subjectId: "english",
    courseIds: [course.id],
    status: "published",
    level: "practice",
    questions,
  };
  return { course, series };
}
