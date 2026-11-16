import { describe, expect, it } from "vitest";
import { initialData } from "../../src/domain/fixtures";
import { clone, parseLearningData } from "../../src/domain/learning";
import { restoreLearningData } from "../../src/state/persistence";
import { mergeLearningData } from "../../src/domain/sync";
import type {
  VocabularyLanguage,
  VocabularyList,
  VocabularyMode,
  VocabularySession,
} from "../../src/domain/model";
import {
  answerVocabularySession,
  isVocabularySession,
  retainRemovedVocabulary,
  createVocabularySession,
  evaluateVocabularyAnswer,
  legacyEnglishListId,
  parseVocabularyLines,
  reviewVocabularyPhoto,
  vocabularyListError,
  vocabularyProgress,
  vocabularyQuestions,
} from "../../src/domain/vocabulary";

import {
  createGeneralReview,
  publicationPreview,
  vocabularyRepertoire,
} from "../../src/domain/vocabulary-repertoire";

const list = (language: VocabularyLanguage = "spanish"): VocabularyList => ({
  id: "list-1",
  title: "Mes mots",
  language,
  status: "published",
  words: [
    { id: "casa", term: "casa ; hogar", translation: "maison" },
    { id: "arbol", term: "árbol", translation: "arbre" },
  ],
});
let sequence = 0;
function session(
  value = list(),
  mode: VocabularyMode = "both",
  previous: VocabularySession[] = [],
) {
  return createVocabularySession(value, previous, {
    id: `session-${++sequence}`,
    mode,
    scope: "all",
    startedAt: "2026-11-15T10:00:00.000Z",
  })!;
}
function answerAll(value: VocabularySession, wrong = "") {
  return value.questions.reduce(
    (current, question) =>
      answerVocabularySession(
        current,
        question.id,
        wrong || question.expectedAnswers[0],
        "2026-11-15T10:00:01.000Z",
      ),
    value,
  );
}

describe("listes de vocabulaire dans trois langues", () => {
  it.each(["english", "spanish", "latin"] as const)(
    "propose une traduction écrite dans les deux sens en %s",
    (language) => {
      const questions = vocabularyQuestions(list(language), "both");
      expect(questions.map((question) => question.direction)).toEqual([
        "to-french",
        "to-french",
        "from-french",
        "from-french",
      ]);
      expect(questions[0].prompt).toBe("casa");
      expect(questions[0].expectedAnswers).toEqual(
        language === "spanish" ? ["la maison", "maison"] : ["maison"],
      );
      expect(questions[2].prompt).toBe("maison");
      expect(questions[2].expectedAnswers).toEqual(
        language === "spanish"
          ? ["la casa", "casa", "hogar"]
          : ["casa", "hogar"],
      );
      expect(vocabularyQuestions(list(language), "to-french")).toHaveLength(2);
      expect(vocabularyQuestions(list(language), "from-french")).toHaveLength(
        2,
      );
    },
  );
  it("accepte les variantes approuvées, majuscules, espaces et Unicode, en respectant les accents", () => {
    const questions = vocabularyQuestions(list(), "both");
    expect(evaluateVocabularyAnswer(questions[2], " HOGAR  ")).toBe(true);
    expect(evaluateVocabularyAnswer(questions[3], "a\u0301rbol")).toBe(true);
    expect(evaluateVocabularyAnswer(questions[3], "arbol")).toBe(false);
    expect(
      evaluateVocabularyAnswer(
        { ...questions[3], expectedAnswers: ["1"] },
        "1.0",
      ),
    ).toBe(false);
  });
  it("accepte les synonymes quand deux mots publiés ont la même traduction française", () => {
    const value = list();
    value.words[0].term = "casa";
    value.words.push({ id: "hogar", term: "hogar", translation: "maison" });
    const question = vocabularyQuestions(value, "from-french")[0];
    expect(question.expectedAnswers).toEqual(["la casa", "casa", "hogar"]);
  });
  it("bloque la publication des lignes incomplètes, des doublons et des listes vides", () => {
    const value = list();
    value.words[0].translation = " ; ";
    expect(vocabularyListError(value)).toContain("Complétez");
    value.words[0].translation = "maison";
    value.words.push({
      id: "duplicate",
      term: " CASA ",
      translation: "chez soi",
    });
    expect(vocabularyListError(value)).toContain("plusieurs lignes");
    expect(vocabularyListError({ ...value, words: [] })).toContain("Ajoutez");
  });
  it("colle des paires avec égal ou tabulation, et signale les lignes erronées", () => {
    expect(parseVocabularyLines("casa = maison\r\n\nárbol\tarbre")).toEqual([
      { term: "casa", translation: "maison" },
      { term: "árbol", translation: "arbre" },
    ]);
    expect(() => parseVocabularyLines("rosa = rose\naqua")).toThrow("Ligne 2");
  });
  it("repère les doublons d’une photo même parmi les variantes et garde les paires à compléter", () => {
    expect(
      reviewVocabularyPhoto(list().words, [
        { term: "HOGAR", translation: "chez soi" },
        { term: "la ventana", translation: "" },
        { term: "la ventana", translation: "la fenêtre" },
        { term: "ventana ; la ventana", translation: "fenêtre" },
        { term: "", translation: "la porte" },
        {
          id: "arbol",
          term: "mot mal recopié dans la photo",
          translation: "arbre",
        },
      ]),
    ).toEqual([
      "duplicate",
      "incomplete",
      "ready",
      "duplicate",
      "incomplete",
      "duplicate",
    ]);
  });
});
describe("consignes et formes écrites du vocabulaire", () => {
  function questions(
    language: VocabularyLanguage,
    term: string,
    translation: string,
    requireArticles = false,
  ) {
    return vocabularyQuestions(
      {
        ...list(language),
        words: [{ id: "word", term, translation }],
        requireArticles,
      },
      "both",
    );
  }

  it.each(["hablo", "yo hablo", "hablo ; yo hablo"])(
    "accepte le sujet espagnol facultatif avec la fiche %s",
    (term) => {
      const [french, spanish] = questions("spanish", term, "je parle");
      expect(spanish.guide?.instruction).toContain("laisser de côté");
      expect(spanish.guide?.models).toEqual(["yo hablo"]);
      expect(spanish.expectedAnswers).toEqual(["hablo", "yo hablo"]);
      for (const wrong of ["tú hablo", "yo habla", "hablar"])
        expect(evaluateVocabularyAnswer(spanish, wrong)).toBe(false);
      expect(french.guide?.instruction).toContain("avec son sujet");
      expect(evaluateVocabularyAnswer(french, "parle")).toBe(false);
    },
  );

  it("garde le sujet anglais, les pronoms réfléchis et les accents", () => {
    expect(questions("english", "I speak", "je parle")[1]).toMatchObject({
      expectedAnswers: ["I speak"],
      guide: { instruction: "Écris la phrase avec son sujet." },
    });
    expect(
      questions("english", "I'm happy", "je suis heureux")[1].guide
        ?.instruction,
    ).toContain("avec son sujet");
    expect(
      questions("spanish", "yo me levanto", "je me lève")[1].expectedAnswers,
    ).toEqual(["me levanto", "yo me levanto"]);
    expect(
      questions("spanish", "hablas", "tu parles")[1].expectedAnswers,
    ).toEqual(["hablas", "tú hablas"]);
    expect(
      questions("spanish", "Yo hablo.", "Je parle.")[1].expectedAnswers,
    ).toContain("hablo.");
    expect(questions("latin", "amo", "j’aime")[1].expectedAnswers).toEqual([
      "amo",
      "ego amo",
    ]);
  });

  it("conserve les impersonnels, les pronoms isolés et les expressions", () => {
    for (const [es, fr] of [
      ["llueve", "il pleut"],
      ["me gusta", "j’aime"],
      ["yo", "je"],
      ["la veo", "je la vois"],
      ["La Habana", "La Havane"],
      ["a veces", "parfois"],
    ]) {
      const question = questions("spanish", es, fr)[1];
      if (es === "la veo") {
        expect(evaluateVocabularyAnswer(question, "veo")).toBe(false);
      } else expect(question.expectedAnswers).toEqual([es]);
    }
    expect(
      questions("english", "to see him", "le voir")[0].expectedAnswers,
    ).toEqual(["le voir"]);
  });

  it("préserve un pronom complément dans une traduction à l’infinitif", () => {
    expect(
      questions("english", "see him", "le voir")[0].expectedAnswers,
    ).toEqual(["le voir"]);
  });

  it("accepte le bon article même sur une ancienne liste et présente la forme complète", () => {
    const [french, spanish] = questions("spanish", "casa", "maison");
    expect(french.guide?.models).toEqual(["la maison"]);
    expect(evaluateVocabularyAnswer(french, "la maison")).toBe(true);
    expect(evaluateVocabularyAnswer(french, "le maison")).toBe(false);
    expect(evaluateVocabularyAnswer(spanish, "el casa")).toBe(false);
    expect(questions("english", "pound", "livre")[0].guide?.models).toEqual([
      "la livre",
    ]);
    const water = questions("latin", "aqua", "eau")[0];
    expect(evaluateVocabularyAnswer(water, " L'EAU ")).toBe(true);
    expect(water.guide?.models).toEqual(["l’eau"]);
  });

  it("respecte l’article du parent sur un nom nouveau ou composé, y compris en révision du genre", () => {
    const normal = questions("spanish", "la brújula", "la boussole")[0];
    expect(normal.expectedAnswers).toEqual(["la boussole", "boussole"]);
    const strict = questions(
      "spanish",
      "la brújula",
      "boussole ; la boussole",
      true,
    )[0];
    expect(strict.guide?.instruction).toBe(
      "Écris le nom avec son article défini.",
    );
    expect(strict.expectedAnswers).toEqual(["la boussole"]);
    expect(
      questions("english", "classroom", "la salle de classe")[0]
        .expectedAnswers,
    ).toContain("salle de classe");
    expect(
      questions("spanish", "hablo", "je parle", true)[1].expectedAnswers,
    ).toContain("yo hablo");
  });
  it("compte une réponse courte en vocabulaire et réserve le suivi du genre aux articles donnés", () => {
    const nouns = {
      ...list(),
      words: [{ id: "casa", term: "la casa", translation: "la maison" }],
    };
    const first = session(nouns, "to-french");
    const answered = answerVocabularySession(
      first,
      first.questions[0].id,
      "maison",
      "2026-11-15T10:00:01.000Z",
    );
    expect(
      vocabularyProgress(nouns, [answered])[0].directions["to-french"].streak,
    ).toBe(1);
    expect(
      vocabularyProgress({ ...nouns, requireArticles: true }, [answered])[0]
        .directions["to-french"].answered,
    ).toBe(0);
    expect(answered.answers[0].isCorrect).toBe(true);
  });
  it("conserve les variantes qu’un parent a expressément autorisées", () => {
    const english = questions("english", "speak ; I speak", "je parle")[1];
    expect(english.guide?.instruction).toContain("laisser de côté");
    expect(english.guide?.models).toEqual(["I speak"]);
    const noun = questions("spanish", "casa", "maison ; une maison", true)[0];
    expect(noun.expectedAnswers).toEqual(["une maison"]);
    expect(noun.guide?.instruction).toContain("indéfini");
  });
});
describe("suivi des mots et snapshots des séances", () => {
  it("distingue non testé, en cours, connu dans les deux sens et à revoir après une erreur", () => {
    const value = list();
    expect(vocabularyProgress(value, [])[0].status).toBe("new");
    const forward = answerAll(session(value, "to-french"));
    const secondForward = answerAll(session(value, "to-french"));
    expect(vocabularyProgress(value, [forward, secondForward])[0].status).toBe(
      "learning",
    );
    const backward = answerAll(session(value, "from-french"));
    expect(
      vocabularyProgress(value, [forward, secondForward, backward])[0].status,
    ).toBe("learning");
    const secondBackward = answerAll(session(value, "from-french"));
    const sessions = [forward, secondForward, backward, secondBackward];
    expect(
      vocabularyProgress(value, sessions).map((item) => item.status),
    ).toEqual(["known", "known"]);
    const failure = answerVocabularySession(
      session(value),
      "casa:to-french",
      "chat",
      "2026-11-15T10:00:02Z",
    );
    const result = vocabularyProgress(value, [...sessions, failure]);
    expect(result[0].status).toBe("review");
    expect(result[0].directions["to-french"].streak).toBe(0);
    expect(result[1].status).toBe("known");
  });
  it("ne compte pas une carte consultée comme réussite, et préserve les anciennes traductions lors d’une modification", () => {
    const value = list();
    const sessions = [answerAll(session(value)), answerAll(session(value))];
    expect(vocabularyProgress(value, sessions)[0].status).toBe("known");
    const oldQuestions = clone(sessions[0].questions);
    value.words[0].translation = "foyer";
    expect(vocabularyProgress(value, sessions)[0].status).toBe("new");
    expect(sessions[0].questions).toEqual(oldQuestions);
    expect(vocabularyProgress(value, sessions)[1].status).toBe("known");
  });
  it("partage les progrès entre listes dans la même langue et ignore les scores forgés", () => {
    const value = list();
    const failure = answerAll(session(value), "faux");
    failure.answers.forEach((answer) => {
      answer.isCorrect = true;
    });
    expect(vocabularyProgress(value, [failure])[0].status).toBe("review");
    expect(
      vocabularyProgress(
        {
          language: value.language,
          words: value.words.map((word) => ({
            ...word,
            id: "other-" + word.id,
          })),
        },
        [failure],
      )[0].status,
    ).toBe("review");
    expect(
      vocabularyProgress({ ...value, language: "latin" }, [failure])[0].status,
    ).toBe("new");
  });
  it("ne réécrit pas une réponse et ne répond pas hors ordre", () => {
    const pending = session();
    expect(
      answerVocabularySession(
        pending,
        pending.questions[1].id,
        "arbre",
        "2026-11-15T10:00:01Z",
      ),
    ).toBe(pending);
    const answered = answerVocabularySession(
      pending,
      pending.questions[0].id,
      "maison",
      "2026-11-15T10:00:01Z",
    );
    expect(
      answerVocabularySession(
        answered,
        pending.questions[0].id,
        "chat",
        "2026-11-15T10:00:02Z",
      ),
    ).toBe(answered);
  });
  it("limite la séance à revoir aux mots non connus et n’ouvre pas les brouillons", () => {
    const value = list();
    const sessions = [answerAll(session(value)), answerAll(session(value))];
    expect(
      createVocabularySession(value, sessions, {
        id: "review",
        mode: "both",
        scope: "review",
        startedAt: "2026-11-15T10:01:00Z",
      }),
    ).toBeNull();
    value.words.push({ id: "nuevo", term: "nuevo", translation: "nouveau" });
    const review = createVocabularySession(value, sessions, {
      id: "review",
      mode: "both",
      scope: "review",
      startedAt: "2026-11-15T10:01:00Z",
    });
    expect(review?.questions.map((question) => question.wordId)).toEqual([
      "nuevo",
      "nuevo",
    ]);
    expect(
      createVocabularySession({ ...value, status: "draft" }, [], {
        id: "secret",
        mode: "both",
        scope: "all",
        startedAt: "2026-11-15T10:01:00Z",
      }),
    ).toBeNull();
  });
});
describe("persistance et synchronisation du vocabulaire", () => {
  it("restaure les listes, la place dans la séance et les scores recalculés", () => {
    const data = clone(initialData);
    data.vocabularyLists = [list()];
    const pending = answerVocabularySession(
      session(),
      "casa:to-french",
      "erreur",
      "2026-11-15T10:00:01Z",
    );
    pending.answers[0].isCorrect = true;
    data.vocabularySessions = [pending];
    const restored = parseLearningData(JSON.stringify(data));
    expect(restored.vocabularySessions![0].answers).toHaveLength(1);
    expect(restored.vocabularySessions![0].answers[0].isCorrect).toBe(false);
    expect(restored.vocabularySessions![0].questions).toEqual(
      pending.questions,
    );
  });
  it("reprend les mots d’une ancienne sauvegarde anglaise sans remplir les listes explicitement supprimées", () => {
    const data = clone(initialData);
    delete data.vocabularyLists;
    data.english = {
      words: [{ id: "hello", en: "hello", fr: "bonjour" }],
      verbs: [],
      tenses: [],
      toolWords: [],
    };
    expect(
      parseLearningData(JSON.stringify(data)).vocabularyLists![0],
    ).toMatchObject({
      id: legacyEnglishListId,
      status: "published",
      words: [{ id: "hello", term: "hello", translation: "bonjour" }],
    });
    data.vocabularyLists = [];
    expect(parseLearningData(JSON.stringify(data)).vocabularyLists).toEqual([]);
  });
  it.each([
    (data: typeof initialData) => {
      data.vocabularyLists![0].language = "unknown" as VocabularyLanguage;
    },
    (data: typeof initialData) => {
      data.vocabularyLists![0].words[0].translation = "";
    },
    (data: typeof initialData) => {
      const pending = session();
      pending.completedAt = "2026-11-15T10:01:00Z";
      data.vocabularySessions = [pending];
    },
    (data: typeof initialData) => {
      const pending = answerAll(session());
      pending.answers.push(pending.answers[0]);
      data.vocabularySessions = [pending];
    },
  ])("résiste aux données locales de vocabulaire invalides", (corrupt) => {
    const data = clone(initialData);
    corrupt(data);
    const restored = restoreLearningData(JSON.stringify(data));
    expect(restored.error).toBeTruthy();
    expect(restored.data).toEqual(initialData);
  });
  it("fusionne deux listes et deux séances ajoutées sur des appareils différents", () => {
    const base = clone(initialData),
      local = clone(base),
      remote = clone(base);
    local.vocabularyLists!.push(list());
    remote.vocabularyLists!.push({ ...list(), id: "remote-list" });
    local.vocabularySessions!.push(answerAll(session()));
    remote.vocabularySessions!.push(answerAll(session()));
    const merged = mergeLearningData(base, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.data.vocabularyLists).toHaveLength(
      base.vocabularyLists!.length + 2,
    );
    expect(merged.data.vocabularySessions).toHaveLength(2);
    expect(() => parseLearningData(JSON.stringify(merged.data))).not.toThrow();
  });
});

it("conserve intégralement un ancien répertoire anglais de plus de 200 mots", () => {
  const old = clone(initialData);
  delete old.vocabularyLists;
  old.english = {
    words: Array.from({ length: 250 }, (_, index) => ({
      id: `legacy-${index}`,
      en: `word ${index}`,
      fr: `mot ${index}`,
    })),
    verbs: [],
    tenses: [],
    toolWords: [],
  };
  const migrated = parseLearningData(JSON.stringify(old));
  expect(migrated.vocabularyLists![0].words).toHaveLength(250);
  expect(migrated.vocabularyLists![0].status).toBe("published");
  expect(() => parseLearningData(JSON.stringify(migrated))).not.toThrow();
  migrated.vocabularySessions = [
    createVocabularySession(migrated.vocabularyLists![0], [], {
      id: "large-repertoire",
      mode: "both",
      scope: "all",
      startedAt: "2026-11-15T10:00:00Z",
    })!,
  ];
  expect(migrated.vocabularySessions[0].questions).toHaveLength(500);
  expect(() => parseLearningData(JSON.stringify(migrated))).not.toThrow();
});

describe("répertoire et révision générale", () => {
  const start = "2026-11-16T10:00:00.000Z";
  const general = (
    lists: VocabularyList[],
    history: VocabularySession[] = [],
    when = start,
  ) =>
    createGeneralReview(
      { vocabularyLists: lists },
      history,
      "spanish",
      "general",
      when,
    )!;

  it("donne la même consigne dans le répertoire et garde le sens du rappel", () => {
    const chapter = {
      ...list(),
      words: [{ id: "v", term: "hablo", translation: "je parle" }],
    };
    const forward = general([chapter]);
    expect(forward.questions[0].direction).toBe("to-french");
    const answered = answerVocabularySession(
      forward,
      forward.questions[0].id,
      "je parle",
      start,
    );
    const reverse = general([chapter], [answered]);
    expect(reverse.questions[0]).toMatchObject({
      direction: "from-french",
      expectedAnswers: ["hablo", "yo hablo"],
      guide: { models: ["yo hablo"] },
    });
    expect(general([list()]).questions[0]).toMatchObject({
      direction: "to-french",
      guide: { models: ["la maison"] },
    });
  });
  it("réunit les sources publiées ou archivées et conserve les mots après suppression", () => {
    const spanish = list();
    const archived = { ...list(), id: "archived", archived: true };
    archived.words = [
      { id: "other", term: "HOGAR ; CASA", translation: "  maison  " },
      { id: "new", term: "libro", translation: "livre" },
    ];
    const privateList = {
      ...list(),
      id: "private",
      status: "draft" as const,
      words: [{ id: "private", term: "secreto", translation: "secret" }],
    };
    const old = {
      ...initialData,
      vocabularyLists: [spanish, archived, privateList, list("latin")],
    };
    const repertoire = vocabularyRepertoire(old, "spanish");
    expect(repertoire.words).toHaveLength(3);
    expect(
      publicationPreview(
        archived,
        vocabularyRepertoire({ vocabularyLists: [spanish] }, "spanish"),
      ),
    ).toMatchObject({ existing: 1, added: 1 });
    const next = retainRemovedVocabulary(old, { ...old, vocabularyLists: [] });
    const restored = parseLearningData(JSON.stringify(next));
    expect(vocabularyRepertoire(restored, "spanish").words).toHaveLength(3);
    expect(
      restored.vocabularyRetainedWords?.some((w) => w.term === "secreto"),
    ).toBe(false);
    expect(
      createGeneralReview(restored, [], "spanish", "later", start)?.questions,
    ).toHaveLength(3);
    expect(
      createGeneralReview(restored, [], "english", "empty", start),
    ).toBeNull();
    expect(() =>
      parseLearningData(
        JSON.stringify({
          ...restored,
          vocabularyRetainedWords: [{ term: "invalide" }],
        }),
      ),
    ).toThrow();
  });

  it("garde un mot retiré de la liste mais remplace une traduction corrigée", () => {
    const old = { ...initialData, vocabularyLists: [list()] };
    const updated = {
      ...list(),
      words: [{ ...list().words[0], translation: "foyer" }],
    };
    const data = retainRemovedVocabulary(old, {
      ...old,
      vocabularyLists: [updated],
    });
    expect(
      vocabularyRepertoire(data, "spanish").words.map(
        (word) => word.translation,
      ),
    ).toEqual(["foyer", "arbre"]);
  });

  it("choisit le sens inverse quand les titres d’origine ne distinguent pas deux homonymes", () => {
    const river = {
      ...list(),
      words: [{ id: "r", term: "banco", translation: "banc" }],
    };
    const bank = {
      ...river,
      id: "2",
      words: [{ id: "b", term: "banco", translation: "banque" }],
    };
    expect(general([river, bank]).questions.map((q) => q.prompt)).toEqual([
      "banc",
      "banque",
    ]);
  });

  it("distingue deux sens et conserve précisément l’indice et les réponses présentés", () => {
    const river = {
      id: "river",
      term: "banco",
      translation: "banc",
      context: "Dans un parc",
    };
    const bank = {
      id: "bank",
      term: "banco",
      translation: "banque",
      context: "Pour déposer de l’argent",
    };
    const value = { ...list(), words: [river, bank] };
    const preview = publicationPreview(
      { ...value, words: [bank] },
      vocabularyRepertoire(
        { vocabularyLists: [{ ...value, words: [river] }] },
        "spanish",
      ),
    );
    expect(preview.otherSenses.get(bank.id)).toEqual(["banc"]);
    expect(vocabularyListError(value)).toBeNull();
    const review = general([value]);
    expect(review.questions.map((q) => [q.context, q.expectedAnswers])).toEqual(
      [
        [river.context, ["banc"]],
        [bank.context, ["banque"]],
      ],
    );
    const answered = answerVocabularySession(
      review,
      review.questions[0].id,
      "banc",
      start,
    );
    const progress = vocabularyProgress(value, [answered]);
    expect(progress.map((item) => item.status)).toEqual(["learning", "new"]);
  });

  it("mélange deux chapitres, limite la séance et reprend une erreur sans la transformer en acquis", () => {
    const longList = {
      ...list(),
      words: Array.from({ length: 16 }, (_, i) => ({
        id: "word" + i,
        term: "mot" + i,
        translation: "traduction" + i,
      })),
    };
    const second = { ...list(), id: "2", title: "Maison" };
    let review = general([longList, second]);
    expect(review.questions).toHaveLength(8);
    expect(review.questions.some((q) => q.term === "casa ; hogar")).toBe(true);
    const first = review.questions[0];
    review = answerVocabularySession(review, first.id, "erreur", start);
    expect(review.questions.at(-1)).toMatchObject({
      retryOf: first.id,
      prompt: first.prompt,
    });
    for (const q of review.questions.slice(1))
      review = answerVocabularySession(
        review,
        q.id,
        q.expectedAnswers[0],
        start,
      );
    expect(isVocabularySession(review)).toBe(true);
    expect(vocabularyProgress(longList, [review])[0].status).toBe("review");
    const next = general([longList, second], [review], "2026-11-18T10:00:00Z");
    expect(next.questions[0]).toMatchObject({
      term: first.term,
      direction: first.direction,
    });
    expect(
      isVocabularySession({
        ...review,
        questions: review.questions.slice(0, -1),
      }),
    ).toBe(false);
  });

  it("espace séparément les deux sens et allonge le délai seulement lors de réussites sur plusieurs jours", () => {
    const value = list();
    const first = answerAll(session(value, "to-french"));
    const again = answerAll(session(value, "to-french"));
    const next = session(value, "to-french");
    const later = answerVocabularySession(
      next,
      next.questions[0].id,
      "maison",
      "2026-11-18T10:00:00Z",
    );
    const [entry] = vocabularyProgress(value, [first, again, later]);
    expect(entry.directions["to-french"]).toMatchObject({
      spacedSuccesses: 2,
      nextReviewAt: Date.parse("2026-11-21T10:00:00Z"),
    });
    expect(entry.directions["from-french"].answered).toBe(0);
    expect(
      general([value], [first, again], "2026-11-15T11:00:00Z").questions[0]
        .direction,
    ).toBe("from-french");
  });
});
