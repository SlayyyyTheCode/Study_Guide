import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB, createWorkflow } from "@/lib/db";
import { ensureCategory, createLibraryItem } from "@/lib/library";
import { getWeakSpots } from "@/lib/weakspots";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); });

describe("getWeakSpots", () => {
  it("selects due, never-reviewed, and high-miss cards; excludes freshly-scheduled ones", () => {
    const cat = ensureCategory(db, "Bio");
    const item = createLibraryItem(db, { title: "Cells", kind: "file", content_md: "x", categoryId: cat.id });
    db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, missed, next_review_at) VALUES (?,?,?,?,?)")
      .run(item.id, "due-card", "a", 0, "2000-01-01 00:00:00");
    db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, missed, next_review_at) VALUES (?,?,?,?,?)")
      .run(item.id, "never-reviewed", "a", 0, null);
    db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, missed, next_review_at) VALUES (?,?,?,?,?)")
      .run(item.id, "high-miss", "a", 3, "2999-01-01 00:00:00");
    db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, missed, next_review_at) VALUES (?,?,?,?,?)")
      .run(item.id, "fresh-scheduled", "a", 0, "2999-01-01 00:00:00");
    const { cards } = getWeakSpots(db);
    expect(cards.map(c => c.front).sort()).toEqual(["due-card", "high-miss", "never-reviewed"]);
  });

  it("only includes quiz_attempts explicitly marked incorrect", () => {
    const wf = createWorkflow(db, "Test WF");
    const runId = Number(db.prepare(
      "INSERT INTO runs (workflow_id, node_id, method, brain, model) VALUES (?,?,?,?,?)"
    ).run(wf.id, "n1", "quiz", "ollama", "m").lastInsertRowid);
    db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct, feedback) VALUES (?,?,?,?,?)").run(runId, "Q right", "a", 1, "good");
    db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct, feedback) VALUES (?,?,?,?,?)").run(runId, "Q wrong", "b", 0, "bad");
    db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct, feedback) VALUES (?,?,?,?,?)").run(runId, "Q ungraded", "c", null, null);
    const { quizMisses } = getWeakSpots(db);
    expect(quizMisses.map(q => q.question)).toEqual(["Q wrong"]);
    expect(quizMisses[0].workflow_name).toBe("Test WF");
  });

  it("returns empty arrays when there is nothing due or missed", () => {
    expect(getWeakSpots(db)).toEqual({ cards: [], quizMisses: [] });
  });
});
