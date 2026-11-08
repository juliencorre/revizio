import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { LearningData } from "../src/domain/model";
import { parseLearningData } from "../src/domain/learning";
import { FamilyDatabase } from "./database";
import { HttpError, isoNow, type StoredUpload } from "./types";
import { removeUploadFiles } from "./uploads";
const row = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown, max = 200) =>
  typeof v === "string" && v.length <= max ? v : "";
const identifier = (v: unknown) =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
export async function exportBackup(database: FamilyDatabase, familyId: string) {
  const uploads = [];
  let total = 0;
  for (const upload of database.uploads(familyId)) {
    const [bytes, originalBytes] = await Promise.all([
      readFile(upload.path),
      readFile(upload.originalPath),
    ]);
    total += bytes.length + originalBytes.length;
    if (total > 100 * 1024 * 1024)
      throw new HttpError(
        413,
        "La sauvegarde dépasse 100 Mo. Exportez ou archivez les documents volumineux séparément.",
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
) {
  const backup = row(value);
  if (
    backup.format !== "revizio-backup" ||
    backup.version !== 1 ||
    !Array.isArray(backup.profiles) ||
    !Array.isArray(backup.uploads) ||
    backup.profiles.length < 1 ||
    backup.profiles.length > 12 ||
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
  let total = 0;
  const files: StoredUpload[] = [];
  const temporaryPaths: string[] = [];
  try {
    for (const raw of backup.uploads) {
      const source = row(raw);
      if (
        !identifier(source.id) ||
        !profiles.some((p) => p.id === source.profileId) ||
        !["application/pdf", "image/png"].includes(String(source.mimeType)) ||
        !text(source.name, 180) ||
        typeof source.bytes !== "string" ||
        typeof source.originalBytes !== "string" ||
        source.bytes.length > 40 * 1024 * 1024 ||
        source.originalBytes.length > 40 * 1024 * 1024
      )
        throw new HttpError(400, "Un document de la sauvegarde est invalide.");
      const bytes = Buffer.from(source.bytes, "base64"),
        original = Buffer.from(source.originalBytes, "base64");
      total += bytes.length + original.length;
      if (
        !bytes.length ||
        !original.length ||
        total > 100 * 1024 * 1024 ||
        bytes.length > 25 * 1024 * 1024 ||
        original.length > 25 * 1024 * 1024
      )
        throw new HttpError(413, "Cette sauvegarde est trop volumineuse.");
      if (source.mimeType === "application/pdf") {
        if (bytes.subarray(0, 5).toString() !== "%PDF-")
          throw new HttpError(400, "Un PDF de la sauvegarde est invalide.");
      } else {
        try {
          const metadata = await sharp(bytes, {
            limitInputPixels: 40_000_000,
          }).metadata();
          if (metadata.format !== "png") throw new Error("format");
        } catch {
          throw new HttpError(400, "Une image de la sauvegarde est invalide.");
        }
      }
      const prefix = randomUUID();
      const path = join(
        database.filesDir,
        prefix + (source.mimeType === "application/pdf" ? ".pdf" : ".png"),
      );
      const originalPath = join(database.filesDir, prefix + ".original");
      await writeFile(path, bytes, { mode: 0o600 });
      temporaryPaths.push(path);
      await writeFile(originalPath, original, { mode: 0o600 });
      temporaryPaths.push(originalPath);
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
            delete source.cachedUri;
          } else if (source.uri)
            throw new HttpError(
              400,
              "La sauvegarde contient un document non durable.",
            );
        }
    const previousProfiles = database.profiles(familyId),
      previousFiles = database.uploads(familyId);
    const previous = await exportBackup(database, familyId);
    const backupDir = join(database.dataDir, "backups");
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    await writeFile(
      join(backupDir, `before-restore-${Date.now()}.json`),
      JSON.stringify(previous),
      { mode: 0o600 },
    );
    database.transaction(() => {
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
          database.updateProfile(profile.id, {
            name: profile.name,
            grade: profile.grade,
          });
        else
          database.addProfile(familyId, {
            id: profile.id,
            name: profile.name,
            grade: profile.grade,
            pinHash: "",
          });
        database.db
          .prepare(
            "UPDATE learning SET data=?,revision=revision+1,updated_at=? WHERE profile_id=?",
          )
          .run(JSON.stringify(profile.data), isoNow(), profile.id);
      }
      for (const file of files) database.saveUpload(file);
    });
    for (const previousFile of previousFiles)
      await removeUploadFiles(previousFile);
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
    for (const path of temporaryPaths) await unlink(path).catch(() => {});
    throw error;
  }
}
