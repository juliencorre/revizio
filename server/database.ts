import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AiJob, LearningData, SessionUser } from "../src/domain/model";
import {
  emptyLearningData,
  HttpError,
  isoNow,
  type AiSettings,
  type AuthSession,
  type DataEnvelope,
  type StoredJob,
  type StoredProfile,
  type StoredUpload,
} from "./types";

export class FamilyDatabase {
  readonly db: DatabaseSync;
  readonly filesDir: string;
  constructor(readonly dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.filesDir = join(dataDir, "private");
    mkdirSync(this.filesDir, { recursive: true, mode: 0o700 });
    const path = join(dataDir, "family.sqlite");
    this.db = new DatabaseSync(path, { timeout: 5000 });
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, name TEXT NOT NULL, settings TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS parents (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE, name TEXT NOT NULL, grade TEXT NOT NULL, pin_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE, parent_id TEXT REFERENCES parents(id) ON DELETE CASCADE, profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, role TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS learning (profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, metadata TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, metadata TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS jobs_family ON jobs(family_id);
    `);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  needsSetup(): boolean {
    return !this.db.prepare("SELECT id FROM families LIMIT 1").get();
  }
  setup(input: {
    parentName: string;
    email: string;
    passwordHash: string;
    childName: string;
    grade: string;
    pinHash: string;
    settings: AiSettings;
  }) {
    return this.transaction(() => {
      if (!this.needsSetup())
        throw new HttpError(
          409,
          "L’espace familial est déjà créé. Connectez-vous.",
        );
      const familyId = randomUUID(),
        parentId = randomUUID(),
        profileId = randomUUID();
      this.db
        .prepare("INSERT INTO families VALUES (?,?,?,?)")
        .run(
          familyId,
          input.parentName,
          JSON.stringify(input.settings),
          isoNow(),
        );
      this.db
        .prepare("INSERT INTO parents VALUES (?,?,?,?,?)")
        .run(
          parentId,
          familyId,
          input.email,
          input.parentName,
          input.passwordHash,
        );
      this.addProfile(familyId, {
        id: profileId,
        name: input.childName,
        grade: input.grade,
        pinHash: input.pinHash,
      });
      return {
        id: parentId,
        familyId,
        role: "parent" as const,
        name: input.parentName,
        email: input.email,
      };
    });
  }
  parentByEmail(
    email: string,
  ): (SessionUser & { passwordHash: string }) | undefined {
    const row = this.db
      .prepare("SELECT * FROM parents WHERE email=?")
      .get(email);
    return row
      ? {
          id: String(row.id),
          familyId: String(row.family_id),
          name: String(row.name),
          email: String(row.email),
          role: "parent",
          passwordHash: String(row.password_hash),
        }
      : undefined;
  }
  profiles(familyId?: string): StoredProfile[] {
    const rows = familyId
      ? this.db
          .prepare("SELECT * FROM profiles WHERE family_id=? ORDER BY rowid")
          .all(familyId)
      : this.db.prepare("SELECT * FROM profiles ORDER BY rowid").all();
    return rows.map((row) => ({
      id: String(row.id),
      familyId: String(row.family_id),
      name: String(row.name),
      grade: String(row.grade),
      pinHash: String(row.pin_hash),
    }));
  }
  profile(id: string): StoredProfile | undefined {
    return this.profiles().find((profile) => profile.id === id);
  }
  addProfile(
    familyId: string,
    input: { id?: string; name: string; grade: string; pinHash: string },
  ) {
    const id = input.id ?? randomUUID();
    this.db
      .prepare("INSERT INTO profiles VALUES (?,?,?,?,?)")
      .run(id, familyId, input.name, input.grade, input.pinHash);
    this.db
      .prepare("INSERT INTO learning VALUES (?,?,0,?)")
      .run(id, JSON.stringify(emptyLearningData()), isoNow());
    return this.profile(id)!;
  }
  updateProfile(
    id: string,
    input: { name: string; grade: string; pinHash?: string },
  ) {
    this.db
      .prepare(
        "UPDATE profiles SET name=?,grade=?,pin_hash=COALESCE(?,pin_hash) WHERE id=?",
      )
      .run(input.name, input.grade, input.pinHash ?? null, id);
    if (input.pinHash)
      this.db.prepare("DELETE FROM sessions WHERE profile_id=?").run(id);
    return this.profile(id)!;
  }
  deleteProfile(id: string) {
    this.db.prepare("DELETE FROM profiles WHERE id=?").run(id);
  }
  createSession(tokenHash: string, user: SessionUser, expiresAt: string) {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(isoNow());
    this.db
      .prepare("INSERT INTO sessions VALUES (?,?,?,?,?,?)")
      .run(
        tokenHash,
        user.familyId,
        user.role === "parent" ? user.id : null,
        user.profileId ?? null,
        user.role,
        expiresAt,
      );
  }
  session(tokenHash: string): AuthSession | undefined {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?")
      .get(tokenHash, isoNow());
    if (!row) return undefined;
    if (row.role === "parent") {
      const parent = this.db
        .prepare("SELECT * FROM parents WHERE id=?")
        .get(String(row.parent_id));
      return parent
        ? {
            tokenHash,
            user: {
              id: String(parent.id),
              familyId: String(parent.family_id),
              name: String(parent.name),
              email: String(parent.email),
              role: "parent",
            },
          }
        : undefined;
    }
    const profile = this.profile(String(row.profile_id));
    return profile
      ? {
          tokenHash,
          user: {
            id: profile.id,
            profileId: profile.id,
            familyId: profile.familyId,
            name: profile.name,
            role: "child",
          },
        }
      : undefined;
  }
  deleteSession(hash: string) {
    this.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash);
  }
  data(profileId: string): DataEnvelope {
    const row = this.db
      .prepare("SELECT * FROM learning WHERE profile_id=?")
      .get(profileId);
    if (!row) throw new HttpError(404, "Ce profil est introuvable.");
    return {
      data: JSON.parse(String(row.data)) as LearningData,
      revision: Number(row.revision),
    };
  }
  saveData(
    profileId: string,
    data: LearningData,
    revision: number,
  ): DataEnvelope {
    return this.transaction(() => {
      const current = this.data(profileId);
      if (current.revision !== revision)
        throw new HttpError(
          409,
          "Les données ont changé sur un autre appareil. Votre travail est conservé pour fusion.",
          current as unknown as Record<string, unknown>,
        );
      this.db
        .prepare(
          "UPDATE learning SET data=?, revision=revision+1, updated_at=? WHERE profile_id=?",
        )
        .run(JSON.stringify(data), isoNow(), profileId);
      return { data, revision: revision + 1 };
    });
  }
  settings(familyId: string): AiSettings {
    const row = this.db
      .prepare("SELECT settings FROM families WHERE id=?")
      .get(familyId);
    if (!row) throw new HttpError(404, "Espace familial introuvable.");
    return JSON.parse(String(row.settings));
  }
  saveSettings(familyId: string, settings: AiSettings) {
    this.db
      .prepare("UPDATE families SET settings=? WHERE id=?")
      .run(JSON.stringify(settings), familyId);
  }
  saveUpload(upload: StoredUpload) {
    this.db
      .prepare("INSERT OR REPLACE INTO uploads VALUES (?,?,?,?)")
      .run(
        upload.id,
        upload.familyId,
        upload.profileId,
        JSON.stringify(upload),
      );
  }
  upload(id: string): StoredUpload | undefined {
    const row = this.db
      .prepare("SELECT metadata FROM uploads WHERE id=?")
      .get(id);
    return row ? JSON.parse(String(row.metadata)) : undefined;
  }
  uploads(familyId: string): StoredUpload[] {
    return this.db
      .prepare("SELECT metadata FROM uploads WHERE family_id=?")
      .all(familyId)
      .map((row) => JSON.parse(String(row.metadata)));
  }
  deleteUpload(id: string) {
    this.db.prepare("DELETE FROM uploads WHERE id=?").run(id);
  }
  saveJob(job: StoredJob) {
    this.db
      .prepare("INSERT OR REPLACE INTO jobs VALUES (?,?,?,?)")
      .run(job.id, job.familyId, job.profileId, JSON.stringify(job));
  }
  job(id: string): StoredJob | undefined {
    const row = this.db.prepare("SELECT metadata FROM jobs WHERE id=?").get(id);
    return row ? JSON.parse(String(row.metadata)) : undefined;
  }
  jobs(familyId?: string): StoredJob[] {
    return (
      familyId
        ? this.db
            .prepare(
              "SELECT metadata FROM jobs WHERE family_id=? ORDER BY rowid DESC",
            )
            .all(familyId)
        : this.db.prepare("SELECT metadata FROM jobs ORDER BY rowid DESC").all()
    ).map((row) => JSON.parse(String(row.metadata)));
  }
  updateJob(id: string, update: Partial<AiJob>) {
    const job = this.job(id);
    if (job) this.saveJob({ ...job, ...update, updatedAt: isoNow() });
  }
  deleteFamily(familyId: string) {
    this.db.prepare("DELETE FROM families WHERE id=?").run(familyId);
  }
}
