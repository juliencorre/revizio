import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { CourseSource } from "@/domain/model";

// Safari can return the original HEIC or a full-resolution photo from the library.
async function webPhotoUri(
  asset: ImagePicker.ImagePickerAsset,
  maxEdge: number,
) {
  if (
    ["image/jpeg", "image/png"].includes(asset.mimeType ?? "") &&
    asset.width > 0 &&
    asset.height > 0 &&
    Math.max(asset.width, asset.height) <= maxEdge &&
    (asset.fileSize ?? 0) <= 25 * 1024 * 1024
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
    maxEdge / Math.max(image.naturalWidth, image.naturalHeight),
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

export async function pickPhotos(
  camera: boolean,
  limit: number,
  makeId: () => string,
  maxEdge: number,
): Promise<CourseSource[]> {
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
      : ImagePicker.launchImageLibraryAsync({
          ...options,
          allowsMultipleSelection: true,
          selectionLimit: limit,
        })
  ).catch(() => {
    throw new Error(
      camera
        ? "L’appareil photo n’a pas pu être ouvert. Choisissez une photo existante."
        : "Cette photo ne peut pas être ouverte. Choisissez une image JPEG ou PNG.",
    );
  });
  if (result.canceled) return [];
  const photos: CourseSource[] = [];
  try {
    if (result.assets.length > limit)
      throw new Error(`Choisissez au maximum ${limit} images supplémentaires.`);
    for (const asset of result.assets) {
      const uri =
        Platform.OS === "web" ? await webPhotoUri(asset, maxEdge) : asset.uri;
      const converted = uri !== asset.uri;
      const id = makeId();
      const name = asset.fileName || id + ".jpg";
      photos.push({
        id,
        uri,
        name: converted ? name.replace(/(\.[^.]+)?$/, ".jpg") : name,
        mimeType: converted ? "image/jpeg" : (asset.mimeType ?? "image/jpeg"),
        rotation: 0,
      });
    }
    return photos;
  } catch (error) {
    for (const photo of photos)
      if (photo.uri?.startsWith("blob:")) URL.revokeObjectURL(photo.uri);
    throw error;
  } finally {
    const kept = new Set(photos.map((source) => source.uri));
    for (const asset of result.assets)
      if (asset.uri.startsWith("blob:") && !kept.has(asset.uri))
        URL.revokeObjectURL(asset.uri);
  }
}
