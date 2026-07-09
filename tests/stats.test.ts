import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB, createWorkflow } from "@/lib/db";
import { ensureCategory, createLibraryItem } from "@/lib/library";
import { getStats, computeStreak } from "@/lib/stats";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); });

describe("computeStreak", () => {
  const today = new Date("2026-07-08T12:00:00Z");
  it("counts consecutive days ending today", () => {
    expect(computeStreak(["2026-07-08", "2026-07-07", "2026-07-06"], today)).toBe(3);
  });
  it("still counts from yesterday if nothing happened yet today", () => {
    expect(computeStreak(["2026-07-07", "2026-07-06"], today)).toBe(2);
  });
  it("a gap before yesterday breaks the streak", () => {
    expect(computeStreak(["2026-07-05"], today)).toBe(0);
  });
  it("returns 0 for no activity", () => {
    expect(computeStreak([], today)).toBe(0);
  });
});

describe("getStats", () => {
  it("guards every ratio against zero data", () => {
    const stats = getStats(db);
    expect(stats.flashcardMastery).toEqual({ mastered: 0, total: 0 });
    expect(stats.quizScoreTrend).toEqual([]);
    expect(stats.weakestFlashcardCategories).toEqual([]);
    expect(stats.weakestQuizTopics).toEqual([]);
    expect(stats.studyMinutesAllTime).toBe(0);
  });

  it("counts mastered cards (repetitions >= 2) against total reviewed", () => {
    const cat = ensureCategory(db, "Bio");
    const item = createLibraryItem(db, { title: "Cells", kind: "file", content_md: "x", categoryId: cat.id });
    db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, repetitions) VALUES (?,?,?,?)").run(item.id, "a", "b", 3);
    db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, repetitions) VALUES (?,?,?,?)").run(item.id, "c", "d", 0);
    expect(getStats(db).flashcardMastery).toEqual({ mastered: 1, total: 2 });
  });

  it("builds quiz score trend only from graded (non-null correct) attempts", () => {
    const wf = createWorkflow(db, "WF");
    const runId = Number(db.prepare(
      "INSERT INTO runs (workflow_id, node_id, method, brain, model) VALUES (?,?,?,?,?)"
    ).run(wf.id, "n", "quiz", "ollama", "m").lastInsertRowid);
    db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct) VALUES (?,?,?,?)").run(runId, "q1", "a", 1);
    db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct) VALUES (?,?,?,?)").run(runId, "q2", "a", 0);
    db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct) VALUES (?,?,?,?)").run(runId, "q3", "a", null);
    const trend = getStats(db).quizScoreTrend;
    expect(trend).toHaveLength(1);
    expect(trend[0]).toMatchObject({ runId, correct: 1, total: 2 });
  });

  it("ranks weakest quiz topics by miss rate", () => {
    const wfGood = createWorkflow(db, "Good WF");
    const wfBad = createWorkflow(db, "Bad WF");
    const rGood = Number(db.prepare("INSERT INTO runs (workflow_id, node_id, method, brain, model) VALUES (?,?,?,?,?)").run(wfGood.id, "n", "quiz", "ollama", "m").lastInsertRowid);
    const rBad = Number(db.prepare("INSERT INTO runs (workflow_id, node_id, method, brain, model) VALUES (?,?,?,?,?)").run(wfBad.id, "n", "quiz", "ollama", "m").lastInsertRowid);
    db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct) VALUES (?,?,?,?)").run(rGood, "q", "a", 1);
    db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct) VALUES (?,?,?,?)").run(rBad, "q", "a", 0);
    expect(getStats(db).weakestQuizTopics[0].name).toBe("Bad WF");
  });
});
