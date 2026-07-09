import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { openDb, createWorkflow, listWorkflows, saveCanvas, getWorkflow, deleteWorkflow, migrateFlashcardReviewColumns } from "@/lib/db";

describe("db", () => {
  it("creates schema and round-trips a workflow", () => {
    const db = openDb(":memory:");
    const wf = createWorkflow(db, "Biology Ch.3");
    expect(wf.id).toBeGreaterThan(0);
    expect(listWorkflows(db).map(w => w.name)).toContain("Biology Ch.3");
    saveCanvas(db, wf.id, JSON.stringify({ nodes: [], edges: [] }));
    expect(JSON.parse(getWorkflow(db, wf.id)!.react_flow_json)).toEqual({ nodes: [], edges: [] });
  });

  it("deleteWorkflow cascades files, runs, quiz_attempts, and pomodoro_blocks", () => {
    const db = openDb(":memory:");
    const wf = createWorkflow(db, "To Delete");
    db.prepare(
      "INSERT INTO files (workflow_id, node_id, filename, path, mime) VALUES (?, 'n1', 'a.txt', '/tmp/a.txt', 'text/plain')"
    ).run(wf.id);
    const runInfo = db.prepare(
      "INSERT INTO runs (workflow_id, node_id, method, brain, model) VALUES (?, 'n2', 'quiz', 'claude', 'sonnet')"
    ).run(wf.id);
    const runId = Number(runInfo.lastInsertRowid);
    db.prepare(
      "INSERT INTO quiz_attempts (run_id, question, user_answer) VALUES (?, 'Q1?', 'A1')"
    ).run(runId);
    db.prepare(
      "INSERT INTO pomodoro_blocks (workflow_id, label, planned_min) VALUES (?, 'Block 1', 25)"
    ).run(wf.id);

    deleteWorkflow(db, wf.id);

    expect(getWorkflow(db, wf.id)).toBeUndefined();
    expect(db.prepare("SELECT COUNT(*) AS c FROM files WHERE workflow_id = ?").get(wf.id)).toEqual({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) AS c FROM runs WHERE workflow_id = ?").get(wf.id)).toEqual({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) AS c FROM quiz_attempts WHERE run_id = ?").get(runId)).toEqual({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) AS c FROM pomodoro_blocks WHERE workflow_id = ?").get(wf.id)).toEqual({ c: 0 });
  });

  it("migrateFlashcardReviewColumns adds SM-2 columns to a pre-v3 table and preserves existing rows", () => {
    const raw = new Database(":memory:");
    raw.exec(`CREATE TABLE flashcard_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER, library_item_id INTEGER,
      front TEXT NOT NULL, back TEXT NOT NULL, missed INTEGER NOT NULL DEFAULT 0,
      last_reviewed TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    raw.prepare(
      "INSERT INTO flashcard_reviews (front, back, missed, last_reviewed) VALUES (?, ?, ?, ?)"
    ).run("Q1", "A1", 1, "2020-01-01 00:00:00");

    migrateFlashcardReviewColumns(raw);

    const cols = (raw.prepare("PRAGMA table_info(flashcard_reviews)").all() as { name: string }[]).map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining(["ease_factor", "interval_days", "repetitions", "next_review_at"]));

    const row = raw.prepare("SELECT * FROM flashcard_reviews WHERE front = 'Q1'").get() as {
      front: string; back: string; missed: number; last_reviewed: string;
      ease_factor: number; interval_days: number; repetitions: number; next_review_at: string | null;
    };
    expect(row.front).toBe("Q1");
    expect(row.back).toBe("A1");
    expect(row.missed).toBe(1);
    expect(row.last_reviewed).toBe("2020-01-01 00:00:00");
    expect(row.ease_factor).toBe(2.5);
    expect(row.interval_days).toBe(0);
    expect(row.repetitions).toBe(0);
    expect(row.next_review_at).toBeTruthy();
    expect(row.next_review_at).toMatch(new RegExp(`^${new Date().toISOString().slice(0, 10)}`));

    raw.close();
  });
});
