import { describe, expect, it } from "vitest";
import {
  englishScopeError,
  generateCourse,
  generateExercises,
  OllamaClient,
} from "../../server/ai";
import {
  calculate,
  numericKey,
  promptCalculation,
  requestedCalculation,
} from "../../server/arithmetic";
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
describe("verdict des questions vrai/faux générées", () => {
  async function generate(
    choices: unknown,
    correctChoiceIndex: unknown,
    expectedAnswers: unknown,
  ) {
    return generateExercises(
      {
        available: async () => true,
        json: async () => ({
          questions: [
            {
              type: "true-false",
              prompt: "Un nombre négatif est inférieur à zéro.",
              choices,
              correctChoiceIndex,
              expectedAnswers,
              explanation: "Compare sa position sur la droite graduée.",
              hint: "Repère zéro.",
              concept: "Nombres relatifs",
              rubric: "",
              sourceRefs: [],
            },
          ],
        }),
      },
      { baseUrl: "http://localhost", model: "test" },
      {
        courses: [initialData.courses[0]],
        types: ["true-false"],
        level: "practice",
        count: 1,
      },
    );
  }

  it.each([
    { choices: [], index: 0, expected: ["Vrai"], correct: "c1" },
    { choices: [], index: 0, expected: ["Faux"], correct: "c2" },
    { choices: ["Faux", "Vrai"], index: 0, expected: [], correct: "c2" },
    {
      choices: ["faux", "VRAI"],
      index: 1,
      expected: [" vrai "],
      correct: "c1",
    },
    { choices: ["Vrai", "Faux"], index: 1, expected: [], correct: "c2" },
  ])(
    "conserve le verdict explicite ou le choix indexé $correct",
    async ({ choices, index, expected, correct }) => {
      const [question] = await generate(choices, index, expected);
      expect(question.choices).toEqual([
        { id: "c1", label: "Vrai" },
        { id: "c2", label: "Faux" },
      ]);
      expect(question.correctChoiceId).toBe(correct);
      expect(question.expectedAnswers).toBeUndefined();
    },
  );
  it.each([
    { choices: [], index: 0, expected: [] },
    { choices: [], index: 0, expected: ["Vrai", "Faux"] },
    { choices: [], index: 0, expected: ["Peut-être"] },
    { choices: [], index: 2, expected: ["Vrai"] },
    { choices: ["Vrai", "Faux"], index: 0, expected: ["Faux"] },
    { choices: ["Vrai", "Vrai"], index: 0, expected: [] },
    { choices: ["Vrai", "Faux"], index: null, expected: [] },
    { choices: ["Vrai", "Faux"], index: 2, expected: [] },
  ])(
    "refuse un verdict absent, ambigu ou contradictoire",
    async ({ choices, index, expected }) => {
      await expect(generate(choices, index, expected)).rejects.toThrow(
        "verdict explicite unique et cohérent",
      );
    },
  );
});
describe("garde-fous de fidélité", () => {
  it.each([
    { suffix: "A) premier\nB) deuxième", output: "Quel terme choisir ?" },
    {
      suffix: "A) autre\nB) deuxième",
      output: "Quel terme choisir ?\n\nA) autre\nB) deuxième",
    },
  ])(
    "retire uniquement les options entièrement recopiées à la fin d’un QCM",
    async ({ suffix, output }) => {
      const [question] = await generateExercises(
        {
          available: async () => true,
          json: async () => ({
            questions: [
              {
                type: "single-choice",
                prompt: "Quel terme choisir ?\n\n" + suffix,
                choices: ["premier", "deuxième"],
                correctChoiceIndex: 1,
                expectedAnswers: [],
                explanation: "Le second terme convient.",
                concept: "Ordinal",
                hint: "",
                sourceRefs: [],
              },
            ],
          }),
        },
        { baseUrl: "http://localhost", model: "test" },
        {
          courses: [initialData.courses[0]],
          types: ["single-choice"],
          level: "practice",
          count: 1,
        },
      );
      expect(question.prompt).toBe(output);
      expect(question.correctChoiceId).toBe("c2");
    },
  );
  it("régénère un problème qui mélange plusieurs résultats dans les réponses acceptées", async () => {
    let calls = 0;
    const client = {
      available: async () => true,
      json: async () => ({
        questions: [
          {
            type: "problem",
            prompt:
              ++calls === 1
                ? "Calcule :\n1. 2 + 3 =\n2. 4 + 5 ="
                : "Calcule 2 + 3.",
            choices: [],
            expectedAnswers: calls === 1 ? ["5", "9"] : ["5", "+5"],
            correctChoiceIndex: 0,
            explanation: "On additionne les deux nombres.",
            concept: "Addition",
            hint: "",
            rubric: "",
            sourceRefs: [],
          },
        ],
      }),
    };
    const [question] = await generateExercises(
      client,
      { baseUrl: "http://localhost", model: "test" },
      {
        courses: [initialData.courses[0]],
        types: ["problem"],
        level: "practice",
        count: 1,
      },
    );
    expect(calls).toBe(2);
    expect(question.prompt).toBe("Calcule 2 + 3.");
    expect(question.expectedAnswers).toEqual(["5"]);
  });
  it("présente une notion lisible et retire les marqueurs Markdown du texte généré", async () => {
    const course = {
      ...initialData.courses[0],
      sections: [
        {
          ...initialData.courses[0].sections[0],
          id: "346063c0-1ca3-4f7e-960c-74bcf6b2d718",
        },
      ],
    };
    const client = {
      available: async () => true,
      json: async () => ({
        questions: [
          {
            type: "short-answer",
            prompt: "Écris le mot **négatif**.",
            choices: [],
            expectedAnswers: ["négatif"],
            correctChoiceIndex: 0,
            explanation: "La notion est **importante**.",
            concept: course.sections[0].id,
            hint: "",
            rubric: "",
            sourceRefs: [],
          },
        ],
      }),
    };
    const [question] = await generateExercises(
      client,
      { baseUrl: "http://localhost", model: "test" },
      {
        courses: [course],
        types: ["short-answer"],
        level: "practice",
        count: 1,
      },
    );
    expect(question.concept).toBe(course.sections[0].title);
    expect(question.prompt).toBe("Écris le mot négatif.");
    expect(question.explanation).toBe("La notion est importante.");
  });
  it("calcule les priorités et rejette le code, les expressions ambiguës et les divisions par zéro", () => {
    expect(calculate("10 – (4 + 2) × 3")).toBe(-8);
    expect(calculate("(-3) + (-4)")).toBe(-7);
    expect(calculate("1 / 2 + 0,25")).toBe(0.75);
    expect(calculate("process.exit()")).toBeNull();
    expect(calculate("2 / 0")).toBeNull();
    expect(calculate("2 +")).toBeNull();
    expect(numericKey("+6")).toBe(numericKey("6"));
    expect(numericKey("1/2")).toBe(numericKey("0,5"));
    expect(promptCalculation("Calcule **10 – (4+2)*3**.")?.value).toBe(-8);
    expect(promptCalculation("Calcule 2+3 puis 4+5.")).toBeNull();
    expect(
      requestedCalculation(
        "Résous l'expression suivante en suivant les règles des priorités opératoires : (5 + 2) * 3 - 4. (page 1, priorités.pdf)",
      )?.value,
    ).toBe(17);
  });
  it("refuse une lecture limitée à un titre et reconstruit les sections à partir d’extraits vérifiés", async () => {
    const source =
      "Un nombre relatif est positif, négatif ou nul. Pour additionner deux nombres de même signe, on additionne les distances à zéro et on garde le signe.";
    const client = {
      available: async () => true,
      json: async () => ({
        sections: [
          {
            kind: "essential",
            title: "Titre non fiable",
            content: "Une règle inventée et fausse.",
            example: "5 n’est pas égal à +5",
            sourceRefs: [
              {
                sourceId: "page",
                page: 1,
                excerpt: "Un nombre relatif est positif, négatif ou nul.",
              },
            ],
          },
        ],
      }),
    };
    const settings = { baseUrl: "http://localhost:11434", model: "test" };
    await expect(
      generateCourse(client, settings, {
        title: "Les relatifs",
        subjectId: "maths",
        sourceText: "LES NOMBRES RELATIFS",
        pages: [],
        sources: [],
      }),
    ).rejects.toThrow("trop courte");
    const course = await generateCourse(client, settings, {
      title: "Les relatifs",
      subjectId: "maths",
      sourceText: source,
      pages: [
        {
          sourceId: "page",
          name: "Cours",
          page: 1,
          text: source,
          uncertain: false,
        },
      ],
      sources: [],
    });
    expect(course.sections?.[0].content).toBe(
      "Un nombre relatif est positif, négatif ou nul.",
    );
    expect(course.sections?.[0].example).toBe("");
    expect(course.sections?.[0].title).toBe("L’essentiel");
  });
});
