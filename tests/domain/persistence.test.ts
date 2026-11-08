import { describe, expect, it, vi } from "vitest";
import { initialData } from "../../src/domain/fixtures";
import { clone, markReviewedInData } from "../../src/domain/learning";
import {
  createLearningPersistence,
  restoreLearningData,
  STORAGE_KEY,
} from "../../src/state/persistence";
describe("hydratation", () => {
  it("lit les changements enregistrés sans écrire la démonstration au démarrage", async () => {
    const saved = markReviewedInData(
      clone(initialData),
      "maths-relative-numbers",
    );
    saved.courses[0].description = "Une modification sauvegardée.";
    const storage = {
      getItem: vi.fn(async () => JSON.stringify(saved)),
      setItem: vi.fn(async () => undefined),
    };
    const restored = await createLearningPersistence(storage).load();
    expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(restored.error).toBeNull();
    expect(restored.data).toEqual(saved);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("fournit une copie indépendante pour un premier lancement", () => {
    const first = restoreLearningData(null);
    expect(first.error).toBeNull();
    first.data.courses[0].title = "Modifié";
    expect(initialData.courses[0].title).not.toBe("Modifié");
    expect(restoreLearningData(null).data.courses[0].title).toBe(
      initialData.courses[0].title,
    );
  });
  it("signale une sauvegarde incompatible sans l’écraser au chargement", async () => {
    const storage = {
      getItem: vi.fn(async () => '{"version":99}'),
      setItem: vi.fn(async () => undefined),
    };
    const restored = await createLearningPersistence(storage).load();
    expect(restored.error).toBeTruthy();
    expect(restored.data).toEqual(initialData);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("gère une erreur de lecture et permet de démarrer avec la démonstration", async () => {
    const storage = {
      getItem: vi.fn(async (): Promise<string | null> => {
        throw new Error("denied");
      }),
      setItem: vi.fn(async () => undefined),
    };
    const result = await createLearningPersistence(storage).load();
    expect(result.error).toBeTruthy();
    expect(result.data).toEqual(initialData);
  });
});
describe("sauvegarde sérialisée", () => {
  it("attend chaque écriture avant la suivante et capture les données au moment de l’appel", async () => {
    const snapshots: string[] = [];
    const release: Array<() => void> = [];
    const storage = {
      getItem: async () => null,
      setItem: vi.fn(
        (_key: string, value: string) =>
          new Promise<void>((resolve) => {
            snapshots.push(value);
            release.push(resolve);
          }),
      ),
    };
    const persistence = createLearningPersistence(storage);
    const first = clone(initialData);
    first.courses[0].description = "Première version";
    const writeOne = persistence.save(first);
    first.courses[0].description = "Mutation après appel";
    const second = clone(first);
    second.courses[0].description = "Dernière version";
    const writeTwo = persistence.save(second);
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
    expect(JSON.parse(snapshots[0]).courses[0].description).toBe(
      "Première version",
    );
    release[0]();
    await writeOne;
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(2));
    expect(JSON.parse(snapshots[1]).courses[0].description).toBe(
      "Dernière version",
    );
    release[1]();
    await writeTwo;
    await persistence.whenIdle();
    expect(
      storage.setItem.mock.calls.every((call) => call[0] === STORAGE_KEY),
    ).toBe(true);
  });
  it("signale un échec sans bloquer les sauvegardes suivantes", async () => {
    let calls = 0;
    const storage = {
      getItem: async () => null,
      setItem: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("full");
      }),
    };
    const persistence = createLearningPersistence(storage);
    const first = persistence.save(clone(initialData));
    const rejected = expect(first).rejects.toThrow("full");
    const next = persistence.save(
      markReviewedInData(clone(initialData), "maths-relative-numbers"),
    );
    await rejected;
    await expect(next).resolves.toBeUndefined();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });
});
