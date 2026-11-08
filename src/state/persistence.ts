import { initialData } from "../domain/fixtures";
import { clone, parseLearningData } from "../domain/learning";
import type { LearningData } from "../domain/model";
export const STORAGE_KEY = "revizo.learning.v1";
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
export interface HydrationResult {
  data: LearningData;
  error: string | null;
}
export function restoreLearningData(
  raw: string | null,
  fallback: LearningData = initialData,
): HydrationResult {
  if (raw === null) return { data: clone(fallback), error: null };
  try {
    return { data: parseLearningData(raw), error: null };
  } catch {
    return {
      data: clone(fallback),
      error:
        "La sauvegarde locale est illisible ou incompatible. La démonstration a été chargée ; vous pouvez la réinitialiser.",
    };
  }
}
export function createLearningPersistence(
  storage: StorageAdapter,
  fallback: LearningData = initialData,
  key: string = STORAGE_KEY,
) {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    async load(): Promise<HydrationResult> {
      try {
        return restoreLearningData(await storage.getItem(key), fallback);
      } catch {
        return {
          data: clone(fallback),
          error:
            "Impossible de lire la sauvegarde locale. Vos changements risquent de ne pas être conservés sur cet appareil.",
        };
      }
    },
    save(data: LearningData): Promise<unknown> {
      const snapshot = JSON.stringify(data);
      const write = queue
        .catch(() => undefined)
        .then(() => storage.setItem(key, snapshot));
      queue = write;
      return write;
    },
    whenIdle(): Promise<unknown> {
      return queue;
    },
  };
}
