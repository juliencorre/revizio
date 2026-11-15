import { Buffer } from "node:buffer";
// The browser build uses a JS inflater; Node's stream-style zlib constructors
// used by pngjs's default entry point are incompatible with Workers.
import { PNG } from "pngjs/browser.js";
import jpeg from "jpeg-js";
import type { ImageProcessor } from "../server/runtime";

// Inspect dimensions before allocating a raster. Parent uploads are still untrusted.
function jpegInfo(bytes: Buffer): {
  width: number;
  height: number;
  orientation: number;
} {
  let offset = 2,
    orientation = 1;
  let width = 0,
    height = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1],
      length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 7) {
      height = bytes.readUInt16BE(offset + 5);
      width = bytes.readUInt16BE(offset + 7);
    }
    if (
      marker === 0xe1 &&
      bytes.subarray(offset + 4, offset + 10).toString() === "Exif\0\0"
    ) {
      try {
        const base = offset + 10,
          little = bytes.toString("ascii", base, base + 2) === "II";
        const u16 = (at: number) =>
          little ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at);
        const u32 = (at: number) =>
          little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at);
        const directory = base + u32(base + 4),
          count = Math.min(u16(directory), 256);
        for (
          let entry = directory + 2;
          entry < directory + 2 + count * 12;
          entry += 12
        )
          if (u16(entry) === 0x112) orientation = u16(entry + 8);
      } catch {
        /* Invalid EXIF does not control allocations or offsets. */
      }
    }
    offset += 2 + length;
    if (marker === 0xda) break;
  }
  return { width, height, orientation };
}
export const cloudImages: ImageProcessor = {
  async normalize(bytes, rotation = 0) {
    const isPng = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!isPng && !isJpeg) throw new Error("Utilisez une image JPEG ou PNG.");
    const info = isPng
      ? {
          width: bytes.readUInt32BE(16),
          height: bytes.readUInt32BE(20),
          orientation: 1,
        }
      : jpegInfo(bytes);
    if (!info.width || !info.height || info.width * info.height > 12_500_000)
      throw new Error(
        "L’image dépasse 12,5 mégapixels. Réduisez-la avant l’import.",
      );
    const input = isPng
      ? PNG.sync.read(bytes)
      : jpeg.decode(bytes, {
          maxResolutionInMP: 12.5,
          maxMemoryUsageInMB: 64,
          tolerantDecoding: false,
        });
    const swapped = info.orientation >= 5 && info.orientation <= 8;
    const orientedWidth = swapped ? info.height : info.width,
      orientedHeight = swapped ? info.width : info.height;
    const quarterTurn = rotation === 90 || rotation === 270;
    const rw = quarterTurn ? orientedHeight : orientedWidth,
      rh = quarterTurn ? orientedWidth : orientedHeight;
    const scale = Math.min(1, 2200 / Math.max(rw, rh));
    const width = Math.max(1, Math.floor(rw * scale)),
      height = Math.max(1, Math.floor(rh * scale));
    const output = new PNG({ width, height });
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let ox = Math.min(rw - 1, Math.floor(x / scale)),
          oy = Math.min(rh - 1, Math.floor(y / scale));
        if (rotation === 90) [ox, oy] = [oy, orientedHeight - 1 - ox];
        else if (rotation === 180)
          [ox, oy] = [orientedWidth - 1 - ox, orientedHeight - 1 - oy];
        else if (rotation === 270) [ox, oy] = [orientedWidth - 1 - oy, ox];
        let sx = ox,
          sy = oy;
        switch (info.orientation) {
          case 2:
            sx = info.width - 1 - ox;
            break;
          case 3:
            sx = info.width - 1 - ox;
            sy = info.height - 1 - oy;
            break;
          case 4:
            sy = info.height - 1 - oy;
            break;
          case 5:
            sx = oy;
            sy = ox;
            break;
          case 6:
            sx = oy;
            sy = info.height - 1 - ox;
            break;
          case 7:
            sx = info.width - 1 - oy;
            sy = info.height - 1 - ox;
            break;
          case 8:
            sx = info.width - 1 - oy;
            sy = ox;
            break;
        }
        const source = (sy * info.width + sx) * 4,
          target = (y * width + x) * 4;
        output.data.set(input.data.subarray(source, source + 4), target);
      }
    return PNG.sync.write(output);
  },
  async validatePng(bytes) {
    if (
      bytes.length < 24 ||
      bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 12_500_000
    )
      throw new Error("dimensions");
    PNG.sync.read(bytes);
  },
};
