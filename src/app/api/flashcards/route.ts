import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { upsertFlashcardResult } from "@/lib/flashcardReviews";

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

interface ResultRow { front: string; back: string; missed: boolean; runId?: number; libraryItemId?: number; }

/** POST { runId?|libraryItemId?, results: [{front, back, missed: boolean, runId?, libraryItemId?}] } */
export async function POST(req: Request) {
  const { runId, libraryItemId, results } = await req.json() as
    { runId?: unknown; libraryItemId?: unknown; results?: unknown };
  const topRunId = typeof runId === "number" && Number.isFinite(runId) ? runId : undefined;
  const topLibId = typeof libraryItemId === "number" && Number.isFinite(libraryItemId) ? libraryItemId : undefined;

  if (!Array.isArray(results) || results.length === 0)
    return NextResponse.json({ error: "results must be a non-empty array" }, { status: 400 });

  const rows: ResultRow[] = [];
  for (const r of results) {
    if (!r || typeof r !== "object")
      return NextResponse.json({ error: "invalid result row" }, { status: 400 });
    const front = (r as { front?: unknown }).front;
    const back = (r as { back?: unknown }).back;
    if (typeof front !== "string" || front.trim() === "" || typeof back !== "string" || back.trim() === "")
      return NextResponse.json({ error: "results must be an array of {front, back} with non-empty strings" }, { status: 400 });
    const rowLibIdRaw = (r as { libraryItemId?: unknown }).libraryItemId;
    const rowRunIdRaw = (r as { runId?: unknown }).runId;
    const rowLibId = typeof rowLibIdRaw === "number" && Number.isFinite(rowLibIdRaw) ? rowLibIdRaw : topLibId;
    const rowRunId = typeof rowRunIdRaw === "number" && Number.isFinite(rowRunIdRaw) ? rowRunIdRaw : topRunId;
    if (rowLibId === undefined && rowRunId === undefined)
      return NextResponse.json({ error: "each result needs a runId or libraryItemId (row-level or top-level)" }, { status: 400 });
    rows.push({ front, back, missed: !!(r as { missed?: unknown }).missed, runId: rowRunId, libraryItemId: rowLibId });
  }

  const db = getDb();
  db.transaction(() => {
    for (const row of rows) upsertFlashcardResult(db, { runId: row.runId, libraryItemId: row.libraryItemId }, row.front, row.back, row.missed);
  })();
  return NextResponse.json({ ok: true });
}
