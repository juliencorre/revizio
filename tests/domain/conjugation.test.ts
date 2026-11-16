import { describe, expect, it } from "vitest";
import {
  conjugationForms,
  conjugationVerbs,
  isConjugationSheet,
} from "../../src/domain/conjugation";
import { englishTenses } from "../../src/domain/english";

describe("fiches de conjugaison anglaise", () => {
  it("conjugue be au présent pour chaque personne, y compris les deux you", () => {
    const rows = conjugationForms({ verb: "be", tense: "present-simple" });
    expect(rows.map(({ pronoun, form }) => pronoun + " " + form)).toEqual([
      "I am",
      "you are",
      "he is",
      "she is",
      "it is",
      "we are",
      "you are",
      "they are",
    ]);
    expect(
      rows.filter(({ plural }) => plural).map(({ pronoun }) => pronoun),
    ).toEqual(["we", "you", "they"]);
  });

  it.each([
    ["be", "past-simple", "was", "were", "was"],
    ["be", "present-perfect", "have been", "have been", "has been"],
    ["have", "present-simple", "have", "have", "has"],
    ["have", "past-simple", "had", "had", "had"],
    ["do", "present-simple", "do", "do", "does"],
    ["go", "present-perfect", "have gone", "have gone", "has gone"],
    ["take", "future-will", "will take", "will take", "will take"],
    ["run", "present-continuous", "am running", "are running", "is running"],
    ["write", "past-continuous", "was writing", "were writing", "was writing"],
    ["study", "present-simple", "study", "study", "studies"],
  ])("accorde %s au %s", (verb, tense, first, second, third) => {
    expect(conjugationForms({ verb, tense }).map(({ form }) => form)).toEqual([
      first,
      second,
      third,
      third,
      third,
      second,
      second,
      second,
    ]);
  });

  it("ne propose que des fiches complètes aux temps adaptés au sens enseigné", () => {
    for (const { base: verb } of conjugationVerbs) {
      for (const { id: tense } of englishTenses) {
        const sheet = { verb, tense };
        const progressive =
          tense === "present-continuous" || tense === "past-continuous";
        const expected =
          !progressive || !["be", "have", "like", "know", "see"].includes(verb);
        expect(isConjugationSheet(sheet)).toBe(expected);
        expect(conjugationForms(sheet)).toHaveLength(expected ? 8 : 0);
      }
    }
  });

  it("écarte les fiches inconnues ou incomplètes à la lecture", () => {
    for (const invalid of [
      null,
      [],
      {},
      "be",
      { verb: "be" },
      { verb: 5, tense: 2 },
    ]) {
      expect(isConjugationSheet(invalid)).toBe(false);
    }
    for (const sheet of [
      { verb: "be", tense: "unknown" },
      { verb: "unknown", tense: "present-simple" },
      { verb: "constructor", tense: "toString" },
    ]) {
      expect(isConjugationSheet(sheet)).toBe(false);
      expect(conjugationForms(sheet)).toEqual([]);
    }
  });
});
