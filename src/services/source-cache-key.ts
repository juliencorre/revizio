import type { CourseSource } from "@/domain/model";

/** Restores can replace the bytes of a document while keeping its ID and its links. */
export function sourceCacheKey(source: CourseSource): string {
  const id = source.storageId || source.id;
  return source.cacheRevision ? id + "@" + source.cacheRevision : id;
}
