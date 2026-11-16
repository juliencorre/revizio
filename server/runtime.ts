import type { FamilyDatabase } from "./database";
import type { JobQueue } from "./jobs";
import type { AiClient, AiSettings } from "./types";

export type SqlValue = string | number | bigint | null | Uint8Array;
export interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: SqlValue[]): Record<string, unknown> | undefined;
    all(...values: SqlValue[]): Record<string, unknown>[];
    run(...values: SqlValue[]): unknown;
  };
  close(): void;
}
export interface PrivateFiles {
  size(path: string): Promise<number>;
  freeBytes?(): number;
  /** Move bytes during the same SQLite transaction as metadata publication. */
  moveInTransaction?(from: string, to: string): void;
  link?(from: string, to: string): Promise<void>;
  read(path: string): Promise<Buffer>;
  write(path: string, bytes: Uint8Array | string): Promise<void>;
  mkdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
  removeDirectory(path: string): Promise<void>;
}
export interface ImageProcessor {
  normalize(bytes: Buffer, rotation?: number): Promise<Buffer>;
  validatePng(bytes: Buffer): Promise<void>;
}
export interface ServerRuntime {
  database: FamilyDatabase;
  ai: AiClient;
  queue: JobQueue;
  images: ImageProcessor;
  aiDefaults: AiSettings;
  aiProvider?: "ollama" | "anthropic" | "workers-ai";
  deployment?: "local" | "cloudflare";
  setupToken?: string;
  backupLimitBytes?: number;
  backupBodyLimitBytes?: number;
}
