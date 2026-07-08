import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/** GET /api/flashcards?runId=1 or ?libraryItemId=2 → rows with missed counts */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const runIdRaw = url.searchParams.get("runId");
  const libIdRaw = url.searchParams.get("libraryItemId");
  const runId = runIdRaw !== null ? Number(runIdRaw) : null;
  const libId = libIdRaw !== null ? Number(libIdRaw) : null;
  const useRun = runId !== null && Number.isFinite(runId);
  const useLib = libId !== null && Number.isFinite(libId);
  if (!useRun && !useLib)
    return NextResponse.json({ error: "valid runId or libraryItemId required" }, { status: 400 });
  const db = getDb();
  const rows = useRun
    ? db.prepare("SELECT * FROM flashcard_reviews WHERE run_id = ?").all(runId)
    : db.prepare("SELECT * FROM flashcard_reviews WHERE library_item_id = ?").all(libId);
  return NextResponse.json(rows);
}

/** POST { runId?|libraryItemId?, results: [{front, back, missed: boolean}] } */
export async function POST(req: Request) {
  const { runId, libraryItemId, results } = await req.json() as
    { runId?: unknown; libraryItemId?: unknown; results?: unknown };
  const useRun = typeof runId === "number" && Number.isFinite(runId);
  const useLib = typeof libraryItemId === "number" && Number.isFinite(libraryItemId);
  if (!useRun && !useLib)
    return NextResponse.json({ error: "runId or libraryItemId required" }, { status: 400 });
  if (!Array.isArray(results) || !results.every(r =>
    r && typeof r === "object" &&
    typeof (r as { front?: unknown }).front === "string" && (r as { front: string }).front.trim() !== "" &&
    typeof (r as { back?: unknown }).back === "string" && (r as { back: string }).back.trim() !== ""
  ))
    return NextResponse.json({ error: "results must be an array of {front, back} with non-empty strings" }, { status: 400 });
  const cards = results as { front: string; back: string; missed?: boolean }[];
  const db = getDb();
  const col = useRun ? "run_id" : "library_item_id";
  const key = useRun ? (runId as number) : (libraryItemId as number);
  db.transaction(() => {
    for (const r of cards) {
      const existing = db.prepare(`SELECT id, missed FROM flashcard_reviews WHERE ${col} = ? AND front = ?`).get(key, r.front) as { id: number; missed: number } | undefined;
      if (existing) {
        // Refresh back text too, so a regenerated deck doesn't leave stale answers.
        db.prepare("UPDATE flashcard_reviews SET back = ?, missed = ?, last_reviewed = datetime('now') WHERE id = ?")
          .run(r.back, r.missed ? existing.missed + 1 : existing.missed, existing.id);
      } else {
        db.prepare(`INSERT INTO flashcard_reviews (${col}, front, back, missed) VALUES (?,?,?,?)`)
          .run(key, r.front, r.back, r.missed ? 1 : 0);
      }
    }
  })();
  return NextResponse.json({ ok: true });
}
