import { officeText } from "./office-text";
import { HttpError } from "./types";

const textExt =
  /\.(txt|text|md|markdown|csv|tsv|json|jsonl|xml|html?|yaml|yml|tex|log|srt|vtt)$/i;
const tooLong = () =>
  new HttpError(
    413,
    "Le texte est trop long. Séparez le document en plusieurs chapitres.",
  );

// Never decode a binary document as replacement characters or serve uploaded markup as HTML.
export function decodeDocumentText(buffer: Buffer) {
  if (buffer.length > 560_004) throw tooLong();
  const encoding =
    buffer[0] === 0xff && buffer[1] === 0xfe
      ? "utf-16le"
      : buffer[0] === 0xfe && buffer[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  let value: string;
  try {
    value = new TextDecoder(encoding, { fatal: true }).decode(buffer);
  } catch {
    throw new HttpError(
      415,
      "Le fichier ne contient pas de texte Unicode lisible. Exportez-le en UTF-8 ou en PDF.",
    );
  }
  if (/[\u0000-\u0008\u000e-\u001f\u007f]/.test(value))
    throw new HttpError(
      415,
      "Ce fichier binaire ne peut pas être lu comme du texte. Exportez-le en PDF.",
    );
  if (value.length > 140_000) throw tooLong();
  if (!value.trim())
    throw new HttpError(422, "Le document ne contient aucun texte.");
  return value.trim();
}

export function documentText(
  buffer: Buffer,
  name: string,
  mime: string,
): string | null {
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 3 &&
    buffer[3] === 4
  )
    return officeText(buffer);
  if (
    /\.(docx?|pptx?|xlsx?|od[pts]|pages|numbers|key|rtf)$/i.test(name) ||
    buffer.subarray(0, 5).toString() === "{\\rtf"
  )
    throw new HttpError(
      415,
      "Ce document est illisible, protégé ou dans un ancien format. Exportez-le sans mot de passe en PDF ou au format Office récent.",
    );
  if (
    textExt.test(name) ||
    mime.startsWith("text/") ||
    /^application\/(?:[\w.-]+\+)?(?:json|xml)$/.test(mime)
  )
    return decodeDocumentText(buffer);
  return null;
}
