import type { LearningData } from "./model";
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const copy = (value: unknown) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export function mergeLearningData(
  base: LearningData,
  local: LearningData,
  remote: LearningData,
  prefer?: "local" | "remote",
): { data: LearningData; conflicts: string[] } {
  const conflicts: string[] = [];
  function merge(a: unknown, b: unknown, c: unknown, path: string): unknown {
    if (same(b, c) || same(a, c)) return copy(b);
    if (same(a, b)) return copy(c);
    if (Array.isArray(b) && Array.isArray(c)) {
      const old = Array.isArray(a) ? a : [];
      if (path === "reviewedCourseIds") return [...new Set([...b, ...c])];
      if (
        [...old, ...b, ...c].every(
          (item) => object(item) && typeof item.id === "string",
        )
      ) {
        const allIds = [
          ...new Set(
            [...c, ...b, ...old].map((item) => (item as { id: string }).id),
          ),
        ];
        return allIds
          .map((id) =>
            merge(
              old.find((item) => item.id === id),
              b.find((item) => item.id === id),
              c.find((item) => item.id === id),
              path + "." + id,
            ),
          )
          .filter((item) => item !== undefined);
      }
    }
    if (object(b) && object(c)) {
      const old = object(a) ? a : {};
      const keys = [
        ...new Set([...Object.keys(old), ...Object.keys(c), ...Object.keys(b)]),
      ];
      return Object.fromEntries(
        keys
          .map((key) => [
            key,
            merge(old[key], b[key], c[key], path ? path + "." + key : key),
          ])
          .filter(([, value]) => value !== undefined),
      );
    }
    conflicts.push(path);
    return copy(prefer === "local" ? b : c);
  }
  return { data: merge(base, local, remote, "") as LearningData, conflicts };
}
