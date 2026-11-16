import type { LearningData } from "./model";

/** Length-prefixed metadata followed by each normalized document and its original, in order. */
export const archiveMagic = "REVIZO2\n";
export const maxManifestBytes = 10 * 1024 * 1024;
export const documentParts = ["normalized", "original"] as const;
export type DocumentPart = (typeof documentParts)[number];
export interface PartInfo {
  size: number;
  sha256: string;
}
export interface ArchiveUpload {
  id: string;
  profileId: string;
  name: string;
  mimeType: string;
  rotation: number;
  normalized: PartInfo;
  original: PartInfo;
}
export interface BackupManifest {
  format: "revizio-backup";
  version: 2;
  exportedAt: string;
  profiles: { id: string; name: string; grade: string; data: LearningData }[];
  uploads: ArchiveUpload[];
}
export function checkManifest(value: unknown): asserts value is BackupManifest {
  const manifest = value as BackupManifest | null;
  if (
    !manifest ||
    manifest.format !== "revizio-backup" ||
    manifest.version !== 2 ||
    !Array.isArray(manifest.profiles) ||
    !manifest.profiles.length ||
    manifest.profiles.length > 2 ||
    !Array.isArray(manifest.uploads) ||
    manifest.uploads.length > 1000 ||
    !manifest.uploads.every(
      (file) =>
        file &&
        documentParts.every((part) => {
          const descriptor = file[part];
          return (
            descriptor &&
            Number.isSafeInteger(descriptor.size) &&
            descriptor.size > 0 &&
            descriptor.size <= 25 * 1024 * 1024 &&
            typeof descriptor.sha256 === "string" &&
            /^[a-f0-9]{64}$/.test(descriptor.sha256)
          );
        }),
    )
  )
    throw new Error("Le sommaire de cette sauvegarde est invalide.");
}
export function documentsSize(manifest: BackupManifest) {
  return manifest.uploads.reduce(
    (total, file) => total + file.normalized.size + file.original.size,
    0,
  );
}
