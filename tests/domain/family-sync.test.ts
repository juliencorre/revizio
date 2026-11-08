import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FamilySync,
  type RemoteData,
  type SyncStatus,
} from "../../src/state/family-sync";
import { initialData } from "../../src/domain/fixtures";
import { clone } from "../../src/domain/learning";
import type { LearningData } from "../../src/domain/model";

type Request = ConstructorParameters<typeof FamilySync>[0]["request"];
const key = "family-test";
const active: FamilySync[] = [];
const storage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
};
function harness(request: Request, saved = storage()) {
  let current = clone(initialData);
  const statuses: SyncStatus[] = [],
    errors: (string | null)[] = [];
  const sync = new FamilySync(
    {
      key,
      profileId: "child-1",
      storage: saved,
      getData: () => current,
      apply: (data) => {
        current = clone(data);
      },
      request,
      status: (value) => statuses.push(value),
      error: (error) => errors.push(error),
    },
    initialData,
  );
  active.push(sync);
  return {
    sync,
    saved,
    statuses,
    errors,
    data: () => current,
    edit: (edit: (data: LearningData) => void) => {
      const next = clone(current);
      edit(next);
      current = next;
      sync.changed(next);
    },
    load: async () => {
      current = await sync.load(initialData);
    },
    state: () => JSON.parse(saved.values.get(key + ".state") ?? "null"),
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  active.splice(0).forEach((sync) => sync.dispose());
});

describe("synchronisation familiale durable", () => {
  it("reprend les modifications pending après un rechargement hors ligne", async () => {
    const offline: Request = async () => {
      throw new Error("Réseau indisponible");
    };
    const first = harness(offline);
    await first.load();
    first.edit((data) => {
      data.courses[0].title = "Mon chapitre hors ligne";
    });
    await first.sync.sync();
    await vi.waitFor(() => expect(first.state()?.pending).toBe(true));
    expect(first.saved.setItem).toHaveBeenCalledWith(
      key + ".state",
      expect.any(String),
    );
    first.sync.dispose();
    const reloaded = harness(offline, first.saved);
    await reloaded.load();
    expect(reloaded.data().courses[0].title).toBe("Mon chapitre hors ligne");
    await reloaded.sync.sync();
    expect(reloaded.statuses.at(-1)).toBe("offline");
    expect(reloaded.state().pending).toBe(true);
    let remote: RemoteData = { data: clone(initialData), revision: 4 };
    const online: Request = async <T>(
      _path: string,
      options?: { method?: string; body?: string },
    ) => {
      if (options?.method === "PUT") {
        const input = JSON.parse(options.body!);
        expect(input.revision).toBe(4);
        remote = { data: input.data, revision: 5 };
      }
      return clone(remote) as T;
    };
    reloaded.sync.dispose();
    const connected = harness(online, first.saved);
    await connected.load();
    await connected.sync.sync();
    expect(remote.data.courses[0].title).toBe("Mon chapitre hors ligne");
    expect(connected.state().pending).toBe(false);
  });
  it("migre les anciennes clés uniquement après sauvegarde du snapshot complet", async () => {
    const saved = storage(),
      modified = clone(initialData);
    modified.courses[0].title = "Ancienne copie en attente";
    for (const [suffix, value] of [
      ["", JSON.stringify(modified)],
      [".base", JSON.stringify(initialData)],
      [".revision", "7"],
      [".pending", "1"],
    ])
      saved.values.set(key + suffix, value);
    const h = harness(
      async <T>() => ({ data: clone(initialData), revision: 7 }) as T,
      saved,
    );
    await h.load();
    expect(h.data().courses[0].title).toBe("Ancienne copie en attente");
    h.edit((data) => {
      data.courses[0].description = "Un changement conservé.";
    });
    await vi.waitFor(() => expect(h.state()?.pending).toBe(true));
    expect(h.state().revision).toBe(7);
    await vi.waitFor(() =>
      expect(saved.values.has(key + ".pending")).toBe(false),
    );
  });
  it.each(["server", "local"] as const)(
    "expose un conflit puis applique le choix %s",
    async (strategy) => {
      let remote: RemoteData = { data: clone(initialData), revision: 2 },
        puts = 0;
      remote.data.courses[0].title = "Titre sur l’autre tablette";
      const request: Request = async <T>(
        _path: string,
        options?: { method?: string; body?: string },
      ) => {
        if (options?.method === "PUT") {
          puts++;
          remote = {
            data: JSON.parse(options.body!).data,
            revision: remote.revision + 1,
          };
        }
        return clone(remote) as T;
      };
      const h = harness(request);
      await h.load();
      h.edit((data) => {
        data.courses[0].title = "Titre sur cette tablette";
      });
      await h.sync.sync();
      expect(h.statuses.at(-1)).toBe("conflict");
      expect(puts).toBe(0);
      await h.sync.resolve(strategy);
      expect(h.data().courses[0].title).toBe(
        strategy === "local"
          ? "Titre sur cette tablette"
          : "Titre sur l’autre tablette",
      );
      expect(puts).toBe(strategy === "local" ? 1 : 0);
      expect(h.state().pending).toBe(false);
      expect(h.statuses.at(-1)).toBe("synced");
    },
  );
  it("conserve les mutations faites pendant un PUT et les changements distincts du serveur", async () => {
    const gate = deferred();
    let puts = 0;
    let remote: RemoteData = { data: clone(initialData), revision: 1 };
    remote.data.courses[0].title = "Titre distant à conserver";
    const request: Request = async <T>(
      _path: string,
      options?: { method?: string; body?: string },
    ) => {
      if (options?.method === "PUT") {
        puts++;
        const input = JSON.parse(options.body!);
        if (puts === 1) await gate.promise;
        remote = { data: input.data, revision: remote.revision + 1 };
      }
      return clone(remote) as T;
    };
    const h = harness(request);
    await h.load();
    h.edit((data) => {
      data.courses[0].description = "Première rédaction";
    });
    const running = h.sync.sync();
    await vi.waitFor(() => expect(puts).toBe(1));
    h.edit((data) => {
      data.courses[0].description = "Rédaction pendant l’envoi";
    });
    gate.resolve();
    await running;
    expect(puts).toBe(2);
    expect(remote.data.courses[0].title).toBe("Titre distant à conserver");
    expect(remote.data.courses[0].description).toBe(
      "Rédaction pendant l’envoi",
    );
    expect(h.statuses).not.toContain("conflict");
    expect(h.state().pending).toBe(false);
  });
  it("persiste la nouvelle base après un PUT réussi si le réseau coupe avant l’envoi suivant", async () => {
    const gate = deferred();
    let puts = 0,
      gets = 0;
    let remote: RemoteData = { data: clone(initialData), revision: 1 };
    const request: Request = async <T>(
      _path: string,
      options?: { method?: string; body?: string },
    ) => {
      if (options?.method === "PUT") {
        puts++;
        const input = JSON.parse(options.body!);
        await gate.promise;
        remote = { data: input.data, revision: 2 };
      } else if (++gets > 1) throw new Error("Connexion coupée");
      return clone(remote) as T;
    };
    const h = harness(request);
    await h.load();
    h.edit((data) => {
      data.courses[0].title = "Titre envoyé";
    });
    const running = h.sync.sync();
    await vi.waitFor(() => expect(puts).toBe(1));
    h.edit((data) => {
      data.courses[0].title = "Titre final en attente";
    });
    gate.resolve();
    await running;
    expect(h.state().base.courses[0].title).toBe("Titre envoyé");
    expect(h.state().data.courses[0].title).toBe("Titre final en attente");
    expect(h.state().revision).toBe(2);
    const reconnect: Request = async <T>(
      _path: string,
      options?: { method?: string; body?: string },
    ) => {
      if (options?.method === "PUT")
        remote = { data: JSON.parse(options.body!).data, revision: 3 };
      return clone(remote) as T;
    };
    h.sync.dispose();
    const reloaded = harness(reconnect, h.saved);
    await reloaded.load();
    await reloaded.sync.sync();
    expect(reloaded.statuses).not.toContain("conflict");
    expect(remote.data.courses[0].title).toBe("Titre final en attente");
  });
  it("réessaie un verrou optimiste 409 avec la version distante actualisée", async () => {
    let remote: RemoteData = { data: clone(initialData), revision: 1 },
      puts = 0;
    const request: Request = async <T>(
      _path: string,
      options?: { method?: string; body?: string },
    ) => {
      if (options?.method === "PUT") {
        puts++;
        if (puts === 1) {
          remote.revision = 2;
          remote.data.reviewedCourseIds = [remote.data.courses[0].id];
          throw { status: 409 };
        }
        const input = JSON.parse(options.body!);
        expect(input.revision).toBe(2);
        remote = { data: input.data, revision: 3 };
      }
      return clone(remote) as T;
    };
    const h = harness(request);
    await h.load();
    h.edit((data) => {
      data.courses[0].description = "Ma modification";
    });
    await h.sync.sync();
    expect(puts).toBe(2);
    expect(h.data().reviewedCourseIds).toEqual([initialData.courses[0].id]);
    expect(h.state().pending).toBe(false);
  });
  it("attend l’envoi en cours avant un remplacement explicite depuis le serveur", async () => {
    const gate = deferred();
    let sending = false,
      gets = 0;
    let remote: RemoteData = { data: clone(initialData), revision: 0 };
    const request: Request = async <T>(
      _path: string,
      options?: { method?: string; body?: string },
    ) => {
      if (options?.method === "PUT") {
        sending = true;
        const input = JSON.parse(options.body!);
        await gate.promise;
        sending = false;
        remote = { data: input.data, revision: 1 };
      } else {
        expect(sending).toBe(false);
        gets++;
      }
      return clone(remote) as T;
    };
    const h = harness(request);
    await h.load();
    h.edit((data) => {
      data.courses[0].title = "Titre sauvegardé";
    });
    const running = h.sync.sync();
    await vi.waitFor(() => expect(sending).toBe(true));
    const reload = h.sync.reload();
    expect(gets).toBe(1);
    gate.resolve();
    await Promise.all([running, reload]);
    expect(gets).toBe(2);
    expect(h.data().courses[0].title).toBe("Titre sauvegardé");
    expect(h.state().pending).toBe(false);
  });
});
