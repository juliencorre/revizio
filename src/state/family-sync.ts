import type { LearningData } from "../domain/model";
import { clone, parseLearningData } from "../domain/learning";
import {
  mergeLearningData,
  type FieldConflict,
  type ConflictChoice,
} from "../domain/sync";
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
    removeItem?(key: string): Promise<unknown>;
  };
  getData(): LearningData;
  apply(data: LearningData): void;
  request<T>(
    path: string,
    options?: { method?: string; body?: string },
  ): Promise<T>;
  prepare?(data: LearningData): Promise<LearningData>;
  conflicts?(fields: FieldConflict[]): void;
  status(status: SyncStatus): void;
  error(message: string | null): void;
}
export class FamilySync {
  private base: LearningData;
  private revision = 0;
  private dirty = false;
  private knownBase = false;
  private choices = new Map<string, ConflictChoice>();
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
      const state = await storage.getItem(key + ".state");
      if (state) {
        const saved = JSON.parse(state);
        if (
          saved.version !== 1 ||
          typeof saved.pending !== "boolean" ||
          !Number.isInteger(saved.revision) ||
          saved.revision < 0
        )
          throw new Error("invalid snapshot");
        const data = parseLearningData(JSON.stringify(saved.data));
        this.base = parseLearningData(JSON.stringify(saved.base));
        this.revision = saved.revision;
        this.knownBase = saved.knownBase ?? saved.revision > 0;
        this.dirty = saved.pending;
        return data;
      }
      const [raw, base, revision, pending] = await Promise.all([
        storage.getItem(key),
        storage.getItem(key + ".base"),
        storage.getItem(key + ".revision"),
        storage.getItem(key + ".pending"),
      ]);
      this.base = base ? parseLearningData(base) : clone(fallback);
      this.revision = Number(revision) || 0;
      this.knownBase = !!base && revision !== null;
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
    if (this.conflict) {
      this.choices.clear();
      const { details } = mergeLearningData(
        this.base,
        data,
        this.conflict.data,
      );
      this.options.conflicts?.(details);
      if (!details.length) this.conflict = null;
    }
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
    const state = JSON.stringify({
      version: 1,
      data,
      base: this.base,
      revision: this.revision,
      pending: dirty,
      knownBase: this.knownBase,
    });
    this.writes = this.writes
      .catch(() => undefined)
      .then(async () => {
        // A single storage write is the recovery source. Four legacy keys are
        // read for migration, then removed only after this write has succeeded.
        await storage.setItem(key + ".state", state);
        if (storage.removeItem)
          await Promise.all(
            [key, key + ".base", key + ".revision", key + ".pending"].map(
              (old) => storage.removeItem!(old).catch(() => undefined),
            ),
          );
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
    if (this.dirty || !this.knownBase) this.options.status("syncing");
    try {
      for (let tries = 0; tries < 4 && !this.disposed; tries++) {
        const response = await request<
          RemoteData | { revision: number; unchanged: true }
        >(
          "/data?profileId=" +
            encodeURIComponent(profileId) +
            (this.knownBase ? "&since=" + this.revision : ""),
        );
        if (this.disposed) return;
        if ("unchanged" in response && !this.dirty) {
          this.options.error(null);
          this.options.status("synced");
          return;
        }
        const remote: RemoteData =
          "unchanged" in response
            ? { data: this.base, revision: this.revision }
            : response;
        if (!this.dirty) {
          this.knownBase = true;
          this.base = clone(remote.data);
          this.revision = remote.revision;
          this.options.apply(remote.data);
          await this.persist(remote.data, false);
          this.options.error(null);
          this.options.status("synced");
          return;
        }
        const local = clone(this.options.getData());
        const merged = mergeLearningData(this.base, local, remote.data);
        if (merged.conflicts.length) {
          this.conflict = remote;
          this.choices.clear();
          this.options.conflicts?.(merged.details);
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
          this.knownBase = true;
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
          const rebased = mergeLearningData(
            local,
            this.options.getData(),
            saved.data,
            "local",
          ).data;
          this.options.apply(rebased);
          await this.persist(rebased, true);
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
    this.options.conflicts?.([]);
    this.knownBase = true;
    this.dirty = false;
    this.base = clone(remote.data);
    this.revision = remote.revision;
    this.options.apply(remote.data);
    await this.persist(remote.data, false);
    this.options.error(null);
    this.options.status("synced");
  }
  async resolve(strategy: "local" | "server", path?: string) {
    const remote = this.conflict;
    if (!remote || this.disposed) return;
    const side = strategy === "server" ? "remote" : "local";
    if (path) this.choices.set(path, side);
    const merged = mergeLearningData(
      this.base,
      this.options.getData(),
      remote.data,
      path ? this.choices : side,
    );
    const remaining = path
      ? merged.details.filter((field) => !this.choices.has(field.path))
      : [];
    if (remaining.length) {
      this.options.conflicts?.(remaining);
      return;
    }
    this.choices.clear();
    this.conflict = null;
    this.options.conflicts?.([]);
    this.base = clone(remote.data);
    this.knownBase = true;
    this.revision = remote.revision;
    this.dirty = JSON.stringify(merged.data) !== JSON.stringify(remote.data);
    this.options.apply(merged.data);
    try {
      await this.persist(merged.data, this.dirty);
      if (this.disposed) return;
      this.options.error(null);
      if (this.dirty) await this.sync();
      else this.options.status("synced");
    } catch {
      this.options.error(
        "La copie locale ne peut pas être enregistrée. Gardez cette page ouverte.",
      );
    }
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
