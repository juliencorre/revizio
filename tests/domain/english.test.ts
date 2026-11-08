import { describe, expect, it } from "vitest";
import {
  buildEnglishMaterial,
  englishFlashcards,
  englishValidation,
  generateBoundedQuiz,
  normalizeEnglish,
} from "../../src/domain/english";
import type { EnglishSettings } from "../../src/domain/model";
const settings: EnglishSettings = {
  words: [
    { id: "castle", en: "castle", fr: "château" },
    { id: "knight", en: "knight", fr: "chevalier" },
    { id: "journey", en: "journey", fr: "voyage" },
  ],
  verbs: [
    {
      id: "go",
      base: "go",
      past: "went",
      participle: "gone",
      meaning: "aller",
    },
    {
      id: "see",
      base: "see",
      past: "saw",
      participle: "seen",
      meaning: "voir",
    },
  ],
  tenses: ["present-simple", "past-simple"],
  toolWords: ["I", "the", "to"],
};
describe("répertoire d’anglais", () => {
  it("refuse les entrées incomplètes, les doublons et les temps inconnus", () => {
    expect(englishValidation(settings)).toBeNull();
    expect(
      englishValidation({
        ...settings,
        words: [...settings.words, { id: "other", en: " CASTLE ", fr: "fort" }],
      }),
    ).toContain("plusieurs");
    expect(
      englishValidation({
        ...settings,
        verbs: [{ ...settings.verbs[0], past: "" }],
      }),
    ).toContain("quatre");
    expect(
      englishValidation({ ...settings, tenses: ["unknown"] }),
    ).toBeTruthy();
  });
  it("normalise les espaces sans inventer de mot", () => {
    const value = normalizeEnglish({
      ...settings,
      words: [{ id: "castle", en: " castle ", fr: " château " }],
      toolWords: [" the ", "The", "to"],
    });
    expect(value.words).toEqual([
      { id: "castle", en: "castle", fr: "château" },
    ]);
    expect(value.toolWords).toEqual(["The", "to"]);
  });
  it("ne propose des cartes de participe passé que si ce temps est autorisé", () => {
    expect(
      englishFlashcards(settings).some(
        (card) => card.kind === "Participe passé",
      ),
    ).toBe(false);
    expect(
      englishFlashcards({
        ...settings,
        tenses: [...settings.tenses, "present-perfect"],
      }).some((card) => card.back === "gone"),
    ).toBe(true);
  });
});
describe("quiz borné", () => {
  it("utilise uniquement les mots et formes approuvés, sans participe passé non autorisé", () => {
    const quiz = generateBoundedQuiz(settings, 20);
    const allowed = new Set([
      ...settings.words.flatMap((word) => [word.en, word.fr]),
      ...settings.verbs.flatMap((verb) => [verb.base, verb.past]),
    ]);
    expect(quiz.length).toBeGreaterThan(3);
    for (const question of quiz) {
      for (const choice of question.choices)
        expect(allowed.has(choice.label)).toBe(true);
      if (question.choices.length)
        expect(
          question.choices.some(
            (choice) => choice.id === question.correctChoiceId,
          ),
        ).toBe(true);
      expect(question.explanation).toBeTruthy();
    }
    expect(JSON.stringify(quiz)).not.toContain("gone");
    expect(JSON.stringify(quiz)).not.toContain("seen");
  });
  it("reste utilisable avec un seul mot grâce à une réponse courte", () => {
    const quiz = generateBoundedQuiz({
      ...settings,
      words: [settings.words[0]],
      verbs: [],
      tenses: [],
    });
    expect(quiz[0]).toMatchObject({
      type: "fill-blank",
      expectedAnswers: ["castle"],
    });
  });
  it("produit un support publié et des identifiants stables lors de la validation parent", () => {
    const material = buildEnglishMaterial(settings)!;
    expect(material.course.id).toBe("english-repertoire-course");
    expect(material.series.id).toBe("english-repertoire-practice");
    expect(material.series.courseIds).toEqual([material.course.id]);
    expect(material.course.status).toBe("published");
    expect(
      buildEnglishMaterial({ words: [], verbs: [], tenses: [], toolWords: [] }),
    ).toBeNull();
  });
});
