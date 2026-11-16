export type ConjugationSheet = { verb: string; tense: string };

function verb(
  base: string,
  meaning: string,
  thirdPerson: string,
  past: string,
  participle: string,
  ing?: string,
) {
  return { base, meaning, thirdPerson, past, participle, ing };
}

// Les formes en -ing sont proposées pour le sens indiqué sur la fiche.
const catalogue = [
  verb("be", "être", "is", "was", "been"),
  verb("have", "avoir", "has", "had", "had"),
  verb("do", "faire", "does", "did", "done", "doing"),
  verb("go", "aller", "goes", "went", "gone", "going"),
  verb("come", "venir", "comes", "came", "come", "coming"),
  verb("eat", "manger", "eats", "ate", "eaten", "eating"),
  verb("know", "savoir", "knows", "knew", "known"),
  verb("like", "aimer", "likes", "liked", "liked"),
  verb("make", "fabriquer", "makes", "made", "made", "making"),
  verb("play", "jouer", "plays", "played", "played", "playing"),
  verb("run", "courir", "runs", "ran", "run", "running"),
  verb("see", "voir", "sees", "saw", "seen"),
  verb("speak", "parler", "speaks", "spoke", "spoken", "speaking"),
  verb("study", "étudier", "studies", "studied", "studied", "studying"),
  verb("take", "prendre", "takes", "took", "taken", "taking"),
  verb("watch", "regarder", "watches", "watched", "watched", "watching"),
  verb("write", "écrire", "writes", "wrote", "written", "writing"),
];

export const conjugationVerbs = catalogue.map(({ base, meaning }) => ({
  base,
  meaning,
}));

const subjects = [
  { pronoun: "I", plural: false, agreement: "firstSingular" },
  { pronoun: "you", plural: false, agreement: "other" },
  { pronoun: "he", plural: false, agreement: "thirdSingular" },
  { pronoun: "she", plural: false, agreement: "thirdSingular" },
  { pronoun: "it", plural: false, agreement: "thirdSingular" },
  { pronoun: "we", plural: true, agreement: "other" },
  { pronoun: "you", plural: true, agreement: "other" },
  { pronoun: "they", plural: true, agreement: "other" },
] as const;

function formsByAgreement(
  firstSingular: string,
  thirdSingular = firstSingular,
  other = firstSingular,
) {
  return { firstSingular, thirdSingular, other };
}

function resolveSheet(sheet: ConjugationSheet) {
  const entry = catalogue.find(({ base }) => base === sheet.verb);
  if (!entry) return null;
  switch (sheet.tense) {
    case "present-simple":
      return entry.base === "be"
        ? formsByAgreement("am", "is", "are")
        : formsByAgreement(entry.base, entry.thirdPerson);
    case "past-simple":
      return entry.base === "be"
        ? formsByAgreement("was", "was", "were")
        : formsByAgreement(entry.past);
    case "future-will":
      return formsByAgreement(`will ${entry.base}`);
    case "present-perfect":
      return formsByAgreement(
        `have ${entry.participle}`,
        `has ${entry.participle}`,
      );
    case "present-continuous":
      return entry.ing
        ? formsByAgreement(
            `am ${entry.ing}`,
            `is ${entry.ing}`,
            `are ${entry.ing}`,
          )
        : null;
    case "past-continuous":
      return entry.ing
        ? formsByAgreement(
            `was ${entry.ing}`,
            `was ${entry.ing}`,
            `were ${entry.ing}`,
          )
        : null;
    default:
      return null;
  }
}

export function conjugationForms(sheet: ConjugationSheet) {
  const forms = resolveSheet(sheet);
  if (!forms) return [];
  return subjects.map(({ pronoun, plural, agreement }) => ({
    pronoun,
    plural,
    form: forms[agreement],
  }));
}

export function isConjugationSheet(value: unknown): value is ConjugationSheet {
  if (
    !value ||
    typeof value !== "object" ||
    !("verb" in value) ||
    typeof value.verb !== "string" ||
    !("tense" in value) ||
    typeof value.tense !== "string"
  )
    return false;
  return resolveSheet({ verb: value.verb, tense: value.tense }) !== null;
}
