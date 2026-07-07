import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/** GET /api/flashcards?runId=1 or ?libraryItemId=2 → rows with missed counts */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const libId = url.searchParams.get("libraryItemId");
  const db = getDb();
  const rows = runId
    ? db.prepare("SELECT * FROM flashcard_reviews WHERE run_id = ?").all(Number(runId))
    : db.prepare("SELECT * FROM flashcard_reviews WHERE library_item_id = ?").all(Number(libId));
  return NextResponse.json(rows);
}

/** POST { runId?|libraryItemId?, results: [{front, back, missed: boolean}] } */
export async function POST(req: Request) {
  const { runId, libraryItemId, results } = await req.json() as
    { runId?: number; libraryItemId?: number; results: { front: string; back: string; missed: boolean }[] };
  if (!runId && !libraryItemId) return NextResponse.json({ error: "runId or libraryItemId required" }, { status: 400 });
  const db = getDb();
  const col = runId ? "run_id" : "library_item_id";
  const key = runId ?? libraryItemId;
  db.transaction(() => {
    for (const r of results) {
      const existing = db.prepare(`SELECT id, missed FROM flashcard_reviews WHERE ${col} = ? AND front = ?`).get(key, r.front) as { id: number; missed: number } | undefined;
      if (existing) {
        db.prepare("UPDATE flashcard_reviews SET missed = ?, last_reviewed = datetime('now') WHERE id = ?")
          .run(r.missed ? existing.missed + 1 : existing.missed, existing.id);
      } else {
        db.prepare(`INSERT INTO flashcard_reviews (${col}, front, back, missed) VALUES (?,?,?,?)`)
          .run(key, r.front, r.back, r.missed ? 1 : 0);
      }
    }
  })();
  return NextResponse.json({ ok: true });
}
