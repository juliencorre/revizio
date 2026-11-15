import type { Href } from "expo-router";

export function preparationHref(
  task: "import" | "exercises",
  subjectId?: string,
): Href {
  if (!subjectId)
    return { pathname: "/parent/subjects", params: { next: task } };
  return {
    pathname: task === "import" ? "/parent/import" : "/parent/exercises",
    params: { subjectId },
  };
}

export type SubjectTab = "cours" | "exercices" | "vocabulaire" | "conjugaison";

export function subjectHref(id: string, tab: SubjectTab = "cours"): Href {
  return {
    pathname: "/parent/subject/[id]",
    params: tab === "cours" ? { id } : { id, tab },
  };
}
