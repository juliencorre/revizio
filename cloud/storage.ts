import { Buffer } from "node:buffer";
import type { PrivateFiles, SqlDatabase, SqlValue } from "../server/runtime";
import { HttpError } from "../server/types";

/** Keep the existing repository's SQL and synchronous transactions on DO SQLite. */
export function sqlDatabase(storage: DurableObjectStorage): SqlDatabase {
  const sql = storage.sql;
  const bindings = (values: SqlValue[]) =>
    values.map((value) => (typeof value === "bigint" ? Number(value) : value));
  return {
    exec: (query) => {
      sql.exec(query);
    },
    prepare: (query) => ({
      get: (...values) => sql.exec(query, ...bindings(values)).toArray()[0],
      all: (...values) => sql.exec(query, ...bindings(values)).toArray(),
      run: (...values) => {
        sql.exec(query, ...bindings(values));
      },
    }),
    close() {},
  };
}

/** Small private family documents, chunked below the SQL row limit; never public assets. */
export class SqliteFiles implements PrivateFiles {
  constructor(private storage: DurableObjectStorage) {
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS private_files (path TEXT NOT NULL, part INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(path,part))",
    );
  }
  async read(path: string): Promise<Buffer> {
    const rows = this.storage.sql
      .exec<{ bytes: ArrayBuffer }>(
        "SELECT bytes FROM private_files WHERE path=? ORDER BY part",
        path,
      )
      .toArray();
    if (!rows.length)
      throw new HttpError(404, "Ce document privé est introuvable.");
    return Buffer.concat(rows.map((row) => Buffer.from(row.bytes)));
  }
  async write(path: string, input: Uint8Array | string): Promise<void> {
    const bytes = typeof input === "string" ? Buffer.from(input) : input;
    const used = this.storage.sql
      .exec<{ size: number }>(
        "SELECT COALESCE(SUM(length(bytes)),0) AS size FROM private_files WHERE path<>?",
        path,
      )
      .one().size;
    if (used + bytes.byteLength > 450 * 1024 * 1024)
      throw new HttpError(
        413,
        "Le stockage familial est plein (450 Mo). Supprimez des documents inutilisés après sauvegarde.",
      );
    this.storage.transactionSync(() => {
      this.storage.sql.exec("DELETE FROM private_files WHERE path=?", path);
      const chunkSize = 256 * 1024;
      for (
        let start = 0;
        start < Math.max(1, bytes.byteLength);
        start += chunkSize
      )
        this.storage.sql.exec(
          "INSERT INTO private_files VALUES (?,?,?)",
          path,
          start / chunkSize,
          bytes.subarray(start, start + chunkSize),
        );
    });
  }
  async mkdir(_path: string): Promise<void> {}
  async unlink(path: string): Promise<void> {
    this.storage.sql.exec("DELETE FROM private_files WHERE path=?", path);
  }
  async removeDirectory(path: string): Promise<void> {
    // Substring comparison avoids LIKE wildcard/length semantics for paths.
    this.storage.sql.exec(
      "DELETE FROM private_files WHERE substr(path,1,?)=?",
      path.length + 1,
      path + "/",
    );
  }
}
