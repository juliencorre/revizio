import { describe, expect, it } from "vitest";
import { englishScopeError, generateCourse, OllamaClient } from "../../server/ai";
import { calculate, numericKey, promptCalculation, requestedCalculation } from "../../server/arithmetic";
import { initialData } from "../../src/domain/fixtures";
import type { Question } from "../../src/domain/model";
describe("périmètre anglais", () => {
  const settings = {
    words: [{ id: "castle", en: "castle", fr: "château" }],
    verbs: [
      {
        id: "go",
        base: "go",
        past: "went",
        participle: "gone",
        meaning: "aller",
      },
    ],
    tenses: ["Prétérit simple"],
    toolWords: ["the", "to", "I", "a"],
  };
  const q: Question = {
    ...initialData.series[0].questions[0],
    choices: [
      { id: "a", label: "castle" },
      { id: "b", label: "went" },
    ],
  };
  it("autorise seulement les mots, formes verbales et mots outils enregistrés", () => {
    expect(englishScopeError([q], settings)).toBeNull();
    expect(
      englishScopeError(
        [
          {
            ...q,
            choices: [
              { id: "a", label: "dragon" },
              { id: "b", label: "castle" },
            ],
          },
        ],
        settings,
      ),
    ).toContain("dragon");
    expect(
      englishScopeError([q], settings, [
        { englishText: ["I went to the castle"] },
      ]),
    ).toBeNull();
    expect(
      englishScopeError([q], settings, [
        { englishText: ["I went to the mountain"] },
      ]),
    ).toContain("mountain");
  });
  it("ne prétend pas qu’un service absent est disponible", async () => {
    expect(
      await new OllamaClient().available({
        baseUrl: "http://127.0.0.1:1",
        model: "not-installed",
      }),
    ).toBe(false);
  });
});
describe("garde-fous de fidélité", () => {
  it("calcule les priorités et rejette le code, les expressions ambiguës et les divisions par zéro", () => {
    expect(calculate("10 – (4 + 2) × 3")).toBe(-8);
    expect(calculate("(-3) + (-4)")).toBe(-7);
    expect(calculate("1 / 2 + 0,25")).toBe(.75);
    expect(calculate("process.exit()")).toBeNull();
    expect(calculate("2 / 0")).toBeNull();
    expect(calculate("2 +")).toBeNull();
    expect(numericKey("+6")).toBe(numericKey("6"));
    expect(numericKey("1/2")).toBe(numericKey("0,5"));
    expect(promptCalculation("Calcule **10 – (4+2)*3**.")?.value).toBe(-8);
    expect(promptCalculation("Calcule 2+3 puis 4+5.")).toBeNull();
    expect(requestedCalculation("Résous l'expression suivante en suivant les règles des priorités opératoires : (5 + 2) * 3 - 4. (page 1, priorités.pdf)")?.value).toBe(17);
  });
  it("refuse une lecture limitée à un titre et reconstruit les sections à partir d’extraits vérifiés", async () => {
    const source = "Un nombre relatif est positif, négatif ou nul. Pour additionner deux nombres de même signe, on additionne les distances à zéro et on garde le signe.";
    const client = { available: async () => true, json: async () => ({ sections: [{ kind: "essential", title: "Titre non fiable", content: "Une règle inventée et fausse.", example: "5 n’est pas égal à +5", sourceRefs: [{ sourceId: "page", page: 1, excerpt: "Un nombre relatif est positif, négatif ou nul." }] }] }) };
    const settings = { baseUrl: "http://localhost:11434", model: "test" };
    await expect(generateCourse(client, settings, { title: "Les relatifs", subjectId: "maths", sourceText: "LES NOMBRES RELATIFS", pages: [], sources: [] })).rejects.toThrow("trop courte");
    const course = await generateCourse(client, settings, { title: "Les relatifs", subjectId: "maths", sourceText: source, pages: [{ sourceId: "page", name: "Cours", page: 1, text: source, uncertain: false }], sources: [] });
    expect(course.sections?.[0].content).toBe("Un nombre relatif est positif, négatif ou nul.");
    expect(course.sections?.[0].example).toBe("");
    expect(course.sections?.[0].title).toBe("L’essentiel");
  });
});
