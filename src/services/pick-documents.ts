import * as DocumentPicker from "expo-document-picker";
import type { CourseSource } from "@/domain/model";

export const documentExamples =
  "PDF, Word (DOCX), PowerPoint, Excel, OpenDocument, texte ou photos";

export async function pickDocuments(
  multiple: boolean,
  makeId: () => string,
): Promise<CourseSource[]> {
  // Files/iCloud providers do not always set the MIME type. Let the server inspect the contents.
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    multiple,
    copyToCacheDirectory: true,
    base64: false,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => {
    if (asset.size !== undefined && asset.size > 25 * 1024 * 1024)
      throw new Error(
        asset.name + " dépasse 25 Mo. Séparez le document avant de l’importer.",
      );
    return {
      id: makeId(),
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType,
      rotation: 0,
    };
  });
}
