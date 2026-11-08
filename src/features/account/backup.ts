import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File as NativeFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export interface BackupSelection {
  name: string;
  value: unknown;
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
    data.version !== 1 ||
    !Array.isArray(data.profiles) ||
    !data.profiles.length ||
    !Array.isArray(data.uploads)
  )
    throw new Error(
      "Choisissez une sauvegarde Révizo compatible au format JSON.",
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
    type: ["application/json", "text/json", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > 120 * 1024 * 1024)
    throw new Error(
      "Cette sauvegarde dépasse la taille de 120 Mo acceptée ici.",
    );
  let text: string;
  if (Platform.OS === "web") {
    const response = await fetch(asset.uri);
    if (!response.ok)
      throw new Error("Le fichier sélectionné n’est plus disponible.");
    text = await response.text();
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
