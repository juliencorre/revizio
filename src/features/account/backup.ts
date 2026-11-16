import { Platform } from "react-native";
import { ApiError, apiAuthHeaders, apiBase, apiFetch } from "@/services/api";
import {
  archiveMagic,
  checkManifest,
  documentParts,
  documentsSize,
  maxManifestBytes,
  type BackupManifest,
} from "@/domain/backup-format";
import { FAMILY_LIMITS } from "@/domain/family";
import * as DocumentPicker from "expo-document-picker";
import { File as NativeFile, Paths, FileMode } from "expo-file-system";
import * as Sharing from "expo-sharing";

export interface BackupSelection {
  name: string;
  value: unknown;
  archive?: {
    manifest: BackupManifest;
    read(offset: number, size: number): Promise<Blob | Uint8Array<ArrayBuffer>>;
    start: number;
  };
  profiles: number;
  courses: number;
  documents: number;
}
export function backupSummary(
  value: unknown,
): Omit<BackupSelection, "name" | "value"> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Ce fichier ne contient pas une sauvegarde Révizo.");
  const data = value as Record<string, unknown>;
  if (
    data.format !== "revizio-backup" ||
    (data.version !== 1 && data.version !== 2) ||
    !Array.isArray(data.profiles) ||
    !data.profiles.length ||
    !Array.isArray(data.uploads)
  )
    throw new Error(
      "Choisissez une sauvegarde Révizo compatible au format JSON.",
    );
  if (data.profiles.length > FAMILY_LIMITS.children)
    throw new Error(
      "Votre foyer est limité à deux profils enfants. Choisissez une sauvegarde contenant au maximum deux enfants.",
    );
  let courses = 0;
  for (const raw of data.profiles) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      throw new Error("La liste des profils de cette sauvegarde est invalide.");
    const profile = raw as { name?: unknown; data?: { courses?: unknown } };
    if (
      typeof profile.name !== "string" ||
      !Array.isArray(profile.data?.courses)
    )
      throw new Error("Un profil de cette sauvegarde est incomplet.");
    courses += profile.data.courses.length;
  }
  return {
    profiles: data.profiles.length,
    courses,
    documents: data.uploads.length,
  };
}
export async function exportJsonBackup(value: unknown) {
  const name =
    "revizo-sauvegarde-" + new Date().toISOString().slice(0, 10) + ".json";
  const content = JSON.stringify(value, null, 2);
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } else {
    if (!(await Sharing.isAvailableAsync()))
      throw new Error(
        "Le partage de fichiers n’est pas disponible sur cet appareil.",
      );
    const file = new NativeFile(Paths.cache, name);
    file.create({ overwrite: true });
    await file.write(content);
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Enregistrer la sauvegarde Révizo",
      UTI: "public.json",
    });
  }
  return name;
}
export async function pickJsonBackup(): Promise<BackupSelection | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    base64: false,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const blob = asset.file;
  const size =
    asset.size ??
    (Platform.OS === "web" ? blob?.size : new NativeFile(asset.uri).size) ??
    0;
  async function read(
    offset: number,
    length: number,
  ): Promise<Blob | Uint8Array<ArrayBuffer>> {
    if (blob) return blob.slice(offset, offset + length);
    const handle = new NativeFile(asset.uri).open(FileMode.ReadOnly);
    try {
      handle.offset = offset;
      return await handle.readBytes(length);
    } finally {
      handle.close();
    }
  }
  const bytes = async (offset: number, length: number) => {
    const part = await read(offset, length);
    return part instanceof Uint8Array
      ? part
      : new Uint8Array(await part.arrayBuffer());
  };
  // Revoke the picker's temporary web URL after capturing its underlying File.
  if (blob && asset.uri.startsWith("blob:")) URL.revokeObjectURL(asset.uri);
  const header = await bytes(0, 12);
  if (new TextDecoder().decode(header.subarray(0, 8)) === archiveMagic) {
    if (header.length !== 12)
      throw new Error("L’en-tête de cette sauvegarde est incomplet.");
    const length = new DataView(
      header.buffer,
      header.byteOffset,
      header.byteLength,
    ).getUint32(8);
    if (!length || length > maxManifestBytes || length + 12 > size)
      throw new Error("Le sommaire de la sauvegarde est incomplet.");
    let manifest: unknown;
    try {
      manifest = JSON.parse(new TextDecoder().decode(await bytes(12, length)));
    } catch {
      throw new Error("Le sommaire de cette sauvegarde est illisible.");
    }
    checkManifest(manifest);
    const start = 12 + length;
    if (start + documentsSize(manifest) !== size)
      throw new Error(
        "Cette sauvegarde est incomplète. Sélectionnez le fichier entier.",
      );
    return {
      name: asset.name,
      value: manifest,
      ...backupSummary(manifest),
      archive: { manifest, start, read },
    };
  }
  if ((asset.size ?? 0) > 120 * 1024 * 1024)
    throw new Error(
      "Cette sauvegarde dépasse la taille de 120 Mo acceptée ici.",
    );
  let text: string;
  if (Platform.OS === "web") {
    if (!blob) throw new Error("Le fichier sélectionné n’est plus disponible.");
    text = await blob.text();
  } else text = await new NativeFile(asset.uri).text();
  if (text.length > 120 * 1024 * 1024)
    throw new Error("Cette sauvegarde est trop volumineuse.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      "Ce fichier JSON est illisible. Choisissez une sauvegarde exportée depuis Révizo.",
    );
  }
  return { name: asset.name, value, ...backupSummary(value) };
}

export interface BackupEstimate {
  bytes: number;
  documents: number;
  jsonLimit: number;
  jsonBytes: number;
  jsonBodyLimit: number;
}
async function transferRequest<T>(
  run: (signal: AbortSignal) => Promise<T>,
  retryPending = false,
): Promise<T> {
  const retryDelays = [1000, 5000, 15000, 60000];
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    try {
      return await run(controller.signal);
    } catch (error) {
      const status =
        error instanceof ApiError
          ? error.status
          : error instanceof TypeError
            ? 0
            : -1;
      if (
        attempt >= retryDelays.length ||
        !(
          status === 0 ||
          status === 429 ||
          status >= 500 ||
          (retryPending && status === 425)
        )
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, status === 429 ? 61000 : retryDelays[attempt]),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
export async function exportFamilyBackup(progress: (message: string) => void) {
  const estimate = await apiFetch<BackupEstimate>("/backup/estimate");
  if (
    estimate.bytes <= Math.min(estimate.jsonLimit, 12 * 1024 * 1024) &&
    estimate.jsonBytes <= estimate.jsonBodyLimit
  )
    return exportJsonBackup(await apiFetch("/backup"));
  const manifest = await apiFetch<BackupManifest>("/backup/manifest");
  checkManifest(manifest);
  const metadata = new TextEncoder().encode(JSON.stringify(manifest));
  if (metadata.byteLength > maxManifestBytes)
    throw new Error("Le sommaire de la sauvegarde est trop volumineux.");
  const header = new Uint8Array(12);
  header.set(new TextEncoder().encode(archiveMagic));
  new DataView(header.buffer).setUint32(8, metadata.byteLength);
  const name =
    "revizo-sauvegarde-" + new Date().toISOString().slice(0, 10) + ".revizo";
  const blobs: BlobPart[] = [header, metadata];
  const native =
    Platform.OS !== "web" ? new NativeFile(Paths.cache, name) : undefined;
  if (native && !(await Sharing.isAvailableAsync()))
    throw new Error("Le partage de fichiers est indisponible.");
  native?.create({ overwrite: true });
  const handle = native?.open(FileMode.WriteOnly);
  try {
    if (handle) {
      await handle.writeBytes(header);
      await handle.writeBytes(metadata);
    }
    for (const [index, upload] of manifest.uploads.entries()) {
      progress(
        "Export du document " +
          (index + 1) +
          " sur " +
          manifest.uploads.length +
          "…",
      );
      for (const part of documentParts) {
        const url =
          apiBase() +
          "/uploads/" +
          encodeURIComponent(upload.id) +
          "?sha256=" +
          upload[part].sha256 +
          (part === "original" ? "&original=1" : "");
        const response = await transferRequest(async (signal) => {
          const response = await fetch(url, {
            credentials: "include",
            headers: apiAuthHeaders(),
            signal,
          });
          if (response.status === 429 || response.status >= 500)
            throw new ApiError(
              "Le serveur est momentanément occupé.",
              response.status,
            );
          return response;
        });
        if (!response.ok)
          throw new Error(
            "Le document « " +
              upload.name +
              " » a changé ou est indisponible. Relancez l’export.",
          );
        if (handle) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length !== upload[part].size)
            throw new Error("Le téléchargement est incomplet.");
          await handle.writeBytes(bytes);
        } else {
          const blob = await response.blob();
          if (blob.size !== upload[part].size)
            throw new Error("Le téléchargement est incomplet.");
          blobs.push(blob);
        }
      }
    }
  } finally {
    handle?.close();
  }
  if (native)
    await Sharing.shareAsync(native.uri, {
      mimeType: "application/octet-stream",
      dialogTitle: "Enregistrer la sauvegarde Révizo",
    });
  else {
    const url = URL.createObjectURL(
      new Blob(blobs, { type: "application/octet-stream" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return name;
}
/** Older installations stored base64 in one JSON. Send oversized files through
 * the same per-document transfer as a current archive. */
function legacyArchive(
  value: unknown,
): NonNullable<BackupSelection["archive"]> {
  const legacy = value as {
    exportedAt: string;
    profiles: BackupManifest["profiles"];
    uploads: (Omit<
      BackupManifest["uploads"][number],
      "normalized" | "original"
    > & { bytes: string; originalBytes: string })[];
  };
  let offset = 0;
  const encoded = new Map<number, string>();
  function part(text: string) {
    if (
      typeof text !== "string" ||
      !text.length ||
      text.length > 36 * 1024 * 1024 ||
      text.length % 4 !== 0
    )
      throw new Error("Un document de la sauvegarde JSON est invalide.");
    const size =
      (text.length * 3) / 4 -
      (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0);
    encoded.set(offset, text);
    offset += size;
    return { size, sha256: "" };
  }
  const manifest: BackupManifest = {
    format: "revizio-backup",
    version: 2,
    exportedAt: legacy.exportedAt,
    profiles: legacy.profiles,
    uploads: legacy.uploads.map(({ bytes, originalBytes, ...file }) => ({
      ...file,
      normalized: part(bytes),
      original: part(originalBytes),
    })),
  };
  return {
    manifest,
    start: 0,
    async read(offset) {
      const source = encoded.get(offset);
      if (!source) throw new Error("Un document est manquant.");
      const decoded = atob(source);
      const result = new Uint8Array(decoded.length);
      for (let i = 0; i < result.length; i++) result[i] = decoded.charCodeAt(i);
      return Platform.OS === "web" ? new Blob([result]) : result;
    },
  };
}
export async function restoreFamilyBackup(
  selection: BackupSelection,
  progress: (message: string) => void,
) {
  let archive = selection.archive;
  if (!archive) {
    const body = JSON.stringify({ backup: selection.value });
    // The cloud accepts 12 MiB of decoded documents and 18 MiB of JSON.
    // This conservative threshold also leaves room for profile metadata.
    if (new Blob([body]).size <= 12 * 1024 * 1024) {
      await apiFetch("/backup/restore", { method: "POST", body });
      return;
    }
    archive = legacyArchive(selection.value);
  }
  const { manifest, read, start } = archive;
  const transfer = await apiFetch<{ id: string }>("/backup/transfers", {
    method: "POST",
    body: JSON.stringify({ bytes: documentsSize(manifest) }),
  });
  const path = "/backup/transfers/" + encodeURIComponent(transfer.id);
  let offset = start;
  try {
    for (const [index, file] of manifest.uploads.entries()) {
      progress(
        "Restauration du document " +
          (index + 1) +
          " sur " +
          manifest.uploads.length +
          "…",
      );
      for (const part of documentParts) {
        const descriptor = file[part],
          content = await read(offset, descriptor.size);
        offset += descriptor.size;
        const form = new FormData();
        const temp =
          content instanceof Uint8Array
            ? new NativeFile(
                Paths.cache,
                "restauration-" + transfer.id + ".bin",
              )
            : undefined;
        try {
          if (content instanceof Uint8Array && temp) {
            temp.create({ overwrite: true });
            await temp.write(content);
            form.append("file", {
              uri: temp.uri,
              name: "document",
              type: "application/octet-stream",
            } as unknown as Blob);
          } else form.append("file", content as Blob, "document");
          const saved = await transferRequest((signal) =>
            apiFetch<{ sha256: string }>(
              path +
                "/parts/" +
                index +
                "-" +
                part +
                "?sha256=" +
                descriptor.sha256,
              { method: "POST", body: form, signal },
            ),
          );
          if (!descriptor.sha256) descriptor.sha256 = saved.sha256;
        } finally {
          if (temp?.exists) temp.delete();
        }
      }
    }
    await transferRequest(
      (signal) =>
        apiFetch(path + "/finish", {
          method: "POST",
          signal,
          body: JSON.stringify(manifest),
        }),
      true,
    );
  } catch (error) {
    await apiFetch(path, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}
