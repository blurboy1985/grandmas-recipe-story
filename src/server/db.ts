import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

let db: DatabaseSync | null = null;
let dbPath = "";

export function dataDir(): string {
  return process.env.DATA_DIR || "./data/app";
}

export function getDb(): DatabaseSync {
  const dir = dataDir();
  const path = join(dir, "app.sqlite");
  if (db && dbPath === path) return db;
  mkdirSync(dir, { recursive: true });
  const fresh = !existsSync(path);
  const handle = new DatabaseSync(path);
  handle.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  handle.exec(`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY, relative_path TEXT NOT NULL, photo_relative_path TEXT,
      sha256 TEXT NOT NULL, format TEXT NOT NULL, duration_ms INTEGER NOT NULL,
      byte_size INTEGER NOT NULL, consent_at TEXT NOT NULL, created_at TEXT NOT NULL,
      cook_name TEXT NOT NULL DEFAULT '', dish_name TEXT NOT NULL DEFAULT '', language_hint TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      mode TEXT NOT NULL, processing_state TEXT NOT NULL, approved_transcript_version_id TEXT,
      safe_error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcript_versions (
      id TEXT PRIMARY KEY, recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, text TEXT NOT NULL, segments_json TEXT NOT NULL,
      created_at TEXT NOT NULL, approved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS recipe_versions (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      transcript_version_id TEXT, input_hash TEXT NOT NULL, model TEXT NOT NULL,
      prompt_version TEXT NOT NULL, schema_version TEXT NOT NULL, output_json TEXT NOT NULL,
      review_state TEXT NOT NULL, created_at TEXT NOT NULL, usage_json TEXT
    );
    CREATE TABLE IF NOT EXISTS clarifications (
      id TEXT PRIMARY KEY, recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
      question TEXT NOT NULL, related_field TEXT NOT NULL, source_segment_ids_json TEXT NOT NULL,
      answer TEXT, answered_at TEXT, provenance TEXT NOT NULL DEFAULT 'model'
    );
    CREATE TABLE IF NOT EXISTS family_corrections (
      id TEXT PRIMARY KEY, recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
      target_field TEXT NOT NULL, previous_value_json TEXT NOT NULL, corrected_value_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_cache (
      cache_key TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL,
      result_ref TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tombstones (
      id TEXT PRIMARY KEY, relative_path TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  // Lightweight migration for DBs created before cook/dish columns existed.
  try {
    const rvCols = handle.prepare("PRAGMA table_info(recipe_versions)").all() as { name: string }[];
    if (!rvCols.some((c) => c.name === "usage_json")) handle.exec("ALTER TABLE recipe_versions ADD COLUMN usage_json TEXT");
  } catch { /* fresh schema may already include it below */ }
  try {
    const cols = handle.prepare("PRAGMA table_info(recordings)").all() as { name: string }[];
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("cook_name")) handle.exec("ALTER TABLE recordings ADD COLUMN cook_name TEXT NOT NULL DEFAULT ''");
    if (!names.has("dish_name")) handle.exec("ALTER TABLE recordings ADD COLUMN dish_name TEXT NOT NULL DEFAULT ''");
    if (!names.has("language_hint")) handle.exec("ALTER TABLE recordings ADD COLUMN language_hint TEXT NOT NULL DEFAULT ''");
  } catch { /* fresh schema already has columns */ }
  if (fresh || true) recoverInterrupted(handle);
  db = handle;
  dbPath = path;
  return handle;
}

function recoverInterrupted(handle: DatabaseSync) {
  try {
    handle.prepare(
      "UPDATE jobs SET processing_state='failed', safe_error_code='interrupted', updated_at=? WHERE processing_state IN ('transcribing','extracting')"
    ).run(new Date().toISOString());
    handle.prepare("DELETE FROM model_cache WHERE state='running'").run();
  } catch { /* tables may not exist on first run */ }
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
