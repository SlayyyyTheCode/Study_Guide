# Study Guide v2 Implementation Plan — Library, New Tools & Visual Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a categorized content library (with recall-to-canvas), flashcards + mind-map output nodes, and five visual/interaction upgrades to the shipped v1 app.

**Architecture:** Library = snapshot-copy tables (`categories`, `library_items`) with own lib module + API routes + drawer UI + a `library` canvas node type that feeds the existing runner. New methods plug into the proven MethodId/prompt/fenced-JSON pattern. Visual upgrades are frontend-only: a custom animated edge, CSS state glow, React Flow MiniMap, a custom Ctrl+K component, and a theme pass.

**Tech Stack:** Existing v1 stack (Next.js 15, React 19, @xyflow/react 12, better-sqlite3 v12, Vitest). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-07-v2-library-tools-polish-design.md`
**Baseline:** main @ 55588b9. Branch: `feature/app-v2`.

---

## File Structure

```
Modified:
  src/lib/db.ts                 — schema additions (categories, library_items, flashcard_reviews)
  src/lib/graph.ts              — "library" node type legality (library→brain)
  src/lib/runner.ts             — gather material from library nodes too
  src/lib/prompts.ts            — flashcards + mindmap MethodIds/templates
  src/app/api/files/route.ts    — auto-capture uploads into library
  src/store.tsx                 — runningOutputs, drawer/preview/snap state
  src/components/Canvas.tsx     — edge animation wiring, library drop, MiniMap, snap, QuickAdd mount, visibility pause
  src/components/TopBar.tsx     — 📚 drawer toggle, snap toggle
  src/components/Palette.tsx    — new method entries appear automatically (METHODS-driven)
  src/components/ResultPanel.tsx— deck/mindmap renderers, save-to-library, library preview mode
  src/app/globals.css           — glow, drawer, deck, quickadd, theme pass
Created:
  src/lib/library.ts            — category + library item CRUD (pure, tested)
  src/lib/parse.ts              — fenced-JSON parsers: parseJsonBlock, parseCards, parseMindmap
  src/app/api/library/route.ts, src/app/api/library/[id]/route.ts
  src/app/api/categories/route.ts, src/app/api/categories/[id]/route.ts
  src/app/api/flashcards/route.ts
  src/components/FlowEdge.tsx   — animated edge component
  src/components/LibraryDrawer.tsx
  src/components/nodes/LibraryNode.tsx
  src/components/QuickAdd.tsx
  src/components/renderers/FlashcardDeck.tsx
  src/components/renderers/MindMapView.tsx
Tests:
  tests/library.test.ts, tests/parse.test.ts (+ modify tests/graph.test.ts, tests/runner.test.ts, tests/prompts.test.ts)
```

---

### Task 1: Library schema + lib module

**Files:**
- Modify: `src/lib/db.ts` (SCHEMA constant)
- Create: `src/lib/library.ts`
- Test: `tests/library.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/library.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "@/lib/db";
import {
  ensureCategory, listCategories, renameCategory, deleteCategory,
  createLibraryItem, listLibraryItems, getLibraryItem, updateLibraryItem, deleteLibraryItem,
} from "@/lib/library";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); });

describe("library", () => {
  it("ensureCategory creates once and is idempotent", () => {
    const a = ensureCategory(db, "Biology");
    const b = ensureCategory(db, "Biology");
    expect(a.id).toBe(b.id);
    expect(listCategories(db).map(c => c.name)).toContain("Biology");
  });

  it("creates and fetches items with content", () => {
    const cat = ensureCategory(db, "Biology");
    const item = createLibraryItem(db, {
      title: "Cell summary", kind: "result", content_md: "# Cells\nOsmosis...",
      categoryId: cat.id, method: "summary",
    });
    const full = getLibraryItem(db, item.id)!;
    expect(full.content_md).toContain("Osmosis");
    expect(full.category_id).toBe(cat.id);
  });

  it("lists with search over title and content, and by category", () => {
    const bio = ensureCategory(db, "Biology");
    const hist = ensureCategory(db, "History");
    createLibraryItem(db, { title: "Cells", kind: "file", content_md: "mitochondria text", categoryId: bio.id });
    createLibraryItem(db, { title: "WW2 notes", kind: "file", content_md: "treaty text", categoryId: hist.id });
    expect(listLibraryItems(db, { search: "mitochondria" }).map(i => i.title)).toEqual(["Cells"]);
    expect(listLibraryItems(db, { categoryId: hist.id }).map(i => i.title)).toEqual(["WW2 notes"]);
    expect(listLibraryItems(db, {}).length).toBe(2);
  });

  it("update renames and recategorizes", () => {
    const bio = ensureCategory(db, "Biology");
    const item = createLibraryItem(db, { title: "x", kind: "file", content_md: "c", categoryId: bio.id });
    const hist = ensureCategory(db, "History");
    updateLibraryItem(db, item.id, { title: "y", categoryId: hist.id });
    const full = getLibraryItem(db, item.id)!;
    expect(full.title).toBe("y");
    expect(full.category_id).toBe(hist.id);
  });

  it("deleteCategory moves items to Uncategorized, never deletes them", () => {
    const bio = ensureCategory(db, "Biology");
    const item = createLibraryItem(db, { title: "keep me", kind: "file", content_md: "c", categoryId: bio.id });
    deleteCategory(db, bio.id);
    const full = getLibraryItem(db, item.id)!;
    const uncat = listCategories(db).find(c => c.name === "Uncategorized")!;
    expect(full.category_id).toBe(uncat.id);
    expect(listCategories(db).find(c => c.name === "Biology")).toBeUndefined();
  });

  it("deleteLibraryItem removes the row", () => {
    const bio = ensureCategory(db, "Biology");
    const item = createLibraryItem(db, { title: "x", kind: "file", content_md: "c", categoryId: bio.id });
    deleteLibraryItem(db, item.id);
    expect(getLibraryItem(db, item.id)).toBeUndefined();
  });

  it("renameCategory works", () => {
    const c = ensureCategory(db, "Bio");
    renameCategory(db, c.id, "Biology 2");
    expect(listCategories(db).find(x => x.id === c.id)!.name).toBe("Biology 2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/library.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Extend SCHEMA in src/lib/db.ts**

Append to the SCHEMA template string (before the closing backtick):
```sql
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
  last_reviewed TEXT NOT NULL DEFAULT (datetime('now'))
);
```
(`CREATE TABLE IF NOT EXISTS` = zero-step migration for the existing data.sqlite.)

- [ ] **Step 4: Write src/lib/library.ts**

```ts
import type { DB } from "./db";

export interface CategoryRow { id: number; name: string; icon: string; created_at: string; }
export interface LibraryItemRow {
  id: number; category_id: number; title: string; kind: "file" | "result";
  content_md: string; source_path: string | null; method: string | null; created_at: string;
}
export type LibraryItemMeta = Omit<LibraryItemRow, "content_md"> & { category_name: string };

export function ensureCategory(db: DB, name: string, icon = "📁"): CategoryRow {
  db.prepare("INSERT OR IGNORE INTO categories (name, icon) VALUES (?, ?)").run(name, icon);
  return db.prepare("SELECT * FROM categories WHERE name = ?").get(name) as CategoryRow;
}
export function listCategories(db: DB): CategoryRow[] {
  return db.prepare("SELECT * FROM categories ORDER BY name").all() as CategoryRow[];
}
export function renameCategory(db: DB, id: number, name: string): void {
  db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, id);
}
export function deleteCategory(db: DB, id: number): void {
  const uncat = ensureCategory(db, "Uncategorized", "🗂️");
  if (uncat.id === id) return; // never delete the fallback bucket
  db.transaction(() => {
    db.prepare("UPDATE library_items SET category_id = ? WHERE category_id = ?").run(uncat.id, id);
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  })();
}

export function createLibraryItem(db: DB, item: {
  title: string; kind: "file" | "result"; content_md: string;
  categoryId: number; method?: string; source_path?: string;
}): LibraryItemRow {
  const info = db.prepare(
    "INSERT INTO library_items (category_id, title, kind, content_md, source_path, method) VALUES (?,?,?,?,?,?)"
  ).run(item.categoryId, item.title, item.kind, item.content_md, item.source_path ?? null, item.method ?? null);
  return getLibraryItem(db, Number(info.lastInsertRowid))!;
}
export function getLibraryItem(db: DB, id: number): LibraryItemRow | undefined {
  return db.prepare("SELECT * FROM library_items WHERE id = ?").get(id) as LibraryItemRow | undefined;
}
export function listLibraryItems(db: DB, f: { search?: string; categoryId?: number }): LibraryItemMeta[] {
  const where: string[] = []; const args: unknown[] = [];
  if (f.search) { where.push("(li.title LIKE ? OR li.content_md LIKE ?)"); args.push(`%${f.search}%`, `%${f.search}%`); }
  if (f.categoryId) { where.push("li.category_id = ?"); args.push(f.categoryId); }
  const sql = `SELECT li.id, li.category_id, li.title, li.kind, li.source_path, li.method, li.created_at,
                      c.name AS category_name
               FROM library_items li JOIN categories c ON c.id = li.category_id
               ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY li.created_at DESC`;
  return db.prepare(sql).all(...args) as LibraryItemMeta[];
}
export function updateLibraryItem(db: DB, id: number, patch: { title?: string; categoryId?: number }): void {
  if (patch.title !== undefined) db.prepare("UPDATE library_items SET title = ? WHERE id = ?").run(patch.title, id);
  if (patch.categoryId !== undefined) db.prepare("UPDATE library_items SET category_id = ? WHERE id = ?").run(patch.categoryId, id);
}
export function deleteLibraryItem(db: DB, id: number): void {
  db.prepare("DELETE FROM library_items WHERE id = ?").run(id);
}
/** Concatenate all items in a category as one material bundle (same format as multi-file gathering). */
export function gatherCategoryContent(db: DB, categoryId: number): string {
  const rows = db.prepare("SELECT title, content_md FROM library_items WHERE category_id = ? ORDER BY created_at").all(categoryId) as { title: string; content_md: string }[];
  return rows.map(r => `--- ${r.title} ---\n${r.content_md}`).join("\n\n");
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/library.test.ts` then full `npx vitest run` (24 existing + 7 new = 31). Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/library.ts tests/library.test.ts
git commit -m "feat: library schema and CRUD module with category fallback"
```

---

### Task 2: Library, categories, flashcards API routes

**Files:**
- Create: `src/app/api/library/route.ts`, `src/app/api/library/[id]/route.ts`, `src/app/api/categories/route.ts`, `src/app/api/categories/[id]/route.ts`, `src/app/api/flashcards/route.ts`

Thin adapters over the tested lib (v1 pattern); verified by curl smoke.

- [ ] **Step 1: src/app/api/library/route.ts**

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listLibraryItems, createLibraryItem, ensureCategory } from "@/lib/library";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const categoryId = url.searchParams.get("categoryId");
  return NextResponse.json(listLibraryItems(getDb(), {
    search, categoryId: categoryId ? Number(categoryId) : undefined,
  }));
}

export async function POST(req: Request) {
  const { title, kind, content_md, categoryId, newCategoryName, method, source_path } = await req.json();
  if (!title?.trim() || !kind || content_md === undefined)
    return NextResponse.json({ error: "title, kind, content_md required" }, { status: 400 });
  const db = getDb();
  const catId = newCategoryName?.trim() ? ensureCategory(db, newCategoryName.trim()).id : Number(categoryId);
  if (!catId) return NextResponse.json({ error: "categoryId or newCategoryName required" }, { status: 400 });
  return NextResponse.json(createLibraryItem(db, { title: title.trim(), kind, content_md, categoryId: catId, method, source_path }));
}
```

- [ ] **Step 2: src/app/api/library/[id]/route.ts**

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLibraryItem, updateLibraryItem, deleteLibraryItem } from "@/lib/library";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = getLibraryItem(getDb(), Number(id));
  return item ? NextResponse.json(item) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { title, categoryId } = await req.json();
  updateLibraryItem(getDb(), Number(id), { title, categoryId });
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  deleteLibraryItem(getDb(), Number(id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: src/app/api/categories/route.ts + [id]/route.ts**

`route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listCategories, ensureCategory } from "@/lib/library";

export async function GET() { return NextResponse.json(listCategories(getDb())); }
export async function POST(req: Request) {
  const { name, icon } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  return NextResponse.json(ensureCategory(getDb(), name.trim(), icon));
}
```

`[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { renameCategory, deleteCategory } from "@/lib/library";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  renameCategory(getDb(), Number(id), name.trim());
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  deleteCategory(getDb(), Number(id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: src/app/api/flashcards/route.ts** (review upserts + miss retrieval)

```ts
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
```
(`col` is chosen from a two-value literal, not user input — no injection surface.)

- [ ] **Step 5: Smoke + commit**

Run `npm run dev`, then:
```bash
curl -s -X POST localhost:3000/api/categories -H "content-type: application/json" -d '{"name":"Biology"}'
curl -s -X POST localhost:3000/api/library -H "content-type: application/json" -d '{"title":"T","kind":"file","content_md":"hello","newCategoryName":"Biology"}'
curl -s "localhost:3000/api/library?search=hello"
```
Expected: category JSON; item JSON; list containing the item. Kill server; delete test rows only if data.sqlite was fresh-created (it's gitignored — no repo impact either way).

```bash
git add src/app/api/library src/app/api/categories src/app/api/flashcards
git commit -m "feat: library, category and flashcard-review API routes"
```

---

### Task 3: Auto-capture uploads into library

**Files:**
- Modify: `src/app/api/files/route.ts`

- [ ] **Step 1: Add capture after successful insert**

In the POST handler of `src/app/api/files/route.ts`, after the `files` insert and before the return, add (only when extraction produced usable content):
```ts
import { ensureCategory, createLibraryItem } from "@/lib/library";
import { getWorkflow } from "@/lib/db";
// ... inside POST, after the files insert:
if (status === "ready" && text) {
  const wf = getWorkflow(db, workflowId);
  const cat = ensureCategory(db, wf?.name ?? "Uncategorized");
  createLibraryItem(db, {
    title: file.name, kind: "file", content_md: text,
    categoryId: cat.id, source_path: dest,
  });
}
```
Images/needs_vision files are NOT auto-captured (no text content to snapshot); they remain workflow-local. State this in a one-line comment.

- [ ] **Step 2: Verify + commit**

`npx tsc --noEmit` clean; dev-server smoke: upload a .md via curl multipart, then `curl localhost:3000/api/library` shows the item under a category named after the workflow.

```bash
git add src/app/api/files/route.ts
git commit -m "feat: auto-capture uploaded text files into the library"
```

---

### Task 4: Flashcards + mindmap methods and parsers

**Files:**
- Modify: `src/lib/prompts.ts`
- Create: `src/lib/parse.ts`
- Test: `tests/parse.test.ts`, modify `tests/prompts.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseJsonBlock, parseCards, parseMindmap } from "@/lib/parse";

const wrap = (j: string) => "intro text\n```json\n" + j + "\n```\ntrailing";

describe("parse", () => {
  it("parseJsonBlock extracts the LAST fenced json block", () => {
    const md = wrap('{"a":1}') + "\n" + wrap('{"a":2}');
    expect(parseJsonBlock<{ a: number }>(md)?.a).toBe(2);
  });
  it("parseJsonBlock returns null on malformed json or no block", () => {
    expect(parseJsonBlock("no block here")).toBeNull();
    expect(parseJsonBlock(wrap("{oops"))).toBeNull();
  });
  it("parseCards validates shape", () => {
    expect(parseCards(wrap('{"cards":[{"front":"F","back":"B"}]}'))).toEqual([{ front: "F", back: "B" }]);
    expect(parseCards(wrap('{"cards":"nope"}'))).toBeNull();
    expect(parseCards(wrap('{"cards":[{"front":"F"}]}'))).toBeNull();
  });
  it("parseMindmap validates recursive tree", () => {
    const t = parseMindmap(wrap('{"root":"Bio","children":[{"label":"Cells","children":[{"label":"Organelles"}]}]}'));
    expect(t?.root).toBe("Bio");
    expect(t?.children[0].children?.[0].label).toBe("Organelles");
    expect(parseMindmap(wrap('{"children":[]}'))).toBeNull();
  });
});
```

In `tests/prompts.test.ts`, update the methods list test:
```ts
expect(Object.keys(METHODS).sort()).toEqual(["feynman", "flashcards", "mindmap", "pomodoro", "pq4r", "quiz", "summary"]);
```
And add:
```ts
it("flashcards respects count and focus", () => {
  const p = buildMethodPrompt("flashcards", material, { count: 20, focus: "definitions" });
  expect(p.user).toContain("20");
  expect(p.user).toContain("definitions");
});
it("mindmap prompt demands json tree", () => {
  const p = buildMethodPrompt("mindmap", material, {});
  expect(p.system).toContain('"root"');
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/parse.test.ts tests/prompts.test.ts` → FAIL.

- [ ] **Step 3: Create src/lib/parse.ts**

```ts
export interface Card { front: string; back: string; }
export interface MindNode { label: string; children?: MindNode[]; }
export interface MindMap { root: string; children: MindNode[]; }

/** Extract and parse the LAST ```json fenced block in markdown. Null if absent/malformed. */
export function parseJsonBlock<T>(md: string): T | null {
  const matches = [...md.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length === 0) return null;
  try { return JSON.parse(matches[matches.length - 1][1]) as T; } catch { return null; }
}

export function parseCards(md: string): Card[] | null {
  const obj = parseJsonBlock<{ cards?: unknown }>(md);
  if (!obj || !Array.isArray(obj.cards)) return null;
  const ok = obj.cards.every(c => c && typeof (c as Card).front === "string" && typeof (c as Card).back === "string");
  return ok ? (obj.cards as Card[]) : null;
}

function validNode(n: unknown): boolean {
  if (!n || typeof (n as MindNode).label !== "string") return false;
  const ch = (n as MindNode).children;
  return ch === undefined || (Array.isArray(ch) && ch.every(validNode));
}
export function parseMindmap(md: string): MindMap | null {
  const obj = parseJsonBlock<MindMap>(md);
  if (!obj || typeof obj.root !== "string" || !Array.isArray(obj.children) || !obj.children.every(validNode)) return null;
  return obj;
}
```

- [ ] **Step 4: Extend src/lib/prompts.ts**

Add to `MethodId`: `| "flashcards" | "mindmap"`. Add to `MethodOptions`: `focus?: string;`. Add to `METHODS`:
```ts
flashcards: { label: "Flashcards", icon: "🃏" },
mindmap: { label: "Mind Map", icon: "🕸️" },
```
New system prompts (template literals; escape inner fences as in the existing QUIZ_SYSTEM):
```ts
const FLASHCARDS_SYSTEM = `You create study flashcards.
When asked to generate: output ONLY a JSON code block:
\`\`\`json
{"cards":[{"front":"question or term","back":"concise answer or definition"}]}
\`\`\`
Fronts must be answerable without seeing the back. Backs stay under 40 words.
If asked to regenerate or fix output, reply with ONLY a corrected JSON block in the same format.`;

const MINDMAP_SYSTEM = `You create concept mind-maps.
Output ONLY a JSON code block:
\`\`\`json
{"root":"main topic","children":[{"label":"branch","children":[{"label":"leaf"}]}]}
\`\`\`
Max depth 4, max 6 children per node. Labels under 6 words.
If asked to regenerate or fix output, reply with ONLY a corrected JSON block in the same format.`;
```
New cases in `buildMethodPrompt`:
```ts
case "flashcards": {
  const count = opts.count ?? 15;
  const focus = opts.focus ? ` Focus on: ${opts.focus}.` : "";
  return { system: FLASHCARDS_SYSTEM, user: `${mat}\n\nGenerate ${count} flashcards.${focus}` };
}
case "mindmap":
  return { system: MINDMAP_SYSTEM, user: `${mat}\n\nBuild the mind map.` };
```

- [ ] **Step 5: Run all tests** — `npx vitest run` → all pass (31 + new). `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/prompts.ts src/lib/parse.ts tests/parse.test.ts tests/prompts.test.ts
git commit -m "feat: flashcards and mindmap methods with validated JSON parsers"
```

---

### Task 5: Library node type in graph + runner

**Files:**
- Modify: `src/lib/graph.ts`, `src/lib/runner.ts`
- Test: modify `tests/graph.test.ts`, `tests/runner.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/graph.test.ts`:
```ts
it("library nodes connect only to brains and count as inputs", () => {
  const g3: Graph = {
    nodes: [
      { id: "L1", type: "library", data: { libraryItemId: 5 } },
      { id: "b1", type: "brain", data: { provider: "claude", model: "sonnet" } },
      { id: "o1", type: "output", data: { method: "summary" } },
    ],
    edges: [{ source: "L1", target: "b1" }, { source: "b1", target: "o1" }],
  };
  expect(isValidEdge(g3, "L1", "b1")).toBe(true);
  expect(isValidEdge(g3, "L1", "o1")).toBe(false);
  const r = resolveOutput(g3, "o1");
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.inputs.map(n => n.id)).toEqual(["L1"]);
});
```

Append to `tests/runner.test.ts`:
```ts
import { ensureCategory, createLibraryItem } from "@/lib/library";

it("gathers material from library nodes (single item and category mode)", async () => {
  const db = openDb(":memory:");
  const wf = createWorkflow(db, "t2");
  const cat = ensureCategory(db, "Bio");
  const item = createLibraryItem(db, { title: "Notes", kind: "file", content_md: "LIBRARY MATERIAL osmosis", categoryId: cat.id });
  createLibraryItem(db, { title: "More", kind: "result", content_md: "SECOND ITEM", categoryId: cat.id });

  const mk = (data: Record<string, unknown>): Graph => ({
    nodes: [
      { id: "L1", type: "library", data },
      { id: "b1", type: "brain", data: { provider: "ollama", model: "m" } },
      { id: "o1", type: "output", data: { method: "summary" } },
    ],
    edges: [{ source: "L1", target: "b1" }, { source: "b1", target: "o1" }],
  });
  const capture: string[] = [];
  const driver: BrainDriver = {
    ...mockDriver,
    async *stream(opts) { capture.push(opts.messages[0].content); yield "ok"; },
  };

  for await (const _ of runOutputNode(db, wf.id, mk({ libraryItemId: item.id }), "o1", { driver })) { /* drain */ }
  expect(capture[0]).toContain("LIBRARY MATERIAL");

  for await (const _ of runOutputNode(db, wf.id, mk({ categoryId: cat.id }), "o1", { driver })) { /* drain */ }
  expect(capture[1]).toContain("LIBRARY MATERIAL");
  expect(capture[1]).toContain("SECOND ITEM");
});

it("errors cleanly when library item is gone", async () => {
  const db = openDb(":memory:");
  const wf = createWorkflow(db, "t3");
  const g: Graph = {
    nodes: [
      { id: "L1", type: "library", data: { libraryItemId: 999 } },
      { id: "b1", type: "brain", data: { provider: "ollama", model: "m" } },
      { id: "o1", type: "output", data: { method: "summary" } },
    ],
    edges: [{ source: "L1", target: "b1" }, { source: "b1", target: "o1" }],
  };
  const events: RunEvent[] = [];
  for await (const ev of runOutputNode(db, wf.id, g, "o1", { driver: mockDriver })) events.push(ev);
  expect(events.some(e => e.type === "error" && /library/i.test(e.message))).toBe(true);
});
```
(Adjust imports at top of runner.test.ts: `RunEvent` from runner; note the existing `mockDriver` stream asserts "MOCK MATERIAL" — for these new tests use the local `driver`/`mockDriver` as shown; the missing-item test never reaches stream so mockDriver's assertion doesn't fire.)

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/graph.test.ts tests/runner.test.ts` → FAIL.

- [ ] **Step 3: graph.ts — one-line legality addition**

```ts
const LEGAL: Record<string, string> = { input: "brain", library: "brain", brain: "output" };
```
In `resolveOutput`, widen the inputs filter to accept both source kinds:
```ts
.map(e => g.nodes.find(n => n.id === e.source && (n.type === "input" || n.type === "library")))
```

- [ ] **Step 4: runner.ts — gather from library nodes**

Add import: `import { getLibraryItem, gatherCategoryContent } from "./library";`

In `runOutputNode`, replace the single `gatherMaterial` call block with:
```ts
const fileInputs = res.inputs.filter(n => n.type === "input");
const libInputs = res.inputs.filter(n => n.type === "library");

const { material: fileMaterial, images } = await gatherMaterial(db, workflowId, fileInputs.map(n => n.id));

const libParts: string[] = [];
for (const n of libInputs) {
  const itemId = n.data.libraryItemId as number | undefined;
  const categoryId = n.data.categoryId as number | undefined;
  if (itemId) {
    const item = getLibraryItem(db, itemId);
    if (!item) { yield { type: "error", message: "Library item no longer exists. Remove or re-link this node." }; return; }
    libParts.push(`--- ${item.title} ---\n${item.content_md}`);
  } else if (categoryId) {
    const content = gatherCategoryContent(db, categoryId);
    if (!content) { yield { type: "error", message: "Library category is empty or no longer exists." }; return; }
    libParts.push(content);
  }
}
const material = [fileMaterial, ...libParts].filter(Boolean).join("\n\n");
```
(Existing guard `if (!material && images.length === 0)` stays, now covering both sources. `gatherMaterial` with an empty id list: guard it — if `fileInputs.length === 0`, skip the call and use `{ material: "", images: [] }`, because the SQL `IN ()` with zero placeholders is invalid.)

- [ ] **Step 5: Run all tests** — `npx vitest run` → all pass. `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/graph.ts src/lib/runner.ts tests/graph.test.ts tests/runner.test.ts
git commit -m "feat: library node type feeds runner material (item and category modes)"
```

---

### Task 6: Animated edges + node state glow

**Files:**
- Create: `src/components/FlowEdge.tsx`
- Modify: `src/store.tsx`, `src/components/Canvas.tsx`, `src/components/nodes/OutputNode.tsx`, `src/app/globals.css`

- [ ] **Step 1: store.tsx — running-output tracking**

Add to AppState (and provider):
```ts
runningOutputs: string[];
setRunning: (nodeId: string, running: boolean) => void;
```
Implementation inside AppProvider:
```ts
const [runningOutputs, setRunningOutputs] = useState<string[]>([]);
const setRunning = useCallback((nodeId: string, running: boolean) => {
  setRunningOutputs(prev => running ? (prev.includes(nodeId) ? prev : [...prev, nodeId]) : prev.filter(id => id !== nodeId));
}, []);
```

- [ ] **Step 2: OutputNode.tsx — report run state**

In `run()`: call `setRunning(id, true)` at start; in a `finally`, `setRunning(id, false)`. (Get `setRunning` from `useApp()`.) Keep existing node-data state updates.

- [ ] **Step 3: FlowEdge.tsx**

```tsx
"use client";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export default function FlowEdge(props: EdgeProps) {
  const [path] = getBezierPath(props);
  const state = (props.data?.state as string) ?? "idle";
  return (
    <>
      <BaseEdge id={props.id} path={path} className={`flow-edge flow-edge-${state}`} />
      {state === "running" && (
        <circle r="4" className="flow-edge-dot">
          <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </>
  );
}
```

- [ ] **Step 4: Canvas.tsx — wire it up**

- Register: `const edgeTypes = { flow: FlowEdge };` and pass `edgeTypes={edgeTypes}` + `defaultEdgeOptions={{ type: "flow" }}` to `<ReactFlow>`. Existing saved edges without a type render default — migrate on load: after parsing the workflow graph, map `edges.map(e => ({ ...e, type: "flow" }))`.
- Compute animated edges: with `runningOutputs` from `useApp()`,
```ts
const displayEdges = useMemo(() => {
  if (runningOutputs.length === 0) return edges;
  const active = new Set<string>();
  for (const outId of runningOutputs) {
    const brainEdge = edges.find(e => e.target === outId);
    if (!brainEdge) continue;
    active.add(brainEdge.id);
    for (const e of edges) if (e.target === brainEdge.source) active.add(e.id);
  }
  return edges.map(e => active.has(e.id) ? { ...e, data: { ...e.data, state: "running" } } : e);
}, [edges, runningOutputs]);
```
Pass `edges={displayEdges}` to ReactFlow (state mutations still go through `setEdges` on the raw `edges`).
- Visibility pause: effect adding a `visibilitychange` listener that toggles class `anim-paused` on the canvas wrapper element.

- [ ] **Step 5: Node glow CSS + node class wiring**

OutputNode root div: extend className with state: `` className={`node node-output ${d.state ? `node-${d.state}` : ""}`} `` (states: running/done/error already in node data). Same pattern optional on other nodes — outputs only is enough.

globals.css additions:
```css
.flow-edge { stroke: #3a4150; stroke-width: 2; transition: stroke 200ms ease-out; }
.flow-edge-running { stroke: var(--blue); stroke-dasharray: 8 6; animation: edge-march .7s linear infinite; }
.flow-edge-done { stroke: var(--green); }
@keyframes edge-march { to { stroke-dashoffset: -14; } }
.flow-edge-dot { fill: #7ab8f0; }
.node-running { animation: node-glow 1.5s ease-in-out infinite; }
@keyframes node-glow { 0%,100% { box-shadow: 0 0 4px rgba(74,144,217,.3); } 50% { box-shadow: 0 0 18px rgba(74,144,217,.9); } }
.node-done { animation: node-flash 600ms ease-out 1; }
@keyframes node-flash { 0% { box-shadow: 0 0 16px rgba(77,171,109,.9); } 100% { box-shadow: none; } }
.node-error { box-shadow: 0 0 10px rgba(224,93,68,.6); }
.node { animation: node-in 200ms ease-out; }
@keyframes node-in { from { transform: scale(.9); opacity: 0; } }
.anim-paused .flow-edge-running, .anim-paused .node-running { animation-play-state: paused; }
```

- [ ] **Step 6: Verify + commit**

`npx tsc --noEmit`, `npx vitest run`, `npx next build` all clean. Manual: run a node in dev — wires on its path march + dot travels; node glows; done flashes.

```bash
git add src/components/FlowEdge.tsx src/store.tsx src/components/Canvas.tsx src/components/nodes/OutputNode.tsx src/app/globals.css
git commit -m "feat: animated flow edges and node state glow"
```

---

### Task 7: Library drawer + LibraryNode + canvas drop

**Files:**
- Create: `src/components/LibraryDrawer.tsx`, `src/components/nodes/LibraryNode.tsx`
- Modify: `src/store.tsx`, `src/components/TopBar.tsx`, `src/components/Canvas.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: store.tsx additions**

```ts
drawerOpen: boolean;
setDrawerOpen: (v: boolean) => void;
libraryPreviewId: number | null;              // library item open in ResultPanel
setLibraryPreviewId: (id: number | null) => void;
```
(useState pairs, added to provider value.)

- [ ] **Step 2: LibraryNode.tsx**

```tsx
"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";

export default function LibraryNode({ data }: NodeProps) {
  const d = data as { libraryItemId?: number; categoryId?: number; title?: string; categoryName?: string };
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!d.libraryItemId) return;
    fetch(`/api/library/${d.libraryItemId}`).then(r => setMissing(!r.ok)).catch(() => {});
  }, [d.libraryItemId]);

  return (
    <div className="node node-library">
      <div className="node-title">📚 {d.categoryId ? "Category" : "Library item"} {missing && "⚠️"}</div>
      <div className="node-sub">{d.title}</div>
      {d.categoryName && <span className="lib-chip">{d.categoryName}</span>}
      {missing && <div className="node-warn">Library item no longer exists.</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

- [ ] **Step 3: LibraryDrawer.tsx**

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/store";

interface Cat { id: number; name: string; icon: string; }
interface Item { id: number; category_id: number; title: string; kind: string; method: string | null; created_at: string; category_name: string; }

export default function LibraryDrawer() {
  const { drawerOpen, setDrawerOpen, setLibraryPreviewId } = useApp();
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([
        fetch("/api/categories").then(r => r.json()),
        fetch(`/api/library${search ? `?search=${encodeURIComponent(search)}` : ""}`).then(r => r.json()),
      ]);
      setCats(c); setItems(i);
    } catch { /* drawer shows what it has */ }
  }, [search]);
  useEffect(() => { if (drawerOpen) refresh(); }, [drawerOpen, refresh]);

  if (!drawerOpen) return null;

  async function rename(item: Item) {
    const title = window.prompt("New title:", item.title);
    if (!title?.trim()) return;
    await fetch(`/api/library/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() }) });
    refresh();
  }
  async function move(item: Item) {
    const name = window.prompt(`Move to category (existing or new):\n${cats.map(c => c.name).join(", ")}`, item.category_name);
    if (!name?.trim()) return;
    const cat = cats.find(c => c.name === name.trim()) ?? await fetch("/api/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() }) }).then(r => r.json());
    await fetch(`/api/library/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoryId: cat.id }) });
    refresh();
  }
  async function remove(item: Item) {
    if (!window.confirm(`Delete "${item.title}" from library?`)) return;
    await fetch(`/api/library/${item.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <aside className="lib-drawer" role="dialog" aria-label="Library">
      <div className="lib-head">
        <strong>📚 Library</strong>
        <input aria-label="Search library" placeholder="Search…" value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && refresh()} />
        <button type="button" className="node-btn" aria-label="Close library" onClick={() => setDrawerOpen(false)}>✕</button>
      </div>
      <div className="lib-body">
        {cats.map(cat => {
          const catItems = items.filter(i => i.category_id === cat.id);
          if (search && catItems.length === 0) return null;
          return (
            <div key={cat.id}>
              <button type="button" className="lib-cat" onClick={() => setCollapsed(c => ({ ...c, [cat.id]: !c[cat.id] }))}>
                {collapsed[cat.id] ? "▶" : "▼"} {cat.icon} {cat.name} ({catItems.length})
              </button>
              {!collapsed[cat.id] && catItems.map(item => (
                <div key={item.id} className="lib-item" draggable
                  onDragStart={e => e.dataTransfer.setData("application/sg-library",
                    JSON.stringify({ itemId: item.id, title: item.title, categoryName: item.category_name }))}>
                  <span className="lib-item-title" onClick={() => setLibraryPreviewId(item.id)}
                    title="Preview">{item.kind === "file" ? "📄" : "📋"} {item.title}</span>
                  <span className="lib-item-date">{item.created_at.slice(0, 10)}</span>
                  <span className="lib-actions">
                    <button type="button" className="node-btn" aria-label={`Rename ${item.title}`} onClick={() => rename(item)}>✎</button>
                    <button type="button" className="node-btn" aria-label={`Move ${item.title}`} onClick={() => move(item)}>📂</button>
                    <button type="button" className="node-btn" aria-label={`Delete ${item.title}`} onClick={() => remove(item)}>🗑</button>
                  </span>
                </div>
              ))}
              {!collapsed[cat.id] && !search && (
                <div className="lib-item lib-item-cat" draggable
                  onDragStart={e => e.dataTransfer.setData("application/sg-library",
                    JSON.stringify({ categoryId: cat.id, title: `All of ${cat.name}`, categoryName: cat.name }))}>
                  ⤵ drag whole category
                </div>
              )}
            </div>
          );
        })}
        {cats.length === 0 && <p className="lib-empty">Nothing saved yet. Upload files or 💾 save results — they land here.</p>}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Canvas drop + node type; TopBar toggle; page mount**

Canvas.tsx:
- `nodeTypes` gains `library: LibraryNode`.
- `onDrop` handles the second mime type:
```ts
const lib = e.dataTransfer.getData("application/sg-library");
if (lib) {
  const p = JSON.parse(lib);
  const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
  setNodes(ns => [...ns, {
    id: `library-${Date.now()}`, type: "library", position: pos,
    data: { libraryItemId: p.itemId, categoryId: p.categoryId, title: p.title, categoryName: p.categoryName },
  }]);
  return;
}
```
TopBar.tsx: add `📚 Library` button toggling `setDrawerOpen(!drawerOpen)` (aria-label "Toggle library").
page.tsx: render `<LibraryDrawer />` inside the shell (sibling of ResultPanel).

- [ ] **Step 5: CSS**

```css
.lib-drawer { position: fixed; right: 0; top: 0; bottom: 0; width: min(380px, 90vw); background: var(--panel); border-left: 1px solid var(--border); z-index: 25; display: flex; flex-direction: column; animation: drawer-in 200ms ease-out; }
@keyframes drawer-in { from { transform: translateX(40px); opacity: 0; } }
.lib-head { display: flex; gap: 8px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.lib-head input { flex: 1; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; }
.lib-body { flex: 1; overflow-y: auto; padding: 8px; }
.lib-cat { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--muted); padding: 6px 4px; font-size: 12px; text-transform: none; }
.lib-item { display: flex; align-items: center; gap: 6px; padding: 5px 8px; margin: 2px 0 2px 12px; border-radius: 6px; font-size: 12px; cursor: grab; }
.lib-item:hover { background: var(--bg); }
.lib-item-title { flex: 1; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-item-date { color: var(--muted); font-size: 10px; }
.lib-actions { display: none; gap: 2px; }
.lib-item:hover .lib-actions { display: flex; }
.lib-item-cat { color: var(--muted); font-style: italic; }
.lib-empty { color: var(--muted); font-size: 12px; padding: 16px; text-align: center; }
.node-library { border: 2px solid var(--blue); border-style: dashed; }
.lib-chip { display: inline-block; margin-top: 4px; padding: 1px 8px; border: 1px solid var(--border); border-radius: 10px; font-size: 10px; color: var(--muted); }
```

- [ ] **Step 6: Verify + commit**

tsc/tests/build clean. Manual: save item via curl, open drawer, drag to canvas → dashed library node; wire to brain; run summary → material flows.

```bash
git add -A
git commit -m "feat: library drawer with drag-to-canvas recall and library node"
```

---

### Task 8: Deck + mindmap renderers, save-to-library, library preview

**Files:**
- Create: `src/components/renderers/FlashcardDeck.tsx`, `src/components/renderers/MindMapView.tsx`
- Modify: `src/components/ResultPanel.tsx`, `src/app/globals.css`

- [ ] **Step 1: FlashcardDeck.tsx**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type { Card } from "@/lib/parse";

interface Props { cards: Card[]; runId?: number; libraryItemId?: number; }

export default function FlashcardDeck({ cards, runId, libraryItemId }: Props) {
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, boolean>>({}); // idx → missed

  useEffect(() => { // Space flips
    const h = (e: KeyboardEvent) => { if (e.key === " " && pos < order.length) { e.preventDefault(); setFlipped(f => !f); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [pos, order.length]);

  const done = pos >= order.length;
  const missedIdx = useMemo(() => Object.entries(results).filter(([, m]) => m).map(([i]) => Number(i)), [results]);

  function answer(missed: boolean) {
    const idx = order[pos];
    setResults(r => ({ ...r, [idx]: missed }));
    setFlipped(false);
    setPos(p => p + 1);
  }

  useEffect(() => {
    if (!done || order.length === 0) return;
    fetch("/api/flashcards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId, libraryItemId,
        results: order.map(i => ({ front: cards[i].front, back: cards[i].back, missed: !!results[i] })),
      }),
    }).catch(() => {});
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    const got = order.length - missedIdx.length;
    return (
      <div className="deck">
        <div className="deck-end">
          <h3>Deck complete — {got}/{order.length}</h3>
          {missedIdx.length > 0 && (
            <button type="button" className="node-btn" onClick={() => { setOrder(missedIdx); setPos(0); setResults({}); setFlipped(false); }}>
              🔁 Review {missedIdx.length} missed
            </button>
          )}
          <button type="button" className="node-btn" onClick={() => { setOrder(cards.map((_, i) => i)); setPos(0); setResults({}); setFlipped(false); }}>
            Restart
          </button>
        </div>
      </div>
    );
  }

  const card = cards[order[pos]];
  return (
    <div className="deck">
      <div className="deck-progress">{pos + 1} / {order.length}</div>
      <button type="button" className={`deck-card ${flipped ? "deck-flipped" : ""}`} onClick={() => setFlipped(f => !f)}
        aria-label={flipped ? "Card back — click to see front" : "Card front — click to flip"}>
        <div>{flipped ? card.back : card.front}</div>
        <small>{flipped ? "" : "click / Space to flip"}</small>
      </button>
      {flipped && (
        <div className="deck-actions">
          <button type="button" className="node-btn deck-miss" onClick={() => answer(true)}>✗ Missed</button>
          <button type="button" className="node-btn deck-got" onClick={() => answer(false)}>✓ Got it</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: MindMapView.tsx** (outline + read-only React Flow graph, toggle)

```tsx
"use client";
import { useMemo, useState } from "react";
import { ReactFlow, Background, type Node, type Edge } from "@xyflow/react";
import type { MindMap, MindNode } from "@/lib/parse";

function layout(map: MindMap): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []; const edges: Edge[] = [];
  let row = 0;
  function walk(n: MindNode, depth: number, parentId: string | null): void {
    const id = `m${nodes.length}`;
    nodes.push({ id, position: { x: depth * 220, y: row * 56 }, data: { label: n.label }, type: "default" });
    if (parentId) edges.push({ id: `e${id}`, source: parentId, target: id });
    const kids = n.children ?? [];
    if (kids.length === 0) row++;
    kids.forEach(k => walk(k, depth + 1, id));
  }
  walk({ label: map.root, children: map.children }, 0, null);
  return { nodes, edges };
}

function Outline({ n, depth }: { n: MindNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const kids = n.children ?? [];
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <button type="button" className="mm-row" onClick={() => kids.length && setOpen(o => !o)}>
        {kids.length ? (open ? "▾" : "▸") : "•"} {n.label}
      </button>
      {open && kids.map((k, i) => <Outline key={i} n={k} depth={depth + 1} />)}
    </div>
  );
}

export default function MindMapView({ map }: { map: MindMap }) {
  const [view, setView] = useState<"outline" | "graph">("outline");
  const { nodes, edges } = useMemo(() => layout(map), [map]);

  function toMarkdown(n: MindNode, depth: number): string {
    return `${"  ".repeat(depth)}- ${n.label}\n` + (n.children ?? []).map(k => toMarkdown(k, depth + 1)).join("");
  }
  function exportMd() {
    const md = `# ${map.root}\n\n` + map.children.map(c => toMarkdown(c, 0)).join("");
    navigator.clipboard.writeText(md);
  }

  return (
    <div className="mindmap">
      <div className="mm-bar">
        <button type="button" className="node-btn" onClick={() => setView(v => v === "outline" ? "graph" : "outline")}>
          {view === "outline" ? "🕸️ Graph view" : "☰ Outline view"}
        </button>
        <button type="button" className="node-btn" onClick={exportMd}>⧉ Copy as markdown</button>
      </div>
      {view === "outline"
        ? <Outline n={{ label: map.root, children: map.children }} depth={0} />
        : <div className="mm-graph"><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}><Background gap={20} /></ReactFlow></div>}
    </div>
  );
}
```

- [ ] **Step 3: ResultPanel.tsx integration**

Three changes:
1. **Method renderers.** After thread state loads, where assistant messages render: if `openMethod === "flashcards"`, derive `parseCards` from the LAST assistant message with a valid block (same backwards-scan pattern as quiz) and render `<FlashcardDeck cards={cards} runId={openRunId} />` in place of that message's markdown; if `openMethod === "mindmap"`, same with `parseMindmap` → `<MindMapView map={map} />`. If method is flashcards/mindmap and NO message parses → show raw markdown + a **Regenerate** button that calls the existing `send("Your last output was not valid JSON. Reply with ONLY a corrected JSON block in the required format.")`.
2. **💾 Save to library** button in `.result-head` (hidden while busy or thread empty): opens an inline dialog (`<div className="save-dialog">`) with a title input (prefilled `${METHODS[openMethod]?.label ?? "Result"} — ${new Date().toISOString().slice(0,10)}`), a category `<select>` (options from `GET /api/categories` + a "+ New category…" option that swaps to a text input), and Save/Cancel. Save → `POST /api/library` with `{title, kind: "result", content_md: <last assistant message content>, categoryId | newCategoryName, method: openMethod}` → close dialog, brief "Saved ✓" text.
3. **Library preview mode.** From store, read `libraryPreviewId`/`setLibraryPreviewId`. When set (takes precedence over openRunId): fetch `/api/library/${id}`; render header `📚 {title}` + Close (clears preview id); body: if `item.method === "flashcards"` and `parseCards(item.content_md)` → `<FlashcardDeck cards runId={undefined} libraryItemId={item.id} />`; if `mindmap` and parses → `<MindMapView>`; else `<ReactMarkdown>{item.content_md}</ReactMarkdown>`. No follow-up input row in preview mode (read-only).

- [ ] **Step 4: CSS**

```css
.deck { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 0; }
.deck-progress { color: var(--muted); font-size: 12px; }
.deck-card { width: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; font-size: 16px; text-align: center; color: var(--text); transition: transform 150ms ease-out; }
.deck-card:hover { transform: translateY(-1px); }
.deck-flipped { border-color: var(--blue); }
.deck-card small { color: var(--muted); font-size: 11px; }
.deck-actions { display: flex; gap: 12px; }
.deck-miss { border-color: var(--red); }
.deck-got { border-color: var(--green); }
.deck-end { text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.mindmap { padding: 8px 0; }
.mm-bar { display: flex; gap: 8px; margin-bottom: 10px; }
.mm-row { background: none; border: none; color: var(--text); padding: 3px 4px; font-size: 13px; text-align: left; }
.mm-row:hover { color: var(--blue); }
.mm-graph { height: 400px; border: 1px solid var(--border); border-radius: 8px; }
.save-dialog { position: absolute; top: 48px; right: 14px; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; z-index: 5; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
.save-dialog input, .save-dialog select { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; }
```

- [ ] **Step 5: Verify + commit**

tsc/tests/build clean. Manual: run flashcards on a small .md with Ollama → deck flips, got/missed advance, end screen, review-misses; mindmap renders outline + graph toggle; save quiz result to library; preview from drawer opens deck.

```bash
git add -A
git commit -m "feat: flashcard deck and mindmap renderers with save-to-library and preview"
```

---

### Task 9: Ctrl+K quick-add, MiniMap, snap toggle, theme pass

**Files:**
- Create: `src/components/QuickAdd.tsx`
- Modify: `src/components/Canvas.tsx`, `src/components/TopBar.tsx`, `src/store.tsx`, `src/app/globals.css`

- [ ] **Step 1: store.tsx** — add `snap: boolean; setSnap: (v: boolean) => void;` (useState, default true).

- [ ] **Step 2: QuickAdd.tsx**

```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { METHODS } from "@/lib/prompts";

export interface QuickAddEntry { label: string; type: string; data: Record<string, unknown>; }

const BASE: QuickAddEntry[] = [
  { label: "📄 File Input", type: "input", data: {} },
  { label: "🧠 Brain", type: "brain", data: { provider: "claude", model: "sonnet" } },
  ...Object.entries(METHODS).map(([method, m]) => ({ label: `${m.icon} ${m.label}`, type: "output", data: { method } })),
];

/** Subsequence fuzzy match: all query chars appear in order. */
export function fuzzy(query: string, target: string): boolean {
  const q = query.toLowerCase(); const t = target.toLowerCase();
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i >= q.length;
}

interface Props { at: { x: number; y: number } | null; onPick: (e: QuickAddEntry, at: { x: number; y: number } | null) => void; onClose: () => void; }

export default function QuickAdd({ at, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [libEntries, setLibEntries] = useState<QuickAddEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    fetch("/api/library").then(r => r.json()).then((items: { id: number; title: string; category_name: string }[]) =>
      setLibEntries(items.map(i => ({ label: `📚 ${i.title}`, type: "library", data: { libraryItemId: i.id, title: i.title, categoryName: i.category_name } })))
    ).catch(() => {});
  }, []);

  const results = useMemo(() => {
    const all = [...BASE, ...libEntries];
    return (q ? all.filter(e => fuzzy(q, e.label)) : all).slice(0, 8);
  }, [q, libEntries]);

  useEffect(() => { setSel(0); }, [q]);

  return (
    <div className="quickadd-backdrop" onClick={onClose}>
      <div className="quickadd" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} aria-label="Quick add node" placeholder="Type to add a node… (quiz, pdf, flash…)" value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
            if (e.key === "Enter" && results[sel]) onPick(results[sel], at);
          }} />
        <div className="quickadd-list" role="listbox">
          {results.map((r, i) => (
            <button type="button" key={r.label + i} role="option" aria-selected={i === sel}
              className={`quickadd-row ${i === sel ? "quickadd-sel" : ""}`}
              onMouseEnter={() => setSel(i)} onClick={() => onPick(r, at)}>{r.label}</button>
          ))}
          {results.length === 0 && <div className="quickadd-empty">No match</div>}
        </div>
      </div>
    </div>
  );
}
```
Add a fuzzy test to `tests/parse.test.ts`? No — separate concern; add `tests/fuzzy.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fuzzy } from "@/components/QuickAdd";

describe("fuzzy", () => {
  it("matches subsequences case-insensitively", () => {
    expect(fuzzy("fla", "🃏 Flashcards")).toBe(true);
    expect(fuzzy("qb", "📝 Quiz Bank")).toBe(true);
    expect(fuzzy("xyz", "📝 Quiz Bank")).toBe(false);
    expect(fuzzy("", "anything")).toBe(true);
  });
});
```
(Component import in a node-env test works because `fuzzy` is a pure export and the module's JSX isn't evaluated at import. If vitest chokes on the "use client" TSX import, move `fuzzy` to `src/lib/fuzzy.ts` and import from both places.)

- [ ] **Step 3: Canvas.tsx wiring**

- State: `const [quickAt, setQuickAt] = useState<{x:number;y:number} | null | "closed">("closed");` (null = open at center, coords = open at cursor).
- Keyboard: effect listening for `Ctrl+K`/`Meta+K` → `setQuickAt(null)`; pane double-click via `onDoubleClick` on the wrapper capturing `e.clientX/Y` → `setQuickAt({x,y})` (guard: only when target is the pane, `(e.target as HTMLElement).classList.contains("react-flow__pane")`).
- `onPick`: convert (`at` coords via `rf.screenToFlowPosition`, or center = `rf.screenToFlowPosition({x: innerWidth/2, y: innerHeight/2})`), `setNodes(ns => [...ns, { id: `${entry.type}-${Date.now()}`, type: entry.type, position, data: { ...entry.data } }])`, close.
- Render `{quickAt !== "closed" && <QuickAdd at={quickAt} onPick={onPick} onClose={() => setQuickAt("closed")} />}`.
- MiniMap: `import { MiniMap } from "@xyflow/react";` inside ReactFlow: `<MiniMap position="bottom-left" pannable zoomable nodeColor={n => n.type === "brain" ? "#b07ad9" : n.type === "output" ? "#4dab6d" : "#4a90d9"} />`.
- Snap: `snapToGrid={snap} snapGrid={[8, 8]}` from store.

- [ ] **Step 4: TopBar snap toggle**

Button after Run All: `<button type="button" aria-pressed={snap} aria-label="Toggle snap to grid" onClick={() => setSnap(!snap)}>{snap ? "⊞ Snap on" : "⊡ Snap off"}</button>`.

- [ ] **Step 5: Theme pass CSS**

```css
:root { --surface-1: #14171d; --surface-2: #171a21; --surface-3: #1c2029; }
.topbar, .palette, .chat-panel, .lib-drawer, .result-panel { background: var(--surface-2); }
.node { background: linear-gradient(180deg, var(--surface-3), var(--surface-2)); box-shadow: 0 2px 8px rgba(0,0,0,.35); }
.node:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,.45); transition: transform 100ms ease-out, box-shadow 100ms ease-out; }
.result-panel, .chat-panel { animation: panel-in 200ms ease-out; }
@keyframes panel-in { from { transform: translateX(24px); opacity: 0; } }
.quickadd-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 40; display: flex; align-items: flex-start; justify-content: center; padding-top: 18vh; }
.quickadd { width: min(440px, 90vw); background: var(--surface-3); border: 1px solid var(--border); border-radius: 12px; padding: 10px; box-shadow: 0 16px 48px rgba(0,0,0,.6); }
.quickadd input { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 14px; }
.quickadd-list { margin-top: 8px; display: flex; flex-direction: column; }
.quickadd-row { text-align: left; background: none; border: none; color: var(--text); padding: 8px 10px; border-radius: 8px; font-size: 13px; }
.quickadd-sel { background: rgba(74, 144, 217, .18); }
.quickadd-empty { color: var(--muted); padding: 10px; font-size: 13px; }
```
Audit pass: bump `.main` panel paddings to multiples of 8 where off-grid (palette 10px → 12px stays, node padding 10px → keep: consistent enough; only fix clear violations).

- [ ] **Step 6: Verify + commit**

tsc/tests/build clean; manual: Ctrl+K → type "fla" → Enter → Flashcards node at center; double-click canvas → popup at cursor; minimap colored; snap toggle drags on 8px grid; nodes have depth + hover lift.

```bash
git add -A
git commit -m "feat: quick-add command bar, minimap, snap toggle and theme pass"
```

---

### Task 10: Docs + final verification

**Files:**
- Modify: `README.md`, `docs/SMOKE.md`

- [ ] **Step 1: README — add after the "Use" section**

```markdown
## Library

Everything you upload is auto-saved to the **Library** (📚 in the top bar),
categorized by workflow name. Save any generated result with the 💾 button on
its panel. In the drawer: search, rename, re-categorize, preview (flashcard
decks and mind maps open interactively), and **drag any item — or a whole
category — onto the canvas** to use it as input material in a new workflow.
Library items survive workflow deletion.

## More nodes

- **🃏 Flashcards** — flip-through deck with Got it / Missed tracking and
  review-misses replay.
- **🕸️ Mind Map** — collapsible outline + graph view, copy as markdown.
- **📚 Library item** — recall stored content (drag from drawer or Ctrl+K).

## Shortcuts

- **Ctrl+K** (or double-click the canvas) — quick-add any node by typing.
- **Space** — flip the current flashcard.
- **Esc** — close panels.
```

- [ ] **Step 2: SMOKE.md — append**

```markdown
## v2 additions
- [ ] Upload file → appears in library drawer under workflow-named category
- [ ] Save a summary result to library via 💾 → visible in drawer
- [ ] Drag library item to canvas → dashed node; wire → brain → summary runs with its content
- [ ] Drag whole category → node runs with all items concatenated
- [ ] Delete a category with items → items move to Uncategorized
- [ ] Flashcards run → deck flips (click + Space), got/missed, end screen, review misses replays only missed
- [ ] Mind map run → outline renders, graph toggle works, copy-as-markdown fills clipboard
- [ ] Drawer preview of saved deck opens review mode; saved mindmap opens outline
- [ ] While a node runs: its wires march + pulse dot travels; node glows; done flashes green
- [ ] Ctrl+K → "fla" → Enter drops Flashcards node; double-click canvas opens popup at cursor
- [ ] MiniMap bottom-left shows color-coded nodes; snap toggle affects dragging
- [ ] Regenerate button appears when flashcards/mindmap JSON is malformed
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npx next build`
Expected: clean, all tests pass (24 v1 + ~16 v2), build succeeds.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/SMOKE.md
git commit -m "docs: README and smoke checklist for v2 features"
```

(Merge to main + push happen after the final whole-branch review — not part of this task.)

---

## Self-Review Notes

- **Spec coverage:** §2 library schema/flows/drawer/node/API → Tasks 1–3, 7; §3 flashcards/mindmap → Tasks 4, 8; §4 upgrades 1–5 → Tasks 6, 9; §5 error handling → Task 4 (parsers null on malformed), Task 5 (missing item/category errors), Task 8 (Regenerate fallback), Task 1 (Uncategorized move, IF NOT EXISTS migration); §6 testing → Tasks 1, 4, 5 + fuzzy test + SMOKE extension in Task 10; §7 rollout → branch noted in header, docs in Task 10.
- **Known simplifications (intentional):** drawer rename/move/delete use window.prompt/confirm (consistent with v1's + New pattern; custom dialogs deferred); mindmap graph layout is simple row-packing (readable for ≤4 depth/6 children per spec constraint); Ctrl+K library entries fetch once per open; category-drag hidden during search (ambiguous counts).
- **Type consistency check:** `MethodId` extended before use in Tasks 8–9 (METHODS-driven Palette/QuickAdd pick up new methods automatically); `LibraryItemRow.content_md` used by runner Task 5 matches Task 1; `parseCards`/`parseMindmap` signatures match Task 8 usage; `flashcard_reviews` columns match Task 2 route and Task 8 POST body; store additions (`runningOutputs`, `drawerOpen`, `libraryPreviewId`, `snap`) all defined in Tasks 6, 7, 9 before consumption.
