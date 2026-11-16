import type { DocumentPart } from "../src/domain/backup-format";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ImageProcessor } from "./runtime";
import type { LearningData } from "../src/domain/model";
import { parseLearningData } from "../src/domain/learning";
import type { FamilyDatabase } from "./database";
import { HttpError, isoNow, type StoredUpload } from "./types";
import { decodeDocumentText } from "./document-text";
import { removeUploadFiles, storedExtension } from "./uploads";
import { FAMILY_LIMITS, normalizeChildName } from "../src/domain/family";
const row = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown, max = 200) =>
  typeof v === "string" && v.length <= max ? v : "";
const identifier = (v: unknown) =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
export async function backupEstimate(
  database: FamilyDatabase,
  familyId: string,
) {
  const uploads = database.uploads(familyId);
  let bytes = 0;
  const profiles = database
    .profiles(familyId)
    .map(({ id, name, grade }) => ({ id, name, grade, data: null }));
  const metadata = uploads.map(
    ({ id, profileId, name, mimeType, rotation }) => ({
      id,
      profileId,
      name,
      mimeType,
      rotation,
      bytes: "",
      originalBytes: "",
    }),
  );
  let jsonBytes = Buffer.byteLength(
    JSON.stringify({
      backup: {
        format: "revizio-backup",
        version: 1,
        exportedAt: isoNow(),
        profiles,
        uploads: metadata,
      },
    }),
  );
  for (const profile of profiles) {
    const row = database.db
      .prepare(
        "SELECT LENGTH(CAST(data AS BLOB)) AS bytes FROM learning WHERE profile_id=?",
      )
      .get(profile.id);
    jsonBytes += Number(row?.bytes ?? 4) - 4;
  }
  for (const file of uploads) {
    for (const path of [file.path, file.originalPath]) {
      const size = await database.files.size(path);
      bytes += size;
      jsonBytes += 4 * Math.ceil(size / 3);
    }
  }
  return { bytes, jsonBytes, documents: uploads.length };
}
export async function exportBackup(
  database: FamilyDatabase,
  familyId: string,
  limitBytes = 100 * 1024 * 1024,
) {
  const uploads = [];
  let total = 0;
  for (const upload of database.uploads(familyId)) {
    const [bytes, originalBytes] = await Promise.all([
      database.files.read(upload.path),
      database.files.read(upload.originalPath),
    ]);
    total += bytes.length + originalBytes.length;
    if (total > limitBytes)
      throw new HttpError(
        413,
        `La sauvegarde dépasse ${Math.floor(limitBytes / 1024 / 1024)} Mo. Exportez ou archivez les documents volumineux séparément.`,
      );
    uploads.push({
      id: upload.id,
      profileId: upload.profileId,
      name: upload.name,
      mimeType: upload.mimeType,
      rotation: upload.rotation,
      bytes: bytes.toString("base64"),
      originalBytes: originalBytes.toString("base64"),
    });
  }
  return {
    format: "revizio-backup",
    version: 1,
    exportedAt: isoNow(),
    profiles: database.profiles(familyId).map((profile) => ({
      id: profile.id,
      name: profile.name,
      grade: profile.grade,
      data: database.data(profile.id).data,
    })),
    uploads,
  };
}
export async function restoreBackup(
  database: FamilyDatabase,
  familyId: string,
  value: unknown,
  images: ImageProcessor,
  limitBytes = 100 * 1024 * 1024,
  transfer?: {
    sourcePath(index: number, part: DocumentPart): string;
    committed(): void;
  },
) {
  const backup = row(value);
  if (
    backup.format !== "revizio-backup" ||
    backup.version !== 1 ||
    !Array.isArray(backup.profiles) ||
    !Array.isArray(backup.uploads) ||
    backup.profiles.length < 1 ||
    backup.profiles.length > FAMILY_LIMITS.children ||
    backup.uploads.length > 1000
  )
    throw new HttpError(
      400,
      "Ce fichier n’est pas une sauvegarde Révizo compatible.",
    );
  const profiles = backup.profiles.map((raw) => {
    const profile = row(raw);
    if (
      !identifier(profile.id) ||
      !text(profile.name, 80).trim() ||
      !text(profile.grade, 32).trim()
    )
      throw new HttpError(400, "Un profil de la sauvegarde est invalide.");
    let data: LearningData;
    try {
      data = parseLearningData(JSON.stringify(profile.data));
    } catch {
      throw new HttpError(
        400,
        "Les cours ou résultats de la sauvegarde sont invalides.",
      );
    }
    return {
      id: String(profile.id),
      name: String(profile.name),
      grade: String(profile.grade),
      data,
    };
  });
  if (new Set(profiles.map((p) => p.id)).size !== profiles.length)
    throw new HttpError(400, "La sauvegarde contient des profils dupliqués.");
  if (
    new Set(profiles.map((p) => normalizeChildName(p.name))).size !==
    profiles.length
  )
    throw new HttpError(
      400,
      "Chaque enfant doit avoir un prénom de connexion distinct.",
    );
  let total = 0;
  const files: StoredUpload[] = [];
  const temporaryPaths: string[] = [];
  try {
    for (const [index, raw] of backup.uploads.entries()) {
      const source = row(raw);
      if (
        !identifier(source.id) ||
        !profiles.some((p) => p.id === source.profileId) ||
        !["application/pdf", "image/png", "text/plain"].includes(
          String(source.mimeType),
        ) ||
        !text(source.name, 180) ||
        (!transfer &&
          (typeof source.bytes !== "string" ||
            typeof source.originalBytes !== "string" ||
            source.bytes.length > 40 * 1024 * 1024 ||
            source.originalBytes.length > 40 * 1024 * 1024))
      )
        throw new HttpError(400, "Un document de la sauvegarde est invalide.");
      const bytes = transfer
        ? await database.files.read(transfer.sourcePath(index, "normalized"))
        : Buffer.from(String(source.bytes), "base64");
      const originalSize = transfer
        ? await database.files.size(transfer.sourcePath(index, "original"))
        : Buffer.byteLength(String(source.originalBytes), "base64");
      total += bytes.length + originalSize;
      if (
        !bytes.length ||
        !originalSize ||
        total > (transfer ? 450 * 1024 * 1024 : limitBytes) ||
        bytes.length > 25 * 1024 * 1024 ||
        originalSize > 25 * 1024 * 1024
      )
        throw new HttpError(413, "Cette sauvegarde est trop volumineuse.");
      if (source.mimeType === "application/pdf") {
        if (bytes.subarray(0, 5).toString() !== "%PDF-")
          throw new HttpError(400, "Un PDF de la sauvegarde est invalide.");
      } else if (source.mimeType === "text/plain") {
        try {
          if (!bytes.equals(Buffer.from(decodeDocumentText(bytes))))
            throw new Error();
        } catch {
          throw new HttpError(
            400,
            "Un document texte de la sauvegarde est invalide.",
          );
        }
      } else {
        try {
          await images.validatePng(bytes);
        } catch {
          throw new HttpError(400, "Une image de la sauvegarde est invalide.");
        }
      }
      const prefix = randomUUID();
      const path =
        transfer?.sourcePath(index, "normalized") ??
        join(
          database.filesDir,
          prefix + storedExtension(String(source.mimeType)),
        );
      const originalPath =
        transfer?.sourcePath(index, "original") ??
        join(database.filesDir, prefix + ".original");
      if (!transfer) {
        await database.files.write(path, bytes);
        temporaryPaths.push(path);
        const original = Buffer.from(String(source.originalBytes), "base64");
        if (original.length !== originalSize)
          throw new HttpError(
            400,
            "Un document original de la sauvegarde est invalide.",
          );
        await database.files.write(originalPath, original);
        temporaryPaths.push(originalPath);
      }
      files.push({
        id: String(source.id),
        familyId,
        profileId: String(source.profileId),
        name: String(source.name),
        mimeType: String(source.mimeType),
        path,
        originalPath,
        rotation: [0, 90, 180, 270].includes(Number(source.rotation))
          ? Number(source.rotation)
          : 0,
        size: bytes.length,
        createdAt: isoNow(),
      });
    }
    if (new Set(files.map((file) => file.id)).size !== files.length)
      throw new HttpError(
        400,
        "La sauvegarde contient des documents dupliqués.",
      );
    const cacheRevision = randomUUID();
    for (const profile of profiles)
      for (const course of profile.data.courses)
        for (const source of course.sources) {
          const id =
            source.storageId ??
            (source.uri?.startsWith("/api/uploads/")
              ? source.uri.split("/").pop()
              : undefined);
          if (id) {
            if (
              !files.some(
                (file) => file.id === id && file.profileId === profile.id,
              )
            )
              throw new HttpError(
                400,
                "Une fiche référence un document absent de la sauvegarde.",
              );
            source.uri = `/api/uploads/${id}`;
            source.storageId = id;
            Object.assign(source, { cacheRevision });
            delete source.cachedUri;
          } else if (source.uri)
            throw new HttpError(
              400,
              "La sauvegarde contient un document non durable.",
            );
        }
    const previousProfiles = database.profiles(familyId),
      previousFiles = database.uploads(familyId);
    const revisions = previousProfiles.map((profile) => [
      profile.id,
      database.db
        .prepare("SELECT revision FROM learning WHERE profile_id=?")
        .get(profile.id)?.revision,
    ]);
    const backupDir = join(database.dataDir, "backups");
    await database.files.mkdir(backupDir);
    // Ordinary archives keep the historical standalone JSON. A large library is
    // archived in binary volumes so restoring a small file still works at any size.
    let archivePath: string | undefined;
    let archiveDirectory: string | undefined;
    const moves: [string, string][] = [];
    if (
      !database.files.moveInTransaction &&
      (await backupEstimate(database, familyId)).bytes <= limitBytes
    ) {
      const previous = await exportBackup(database, familyId, limitBytes);
      archivePath = join(backupDir, "before-restore-" + randomUUID() + ".json");
      await database.files.write(archivePath, JSON.stringify(previous));
    } else {
      archiveDirectory = join(backupDir, "before-restore-" + randomUUID());
      await database.files.mkdir(archiveDirectory);
      try {
        const uploads = [];
        for (const [index, file] of previousFiles.entries()) {
          const normalized = index + "-normalized",
            original = index + "-original";
          for (const [from, name] of [
            [file.path, normalized],
            [file.originalPath, original],
          ]) {
            const to = join(archiveDirectory, name);
            if (database.files.moveInTransaction) moves.push([from, to]);
            else if (database.files.link) await database.files.link(from, to);
            else
              await database.files.write(to, await database.files.read(from));
          }
          uploads.push({
            id: file.id,
            profileId: file.profileId,
            name: file.name,
            mimeType: file.mimeType,
            rotation: file.rotation,
            normalized,
            original,
          });
        }
        await database.files.write(
          join(archiveDirectory, "manifest.json"),
          JSON.stringify({
            format: "revizio-backup-volumes",
            version: 1,
            exportedAt: isoNow(),
            uploads,
            profiles: previousProfiles.map(({ id, name, grade }) => ({
              id,
              name,
              grade,
              data: database.data(id).data,
            })),
          }),
        );
      } catch (error) {
        await database.files.removeDirectory(archiveDirectory);
        throw error;
      }
    }
    try {
      database.transaction(() => {
        const currentProfiles = database.profiles(familyId);
        const currentRevisions = currentProfiles.map((profile) => [
          profile.id,
          database.db
            .prepare("SELECT revision FROM learning WHERE profile_id=?")
            .get(profile.id)?.revision,
        ]);
        if (
          JSON.stringify(revisions) !== JSON.stringify(currentRevisions) ||
          JSON.stringify(previousProfiles) !==
            JSON.stringify(currentProfiles) ||
          JSON.stringify(previousFiles) !==
            JSON.stringify(database.uploads(familyId))
        ) {
          throw new HttpError(
            409,
            "La famille a changé pendant la restauration. Réessayez pour conserver la version récente.",
          );
        }
        database.db
          .prepare("DELETE FROM sessions WHERE family_id=? AND role=?")
          .run(familyId, "child");
        database.db.prepare("DELETE FROM jobs WHERE family_id=?").run(familyId);
        database.db
          .prepare("DELETE FROM uploads WHERE family_id=?")
          .run(familyId);
        for (const current of previousProfiles)
          if (!profiles.some((p) => p.id === current.id))
            database.deleteProfile(current.id);
        for (const profile of profiles) {
          const current = previousProfiles.find((p) => p.id === profile.id);
          if (current)
            // All final names were validated together; temporary duplicates during a
            // rename must not reject an otherwise valid atomic restore.
            database.updateProfile(
              profile.id,
              {
                name: profile.name,
                grade: profile.grade,
              },
              false,
            );
          else
            database.addProfile(
              familyId,
              {
                id: profile.id,
                name: profile.name,
                grade: profile.grade,
                pinHash: "",
              },
              false,
            );
          database.db
            .prepare(
              "UPDATE learning SET data=?,revision=revision+1,updated_at=? WHERE profile_id=?",
            )
            .run(JSON.stringify(profile.data), isoNow(), profile.id);
        }
        for (const file of files) database.saveUpload(file);
        for (const [from, to] of moves)
          database.files.moveInTransaction!(from, to);
        transfer?.committed();
      });
    } catch (error) {
      if (archivePath) await database.files.unlink(archivePath).catch(() => {});
      if (archiveDirectory)
        await database.files.removeDirectory(archiveDirectory).catch(() => {});
      throw error;
    }
    for (const previousFile of previousFiles)
      await removeUploadFiles(database, previousFile);
    return {
      ok: true,
      profiles: database.profiles(familyId).map((profile) => ({
        id: profile.id,
        name: profile.name,
        grade: profile.grade,
        needsPin: !profile.pinHash,
      })),
      message:
        "La sauvegarde a été restaurée. Les codes des profils existants sont conservés ; définissez un code pour les profils récupérés.",
    };
  } catch (error) {
    for (const path of temporaryPaths)
      await database.files.unlink(path).catch(() => {});
    throw error;
  }
}
