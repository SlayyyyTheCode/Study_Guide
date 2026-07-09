import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "@/lib/db";
import { upsertFlashcardResult } from "@/lib/flashcardReviews";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); });

describe("upsertFlashcardResult", () => {
  it("creates a new library-scoped row with SM-2 defaults on first Got it", () => {
    upsertFlashcardResult(db, { libraryItemId: 1 }, "Q", "A", false);
    const row = db.prepare("SELECT * FROM flashcard_reviews WHERE library_item_id = 1 AND front = 'Q'").get() as
      { repetitions: number; interval_days: number; ease_factor: number; next_review_at: string };
    expect(row.repetitions).toBe(1);
    expect(row.interval_days).toBe(1);
    expect(row.ease_factor).toBeCloseTo(2.6);
    expect(row.next_review_at).toBeTruthy();
  });

  it("advances scheduling across repeated Got it answers, then resets on Missed", () => {
    upsertFlashcardResult(db, { libraryItemId: 1 }, "Q", "A", false); // rep 1, interval 1
    upsertFlashcardResult(db, { libraryItemId: 1 }, "Q", "A", false); // rep 2, interval 6
    upsertFlashcardResult(db, { libraryItemId: 1 }, "Q", "A", true);  // missed → reset
    const row = db.prepare("SELECT * FROM flashcard_reviews WHERE library_item_id = 1 AND front = 'Q'").get() as
      { repetitions: number; interval_days: number };
    expect(row.repetitions).toBe(0);
    expect(row.interval_days).toBe(1);
  });

  it("run-scoped rows are never scheduled (no SM-2 progression)", () => {
    upsertFlashcardResult(db, { runId: 1 }, "Q", "A", false);
    const row = db.prepare("SELECT * FROM flashcard_reviews WHERE run_id = 1 AND front = 'Q'").get() as
      { repetitions: number; ease_factor: number };
    expect(row.repetitions).toBe(0);
    expect(row.ease_factor).toBe(2.5);
  });

  it("increments the missed counter and refreshes back text on repeat misses", () => {
    upsertFlashcardResult(db, { libraryItemId: 2 }, "Q2", "old back", true);
    upsertFlashcardResult(db, { libraryItemId: 2 }, "Q2", "new back", true);
    const row = db.prepare("SELECT * FROM flashcard_reviews WHERE library_item_id = 2 AND front = 'Q2'").get() as
      { missed: number; back: string };
    expect(row.missed).toBe(2);
    expect(row.back).toBe("new back");
  });
});
