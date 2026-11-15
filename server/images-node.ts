import sharp from "sharp";
import type { ImageProcessor } from "./runtime";
export const nodeImages: ImageProcessor = {
  async normalize(bytes, rotation = 0) {
    const oriented = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .png()
      .toBuffer();
    return sharp(oriented)
      .rotate(rotation)
      .resize({
        width: 2200,
        height: 2200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  },
  async validatePng(bytes) {
    if (
      (await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata())
        .format !== "png"
    )
      throw new Error("format");
  },
};
