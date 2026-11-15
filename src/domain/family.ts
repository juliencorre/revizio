export const FAMILY_LIMITS = { parents: 2, children: 2 } as const;
export const INITIAL_CHILD_GRADES = ["CM1", "5e"] as const;

export const normalizeChildName = (name: string) =>
  name.trim().normalize("NFKC").toLocaleLowerCase("fr");
