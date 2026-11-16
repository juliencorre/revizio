import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  rm,
  stat,
  link,
} from "node:fs/promises";
import type { PrivateFiles } from "./runtime";
export const nodeFiles: PrivateFiles = {
  link,
  size: async (path) => (await stat(path)).size,
  read: (path) => readFile(path),
  write: (path, bytes) => writeFile(path, bytes, { mode: 0o600 }),
  mkdir: async (path) => {
    await mkdir(path, { recursive: true, mode: 0o700 });
  },
  unlink: async (path) => {
    await unlink(path);
  },
  removeDirectory: (path) => rm(path, { recursive: true, force: true }),
};
