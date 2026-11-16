import { subjects } from "./fixtures";
import type { CustomSubject, Subject } from "./model";

export const maxSubjectNameLength = 80;
const cleanName = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/gu, " ");
const subjectKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[’‘]/gu, "'")
    .replace(/\s+/gu, "-");
const builtInIds = new Set(subjects.map(({ id }) => id));
const builtInNames = new Set(
  subjects.flatMap(({ title, shortLabel }) => [
    subjectKey(title),
    subjectKey(shortLabel),
  ]),
);

export function hasSubject(id: unknown, customSubjects: CustomSubject[] = []) {
  return (
    typeof id === "string" &&
    (builtInIds.has(id) || customSubjects.some((subject) => subject.id === id))
  );
}

export function newCustomSubject(
  name: string,
  existing: CustomSubject[] = [],
): CustomSubject {
  const title = cleanName(name);
  const key = subjectKey(title);
  if (!key) throw new Error("Donnez un nom à la matière.");
  if (title.length > maxSubjectNameLength)
    throw new Error(
      `Le nom de la matière peut contenir jusqu’à ${maxSubjectNameLength} caractères.`,
    );
  // A stable ID lets two offline devices add the same subject without duplicating it.
  const slug = key.replace(
    /[^a-z0-9-]/gu,
    (char) => "_" + char.codePointAt(0)!.toString(16) + "_",
  );
  const id = "custom-" + slug;
  if (builtInNames.has(key) || existing.some((subject) => subject.id === id))
    throw new Error(
      "Cette matière existe déjà pour cet enfant. Vous pouvez la cocher dans la liste.",
    );
  return { id, title };
}

export function parseCustomSubjects(raw: unknown): CustomSubject[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw))
    throw new Error("La liste des matières est invalide.");
  const ids = new Set<string>();
  return raw.map((item: unknown) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("title" in item) ||
      typeof item.title !== "string"
    )
      throw new Error("Une matière personnalisée est invalide.");
    const subject = newCustomSubject(item.title);
    if (!("id" in item) || item.id !== subject.id || ids.has(subject.id))
      throw new Error(
        "Les identifiants des matières sont invalides ou dupliqués.",
      );
    ids.add(subject.id);
    return subject;
  });
}

export function subjectCatalog(
  customSubjects: CustomSubject[] = [],
): Subject[] {
  const additions = customSubjects.map(({ id, title }): Subject => {
    const colorIndex =
      Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) %
      subjects.length;
    return {
      id,
      title,
      shortLabel: title,
      icon: "book",
      color: subjects[colorIndex].color,
    };
  });
  return [...subjects, ...additions];
}
