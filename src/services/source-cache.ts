import { sourceCacheKey } from "./source-cache-key";
import { documentKind } from "@/domain/document-kind";
import { Directory, File, Paths } from "expo-file-system";
import type { CourseSource } from "@/domain/model";
import { absoluteApiUri, apiAuthHeaders } from "./api";
const directory = () => new Directory(Paths.document, "revizo-courses");
function target(source: CourseSource) {
  const id = sourceCacheKey(source).replace(/[^a-zA-Z0-9_-]/g, "_");
  const kind = documentKind(source);
  // Keep existing offline photos under their historical cache name.
  const ext =
    kind === "image"
      ? "jpg"
      : kind === "pdf"
        ? "pdf"
        : source.mimeType === "text/plain"
          ? "txt"
          : source.name.match(/\.([a-z0-9]{1,10})$/i)?.[1] || "bin";
  return new File(directory(), id + "." + ext);
}
export async function cacheSource(source: CourseSource): Promise<CourseSource> {
  const folder = directory();
  if (!folder.exists)
    await folder.create({ intermediates: true, idempotent: true });
  const destination = target(source);
  if (!destination.exists && source.uri) {
    if (source.uri.startsWith("file:") || source.uri.startsWith("content:"))
      await new File(source.uri).copy(destination);
    else
      await File.downloadFileAsync(absoluteApiUri(source.uri), destination, {
        headers: apiAuthHeaders(),
      });
  }
  return { ...source, cachedUri: destination.uri };
}
export async function resolveSourceUri(source: CourseSource): Promise<string> {
  const file = target(source);
  return file.exists
    ? file.uri
    : (!source.cacheRevision && source.cachedUri) ||
        absoluteApiUri(source.uri || "");
}
export async function clearSourceCache() {
  const folder = directory();
  if (folder.exists) await folder.delete();
}

export async function readSourceText(uri: string) {
  if (uri.startsWith("file:") || uri.startsWith("content:"))
    return new File(uri).text();
  const response = await fetch(uri, { headers: apiAuthHeaders() });
  if (!response.ok) throw new Error();
  return response.text();
}
