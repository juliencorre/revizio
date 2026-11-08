import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./types";
const scrypt = promisify(scryptCallback);
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(18).toString("hex");
  const key = (await scrypt(secret, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifySecret(
  secret: string,
  encoded: string,
): Promise<boolean> {
  const [kind, salt, key] = encoded.split(":");
  if (kind !== "scrypt" || !salt || !key || key.length !== 128) return false;
  const actual = (await scrypt(secret, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const newToken = () => randomBytes(32).toString("base64url");
export const tokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function requiredString(
  value: unknown,
  label: string,
  max = 200,
): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new HttpError(400, `${label} est manquant ou trop long.`);
  return value.trim();
}
export function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 10 || value.length > 256)
    throw new HttpError(
      400,
      "Le mot de passe doit contenir entre 10 et 256 caractères.",
    );
  return value;
}
export function validatePin(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4,8}$/.test(value))
    throw new HttpError(400, "Le code enfant doit contenir 4 à 8 chiffres.");
  return value;
}
export function validateEmail(value: unknown): string {
  const email = requiredString(value, "L’adresse e-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new HttpError(400, "L’adresse e-mail n’est pas valide.");
  return email;
}
export function objectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || !value || Array.isArray(value))
    throw new HttpError(400, "Les données envoyées sont invalides.");
  return value as Record<string, unknown>;
}
