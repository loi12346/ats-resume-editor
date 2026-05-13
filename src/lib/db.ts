import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { cloneStarterResume } from "./defaultResume";
import { normalizeResumeData } from "./resumeData";
import type { ResumeData, ResumeListItem, ResumeVersion } from "./types";

const dbPath = join(process.cwd(), "data", "resume-editor.sqlite");

let database: DatabaseSync | null = null;

function getDatabase() {
  if (!database) {
    mkdirSync(dirname(dbPath), { recursive: true });
    database = new DatabaseSync(dbPath);
    database.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        target_role TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS resume_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id INTEGER NOT NULL,
        section_type TEXT NOT NULL,
        position INTEGER NOT NULL,
        FOREIGN KEY (version_id) REFERENCES resume_versions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
      );
    `);
    seedDefaults(database);
  }

  return database;
}

function seedDefaults(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM resume_versions").get()?.count;
  if (Number(count) > 0) return;

  const defaults = [
    { profile: "General", role: "General", version: "General Base" },
    { profile: "Sales CS", role: "Sales / Customer Success", version: "Sales CS Base" },
    { profile: "Product Ops", role: "Product / Operations", version: "Product Ops Base" },
    { profile: "Tech AI Builder", role: "Tech / AI Builder", version: "Tech AI Builder Base" },
  ];

  for (const item of defaults) {
    const profileId = upsertProfile(db, item.profile, item.role);
    const versionId = insertVersion(db, profileId, item.version, cloneStarterResume(item.role));
    syncSections(db, versionId, cloneStarterResume(item.role));
  }
}

function parseData(dataJson: unknown): ResumeData {
  return normalizeResumeData(JSON.parse(String(dataJson)) as ResumeData);
}

function rowToVersion(row: Record<string, unknown>): ResumeVersion {
  return {
    id: Number(row.id),
    profileId: Number(row.profile_id),
    profileName: String(row.profile_name),
    targetRole: String(row.target_role),
    name: String(row.name),
    data: parseData(row.data_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function upsertProfile(db: DatabaseSync, name: string, targetRole: string) {
  db.prepare(
    "INSERT INTO profiles (name, target_role) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET target_role = excluded.target_role",
  ).run(name, targetRole);
  const row = db.prepare("SELECT id FROM profiles WHERE name = ?").get(name);
  return Number(row?.id);
}

function insertVersion(db: DatabaseSync, profileId: number, name: string, data: ResumeData) {
  const normalized = normalizeResumeData(data);
  const result = db
    .prepare("INSERT INTO resume_versions (profile_id, name, data_json) VALUES (?, ?, ?)")
    .run(profileId, name, JSON.stringify(normalized));
  return Number(result.lastInsertRowid);
}

function syncSections(db: DatabaseSync, versionId: number, data: ResumeData) {
  const normalized = normalizeResumeData(data);
  const sectionDefs: Array<{ type: string; values: unknown[] }> = [
    { type: "summary", values: [{ summary: normalized.summary }] },
    { type: "experience", values: normalized.experience },
    { type: "projects", values: normalized.projects },
    { type: "education", values: normalized.education },
    { type: "skills", values: [{ hardSkills: normalized.hardSkills, softSkills: normalized.softSkills }] },
  ];

  db.prepare("DELETE FROM items WHERE section_id IN (SELECT id FROM sections WHERE version_id = ?)").run(versionId);
  db.prepare("DELETE FROM sections WHERE version_id = ?").run(versionId);

  sectionDefs.forEach((section, sectionIndex) => {
    const sectionResult = db
      .prepare("INSERT INTO sections (version_id, section_type, position) VALUES (?, ?, ?)")
      .run(versionId, section.type, sectionIndex);
    const sectionId = Number(sectionResult.lastInsertRowid);

    section.values.forEach((value, itemIndex) => {
      db.prepare("INSERT INTO items (section_id, position, data_json) VALUES (?, ?, ?)").run(
        sectionId,
        itemIndex,
        typeof value === "string" ? JSON.stringify({ value }) : JSON.stringify(value),
      );
    });
  });
}

export function listVersions(): ResumeListItem[] {
  const rows = getDatabase()
    .prepare(
      `SELECT rv.id, rv.profile_id, p.name AS profile_name, p.target_role, rv.name, rv.created_at, rv.updated_at, rv.data_json
       FROM resume_versions rv
       JOIN profiles p ON p.id = rv.profile_id
       ORDER BY rv.updated_at DESC, rv.id DESC`,
    )
    .all();

  return rows.map((row) => {
    const data = parseData(row.data_json);
    return {
      id: Number(row.id),
      profileId: Number(row.profile_id),
      profileName: String(row.profile_name),
      targetRole: String(row.target_role),
      name: String(row.name),
      previewName: data.contact.fullName,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  });
}

export function getVersion(id: number): ResumeVersion | null {
  const row = getDatabase()
    .prepare(
      `SELECT rv.id, rv.profile_id, p.name AS profile_name, p.target_role, rv.name, rv.data_json, rv.created_at, rv.updated_at
       FROM resume_versions rv
       JOIN profiles p ON p.id = rv.profile_id
       WHERE rv.id = ?`,
    )
    .get(id);

  return row ? rowToVersion(row) : null;
}

export function createVersion(input: {
  profileName: string;
  targetRole: string;
  name: string;
  data?: ResumeData;
}) {
  const db = getDatabase();
  const data = normalizeResumeData(input.data ?? cloneStarterResume(input.targetRole));
  const profileId = upsertProfile(db, input.profileName.trim() || "General", input.targetRole.trim() || "General");
  const name = input.name.trim() || "Untitled Version";
  const duplicate = db
    .prepare(
      `SELECT id
       FROM resume_versions
       WHERE profile_id = ? AND name = ? AND created_at >= datetime('now', '-5 seconds')
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(profileId, name);

  if (duplicate?.id) return getVersion(Number(duplicate.id));

  const versionId = insertVersion(db, profileId, name, data);
  syncSections(db, versionId, data);
  return getVersion(versionId);
}

export function updateVersion(
  id: number,
  input: {
    profileName: string;
    targetRole: string;
    name: string;
    data: ResumeData;
  },
) {
  const db = getDatabase();
  const data = normalizeResumeData(input.data);
  const profileId = upsertProfile(db, input.profileName.trim() || "General", input.targetRole.trim() || "General");
  db.prepare(
    `UPDATE resume_versions
     SET profile_id = ?, name = ?, data_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(profileId, input.name.trim() || "Untitled Version", JSON.stringify(data), id);
  syncSections(db, id, data);
  return getVersion(id);
}

export function deleteVersion(id: number) {
  const db = getDatabase();
  db.prepare("DELETE FROM items WHERE section_id IN (SELECT id FROM sections WHERE version_id = ?)").run(id);
  db.prepare("DELETE FROM sections WHERE version_id = ?").run(id);
  return db.prepare("DELETE FROM resume_versions WHERE id = ?").run(id).changes > 0;
}
