# Study Guide v3 Implementation Plan — Spaced Repetition, Weak Spots, Analytics, Anki Export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SM-2 spaced repetition for saved flashcard decks, a cross-library weak-spot review session, a read-only analytics dashboard, and Anki TSV export — plus fix quiz grading to record real per-question correctness (a prerequisite both new features depend on).

**Architecture:** Everything is additive on the existing v1+v2 stack. New pure-lib modules (`spacedRepetition.ts`, `flashcardReviews.ts`, `weakspots.ts`, `stats.ts`, `anki.ts`) follow the project's established pattern (`library.ts`, `graph.ts`, `parse.ts`): DB/React-free, unit-tested directly against in-memory SQLite. Two new drawer-style panels (WeakSpotsPanel, StatsPanel) mirror the existing LibraryDrawer. No new dependencies.

**Tech Stack:** Existing stack unchanged (Next.js 15, React 19, better-sqlite3 v12, Vitest, @xyflow/react).

**Spec:** `docs/superpowers/specs/2026-07-08-v3-spaced-repetition-analytics-design.md`
**Baseline:** main @ 37e6892. Branch: `feature/app-v3`.

---

## File Structure

```
Modified:
  src/lib/db.ts                          — flashcard_reviews SM-2 columns + migration for pre-existing files
  src/lib/library.ts                     — listLibraryItems gains due_count per item
  src/lib/parse.ts                       — parseQuizResults
  src/lib/prompts.ts                     — QUIZ_SYSTEM requests a per-question results JSON block
  src/app/api/flashcards/route.ts        — per-row source override + SM-2 application (via flashcardReviews.ts)
  src/components/ResultPanel.tsx         — submitQuiz uses real correct/incorrect; passes title to FlashcardDeck
  src/components/renderers/FlashcardDeck.tsx — sourceIds + title props, Anki export button
  src/components/LibraryDrawer.tsx       — "N due" badge on flashcard items
  src/components/LibraryPreviewPanel.tsx — due-only filtering + title prop
  src/components/TopBar.tsx              — 🔥 Weak Spots and 📊 Stats buttons
  src/store.tsx                          — weakSpotsOpen, statsOpen
  src/app/page.tsx                       — mount WeakSpotsPanel, StatsPanel
  src/app/globals.css                    — due badge, weak-spot recap list, stats panel styles
Created:
  src/lib/spacedRepetition.ts            — applySm2 pure function
  src/lib/flashcardReviews.ts            — upsertFlashcardResult (SM-2-aware upsert)
  src/lib/weakspots.ts                   — getWeakSpots aggregation
  src/lib/stats.ts                       — getStats aggregation, computeStreak
  src/lib/anki.ts                        — cardsToTsv, sanitizeFilename
  src/lib/download.ts                    — downloadTextFile (browser Blob download)
  src/app/api/weakspots/route.ts
  src/app/api/stats/route.ts
  src/components/WeakSpotsPanel.tsx
  src/components/StatsPanel.tsx
Tests:
  tests/spacedRepetition.test.ts, tests/flashcardReviews.test.ts, tests/weakspots.test.ts,
  tests/stats.test.ts, tests/anki.test.ts (+ modify tests/db.test.ts, tests/parse.test.ts,
  tests/prompts.test.ts, tests/library.test.ts)
```

---

### Task 1: Schema migration + SM-2 pure function

**Files:**
- Modify: `src/lib/db.ts`
- Create: `src/lib/spacedRepetition.ts`
- Test: `tests/spacedRepetition.test.ts`, modify `tests/db.test.ts`

- [ ] **Step 1: Write the failing spacedRepetition test**

`tests/spacedRepetition.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { applySm2 } from "@/lib/spacedRepetition";

describe("applySm2", () => {
  it("first success schedules a 1-day interval and bumps ease by 0.1", () => {
    expect(applySm2(undefined, false)).toEqual({ easeFactor: 2.6, intervalDays: 1, repetitions: 1 });
  });
  it("second consecutive success schedules a 6-day interval", () => {
    const r = applySm2({ easeFactor: 2.6, intervalDays: 1, repetitions: 1 }, false);
    expect(r).toEqual({ easeFactor: 2.7, intervalDays: 6, repetitions: 2 });
  });
  it("third+ success rounds prevInterval times easeFactor", () => {
    const r = applySm2({ easeFactor: 2.7, intervalDays: 6, repetitions: 2 }, false);
    expect(r.repetitions).toBe(3);
    expect(r.intervalDays).toBe(Math.round(6 * 2.7));
    expect(r.easeFactor).toBeCloseTo(2.8);
  });
  it("a miss resets repetitions and interval to 1 day, ease unchanged", () => {
    const r = applySm2({ easeFactor: 2.8, intervalDays: 16, repetitions: 3 }, true);
    expect(r).toEqual({ easeFactor: 2.8, intervalDays: 1, repetitions: 0 });
  });
  it("ease factor never drops below the 1.3 floor", () => {
    const r = applySm2({ easeFactor: 1.3, intervalDays: 1, repetitions: 1 }, false);
    expect(r.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
  it("defaults missing state to ease 2.5 / interval 0 / repetitions 0", () => {
    expect(applySm2(null, false)).toEqual({ easeFactor: 2.6, intervalDays: 1, repetitions: 1 });
    expect(applySm2({}, true)).toEqual({ easeFactor: 2.5, intervalDays: 1, repetitions: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/spacedRepetition.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Write src/lib/spacedRepetition.ts**

```ts
export interface Sm2State { easeFactor: number; intervalDays: number; repetitions: number; }

/**
 * Binary-input SM-2. The UI only has Got it / Missed, not SM-2's native 0-5
 * quality scale, so `missed=false` maps to quality 5 (perfect) and
 * `missed=true` maps to quality 2 (fail) — the standard simplification for
 * binary-recall apps. Scheduling is expressed as a day-count interval; the
 * caller turns that into an actual date via SQL (`datetime('now', '+N days')`)
 * rather than computing dates here, so this function stays pure and
 * timezone/format-agnostic.
 */
export function applySm2(state: Partial<Sm2State> | undefined | null, missed: boolean): Sm2State {
  const easeFactor = state?.easeFactor ?? 2.5;
  const prevInterval = state?.intervalDays ?? 0;
  const prevRepetitions = state?.repetitions ?? 0;

  if (missed) {
    return { easeFactor, intervalDays: 1, repetitions: 0 };
  }
  const repetitions = prevRepetitions + 1;
  const intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(prevInterval * easeFactor);
  return { easeFactor: Math.max(1.3, easeFactor + 0.1), intervalDays, repetitions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/spacedRepetition.test.ts` — Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing migration test**

Append to `tests/db.test.ts` (add `import Database from "better-sqlite3";` and `import { migrateFlashcardReviewColumns } from "@/lib/db";` to its existing imports):
```ts
it("migrateFlashcardReviewColumns adds SM-2 columns to a pre-v3 table", () => {
  const raw = new Database(":memory:");
  raw.exec(`CREATE TABLE flashcard_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER, library_item_id INTEGER,
    front TEXT NOT NULL, back TEXT NOT NULL, missed INTEGER NOT NULL DEFAULT 0,
    last_reviewed TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  migrateFlashcardReviewColumns(raw);
  const cols = (raw.prepare("PRAGMA table_info(flashcard_reviews)").all() as { name: string }[]).map(c => c.name);
  expect(cols).toEqual(expect.arrayContaining(["ease_factor", "interval_days", "repetitions", "next_review_at"]));
  raw.close();
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/db.test.ts` — Expected: FAIL (`migrateFlashcardReviewColumns` not exported).

- [ ] **Step 7: Update src/lib/db.ts**

In the `SCHEMA` template string, replace the existing `flashcard_reviews` table with:
```sql
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
```

Add this function and call it from `openDb`:
```ts
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
```

In `openDb`, call it right after `db.exec(SCHEMA)`:
```ts
export function openDb(file: string): DB {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrateFlashcardReviewColumns(db);
  return db;
}
```

- [ ] **Step 8: Run all tests to verify pass**

Run: `npx vitest run` — Expected: all green (47 existing + 7 new = 54).

- [ ] **Step 9: Commit**

```bash
git add src/lib/db.ts src/lib/spacedRepetition.ts tests/spacedRepetition.test.ts tests/db.test.ts
git commit -m "feat: SM-2 spaced-repetition schema and pure scheduling function"
```

---

### Task 2: Quiz grading correct/incorrect fix

**Files:**
- Modify: `src/lib/parse.ts`, `src/lib/prompts.ts`, `src/components/ResultPanel.tsx`
- Test: modify `tests/parse.test.ts`, `tests/prompts.test.ts`

- [ ] **Step 1: Write the failing parser test**

Append to `tests/parse.test.ts` (add `parseQuizResults` to the existing import line):
```ts
it("parseQuizResults validates shape", () => {
  expect(parseQuizResults(wrap('{"results":[{"id":1,"correct":true},{"id":2,"correct":false}]}')))
    .toEqual([{ id: 1, correct: true }, { id: 2, correct: false }]);
  expect(parseQuizResults(wrap('{"results":"nope"}'))).toBeNull();
  expect(parseQuizResults(wrap('{"results":[{"id":1}]}'))).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/parse.test.ts` — Expected: FAIL (`parseQuizResults` not exported).

- [ ] **Step 3: Add parseQuizResults to src/lib/parse.ts**

Append:
```ts
export interface QuizResult { id: number; correct: boolean; }
export function parseQuizResults(md: string): QuizResult[] | null {
  const obj = parseJsonBlock<{ results?: unknown }>(md);
  if (!obj || !Array.isArray(obj.results)) return null;
  const ok = obj.results.every(r => r && typeof (r as QuizResult).id === "number" && typeof (r as QuizResult).correct === "boolean");
  return ok ? (obj.results as QuizResult[]) : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/parse.test.ts` — Expected: PASS.

- [ ] **Step 5: Write the failing prompts test**

Append to `tests/prompts.test.ts`:
```ts
it("quiz system requests a parseable per-question results block after grading", () => {
  const p = buildMethodPrompt("quiz", material, {});
  expect(p.system).toMatch(/"results"/);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/prompts.test.ts` — Expected: FAIL.

- [ ] **Step 7: Update QUIZ_SYSTEM in src/lib/prompts.ts**

Replace the existing `QUIZ_SYSTEM` constant with:
```ts
const QUIZ_SYSTEM = `${CONCISE_RULE}
You are a quiz generator and grader.
When asked to generate: output ONLY a JSON code block containing an array of questions:
\`\`\`json
[{"id":1,"type":"mcq","question":"...","choices":["A ...","B ...","C ...","D ..."],"answer":"A"},
 {"id":2,"type":"short","question":"...","answer":"expected key points"}]
\`\`\`
Question stems must stay under ~25 words. If the study material contains multiple "--- Title ---" sections, deliberately interleave questions across sections instead of grouping all questions from one source together — mixing topics during practice beats blocking one topic at a time.
When the student submits answers: grade each one in 1-2 sentences, state correct/incorrect, explain why, and end with a score line "SCORE: x/y". Then, on its own line, output one more fenced JSON block with the per-question results:
\`\`\`json
{"results":[{"id":1,"correct":true},{"id":2,"correct":false}]}
\`\`\`
Always include that results block after grading — it is read by the app, not shown to the student. Respond in markdown (JSON only for generation; prose + SCORE line + results block for grading).`;
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/prompts.test.ts` — Expected: PASS.

- [ ] **Step 9: Wire real correct/incorrect into ResultPanel.tsx**

Change the import line to add `parseQuizResults`:
```ts
import { parseCards, parseMindmap, parseQuizResults } from "@/lib/parse";
```

Replace `submitQuiz`:
```ts
async function submitQuiz() {
  if (!quiz) return;
  const answered = quiz;
  const answers = quizAnswers;
  const answerText = answered.map(q => `Q${q.id}: ${answers[q.id] ?? "(blank)"}`).join("\n");
  const feedback = await send(`My answers:\n${answerText}\n\nGrade them.`);
  const results = parseQuizResults(feedback);
  await fetch("/api/quiz", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runId: openRunId,
      attempts: answered.map(q => {
        const r = results?.find(x => x.id === q.id);
        return { question: q.question, user_answer: answers[q.id] ?? "", correct: r ? r.correct : null, feedback };
      }),
    }),
  });
}
```

- [ ] **Step 10: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: clean, all green.

```bash
git add src/lib/parse.ts src/lib/prompts.ts src/components/ResultPanel.tsx tests/parse.test.ts tests/prompts.test.ts
git commit -m "fix: quiz grading records real per-question correct/incorrect"
```

---

### Task 3: SM-2-aware flashcard upsert + API route

**Files:**
- Create: `src/lib/flashcardReviews.ts`
- Modify: `src/app/api/flashcards/route.ts`, `src/components/renderers/FlashcardDeck.tsx`
- Test: `tests/flashcardReviews.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/flashcardReviews.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flashcardReviews.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Write src/lib/flashcardReviews.ts**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/flashcardReviews.test.ts` — Expected: PASS.

- [ ] **Step 5: Rewrite src/app/api/flashcards/route.ts POST to use it, with per-row source overrides**

Keep the existing `GET` handler unchanged. Replace `POST`:
```ts
import { upsertFlashcardResult } from "@/lib/flashcardReviews";

interface ResultRow { front: string; back: string; missed: boolean; runId?: number; libraryItemId?: number; }

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
```

- [ ] **Step 6: Add sourceIds prop to FlashcardDeck.tsx for mixed-source posting**

Change the `Props` interface and completion-POST effect:
```tsx
interface Props { cards: Card[]; runId?: number; libraryItemId?: number; sourceIds?: number[]; title?: string; }

export default function FlashcardDeck({ cards, runId, libraryItemId, sourceIds, title }: Props) {
```

Replace the completion effect's fetch body:
```tsx
  useEffect(() => {
    if (!done || order.length === 0 || postedRef.current) return;
    postedRef.current = true;
    fetch("/api/flashcards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId, libraryItemId,
        results: order.map(i => ({
          front: cards[i].front, back: cards[i].back, missed: !!results[i],
          ...(sourceIds ? { libraryItemId: sourceIds[i] } : {}),
        })),
      }),
    }).catch(() => {});
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
```

(`title` is accepted but unused until Task 9 — TypeScript won't complain about an unused destructured prop that's part of a documented interface.)

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: clean, all green.

```bash
git add src/lib/flashcardReviews.ts src/app/api/flashcards/route.ts src/components/renderers/FlashcardDeck.tsx tests/flashcardReviews.test.ts
git commit -m "feat: SM-2 scheduling on flashcard review submit, mixed-source posting support"
```

---

### Task 4: Weak-spot aggregation + API route

**Files:**
- Create: `src/lib/weakspots.ts`, `src/app/api/weakspots/route.ts`
- Test: `tests/weakspots.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/weakspots.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/weakspots.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Write src/lib/weakspots.ts**

```ts
import type { DB } from "./db";

export interface WeakCard {
  id: number; front: string; back: string; missed: number;
  next_review_at: string | null; library_item_id: number;
  source_title: string; category_name: string;
}
export interface QuizMiss {
  question: string; user_answer: string; feedback: string | null;
  created_at: string; workflow_name: string;
}
export interface WeakSpots { cards: WeakCard[]; quizMisses: QuizMiss[]; }

export function getWeakSpots(db: DB): WeakSpots {
  const cards = db.prepare(`
    SELECT fr.id, fr.front, fr.back, fr.missed, fr.next_review_at, fr.library_item_id,
           li.title AS source_title, c.name AS category_name
    FROM flashcard_reviews fr
    JOIN library_items li ON li.id = fr.library_item_id
    JOIN categories c ON c.id = li.category_id
    WHERE fr.library_item_id IS NOT NULL
      AND (fr.next_review_at IS NULL OR fr.next_review_at <= datetime('now') OR fr.missed >= 2)
    ORDER BY (fr.next_review_at IS NULL) DESC, fr.next_review_at ASC, fr.missed DESC
    LIMIT 20
  `).all() as WeakCard[];

  const quizMisses = db.prepare(`
    SELECT qa.question, qa.user_answer, qa.feedback, qa.created_at, w.name AS workflow_name
    FROM quiz_attempts qa
    JOIN runs r ON r.id = qa.run_id
    JOIN workflows w ON w.id = r.workflow_id
    WHERE qa.correct = 0
    ORDER BY qa.created_at DESC
    LIMIT 20
  `).all() as QuizMiss[];

  return { cards, quizMisses };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/weakspots.test.ts` — Expected: PASS.

- [ ] **Step 5: Write src/app/api/weakspots/route.ts**

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getWeakSpots } from "@/lib/weakspots";

export async function GET() {
  return NextResponse.json(getWeakSpots(getDb()));
}
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: clean, all green.

```bash
git add src/lib/weakspots.ts src/app/api/weakspots tests/weakspots.test.ts
git commit -m "feat: weak-spot aggregation across all saved decks and quiz history"
```

---

### Task 5: Weak Spots panel

**Files:**
- Create: `src/components/WeakSpotsPanel.tsx`
- Modify: `src/store.tsx`, `src/components/TopBar.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Add weakSpotsOpen to src/store.tsx**

Add to the `AppState` interface:
```ts
  weakSpotsOpen: boolean;
  setWeakSpotsOpen: (v: boolean) => void;
```

Add to `AppProvider`'s state and provider value (same independent-boolean pattern as `drawerOpen`):
```ts
  const [weakSpotsOpen, setWeakSpotsOpen] = useState(false);
```
and add `weakSpotsOpen, setWeakSpotsOpen,` to the `Ctx.Provider value={{ ... }}` object.

- [ ] **Step 2: Write src/components/WeakSpotsPanel.tsx**

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/store";
import FlashcardDeck from "@/components/renderers/FlashcardDeck";

interface WeakCard {
  id: number; front: string; back: string; missed: number;
  next_review_at: string | null; library_item_id: number;
  source_title: string; category_name: string;
}
interface QuizMiss { question: string; user_answer: string; feedback: string | null; created_at: string; workflow_name: string; }

export default function WeakSpotsPanel() {
  const { weakSpotsOpen, setWeakSpotsOpen } = useApp();
  const [cards, setCards] = useState<WeakCard[]>([]);
  const [quizMisses, setQuizMisses] = useState<QuizMiss[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    fetch("/api/weakspots")
      .then(r => { if (!r.ok) throw new Error(`Could not load weak spots (${r.status})`); return r.json(); })
      .then((d: { cards: WeakCard[]; quizMisses: QuizMiss[] }) => { setCards(d.cards); setQuizMisses(d.quizMisses); })
      .catch(e => setError(e instanceof Error ? e.message : "Could not load weak spots"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (weakSpotsOpen) load(); }, [weakSpotsOpen, load]);

  useEffect(() => {
    if (!weakSpotsOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setWeakSpotsOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [weakSpotsOpen, setWeakSpotsOpen]);

  if (!weakSpotsOpen) return null;

  const deckCards = cards.map(c => ({ front: c.front, back: c.back }));
  const sourceIds = cards.map(c => c.library_item_id);

  return (
    <div className="result-panel">
      <div className="result-head">
        <strong>🔥 Weak Spots</strong>
        <button type="button" className="node-btn" onClick={() => setWeakSpotsOpen(false)} aria-label="Close weak spots">
          ✕ Close
        </button>
      </div>
      <div className="result-body">
        {loading && <p className="node-sub">Loading…</p>}
        {error && <p className="lib-error" role="alert">{error}</p>}
        {!loading && !error && cards.length === 0 && quizMisses.length === 0 && (
          <p className="lib-empty">Nothing due or missed right now — nice work! Come back after more study sessions.</p>
        )}
        {cards.length > 0 && (
          <>
            <h3>Due / struggling flashcards</h3>
            <FlashcardDeck cards={deckCards} sourceIds={sourceIds} title="weak-spot-review" />
          </>
        )}
        {quizMisses.length > 0 && (
          <>
            <h3>Recently missed quiz questions</h3>
            {quizMisses.map((q, i) => (
              <div key={i} className="weakspot-quiz-item">
                <div className="node-sub">{q.workflow_name} · {q.created_at.slice(0, 10)}</div>
                <p><b>Q:</b> {q.question}</p>
                <p><b>Your answer:</b> {q.user_answer}</p>
                {q.feedback && <p><b>Feedback:</b> {q.feedback}</p>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add TopBar button**

In `src/components/TopBar.tsx`, destructure `weakSpotsOpen, setWeakSpotsOpen` alongside the existing `drawerOpen, setDrawerOpen`, and add a button after the Library button:
```tsx
      <button type="button" onClick={() => setWeakSpotsOpen(!weakSpotsOpen)} aria-label="Toggle weak spots review">
        🔥 Weak Spots
      </button>
```

- [ ] **Step 4: Mount in src/app/page.tsx**

Add the import and render it as a sibling of the other panels:
```tsx
import WeakSpotsPanel from "@/components/WeakSpotsPanel";
```
```tsx
        <ResultPanel />
        <LibraryPreviewPanel />
        <LibraryDrawer />
        <WeakSpotsPanel />
```

- [ ] **Step 5: CSS**

Append to `src/app/globals.css`:
```css
.weakspot-quiz-item { border-top: 1px dashed var(--border); padding: 8px 0; font-size: 13px; }
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run && npx next build` — Expected: clean. Boot `npm run dev`, confirm `GET /` 200, kill server.

- [ ] **Step 7: Commit**

```bash
git add src/store.tsx src/components/TopBar.tsx src/components/WeakSpotsPanel.tsx src/app/page.tsx src/app/globals.css
git commit -m "feat: weak-spot review panel combining due flashcards and missed quiz recap"
```

---

### Task 6: Due badge in Library drawer + due-only preview

**Files:**
- Modify: `src/lib/library.ts`, `src/components/LibraryDrawer.tsx`, `src/components/LibraryPreviewPanel.tsx`, `src/app/globals.css`
- Test: modify `tests/library.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/library.test.ts`:
```ts
it("listLibraryItems reports due flashcard count per item", () => {
  const cat = ensureCategory(db, "Bio");
  const item = createLibraryItem(db, { title: "Cells", kind: "result", content_md: "{}", categoryId: cat.id, method: "flashcards" });
  db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, next_review_at) VALUES (?,?,?,?)").run(item.id, "f1", "b1", null);
  db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, next_review_at) VALUES (?,?,?,?)").run(item.id, "f2", "b2", "2999-01-01 00:00:00");
  const meta = listLibraryItems(db, {}).find(i => i.id === item.id)!;
  expect(meta.due_count).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/library.test.ts` — Expected: FAIL (`due_count` undefined).

- [ ] **Step 3: Update listLibraryItems in src/lib/library.ts**

Add `due_count: number;` to `LibraryItemMeta`:
```ts
export type LibraryItemMeta = Omit<LibraryItemRow, "content_md"> & { category_name: string; due_count: number };
```

Replace the `sql` template in `listLibraryItems`:
```ts
  const sql = `SELECT li.id, li.category_id, li.title, li.kind, li.source_path, li.method, li.created_at,
                      c.name AS category_name, COALESCE(due.cnt, 0) AS due_count
               FROM library_items li
               JOIN categories c ON c.id = li.category_id
               LEFT JOIN (
                 SELECT library_item_id, COUNT(*) AS cnt FROM flashcard_reviews
                 WHERE library_item_id IS NOT NULL AND (next_review_at IS NULL OR next_review_at <= datetime('now'))
                 GROUP BY library_item_id
               ) due ON due.library_item_id = li.id
               ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY li.created_at DESC`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/library.test.ts` — Expected: all PASS (existing tests only assert `.title`/`.length`, unaffected by the new field).

- [ ] **Step 5: Show the badge in LibraryDrawer.tsx**

Add `due_count: number` to the local `Item` interface:
```ts
interface Item { id: number; category_id: number; title: string; kind: string; method: string | null; created_at: string; category_name: string; due_count: number; }
```

Update the item title span:
```tsx
                  <span className="lib-item-title" onClick={() => setLibraryPreviewId(item.id)}
                    title="Preview">
                    {item.kind === "file" ? "📄" : "📋"} {item.title}
                    {item.method === "flashcards" && item.due_count > 0 && (
                      <span className="lib-due-badge">{item.due_count} due</span>
                    )}
                  </span>
```

- [ ] **Step 6: Filter to due cards in LibraryPreviewPanel.tsx**

Add imports and a due-filtering effect. Change the top of the component:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useApp } from "@/store";
import { parseCards, parseMindmap, type Card } from "@/lib/parse";
import FlashcardDeck from "@/components/renderers/FlashcardDeck";
import MindMapView from "@/components/renderers/MindMapView";

interface LibraryItem { id: number; title: string; kind: string; content_md: string; method: string | null; category_id: number; }
interface ReviewRow { front: string; next_review_at: string | null; }

export default function LibraryPreviewPanel() {
  const { libraryPreviewId, setLibraryPreviewId } = useApp();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dueCards, setDueCards] = useState<Card[] | null>(null);
  const previewRef = useRef<number | null>(null);
  previewRef.current = libraryPreviewId;
```

(the existing item-loading effect and Escape-key effect stay as-is). Add a new effect after the item-loading one, computing `dueCards` once `item` resolves:
```tsx
  useEffect(() => {
    if (!item || item.method !== "flashcards") { setDueCards(null); return; }
    const cards = parseCards(item.content_md);
    if (!cards) { setDueCards(null); return; }
    fetch(`/api/flashcards?libraryItemId=${item.id}`)
      .then(r => r.ok ? r.json() : [])
      .then((reviews: ReviewRow[]) => {
        const nowSql = new Date().toISOString().slice(0, 19).replace("T", " "); // match SQLite datetime('now') format
        const due = cards.filter(c => {
          const r = reviews.find(x => x.front === c.front);
          return !r || !r.next_review_at || r.next_review_at <= nowSql;
        });
        setDueCards(due.length > 0 ? due : cards);
      })
      .catch(() => setDueCards(cards));
  }, [item]);
```

Update the render's card derivation and the `FlashcardDeck` usage:
```tsx
  const cards = item?.method === "flashcards" ? parseCards(item.content_md) : null;
  const map = item?.method === "mindmap" ? parseMindmap(item.content_md) : null;
```
```tsx
        {item && (
          cards ? <FlashcardDeck key={item.id} cards={dueCards ?? cards} libraryItemId={item.id} title={item.title} />
          : map ? <MindMapView key={item.id} map={map} />
          : <ReactMarkdown>{item.content_md}</ReactMarkdown>
        )}
```

- [ ] **Step 7: CSS**

Append to `src/app/globals.css`:
```css
.lib-due-badge { margin-left: 6px; font-size: 10px; padding: 1px 6px; border-radius: 10px; background: var(--amber); color: #1a1400; }
```

- [ ] **Step 8: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npx next build` — Expected: clean.

```bash
git add src/lib/library.ts src/components/LibraryDrawer.tsx src/components/LibraryPreviewPanel.tsx src/app/globals.css tests/library.test.ts
git commit -m "feat: due-card badge in library drawer, due-only filtering on preview"
```

---

### Task 7: Analytics aggregation + API route

**Files:**
- Create: `src/lib/stats.ts`, `src/app/api/stats/route.ts`
- Test: `tests/stats.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/stats.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stats.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Write src/lib/stats.ts**

```ts
import type { DB } from "./db";

export interface DailyMinutes { date: string; minutes: number; }
export interface QuizScorePoint { runId: number; date: string; correct: number; total: number; }
export interface WeakestFlashcardCategory { name: string; missRate: number; reviewed: number; }
export interface WeakestQuizTopic { name: string; missRate: number; attempted: number; }
export interface Stats {
  streakDays: number;
  studyMinutesToday: number;
  studyMinutesWeek: number;
  studyMinutesAllTime: number;
  dailyMinutes: DailyMinutes[];
  quizScoreTrend: QuizScorePoint[];
  flashcardMastery: { mastered: number; total: number };
  weakestFlashcardCategories: WeakestFlashcardCategory[];
  weakestQuizTopics: WeakestQuizTopic[];
}

/** Consecutive-day streak ending today, or yesterday if nothing happened yet today. */
export function computeStreak(dates: string[], today: Date = new Date()): number {
  const set = new Set(dates);
  let streak = 0;
  const cursor = new Date(today);
  if (!set.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!set.has(key)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function getStats(db: DB): Stats {
  const activityDates = (db.prepare(`
    SELECT date(created_at) AS d FROM runs
    UNION SELECT date(completed_at) FROM pomodoro_blocks
    UNION SELECT date(last_reviewed) FROM flashcard_reviews
  `).all() as { d: string }[]).map(r => r.d);
  const streakDays = computeStreak(activityDates);

  const dailyMinutes = db.prepare(`
    SELECT date(completed_at) AS date, SUM(planned_min) AS minutes
    FROM pomodoro_blocks GROUP BY date ORDER BY date DESC LIMIT 7
  `).all() as DailyMinutes[];
  const todayKey = new Date().toISOString().slice(0, 10);
  const studyMinutesToday = dailyMinutes[0]?.date === todayKey ? dailyMinutes[0].minutes : 0;
  const studyMinutesWeek = dailyMinutes.reduce((sum, d) => sum + d.minutes, 0);
  const { total: studyMinutesAllTime } = db.prepare(
    "SELECT COALESCE(SUM(planned_min), 0) AS total FROM pomodoro_blocks"
  ).get() as { total: number };

  const quizScoreTrend = db.prepare(`
    SELECT r.id AS runId, date(r.created_at) AS date,
           SUM(CASE WHEN qa.correct = 1 THEN 1 ELSE 0 END) AS correct, COUNT(*) AS total
    FROM quiz_attempts qa JOIN runs r ON r.id = qa.run_id
    WHERE qa.correct IS NOT NULL
    GROUP BY qa.run_id ORDER BY r.created_at DESC LIMIT 10
  `).all() as QuizScorePoint[];

  const mastery = db.prepare(`
    SELECT SUM(CASE WHEN repetitions >= 2 THEN 1 ELSE 0 END) AS mastered, COUNT(*) AS total
    FROM flashcard_reviews WHERE library_item_id IS NOT NULL
  `).get() as { mastered: number | null; total: number };

  const weakestFlashcardCategories = (db.prepare(`
    SELECT c.name AS name, SUM(fr.missed) AS misses, COUNT(*) AS reviewed
    FROM flashcard_reviews fr
    JOIN library_items li ON li.id = fr.library_item_id
    JOIN categories c ON c.id = li.category_id
    GROUP BY c.id HAVING reviewed > 0
    ORDER BY (CAST(misses AS REAL) / reviewed) DESC LIMIT 3
  `).all() as { name: string; misses: number; reviewed: number }[])
    .map(r => ({ name: r.name, missRate: r.misses / r.reviewed, reviewed: r.reviewed }));

  const weakestQuizTopics = (db.prepare(`
    SELECT w.name AS name, SUM(CASE WHEN qa.correct = 0 THEN 1 ELSE 0 END) AS misses, COUNT(*) AS attempted
    FROM quiz_attempts qa
    JOIN runs r ON r.id = qa.run_id
    JOIN workflows w ON w.id = r.workflow_id
    WHERE qa.correct IS NOT NULL
    GROUP BY r.workflow_id HAVING attempted > 0
    ORDER BY (CAST(misses AS REAL) / attempted) DESC LIMIT 3
  `).all() as { name: string; misses: number; attempted: number }[])
    .map(r => ({ name: r.name, missRate: r.misses / r.attempted, attempted: r.attempted }));

  return {
    streakDays, studyMinutesToday, studyMinutesWeek, studyMinutesAllTime, dailyMinutes,
    quizScoreTrend, flashcardMastery: { mastered: mastery.mastered ?? 0, total: mastery.total },
    weakestFlashcardCategories, weakestQuizTopics,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stats.test.ts` — Expected: PASS (9 tests).

- [ ] **Step 5: Write src/app/api/stats/route.ts**

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStats } from "@/lib/stats";

export async function GET() {
  return NextResponse.json(getStats(getDb()));
}
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: clean, all green.

```bash
git add src/lib/stats.ts src/app/api/stats tests/stats.test.ts
git commit -m "feat: analytics aggregation — streak, study time, quiz trend, mastery, weak spots"
```

---

### Task 8: Stats panel

**Files:**
- Create: `src/components/StatsPanel.tsx`
- Modify: `src/store.tsx`, `src/components/TopBar.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Add statsOpen to src/store.tsx**

Add to `AppState`:
```ts
  statsOpen: boolean;
  setStatsOpen: (v: boolean) => void;
```
Add to `AppProvider`:
```ts
  const [statsOpen, setStatsOpen] = useState(false);
```
Add `statsOpen, setStatsOpen,` to the provider value object.

- [ ] **Step 2: Write src/components/StatsPanel.tsx**

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/store";

interface DailyMinutes { date: string; minutes: number; }
interface QuizScorePoint { runId: number; date: string; correct: number; total: number; }
interface WeakestFlashcardCategory { name: string; missRate: number; reviewed: number; }
interface WeakestQuizTopic { name: string; missRate: number; attempted: number; }
interface Stats {
  streakDays: number; studyMinutesToday: number; studyMinutesWeek: number; studyMinutesAllTime: number;
  dailyMinutes: DailyMinutes[]; quizScoreTrend: QuizScorePoint[];
  flashcardMastery: { mastered: number; total: number };
  weakestFlashcardCategories: WeakestFlashcardCategory[]; weakestQuizTopics: WeakestQuizTopic[];
}

export default function StatsPanel() {
  const { statsOpen, setStatsOpen } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError("");
    fetch("/api/stats")
      .then(r => { if (!r.ok) throw new Error(`Could not load stats (${r.status})`); return r.json(); })
      .then(setStats)
      .catch(e => setError(e instanceof Error ? e.message : "Could not load stats"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (statsOpen) load(); }, [statsOpen, load]);

  useEffect(() => {
    if (!statsOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setStatsOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [statsOpen, setStatsOpen]);

  if (!statsOpen) return null;

  return (
    <aside className="lib-drawer" role="dialog" aria-label="Stats">
      <div className="lib-head">
        <strong>📊 Stats</strong>
        <button type="button" className="node-btn" onClick={load} aria-label="Refresh stats">⟳</button>
        <button type="button" className="node-btn" onClick={() => setStatsOpen(false)} aria-label="Close stats">✕</button>
      </div>
      <div className="lib-body">
        {loading && <p className="node-sub">Loading…</p>}
        {error && <p className="lib-error" role="alert">{error}</p>}
        {stats && (
          <>
            <div className="stats-section"><div className="stats-stat">🔥 {stats.streakDays}-day streak</div></div>
            <div className="stats-section">
              <h3>Study time</h3>
              <p>Today: {stats.studyMinutesToday}m · This week: {stats.studyMinutesWeek}m · All-time: {stats.studyMinutesAllTime}m</p>
            </div>
            <div className="stats-section">
              <h3>Quiz scores</h3>
              {stats.quizScoreTrend.length === 0
                ? <p className="node-sub">No quiz data yet</p>
                : stats.quizScoreTrend.map(q => (
                    <p key={q.runId}>{q.date}: {q.correct}/{q.total} ({Math.round((q.correct / q.total) * 100)}%)</p>
                  ))}
            </div>
            <div className="stats-section">
              <h3>Flashcard mastery</h3>
              {stats.flashcardMastery.total === 0
                ? <p className="node-sub">No flashcard data yet</p>
                : <p>{stats.flashcardMastery.mastered}/{stats.flashcardMastery.total} cards mastered ({Math.round((stats.flashcardMastery.mastered / stats.flashcardMastery.total) * 100)}%)</p>}
            </div>
            <div className="stats-section">
              <h3>Weakest flashcard categories</h3>
              {stats.weakestFlashcardCategories.length === 0
                ? <p className="node-sub">No data yet</p>
                : stats.weakestFlashcardCategories.map(c => <p key={c.name}>{c.name}: {Math.round(c.missRate * 100)}% missed</p>)}
            </div>
            <div className="stats-section">
              <h3>Weakest quiz topics</h3>
              {stats.weakestQuizTopics.length === 0
                ? <p className="node-sub">No data yet</p>
                : stats.weakestQuizTopics.map(t => <p key={t.name}>{t.name}: {Math.round(t.missRate * 100)}% missed</p>)}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Add TopBar button**

Destructure `statsOpen, setStatsOpen` in `TopBar.tsx` and add a button after the Weak Spots button:
```tsx
      <button type="button" onClick={() => setStatsOpen(!statsOpen)} aria-label="Toggle stats dashboard">
        📊 Stats
      </button>
```

- [ ] **Step 4: Mount in src/app/page.tsx**

```tsx
import StatsPanel from "@/components/StatsPanel";
```
```tsx
        <WeakSpotsPanel />
        <StatsPanel />
```

- [ ] **Step 5: CSS**

Append to `src/app/globals.css`:
```css
.stats-section { margin-bottom: 16px; }
.stats-stat { font-size: 20px; font-weight: 700; }
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run && npx next build` — Expected: clean. Boot `npm run dev`, confirm `GET /` 200, kill server.

- [ ] **Step 7: Commit**

```bash
git add src/store.tsx src/components/TopBar.tsx src/components/StatsPanel.tsx src/app/page.tsx src/app/globals.css
git commit -m "feat: analytics dashboard panel"
```

---

### Task 9: Anki export

**Files:**
- Create: `src/lib/anki.ts`, `src/lib/download.ts`
- Modify: `src/components/renderers/FlashcardDeck.tsx`, `src/components/ResultPanel.tsx`
- Test: `tests/anki.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/anki.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cardsToTsv, sanitizeFilename } from "@/lib/anki";

describe("anki export", () => {
  it("formats cards as tab-separated lines", () => {
    expect(cardsToTsv([{ front: "Q1", back: "A1" }, { front: "Q2", back: "A2" }])).toBe("Q1\tA1\nQ2\tA2");
  });
  it("escapes internal tabs and newlines so they don't corrupt the TSV structure", () => {
    expect(cardsToTsv([{ front: "a\tb", back: "line1\nline2" }])).toBe("a b\tline1<br>line2");
  });
  it("sanitizes filenames to a safe, non-empty slug", () => {
    expect(sanitizeFilename("Cell Biology Ch. 3!")).toBe("cell-biology-ch-3");
    expect(sanitizeFilename("   ")).toBe("flashcards");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/anki.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Write src/lib/anki.ts**

```ts
import type { Card } from "./parse";

/**
 * Literal tabs would be read as an extra field separator by Anki's TSV
 * importer, so they're replaced with spaces. Literal newlines break the
 * one-line-per-card format, so they become <br> — Anki fields support HTML.
 */
function escapeField(s: string): string {
  return s.replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
}

export function cardsToTsv(cards: Card[]): string {
  return cards.map(c => `${escapeField(c.front)}\t${escapeField(c.back)}`).join("\n");
}

export function sanitizeFilename(s: string): string {
  const cleaned = s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "flashcards";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/anki.test.ts` — Expected: PASS.

- [ ] **Step 5: Write src/lib/download.ts** (browser-only DOM helper; not unit-tested, same convention as the existing untested clipboard-copy in MindMapView)

```ts
export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 6: Add the export button to FlashcardDeck.tsx**

Add imports:
```tsx
import { cardsToTsv, sanitizeFilename } from "@/lib/anki";
import { downloadTextFile } from "@/lib/download";
```

Add a handler and the button in the `deck-end` block:
```tsx
  function exportAnki() {
    downloadTextFile(`${sanitizeFilename(title ?? "flashcards")}.txt`, cardsToTsv(cards));
  }
```
```tsx
        <div className="deck-end">
          <h3>Deck complete — {got}/{order.length}</h3>
          {missedIdx.length > 0 && (
            <button type="button" className="node-btn" onClick={() => restart(missedIdx)}>
              🔁 Review {missedIdx.length} missed
            </button>
          )}
          <button type="button" className="node-btn" onClick={() => restart(cards.map((_, i) => i))}>
            Restart
          </button>
          <button type="button" className="node-btn" onClick={exportAnki} aria-label="Export deck to Anki">
            ⬇ Export to Anki (.txt)
          </button>
        </div>
```

- [ ] **Step 7: Pass a title from ResultPanel.tsx**

The FlashcardDeck usage in the thread-render loop currently has no `title`. Update it to pass the method label:
```tsx
          if (m.role === "assistant" && cardsSrc?.idx === idx)
            return <div key={i} className="msg msg-assistant"><FlashcardDeck key={cardsSrc.idx} cards={cardsSrc.cards} runId={openRunId ?? undefined} title={methodLabel} /></div>;
```

(`methodLabel` is already computed earlier in the component for the Save dialog, so no new state is needed.)

- [ ] **Step 8: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npx next build` — Expected: clean.

```bash
git add src/lib/anki.ts src/lib/download.ts src/components/renderers/FlashcardDeck.tsx src/components/ResultPanel.tsx tests/anki.test.ts
git commit -m "feat: export any flashcard deck to Anki-importable tab-separated text"
```

---

### Task 10: Docs + final verification

**Files:**
- Modify: `README.md`, `docs/SMOKE.md`

- [ ] **Step 1: README — add after the "More nodes" / Quiz-interleaving paragraph**

```markdown
## Spaced repetition, weak spots & analytics

Saved flashcard decks use SM-2 spaced repetition: each card gets its own
schedule based on your Got it / Missed history, and the Library drawer shows
a **"N due"** badge — opening the deck reviews only what's due today (falls
back to the full deck if nothing is due). Unsaved in-thread decks stay
simple, no scheduling.

**🔥 Weak Spots** (top bar) pulls together the flashcards due or you've been
missing across *every* saved deck, plus a recap of recently missed quiz
questions — one place to see what needs work.

**📊 Stats** (top bar) shows your study streak, time studied, quiz score
trend, flashcard mastery ratio, and weakest categories/topics.

Any flashcard deck — in-thread or saved — has an **⬇ Export to Anki (.txt)**
button on its end screen. Anki's File → Import reads it directly.
```

- [ ] **Step 2: docs/SMOKE.md — append**

```markdown
## v3 additions
- [ ] Answer flashcards in a saved deck across two sessions → Library drawer shows a "N due" badge that shrinks as cards are reviewed and their scheduled interval grows
- [ ] Miss a card twice → it still shows as due regardless of its scheduled date (high-miss override)
- [ ] Submit a quiz → check the SCORE line's math matches the app's later display of correct/incorrect (grading now records real values, not always blank)
- [ ] 🔥 Weak Spots → shows due/struggling flashcards from multiple different decks mixed together, plus a missed-quiz recap; answering a card here updates the same due badge in the drawer
- [ ] Weak Spots with nothing due/missed → shows the empty-state message, not a blank panel
- [ ] 📊 Stats → streak, study time, quiz trend, flashcard mastery, weakest categories/topics all show sane numbers (or "no data yet") even on a lightly-used profile
- [ ] Export a flashcard deck to Anki → downloaded .txt imports cleanly via Anki's File → Import (or at minimum, front/back columns are correctly tab-separated when opened in a text editor)
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npx next build`
Expected: typecheck clean, all tests pass (47 baseline + ~28 new ≈ 75), production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/SMOKE.md
git commit -m "docs: README and smoke checklist for v3 features"
```

(Merge to main + push happen after the final whole-branch review — not part of this task.)

---

## Self-Review Notes

- **Spec coverage:** §2 schema+quiz fix → Tasks 1, 2; §3 SM-2 → Tasks 1, 3, 6; §4 weak-spot session → Tasks 4, 5; §5 analytics → Tasks 7, 8; §6 Anki export → Task 9; §7 error handling → empty-state guards in Task 5, zero-division guards in Task 7/8, malformed-JSON fallback already handled by Task 2's `parseQuizResults` null path, migration safety in Task 1; §8 testing → unit tests in Tasks 1, 2, 3, 4, 6, 7, 9 plus SMOKE.md in Task 10; §9 rollout → branch/docs in Task 10 header and Task 10 itself.
- **Known simplifications (intentional, matching spec §10):** weak-spot quiz recap is read-only (no live re-quiz); Anki export is TSV, not binary `.apkg`; per-card difficulty stays binary Got it/Missed.
- **Type consistency check:** `Sm2State` fields (`easeFactor`/`intervalDays`/`repetitions`) used identically across `spacedRepetition.ts`, `flashcardReviews.ts`, and their tests; `WeakCard`/`QuizMiss` shapes match between `weakspots.ts` and `WeakSpotsPanel.tsx`; `Stats` shape matches between `stats.ts` and `StatsPanel.tsx`; `FlashcardDeck`'s `sourceIds`/`title` props introduced in Task 3/5 are consumed consistently in Tasks 5, 6, 9 without redefinition drift; `LibraryItemMeta.due_count` added once in Task 6 and consumed only there.
