import type { LearningData } from "../domain/model";
import { clone, parseLearningData } from "../domain/learning";
import { mergeLearningData } from "../domain/sync";
export type SyncStatus =
  "local" | "syncing" | "synced" | "offline" | "conflict";
export interface RemoteData {
  data: LearningData;
  revision: number;
}
interface SyncOptions {
  key: string;
  profileId: string;
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<unknown>;
  };
  getData(): LearningData;
  apply(data: LearningData): void;
  request<T>(
    path: string,
    options?: { method?: string; body?: string },
  ): Promise<T>;
  prepare?(data: LearningData): Promise<LearningData>;
  status(status: SyncStatus): void;
  error(message: string | null): void;
}
export class FamilySync {
  private base: LearningData;
  private revision = 0;
  private dirty = false;
  private sequence = 0;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  private running: Promise<void> | null = null;
  private conflict: RemoteData | null = null;
  constructor(
    private options: SyncOptions,
    fallback: LearningData,
  ) {
    this.base = clone(fallback);
  }
  async load(fallback: LearningData): Promise<LearningData> {
    const { key, storage } = this.options;
    try {
      const [raw, base, revision, pending] = await Promise.all([
        storage.getItem(key),
        storage.getItem(key + ".base"),
        storage.getItem(key + ".revision"),
        storage.getItem(key + ".pending"),
      ]);
      this.base = base ? parseLearningData(base) : clone(fallback);
      this.revision = Number(revision) || 0;
      this.dirty = pending === "1";
      return raw ? parseLearningData(raw) : clone(fallback);
    } catch {
      this.options.error(
        "La copie locale n’a pas pu être chargée. Reconnectez-vous pour retrouver les données du serveur.",
      );
      return clone(fallback);
    }
  }
  changed(data: LearningData) {
    this.sequence++;
    this.dirty = true;
    void this.persist(data, true).catch(() =>
      this.options.error(
        "La copie locale ne peut pas être enregistrée. Gardez cette page ouverte.",
      ),
    );
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.sync();
    }, 400);
  }
  private persist(data: LearningData, dirty: boolean) {
    const { key, storage } = this.options;
    const raw = JSON.stringify(data),
      base = JSON.stringify(this.base),
      revision = String(this.revision);
    this.writes = this.writes
      .catch(() => undefined)
      .then(async () => {
        await storage.setItem(key, raw);
        await storage.setItem(key + ".base", base);
        await storage.setItem(key + ".revision", revision);
        await storage.setItem(key + ".pending", dirty ? "1" : "0");
      });
    return this.writes;
  }
  sync(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.perform().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async perform() {
    if (this.conflict) {
      this.options.status("conflict");
      return;
    }
    const { profileId, request } = this.options;
    this.options.status("syncing");
    try {
      for (let tries = 0; tries < 4 && !this.disposed; tries++) {
        const remote = await request<RemoteData>(
          "/data?profileId=" + encodeURIComponent(profileId),
        );
        if (this.disposed) return;
        if (!this.dirty) {
          this.base = clone(remote.data);
          this.revision = remote.revision;
          this.options.apply(remote.data);
          await this.persist(remote.data, false);
          this.options.error(null);
          this.options.status("synced");
          return;
        }
        const local = this.options.getData();
        const merged = mergeLearningData(this.base, local, remote.data);
        if (merged.conflicts.length) {
          this.conflict = remote;
          this.options.error(
            "Des modifications du même contenu existent sur un autre appareil. Choisissez la version à conserver.",
          );
          this.options.status("conflict");
          return;
        }
        let snapshot = merged.data;
        const sequence = this.sequence;
        if (this.options.prepare)
          snapshot = await this.options.prepare(snapshot);
        if (this.disposed) return;
        if (sequence !== this.sequence) continue;
        try {
          const saved = await request<RemoteData>("/data", {
            method: "PUT",
            body: JSON.stringify({
              profileId,
              revision: remote.revision,
              data: snapshot,
            }),
          });
          if (this.disposed) return;
          this.base = clone(saved.data);
          this.revision = saved.revision;
          if (sequence === this.sequence) {
            this.dirty = false;
            this.options.apply(saved.data);
            await this.persist(saved.data, false);
            this.options.error(null);
            this.options.status("synced");
            return;
          }
        } catch (error) {
          if ((error as { status?: number }).status === 409) continue;
          throw error;
        }
      }
      if (!this.disposed) {
        this.options.status("offline");
        this.options.error(
          "Votre travail est enregistré localement. La synchronisation reprendra à la prochaine connexion.",
        );
      }
    } catch (error) {
      if (!this.disposed) {
        this.options.status("offline");
        this.options.error(
          error instanceof Error
            ? error.message
            : "La synchronisation reprendra à la prochaine connexion.",
        );
      }
    }
  }
  async reload() {
    if (this.running) await this.running;
    const remote = await this.options.request<RemoteData>(
      "/data?profileId=" + encodeURIComponent(this.options.profileId),
    );
    if (this.disposed) return;
    this.conflict = null;
    this.dirty = false;
    this.base = clone(remote.data);
    this.revision = remote.revision;
    this.options.apply(remote.data);
    await this.persist(remote.data, false);
    this.options.error(null);
    this.options.status("synced");
  }
  async resolve(strategy: "local" | "server") {
    const remote = this.conflict;
    if (!remote) return;
    const next =
      strategy === "server"
        ? remote.data
        : mergeLearningData(
            this.base,
            this.options.getData(),
            remote.data,
            "local",
          ).data;
    this.conflict = null;
    this.base = clone(remote.data);
    this.revision = remote.revision;
    this.dirty = strategy === "local";
    this.options.apply(next);
    await this.persist(next, this.dirty);
    this.options.error(null);
    if (this.dirty) await this.sync();
    else this.options.status("synced");
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
