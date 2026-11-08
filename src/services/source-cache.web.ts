import type { CourseSource } from "@/domain/model";
import { absoluteApiUri, apiAuthHeaders } from "./api";
const DB_NAME = "revizo-source-cache";
const objectUrls = new Map<string, string>();
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function cachedBlob(id: string): Promise<Blob | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files");
    const request = transaction.objectStore("files").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
async function saveBlob(id: string, blob: Blob) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    transaction.objectStore("files").put(blob, id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function cacheSource(source: CourseSource): Promise<CourseSource> {
  const key = source.storageId || source.id;
  if (await cachedBlob(key))
    return { ...source, cachedUri: "revizo-cache://" + key };
  if (!source.uri) return source;
  const uri = source.uri.startsWith("revizo-cache://")
    ? await resolveSourceUri(source)
    : absoluteApiUri(source.uri);
  const response = await fetch(uri, {
    credentials: "include",
    headers: apiAuthHeaders(),
  });
  if (!response.ok)
    throw new Error(
      "Ce document n’est pas disponible pour être conservé hors connexion.",
    );
  await saveBlob(key, await response.blob());
  return { ...source, cachedUri: "revizo-cache://" + key };
}
export async function resolveSourceUri(source: CourseSource): Promise<string> {
  const key =
    source.cachedUri?.replace("revizo-cache://", "") ||
    source.storageId ||
    source.id;
  if (objectUrls.has(key)) return objectUrls.get(key)!;
  const blob = await cachedBlob(key).catch(() => undefined);
  if (blob) {
    const uri = URL.createObjectURL(blob);
    objectUrls.set(key, uri);
    return uri;
  }
  if (source.uri?.startsWith("revizo-cache://"))
    throw new Error(
      "Le fichier local n’est plus disponible. Sélectionnez-le à nouveau.",
    );
  return absoluteApiUri(source.uri || "");
}
export async function clearSourceCache() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
