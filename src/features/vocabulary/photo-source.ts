import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadCourseSource } from "@/services/api";
import { localId } from "@/features/parent/shared";

// Safari can return the original HEIC or a full-resolution photo from the library.
async function webPhotoUri(asset: ImagePicker.ImagePickerAsset) {
  if (
    ["image/jpeg", "image/png"].includes(asset.mimeType ?? "") &&
    asset.width > 0 &&
    Math.max(asset.width, asset.height) <= 1600
  )
    return asset.uri;
  const image = new window.Image();
  image.src = asset.uri;
  await image.decode().catch(() => {
    throw new Error(
      "Cette photo ne peut pas être lue. Choisissez une image JPEG ou PNG.",
    );
  });
  const scale = Math.min(
    1,
    1600 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("La photo n’a pas pu être ouverte.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!jpeg)
    throw new Error(
      "La photo n’a pas pu être préparée. Essayez une autre image.",
    );
  return URL.createObjectURL(jpeg);
}

export async function pickVocabularyPhoto(camera: boolean, profileId: string) {
  if (
    camera &&
    Platform.OS !== "web" &&
    !(await ImagePicker.requestCameraPermissionsAsync()).granted
  )
    throw new Error(
      "L’accès à l’appareil photo est refusé. Choisissez une photo existante ou autorisez la caméra dans les réglages.",
    );
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.9,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  const result = await (
    camera
      ? ImagePicker.launchCameraAsync({
          ...options,
          cameraType: ImagePicker.CameraType.back,
        })
      : ImagePicker.launchImageLibraryAsync(options)
  ).catch(() => {
    throw new Error(
      camera
        ? "L’appareil photo n’a pas pu être ouvert. Choisissez une photo existante."
        : "Cette photo ne peut pas être ouverte. Choisissez une image JPEG ou PNG.",
    );
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  let uri = asset.uri;
  try {
    if (Platform.OS === "web") uri = await webPhotoUri(asset);
    const converted = uri !== asset.uri;
    return await uploadCourseSource(
      {
        id: localId("vocabulary-photo"),
        uri,
        name: converted
          ? "Liste de vocabulaire.jpg"
          : (asset.fileName ?? "Vocabulaire.jpg"),
        mimeType: converted ? "image/jpeg" : (asset.mimeType ?? "image/jpeg"),
      },
      profileId,
    );
  } finally {
    if (Platform.OS === "web") {
      for (const url of new Set([asset.uri, uri]))
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
  }
}
