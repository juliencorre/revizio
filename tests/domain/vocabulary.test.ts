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
  createVocabularySession,
  evaluateVocabularyAnswer,
  legacyEnglishListId,
  parseVocabularyLines,
  vocabularyListError,
  vocabularyProgress,
  vocabularyQuestions,
} from "../../src/domain/vocabulary";

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
      expect(questions[0].expectedAnswers).toEqual(["maison"]);
      expect(questions[2].prompt).toBe("maison");
      expect(questions[2].expectedAnswers).toEqual(["casa", "hogar"]);
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
    expect(question.expectedAnswers).toEqual(["casa", "hogar"]);
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
  it("ignore les scores forgés et distingue les listes et les langues", () => {
    const value = list();
    const failure = answerAll(session(value), "faux");
    failure.answers.forEach((answer) => {
      answer.isCorrect = true;
    });
    expect(vocabularyProgress(value, [failure])[0].status).toBe("review");
    expect(
      vocabularyProgress({ ...value, id: "other" }, [failure])[0].status,
    ).toBe("new");
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
