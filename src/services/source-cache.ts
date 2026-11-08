import { Directory, File, Paths } from "expo-file-system";
import type { CourseSource } from "@/domain/model";
import { absoluteApiUri, apiAuthHeaders } from "./api";
const directory = () => new Directory(Paths.document, "revizo-courses");
function target(source: CourseSource) {
  return new File(
    directory(),
    (source.storageId || source.id).replace(/[^a-zA-Z0-9_-]/g, "_") +
      (source.mimeType === "application/pdf" ? ".pdf" : ".jpg"),
  );
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
    : source.cachedUri || absoluteApiUri(source.uri || "");
}
export async function clearSourceCache() {
  const folder = directory();
  if (folder.exists) await folder.delete();
}
