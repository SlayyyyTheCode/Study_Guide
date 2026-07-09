import type { DB } from "./db";
import { applySm2 } from "./spacedRepetition";

interface ExistingRow { id: number; missed: number; ease_factor: number; interval_days: number; repetitions: number; }

/**
 * Upsert one flashcard's review outcome by its natural key (front text within
 * a run or library item). Library-scoped rows (`libraryItemId`) get real SM-2
 * scheduling since they're saved, recurring decks; run-scoped rows (`runId`,
 * unsaved in-thread decks) skip scheduling entirely — spec §3.
 */
export function upsertFlashcardResult(
  db: DB,
  key: { runId?: number; libraryItemId?: number },
  front: string, back: string, missed: boolean,
): void {
  const col = key.libraryItemId !== undefined ? "library_item_id" : "run_id";
  const id = key.libraryItemId ?? key.runId;
  const existing = db.prepare(
    `SELECT id, missed, ease_factor, interval_days, repetitions FROM flashcard_reviews WHERE ${col} = ? AND front = ?`
  ).get(id, front) as ExistingRow | undefined;

  if (col === "library_item_id") {
    const sm2 = applySm2(
      existing ? { easeFactor: existing.ease_factor, intervalDays: existing.interval_days, repetitions: existing.repetitions } : undefined,
      missed,
    );
    if (existing) {
      db.prepare(`
        UPDATE flashcard_reviews
        SET back = ?, missed = ?, ease_factor = ?, interval_days = ?, repetitions = ?,
            next_review_at = datetime('now', '+' || ? || ' days'), last_reviewed = datetime('now')
        WHERE id = ?
      `).run(back, missed ? existing.missed + 1 : existing.missed, sm2.easeFactor, sm2.intervalDays, sm2.repetitions, sm2.intervalDays, existing.id);
    } else {
      db.prepare(`
        INSERT INTO flashcard_reviews (library_item_id, front, back, missed, ease_factor, interval_days, repetitions, next_review_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+' || ? || ' days'))
      `).run(id, front, back, missed ? 1 : 0, sm2.easeFactor, sm2.intervalDays, sm2.repetitions, sm2.intervalDays);
    }
    return;
  }

  if (existing) {
    db.prepare("UPDATE flashcard_reviews SET back = ?, missed = ?, last_reviewed = datetime('now') WHERE id = ?")
      .run(back, missed ? existing.missed + 1 : existing.missed, existing.id);
  } else {
    db.prepare("INSERT INTO flashcard_reviews (run_id, front, back, missed) VALUES (?, ?, ?, ?)")
      .run(id, front, back, missed ? 1 : 0);
  }
}
