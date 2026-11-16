import { normalizeAnswer } from "./answers";
import type { VocabularyLanguage, VocabularyQuestion } from "./model";

type Language = VocabularyLanguage | "french";
type Form = { model: string; accepted: string[]; instruction?: string };

const optionalArticle = "Tu peux écrire le nom avec ou sans son article.";
const definiteArticle = "Écris le nom avec son article défini.";
const indefiniteArticle = "Écris le nom avec son article indéfini.";
const optionalSubject = "Tu peux écrire le pronom sujet ou le laisser de côté.";
const requiredSubject = "Écris la phrase avec son sujet.";

const articles = {
  french: /^(?:(?:le|la|les|un|une|des) |l['’])(.+)$/iu,
  spanish: /^(?:el|la|los|las|un|una|unos|unas) (.+)$/iu,
  english: /^(?:the|a|an) (.+)$/iu,
};

// These paired meanings also cover older lists written without articles.
// A pair matters: “livre” has a different gender when it translates “pound”.
const commonNouns = [
  ["la maison", "the house", "la casa", "domus"],
  ["le livre", "the book", "el libro", "liber"],
  ["la livre", "the pound", "la libra", "libra"],
  ["le chien", "the dog", "el perro", "canis"],
  ["le chat", "the cat", "el gato", "felis"],
  ["la rose", "the rose", "la rosa", "rosa"],
  ["l’eau", "the water", "el agua", "aqua"],
  ["l’ami", "the friend", "el amigo", "amicus"],
  ["l’amie", "the friend", "la amiga", "amica"],
  ["l’arbre", "the tree", "el árbol", "arbor"],
  ["la porte", "the door", "la puerta", "porta"],
  ["la fenêtre", "the window", "la ventana", "fenestra"],
  ["l’école", "the school", "la escuela", "schola"],
  ["la table", "the table", "la mesa", "mensa"],
  ["la ville", "the city", "la ciudad", "urbs"],
  ["le garçon", "the boy", "el chico", "puer"],
  ["la fille", "the girl", "la chica", "puella"],
  ["le château", "the castle", "el castillo", "castellum"],
];
const languageIndex = { french: 0, english: 1, spanish: 2, latin: 3 };
function bareNoun(text: string, language: Language) {
  return language === "latin"
    ? text
    : (text.match(articles[language])?.[1] ?? text);
}
function nounPairKey(
  source: string,
  target: string,
  sourceLang: Language,
  targetLang: Language,
) {
  return [
    sourceLang,
    targetLang,
    normalizeAnswer(bareNoun(source, sourceLang)),
    normalizeAnswer(bareNoun(target, targetLang)),
  ].join("|");
}
const knownNouns = new Map<string, string>();
for (const row of commonNouns) {
  for (const lang of ["english", "spanish", "latin"] as const) {
    const foreign = row[languageIndex[lang]];
    knownNouns.set(nounPairKey(foreign, row[0], lang, "french"), row[0]);
    if (lang !== "latin")
      knownNouns.set(nounPairKey(row[0], foreign, "french", lang), foreign);
  }
}

const frenchSubject = /^(?:(je|tu|il|elle|nous|vous|ils|elles|on) |(j)')(.+)/u;
const englishSubject =
  /^(?:i|you|he|she|it|we|they)(?: |'(?=m|re|s|ve|ll|d))\S/u;
type Subject = { pronouns: string[]; verb: RegExp };
const spanishSubjects: Record<string, Subject> = {
  je: { pronouns: ["yo"], verb: /(?:o|oy|é|í|aba|ía|fui|soy|sé|he)$/u },
  tu: { pronouns: ["tú"], verb: /(?:s|ste)$/u },
  il: { pronouns: ["él"], verb: /(?:a|e|ó|ió|á|es|fue)$/u },
  elle: { pronouns: ["ella"], verb: /(?:a|e|ó|ió|á|es|fue)$/u },
  nous: { pronouns: ["nosotros", "nosotras"], verb: /mos$/u },
  ils: { pronouns: ["ellos"], verb: /n$/u },
  elles: { pronouns: ["ellas"], verb: /n$/u },
};
const latinSubjects: Record<string, Subject> = {
  je: { pronouns: ["ego"], verb: /[oōmiī]$/u },
  tu: { pronouns: ["tu"], verb: /(?:s|stī|sti)$/u },
  il: { pronouns: ["is"], verb: /t$/u },
  elle: { pronouns: ["ea"], verb: /t$/u },
  nous: { pronouns: ["nos"], verb: /mus$/u },
  vous: { pronouns: ["vos"], verb: /tis$/u },
  ils: { pronouns: ["ei"], verb: /nt$/u },
  elles: { pronouns: ["eae"], verb: /nt$/u },
};

function subjectForm(
  source: string,
  answer: string,
  target: Language,
): Form | undefined {
  const normalized = normalizeAnswer(answer);
  if (
    (target === "french" && frenchSubject.test(normalized)) ||
    (target === "english" && englishSubject.test(normalized))
  ) {
    return { model: answer, accepted: [answer], instruction: requiredSubject };
  }
  if (target !== "spanish" && target !== "latin") return;
  const explicit =
    target === "spanish"
      ? /^(yo|tú|él|ella|usted|nosotr[oa]s|vosotr[oa]s|ellos|ellas|ustedes) (.+)$/iu
      : /^(ego|t[uū]|is|ea|n[oō]s|v[oō]s|ei|eae) (.+)$/iu;
  const written = answer.match(explicit);
  const fullForm = written
    ? {
        model: answer,
        accepted: [answer],
        instruction: "Garde le pronom indiqué dans ta liste.",
      }
    : undefined;
  const french = normalizeAnswer(source);
  const subject = french.match(frenchSubject);
  if (!subject) return fullForm;
  // An impersonal “il” has no corresponding él/is to insert.
  if (
    !written &&
    /^il (?:y |(?:ne |n')?(?:pleu|neig|faut|fall|s'agit|fait |(?:est|était|sera) (?:tôt|tard|nécessaire|possible|temps|midi|minuit|\d)))/u.test(
      french,
    )
  )
    return fullForm;
  const frenchPronoun = subject[1] ?? "je";
  const body = written?.[2] ?? answer;
  // Infer a subject only for a simple conjugated form. In longer translations
  // the grammatical subject can change (e.g. “j’aime ça” / “me gusta”).
  const verbPattern =
    target === "latin"
      ? /^(?:non )?(\p{L}+)(?: |$)/u
      : /^(?:(?:no|me|te|se|nos|os|lo|la|los|las|le|les) )*(\p{L}+)(?: |$)/u;
  const predicate = normalizeAnswer(body).replace(/[.!?]$/u, "");
  const match = predicate.match(verbPattern);
  if (!match || (!written && match[0].trim() !== predicate)) return fullForm;
  const verb = match[1];
  const person =
    target === "latin"
      ? latinSubjects[frenchPronoun]
      : frenchPronoun === "vous"
        ? spanishVous(verb)
        : spanishSubjects[frenchPronoun];
  if (!person || !person.verb.test(verb)) return fullForm;
  if (
    !written &&
    target === "spanish" &&
    /^(?:no )?(?:me|te|le|nos|os|les) (?:gust|encant|duele|duelen|falt|parec)/u.test(
      predicate,
    )
  )
    return;
  const pronouns = written ? [written[1]] : person.pronouns;
  const full = pronouns.map((pronoun) => pronoun + " " + body);
  return {
    model: full[0],
    accepted: [body, ...full],
    instruction: optionalSubject,
  };
}

// “Vous” may address one person politely or several people.
function spanishVous(verb: string): Subject {
  if (/(?:áis|éis|ís|ais|eis|is|sois)$/u.test(verb))
    return { pronouns: ["vosotros", "vosotras"], verb: /s$/u };
  if (verb.endsWith("n")) return { pronouns: ["ustedes"], verb: /n$/u };
  return { pronouns: ["usted"], verb: spanishSubjects.il.verb };
}

function nounForm(
  source: string,
  answer: string,
  sourceLang: Language,
  target: Language,
  strict: boolean,
): Form | undefined {
  if (target === "latin") return;
  const known = knownNouns.get(nounPairKey(source, answer, sourceLang, target));
  const explicit = answer.match(articles[target]);
  // Limit automatic removal to a standalone common noun. Phrases such as
  // “la veo”, “le voir” and proper names should retain their approved wording.
  if (
    explicit &&
    !known &&
    (!/^\p{Ll}[\p{Ll}\p{M}-]*(?: (?:de |de la |del |à |en |of |d[’'])\p{Ll}[\p{Ll}\p{M}-]*)?$/u.test(
      explicit[1],
    ) ||
      frenchSubject.test(normalizeAnswer(source)) ||
      englishSubject.test(normalizeAnswer(source)) ||
      /^(?:to |se |s['’])/iu.test(source) ||
      (sourceLang === "english" &&
        /\b(?:me|him|her|it|us|them)$/iu.test(source)) ||
      (sourceLang === "spanish" && /[aei]r(?:l[oa]s?|le)$/iu.test(source)))
  )
    return;
  const model = explicit ? answer : known;
  if (!model) return;
  const bare = bareNoun(model, target);
  return {
    model,
    accepted: strict ? [model] : [model, bare],
    instruction: strict
      ? /^(?:un|une|des|una|unos|unas|a|an) /iu.test(model)
        ? indefiniteArticle
        : definiteArticle
      : optionalArticle,
  };
}

function distinct(values: string[]) {
  return [
    ...new Map(values.map((value) => [normalizeAnswer(value), value])).values(),
  ];
}

export function vocabularyAnswerForms(
  prompt: string,
  answers: string[],
  source: Language,
  target: Language,
  requireArticles = false,
): Pick<VocabularyQuestion, "expectedAnswers" | "guide"> {
  const approvedFullForms = new Map<string, Form>();
  const approved = new Set(answers.map(normalizeAnswer));
  const forms = answers.map((answer) => {
    const subject = subjectForm(prompt, answer, target);
    if (subject) {
      const bare = normalizeAnswer(answer).replace(
        target === "french"
          ? /^(?:(?:je|tu|il|elle|on|nous|vous|ils|elles) |j')/u
          : /^(?:i|you|he|she|it|we|they) /u,
        "",
      );
      if (
        subject.instruction === requiredSubject &&
        bare !== normalizeAnswer(answer) &&
        approved.has(bare)
      ) {
        const form = {
          ...subject,
          instruction: optionalSubject,
          accepted: [answer, bare],
        };
        approvedFullForms.set(bare, form);
        return form;
      }
      return subject;
    }
    const noun = nounForm(prompt, answer, source, target, requireArticles);
    if (noun && target !== "latin" && articles[target].test(answer)) {
      approvedFullForms.set(normalizeAnswer(bareNoun(answer, target)), noun);
    }
    return noun ?? { model: answer, accepted: [answer] };
  });
  // If both forms were entered, show the complete form approved by the parent.
  const resolved = forms.map(
    (form, index) =>
      approvedFullForms.get(normalizeAnswer(answers[index])) ?? form,
  );
  if (!resolved.some((form) => form.instruction)) {
    return {
      expectedAnswers: answers,
      guide: {
        instruction: "Écris la traduction comme dans ta liste.",
        models: answers,
      },
    };
  }
  const instructions = [
    ...new Set(
      resolved.flatMap((form) => (form.instruction ? [form.instruction] : [])),
    ),
  ];
  return {
    expectedAnswers: distinct(resolved.flatMap((form) => form.accepted)),
    guide: {
      instruction:
        instructions.length === 1
          ? instructions[0]
          : "Écris une des traductions de ta liste.",
      models: distinct(resolved.map((form) => form.model)),
    },
  };
}
