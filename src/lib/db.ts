import Database from "better-sqlite3";
import path from "path";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  react_flow_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id),
  node_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  extracted_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  method TEXT NOT NULL,
  brain TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  result_md TEXT NOT NULL DEFAULT '',
  thread_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  correct INTEGER,
  feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pomodoro_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  planned_min INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT '📁',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS library_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_md TEXT NOT NULL,
  source_path TEXT,
  method TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER,
  library_item_id INTEGER,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  missed INTEGER NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review_at TEXT,
  last_reviewed TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Fresh databases get the SM-2 columns straight from CREATE TABLE above.
 * A user's existing data.sqlite predates them, so add them defensively —
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, hence the table_info check.
 */
export function migrateFlashcardReviewColumns(db: DB): void {
  const cols = (db.prepare("PRAGMA table_info(flashcard_reviews)").all() as { name: string }[]).map(c => c.name);
  if (!cols.includes("ease_factor")) db.exec("ALTER TABLE flashcard_reviews ADD COLUMN ease_factor REAL NOT NULL DEFAULT 2.5");
  if (!cols.includes("interval_days")) db.exec("ALTER TABLE flashcard_reviews ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 0");
  if (!cols.includes("repetitions")) db.exec("ALTER TABLE flashcard_reviews ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0");
  if (!cols.includes("next_review_at")) db.exec("ALTER TABLE flashcard_reviews ADD COLUMN next_review_at TEXT");
}

export function openDb(file: string): DB {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrateFlashcardReviewColumns(db);
  return db;
}

let singleton: DB | null = null;
export function getDb(): DB {
  if (!singleton) singleton = openDb(path.join(process.cwd(), "data.sqlite"));
  return singleton;
}

export interface WorkflowRow { id: number; name: string; react_flow_json: string; updated_at: string; }

export function createWorkflow(db: DB, name: string): WorkflowRow {
  const info = db.prepare("INSERT INTO workflows (name) VALUES (?)").run(name);
  return getWorkflow(db, Number(info.lastInsertRowid))!;
}
export function listWorkflows(db: DB): WorkflowRow[] {
  return db.prepare("SELECT * FROM workflows ORDER BY updated_at DESC").all() as WorkflowRow[];
}
export function getWorkflow(db: DB, id: number): WorkflowRow | undefined {
  return db.prepare("SELECT * FROM workflows WHERE id = ?").get(id) as WorkflowRow | undefined;
}
export function saveCanvas(db: DB, id: number, json: string): void {
  db.prepare("UPDATE workflows SET react_flow_json = ?, updated_at = datetime('now') WHERE id = ?").run(json, id);
}
export function deleteWorkflow(db: DB, id: number): void {
  db.transaction((wfId: number) => {
    db.prepare("DELETE FROM quiz_attempts WHERE run_id IN (SELECT id FROM runs WHERE workflow_id = ?)").run(wfId);
    for (const t of ["files", "runs", "chat_messages", "pomodoro_blocks"])
      db.prepare(`DELETE FROM ${t} WHERE workflow_id = ?`).run(wfId);
    db.prepare("DELETE FROM workflows WHERE id = ?").run(wfId);
  })(id);
}
