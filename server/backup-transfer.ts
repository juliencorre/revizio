import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  checkManifest,
  documentParts,
  documentsSize,
  type BackupManifest,
  type DocumentPart,
} from "../src/domain/backup-format";
import type { FamilyDatabase } from "./database";
import { HttpError, isoNow } from "./types";
import { restoreBackup } from "./backup";
import type { ImageProcessor } from "./runtime";

const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const maxBytes = 450 * 1024 * 1024;
export async function backupManifest(
  database: FamilyDatabase,
  familyId: string,
): Promise<BackupManifest> {
  const profiles = database.profiles(familyId).map(({ id, name, grade }) => ({
    id,
    name,
    grade,
    data: database.data(id).data,
  }));
  const files = database.uploads(familyId);
  const uploads = [];
  async function info(path: string) {
    const bytes = await database.files.read(path);
    return { size: bytes.length, sha256: digest(bytes) };
  }
  for (const file of files) {
    const { id, profileId, name, mimeType, rotation } = file;
    uploads.push({
      id,
      profileId,
      name,
      mimeType,
      rotation,
      normalized: await info(file.path),
      original: await info(file.originalPath),
    });
  }
  return {
    format: "revizio-backup",
    version: 2,
    exportedAt: isoNow(),
    profiles,
    uploads,
  };
}

/** Each transfer owns private, independently retryable files. Publication is a single DB transaction. */
export class BackupTransfers {
  constructor(private database: FamilyDatabase) {
    database.db.exec(`CREATE TABLE IF NOT EXISTS backup_transfers
      (id TEXT PRIMARY KEY, family TEXT NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS backup_parts (transfer TEXT NOT NULL, part TEXT NOT NULL, digest TEXT NOT NULL,
      size INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY(transfer,part));`);
  }
  private dir(id: string) {
    return join(this.database.dataDir, "restores", id);
  }
  private record(id: string, family: string) {
    const row = this.database.db
      .prepare(
        "SELECT status,expires FROM backup_transfers WHERE id=? AND family=?",
      )
      .get(id, family);
    if (!row || Number(row.expires) < Date.now())
      throw new HttpError(
        404,
        "Cette restauration a expiré. Sélectionnez à nouveau la sauvegarde.",
      );
    return row;
  }
  private async discard(id: string, completed = false) {
    if (!completed) await this.database.files.removeDirectory(this.dir(id));
    this.database.transaction(() => {
      this.database.db
        .prepare("DELETE FROM backup_parts WHERE transfer=?")
        .run(id);
      this.database.db
        .prepare("DELETE FROM backup_transfers WHERE id=?")
        .run(id);
    });
  }
  async start(family: string, incoming?: number) {
    for (const old of this.database.db
      .prepare("SELECT id,status FROM backup_transfers WHERE expires<?")
      .all(Date.now()))
      await this.discard(String(old.id), old.status === "done");
    if (incoming !== undefined) {
      const free = this.database.files.freeBytes?.();
      if (
        !Number.isSafeInteger(incoming) ||
        incoming < 0 ||
        incoming > maxBytes
      )
        throw new HttpError(413, "La taille de l’archive est invalide.");
      if (free !== undefined && incoming > free)
        throw new HttpError(
          413,
          "La restauration nécessite " +
            Math.ceil(incoming / 1048576) +
            " Mio disponibles. Il reste " +
            Math.floor(free / 1048576) +
            " Mio sur le serveur.",
        );
    }
    const id = randomUUID();
    await this.database.files.mkdir(this.dir(id));
    this.database.db
      .prepare("INSERT INTO backup_transfers VALUES (?,?,?,?)")
      .run(id, family, Date.now() + 24 * 3600000, "open");
    return { id };
  }
  async cancel(id: string, family: string) {
    const row = this.record(id, family);
    if (row.status !== "open")
      throw new HttpError(
        409,
        "Cette restauration est en cours de validation.",
      );
    this.database.db
      .prepare("UPDATE backup_transfers SET status='closing' WHERE id=?")
      .run(id);
    await this.discard(id);
    return { ok: true };
  }
  async add(
    id: string,
    family: string,
    part: string,
    expected: string,
    bytes: Buffer,
  ) {
    if (this.record(id, family).status !== "open")
      throw new HttpError(409, "La restauration est en cours de validation.");
    const hash = digest(bytes);
    if (
      !/^(0|[1-9]\d{0,2})-(normalized|original)$/.test(part) ||
      !bytes.length ||
      bytes.length > 25 * 1024 * 1024 ||
      (expected && hash !== expected)
    )
      throw new HttpError(400, "Le document transmis est incomplet ou altéré.");
    const existing = this.database.db
      .prepare("SELECT digest FROM backup_parts WHERE transfer=? AND part=?")
      .get(id, part);
    if (existing?.digest === hash) return { ok: true, sha256: hash };
    if (existing)
      throw new HttpError(
        409,
        "Ce document a déjà été transféré avec un autre contenu.",
      );
    const total = this.database.db
      .prepare(
        "SELECT COALESCE(SUM(size),0) AS total FROM backup_parts WHERE transfer=?",
      )
      .get(id);
    if (Number(total?.total) + bytes.length > maxBytes)
      throw new HttpError(413, "Cette archive dépasse 450 Mio de documents.");
    const path = join(this.dir(id), randomUUID());
    await this.database.files.write(path, bytes);
    try {
      this.database.transaction(() => {
        if (this.record(id, family).status !== "open")
          throw new HttpError(409, "Cette restauration est terminée.");
        this.database.db
          .prepare("INSERT INTO backup_parts VALUES (?,?,?,?,?)")
          .run(id, part, hash, bytes.length, path);
      });
    } catch (error) {
      await this.database.files.unlink(path).catch(() => {});
      throw error;
    }
    return { ok: true, sha256: hash };
  }
  async finish(
    id: string,
    family: string,
    input: unknown,
    images: ImageProcessor,
    legacyLimit?: number,
  ) {
    const status = this.record(id, family).status;
    if (status === "done") return { ok: true };
    if (status !== "open")
      throw new HttpError(425, "La restauration est en cours de validation.");
    try {
      checkManifest(input);
    } catch {
      throw new HttpError(400, "La sauvegarde est invalide.");
    }
    if (documentsSize(input) > maxBytes)
      throw new HttpError(413, "Cette archive dépasse 450 Mio de documents.");
    const parts = this.database.db
      .prepare("SELECT * FROM backup_parts WHERE transfer=?")
      .all(id);
    const index = new Map(parts.map((row) => [row.part, row]));
    if (parts.length !== input.uploads.length * 2)
      throw new HttpError(400, "Il manque des documents à la sauvegarde.");
    const sourcePath = (position: number, kind: DocumentPart) => {
      const row = index.get(position + "-" + kind),
        descriptor = input.uploads[position][kind];
      if (
        !row ||
        row.digest !== descriptor.sha256 ||
        Number(row.size) !== descriptor.size
      )
        throw new HttpError(
          400,
          "Un document diffère du sommaire de la sauvegarde.",
        );
      return String(row.path);
    };
    input.uploads.forEach((_, position) =>
      documentParts.forEach((kind) => sourcePath(position, kind)),
    );
    this.database.db
      .prepare("UPDATE backup_transfers SET status='committing' WHERE id=?")
      .run(id);
    try {
      return await restoreBackup(
        this.database,
        family,
        { ...input, version: 1 },
        images,
        legacyLimit,
        {
          sourcePath,
          committed: () => {
            this.database.db
              .prepare("DELETE FROM backup_parts WHERE transfer=?")
              .run(id);
            // Keep a short-lived acknowledgement if the client loses the final response.
            this.database.db
              .prepare("UPDATE backup_transfers SET status='done' WHERE id=?")
              .run(id);
          },
        },
      );
    } catch (error) {
      this.database.db
        .prepare("UPDATE backup_transfers SET status='open' WHERE id=?")
        .run(id);
      throw error;
    }
  }
}
