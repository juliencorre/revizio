import {
  latestSpacedReviews,
  publishedReadingEditions,
} from "./reading-history";
import type { ConjugationSheet } from "./conjugation";
import { conjugationSeriesId } from "./conjugation-practice";
import type { LearningData, ReadingRecord, SpacedReview } from "./model";
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const copy = (value: unknown) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export type ConflictChoice = "local" | "remote";
export interface FieldConflict {
  path: string;
  title: string;
  field: string;
  local: string;
  remote: string;
}
const labels: Record<string, string> = {
  courses: "Cours",
  answerReviews: "Vérification d’une réponse",
  series: "Série",
  attempts: "Tentative",
  plans: "Plan",
  vocabularyLists: "Liste de vocabulaire",
  vocabularySessions: "Séance de vocabulaire",
  spacedReviews: "Révision",
  english: "Anglais",
  title: "Titre",
  description: "Description",
  status: "Statut",
  sections: "Sections",
  sources: "Documents",
  questions: "Questions",
  answers: "Réponses",
  text: "Texte",
  content: "Contenu",
  explanation: "Correction",
  prompt: "Question",
  dueDate: "Échéance",
  updatedAt: "Date de modification",
  words: "Mots",
  entries: "Entrées",
  steps: "Étapes",
  name: "Nom",
  body: "Texte",
  hint: "Indice",
  translation: "Traduction",
  courseIds: "Cours associés",
  level: "Niveau",
  choices: "Choix de réponse",
  concept: "Notion",
  completedAt: "Date de fin",
};
function summary(value: unknown): string {
  if (value === undefined || value === null) return "Supprimé";
  if (Array.isArray(value))
    return value.map(summary).join(", ") || "Liste vide";
  if (object(value)) {
    const name =
      value.title ?? value.name ?? value.prompt ?? value.word ?? value.text;
    return typeof name === "string" ? name : "Contenu modifié";
  }
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  return String(value) || "Champ vide";
}
export function mergeLearningData(
  base: LearningData,
  local: LearningData,
  remote: LearningData,
  prefer?: ConflictChoice | ReadonlyMap<string, ConflictChoice>,
) {
  const conflicts: string[] = [];
  const details: FieldConflict[] = [];
  function merge(
    a: unknown,
    b: unknown,
    c: unknown,
    path: string,
    title: string,
    field: string,
  ): unknown {
    if (same(b, c) || same(a, c)) return copy(b);
    if (same(a, b)) return copy(c);
    if (Array.isArray(b) && Array.isArray(c)) {
      const old = Array.isArray(a) ? a : [];
      if (path === "conjugationSheets") {
        const before = new Set(
          (old as ConjugationSheet[]).map(conjugationSeriesId),
        );
        const local = new Map(
          (b as ConjugationSheet[]).map((s) => [conjugationSeriesId(s), s]),
        );
        const remote = new Map(
          (c as ConjugationSheet[]).map((s) => [conjugationSeriesId(s), s]),
        );
        // Independent additions combine; either parent can remove a published sheet.
        return [...new Map([...remote, ...local])]
          .filter(
            ([id]) => !before.has(id) || (local.has(id) && remote.has(id)),
          )
          .map(([, sheet]) => sheet);
      }
      if (path === "reviewedCourseIds") return [...new Set([...b, ...c])];
      if (path === "spacedReviews")
        return latestSpacedReviews([
          ...(c as SpacedReview[]),
          ...(b as SpacedReview[]),
        ]);
      if (path === "readingRecords") {
        const records = [...(c as ReadingRecord[]), ...(b as ReadingRecord[])];
        return [
          ...new Map(
            records.map((item) => [
              JSON.stringify([item.courseId, item.reviewedAt]),
              item,
            ]),
          ).values(),
        ];
      }
      const identified = (
        item: unknown,
      ): item is Record<string, unknown> & { id: string } =>
        object(item) && typeof item.id === "string";
      if (old.every(identified) && b.every(identified) && c.every(identified)) {
        const index = (items: (Record<string, unknown> & { id: string })[]) =>
          new Map(items.map((item) => [item.id, item]));
        const before = index(old),
          localItems = index(b),
          remoteItems = index(c);
        const ids = new Set([
          ...remoteItems.keys(),
          ...localItems.keys(),
          ...before.keys(),
        ]);
        return Array.from(ids, (id) => {
          const item =
            before.get(id) ?? localItems.get(id) ?? remoteItems.get(id);
          const label =
            path === "answerReviews"
              ? remote.attempts
                  .find((attempt) => attempt.id === item?.attemptId)
                  ?.questions.find((q) => q.id === item?.questionId)?.prompt
              : (item?.title ?? item?.name ?? item?.prompt ?? item?.word);
          const itemTitle =
            typeof label === "string" && label.trim() ? label : title;
          const key = encodeURIComponent(id).replace(/\./g, "%2E");
          return merge(
            before.get(id),
            localItems.get(id),
            remoteItems.get(id),
            path + "." + key,
            itemTitle,
            field,
          );
        }).filter((item) => item !== undefined);
      }
    }
    if (object(b) && object(c)) {
      const old = object(a) ? a : {};
      const keys = new Set([
        ...Object.keys(old),
        ...Object.keys(c),
        ...Object.keys(b),
      ]);
      return Object.fromEntries(
        Array.from(keys, (key) => [
          key,
          merge(
            old[key],
            b[key],
            c[key],
            path ? path + "." + key : key,
            title || labels[key] || "Contenu",
            labels[key] || field || "Contenu",
          ),
        ]).filter(([, value]) => value !== undefined),
      );
    }
    conflicts.push(path);
    const decision =
      path.startsWith("answerReviews.") && path.endsWith(".status");
    const format = (value: unknown) => {
      if (decision && value === "accepted") return "Accepter la variante";
      if (decision && value === "declined") return "Confirmer la correction";
      if (decision && value === "pending") return "À vérifier";
      return summary(value);
    };
    details.push({
      path,
      title,
      field: decision ? "Vérification de la réponse" : field,
      local: format(b),
      remote: format(c),
    });
    const choice = typeof prefer === "string" ? prefer : prefer?.get(path);
    return copy(choice === "local" ? b : c);
  }
  const data = merge(base, local, remote, "", "", "") as LearningData;
  if (data.spacedReviews?.length)
    data.spacedReviews = latestSpacedReviews(
      data.spacedReviews,
      publishedReadingEditions(data.courses),
    );
  return { data, conflicts, details };
}
