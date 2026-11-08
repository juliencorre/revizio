import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type {
  AiJob,
  ChildProfile,
  CourseSource,
  SessionUser,
} from "@/domain/model";

export interface SessionResponse {
  user: SessionUser;
  profiles: ChildProfile[];
  token?: string;
}
export interface ServerHealth {
  needsSetup: boolean;
  version: string;
  ai: { available: boolean; model: string };
}
let accessToken: string | null = null;
let configuredBase: string | null = null;
const API_OVERRIDE = "revizo.api-url";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function apiBase() {
  if (configuredBase) return configuredBase;
  if (process.env.EXPO_PUBLIC_API_URL)
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  if (Platform.OS === "web") return "/api";
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host || "localhost"}:4173/api`;
}
export async function configureApiBase(url: string) {
  const normalized = url.trim().replace(/\/$/, "");
  if (normalized && !/^https?:\/\//.test(normalized))
    throw new Error(
      "L’adresse du serveur doit commencer par http:// ou https://.",
    );
  if (normalized !== configuredBase) await rememberToken();
  configuredBase = normalized
    ? normalized.endsWith("/api")
      ? normalized
      : normalized + "/api"
    : null;
  if (configuredBase) await AsyncStorage.setItem(API_OVERRIDE, configuredBase);
  else await AsyncStorage.removeItem(API_OVERRIDE);
}
export async function initializeApi() {
  configuredBase = await AsyncStorage.getItem(API_OVERRIDE).catch(() => null);
  if (Platform.OS !== "web")
    accessToken = await SecureStore.getItemAsync("revizo-session").catch(
      () => null,
    );
}
export async function rememberToken(token?: string) {
  if (Platform.OS === "web") return;
  accessToken = token || null;
  if (token) await SecureStore.setItemAsync("revizo-session", token);
  else await SecureStore.deleteItemAsync("revizo-session");
}
export function absoluteApiUri(uri: string) {
  if (!uri.startsWith("/api/")) return uri;
  const base = apiBase();
  return base.startsWith("http") ? base.replace(/\/api$/, "") + uri : uri;
}
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (accessToken) headers.set("Authorization", "Bearer " + accessToken);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(apiBase() + path, {
      ...options,
      headers,
      credentials: "include",
      signal: options.signal ?? controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json"))
      throw new ApiError(
        "Le serveur Révizo ne répond pas à cette adresse.",
        response.status,
      );
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        typeof data.error === "string"
          ? data.error
          : "Cette action n’a pas pu aboutir.",
        response.status,
        data,
      );
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Connexion au serveur impossible. Vos données déjà téléchargées restent disponibles.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}
export function apiAuthHeaders(): Record<string, string> {
  return accessToken ? { Authorization: "Bearer " + accessToken } : {};
}
export async function uploadCourseSource(
  source: CourseSource,
  profileId?: string,
): Promise<CourseSource> {
  if (source.storageId) return source;
  if (!source.uri)
    throw new Error(
      "Le fichier original doit être sélectionné avant son import.",
    );
  const form = new FormData();
  const { resolveSourceUri, cacheSource } = await import("./source-cache");
  if (Platform.OS === "web") {
    const response = await fetch(await resolveSourceUri(source));
    if (!response.ok)
      throw new Error("Le fichier sélectionné n’est plus disponible.");
    form.append("file", await response.blob(), source.name);
  } else
    form.append("file", {
      uri: await resolveSourceUri(source),
      name: source.name,
      type: source.mimeType || "application/octet-stream",
    } as unknown as Blob);
  const uploaded = await apiFetch<CourseSource>(
    "/uploads" +
      (profileId ? "?profileId=" + encodeURIComponent(profileId) : ""),
    { method: "POST", body: form },
  );
  await cacheSource({ ...uploaded, uri: await resolveSourceUri(source) }).catch(
    () => undefined,
  );
  return uploaded;
}
export async function waitForJob(
  jobId: string,
  onProgress?: (job: AiJob) => void,
  signal?: AbortSignal,
): Promise<AiJob> {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal?.aborted)
      throw new Error(
        "Le suivi a été interrompu. Le traitement continue sur le serveur.",
      );
    const response = await apiFetch<{ job: AiJob } | AiJob>(
      "/jobs/" + encodeURIComponent(jobId),
    );
    const job = "job" in response ? response.job : response;
    onProgress?.(job);
    if (job.status === "succeeded") return job;
    if (job.status === "failed")
      throw new Error(
        job.error || "Le traitement a échoué. Vous pouvez le relancer.",
      );
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(
    "Le traitement prend plus de temps que prévu. Retrouvez-le dans les préparations en cours.",
  );
}
