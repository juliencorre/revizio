import type { CourseSource } from "./model";

export type DocumentKind = "image" | "pdf" | "text" | "other";

export function documentKind(
  source: Pick<CourseSource, "name" | "mimeType">,
): DocumentKind {
  const mime = source.mimeType?.toLowerCase().split(";")[0];
  if (mime === "application/pdf") return "pdf";
  if (mime?.startsWith("image/")) return "image";
  if (
    mime?.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml"
  )
    return "text";
  if (!mime || mime === "application/octet-stream") {
    if (/\.pdf$/i.test(source.name)) return "pdf";
    if (/\.(png|jpe?g|heic|heif|webp|gif|tiff?|bmp)$/i.test(source.name))
      return "image";
    if (/\.(txt|md|csv|tsv|json|xml|html?)$/i.test(source.name)) return "text";
  }
  return "other";
}
