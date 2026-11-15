import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { ImageProcessor } from "./runtime";
import type { CourseSource, SessionUser } from "../src/domain/model";
import type { FamilyDatabase } from "./database";
import { HttpError, isoNow, type StoredUpload } from "./types";
export function sourceFor(upload: StoredUpload): CourseSource {
  return {
    id: upload.id,
    storageId: upload.id,
    name: upload.name,
    uri: `/api/uploads/${upload.id}`,
    mimeType: upload.mimeType,
    rotation: upload.rotation,
  };
}
export async function storeUpload(
  database: FamilyDatabase,
  user: SessionUser,
  profileId: string,
  buffer: Buffer,
  name: string,
  mimeType: string,
  images: ImageProcessor,
): Promise<StoredUpload> {
  if (!buffer.length || buffer.length > 25 * 1024 * 1024)
    throw new HttpError(413, "Chaque document doit peser au maximum 25 Mo.");
  const id = randomUUID();
  const isPdf = buffer.subarray(0, 5).toString() === "%PDF-";
  const safeName = name.replace(/[\r\n\x00]/g, "").slice(0, 180) || "Document";
  const originalPath = join(database.filesDir, id + ".original");
  let bytes = buffer,
    actualMime = "application/pdf";
  if (!isPdf) {
    try {
      bytes = await images.normalize(buffer);
      actualMime = "image/png";
    } catch {
      throw new HttpError(
        415,
        "Ce fichier n’est pas une image ou un PDF lisible. Essayez une photo JPEG/PNG ou un PDF.",
      );
    }
  }
  const path = join(database.filesDir, id + (isPdf ? ".pdf" : ".png"));
  await database.files.write(originalPath, buffer);
  try {
    await database.files.write(path, bytes);
    const upload: StoredUpload = {
      id,
      familyId: user.familyId,
      profileId,
      name: safeName,
      mimeType: actualMime,
      path,
      originalPath,
      rotation: 0,
      size: bytes.length,
      createdAt: isoNow(),
    };
    database.saveUpload(upload);
    return upload;
  } catch (error) {
    await database.files.unlink(originalPath).catch(() => {});
    await database.files.unlink(path).catch(() => {});
    throw error;
  }
}
export function canReadUpload(
  database: FamilyDatabase,
  user: SessionUser,
  upload: StoredUpload,
): boolean {
  if (upload.familyId !== user.familyId) return false;
  if (user.role === "parent") return true;
  if (upload.profileId !== user.profileId) return false;
  return database
    .data(upload.profileId)
    .data.courses.some(
      (course) =>
        course.status === "published" &&
        course.sources.some(
          (source) => (source.storageId ?? source.id) === upload.id,
        ),
    );
}
export async function rotateUpload(
  database: FamilyDatabase,
  upload: StoredUpload,
  rotation: number,
  images: ImageProcessor,
): Promise<StoredUpload> {
  if (
    ![0, 90, 180, 270].includes(rotation) ||
    upload.mimeType === "application/pdf"
  )
    throw new HttpError(
      400,
      "Choisissez une rotation de 0, 90, 180 ou 270 degrés pour une image.",
    );
  const result = await images.normalize(
    await database.files.read(upload.originalPath),
    rotation,
  );
  await database.files.write(upload.path, result);
  const updated = { ...upload, rotation, size: result.length };
  database.saveUpload(updated);
  return updated;
}
export async function removeUploadFiles(
  database: FamilyDatabase,
  upload: StoredUpload,
) {
  for (const path of new Set([upload.path, upload.originalPath]))
    await database.files.unlink(path).catch(() => {});
}
