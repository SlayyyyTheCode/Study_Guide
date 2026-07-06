# Study Guide App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local-first study app: React Flow node canvas wires study files → LLM brains (Claude subscription via Agent SDK, Ollama) → study-method outputs (Feynman, PQ4R, Quiz, Summary, Pomodoro planner) with docked chat and a Pomodoro timer bar, persisted in SQLite.

**Architecture:** Single Next.js (App Router) process. API routes host file extraction, a provider-agnostic brain router, and a workflow runner that streams results over SSE. Frontend is a React Flow canvas with typed ports, a result side panel supporting follow-up conversation (powers Feynman flip/gap-hunt and PQ4R steps), chat panel, and timer bar. SQLite via better-sqlite3.

**Tech Stack:** Next.js 15, React 19, TypeScript, @xyflow/react 12, better-sqlite3, pdf-parse, mammoth, @anthropic-ai/claude-agent-sdk, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-study-guide-design.md`

---

## File Structure

```
package.json, tsconfig.json, next.config.ts, vitest.config.ts
src/
  lib/
    db.ts                 — SQLite connection + schema + typed helpers
    extract.ts            — file → text (pdf/docx/txt/md); images pass through
    prompts.ts            — method prompt builders (feynman/pq4r/quiz/summary/pomodoro) + follow-up system prompts
    graph.ts              — canvas graph validation + resolution (output → brain → inputs)
    runner.ts             — executes one output node against a BrainDriver, yields text chunks
    brains/
      types.ts            — BrainDriver interface + ChatMsg
      ollama.ts           — Ollama driver (localhost:11434)
      claude.ts           — Claude Agent SDK driver (subscription login)
      index.ts            — driver registry
  app/
    layout.tsx, globals.css, page.tsx
    api/
      workflows/route.ts            — GET list / POST create
      workflows/[id]/route.ts       — GET / PUT canvas json / DELETE
      files/route.ts                — POST upload + extract
      brains/route.ts               — GET status + models for both drivers
      run/route.ts                  — POST run one output node (SSE)
      runs/[id]/reply/route.ts      — POST follow-up message on a run (SSE)
      chat/route.ts                 — GET history / POST message (SSE)
      quiz/route.ts                 — POST store quiz attempt
      pomodoro/route.ts             — GET stats / POST log block
  components/
    Canvas.tsx            — React Flow wrapper, typed connections, autosave, run-all
    Palette.tsx           — draggable node palette sidebar
    nodes/InputNode.tsx   — blue file node (upload, status)
    nodes/BrainNode.tsx   — purple brain node (provider, model picker, status dot)
    nodes/OutputNode.tsx  — green method node (run button, result preview)
    ResultPanel.tsx       — full result view + follow-up thread (Feynman/PQ4R/quiz interaction)
    ChatPanel.tsx         — docked chat
    PomodoroBar.tsx       — top timer bar + notifications + stats logging
    TopBar.tsx            — workflow switcher + Run All + brain default
  store.ts                — tiny app store (React context): active workflow, panel state, pomodoro plan
tests/
  db.test.ts, extract.test.ts, prompts.test.ts, graph.test.ts, runner.test.ts, ollama.test.ts
uploads/                  — gitignored file storage
data.sqlite               — gitignored database
```

Conventions: all lib code pure/importable (no Next dependency) so Vitest runs it in node env. API routes are thin adapters. Streaming = SSE lines `data: {json}\n\n`, terminated by `data: {"done":true}`.

---

### Task 1: Scaffold project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `next-env.d.ts` (generated), `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "study-guide",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.5.0",
    "@xyflow/react": "^12.3.0",
    "better-sqlite3": "^11.8.0",
    "mammoth": "^1.8.0",
    "next": "^15.3.0",
    "pdf-parse": "^1.1.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.0.0",
    "@types/pdf-parse": "^1.1.4",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write next.config.ts**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
```

- [ ] **Step 4: Write vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

- [ ] **Step 5: Write minimal app shell**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Study Guide" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (placeholder, replaced in Task 10):
```tsx
export default function Home() {
  return <main style={{ padding: 24 }}>Study Guide — canvas coming soon</main>;
}
```

`src/app/globals.css` (starter; extended in Task 10):
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f1115; --panel: #171a21; --border: #2a2f3a; --text: #e6e8ee; --muted: #9aa3b2;
  --blue: #4a90d9; --purple: #b07ad9; --green: #4dab6d; --red: #e05d44; --amber: #d9a441;
}
html, body { height: 100%; }
body { background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, "Segoe UI", sans-serif; }
button { font: inherit; cursor: pointer; }
```

- [ ] **Step 6: Install and verify dev server boots**

Run: `npm install` then `npm run dev` (stop after checking).
Expected: `http://localhost:3000` renders the placeholder text. If `better-sqlite3` fails to build on Windows, run `npm install --build-from-source=false` (prebuilt binaries exist for Node LTS).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with deps and config"
```

---

### Task 2: SQLite database module

**Files:**
- Create: `src/lib/db.ts`
- Test: `tests/db.test.ts`

Schema follows spec §8. `getDb()` is a lazy singleton; `openDb(path)` is exposed for tests (in-memory).

- [ ] **Step 1: Write the failing test**

`tests/db.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { openDb, createWorkflow, listWorkflows, saveCanvas, getWorkflow } from "@/lib/db";

describe("db", () => {
  it("creates schema and round-trips a workflow", () => {
    const db = openDb(":memory:");
    const wf = createWorkflow(db, "Biology Ch.3");
    expect(wf.id).toBeGreaterThan(0);
    expect(listWorkflows(db).map(w => w.name)).toContain("Biology Ch.3");
    saveCanvas(db, wf.id, JSON.stringify({ nodes: [], edges: [] }));
    expect(JSON.parse(getWorkflow(db, wf.id)!.react_flow_json)).toEqual({ nodes: [], edges: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — cannot resolve `@/lib/db`.

- [ ] **Step 3: Write src/lib/db.ts**

```ts
import Database from "better-sqlite3";
import path from "path";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  react_flow_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id),
  node_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  extracted_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  method TEXT NOT NULL,
  brain TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  result_md TEXT NOT NULL DEFAULT '',
  thread_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  correct INTEGER,
  feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pomodoro_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  planned_min INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function openDb(file: string): DB {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

let singleton: DB | null = null;
export function getDb(): DB {
  if (!singleton) singleton = openDb(path.join(process.cwd(), "data.sqlite"));
  return singleton;
}

export interface WorkflowRow { id: number; name: string; react_flow_json: string; updated_at: string; }

export function createWorkflow(db: DB, name: string): WorkflowRow {
  const info = db.prepare("INSERT INTO workflows (name) VALUES (?)").run(name);
  return getWorkflow(db, Number(info.lastInsertRowid))!;
}
export function listWorkflows(db: DB): WorkflowRow[] {
  return db.prepare("SELECT * FROM workflows ORDER BY updated_at DESC").all() as WorkflowRow[];
}
export function getWorkflow(db: DB, id: number): WorkflowRow | undefined {
  return db.prepare("SELECT * FROM workflows WHERE id = ?").get(id) as WorkflowRow | undefined;
}
export function saveCanvas(db: DB, id: number, json: string): void {
  db.prepare("UPDATE workflows SET react_flow_json = ?, updated_at = datetime('now') WHERE id = ?").run(json, id);
}
export function deleteWorkflow(db: DB, id: number): void {
  for (const t of ["files", "runs", "chat_messages", "pomodoro_blocks"])
    db.prepare(`DELETE FROM ${t} WHERE workflow_id = ?`).run(id);
  db.prepare("DELETE FROM workflows WHERE id = ?").run(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts tests/db.test.ts && git commit -m "feat: sqlite schema and workflow helpers"
```

---

### Task 3: File extraction

**Files:**
- Create: `src/lib/extract.ts`
- Test: `tests/extract.test.ts`, fixtures `tests/fixtures/sample.txt`, `tests/fixtures/sample.md`

Images are NOT extracted — they pass to vision brains as base64; `extract.ts` only flags them. pdf/docx parsing delegated to `pdf-parse`/`mammoth`; their internals are not unit-tested (library trust) — routing and failure behavior are.

- [ ] **Step 1: Create fixtures**

`tests/fixtures/sample.txt`: `Mitochondria are the powerhouse of the cell.`
`tests/fixtures/sample.md`: `# Cells\n\nOsmosis moves water across membranes.`

- [ ] **Step 2: Write the failing test**

`tests/extract.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import path from "path";

vi.mock("pdf-parse", () => ({ default: vi.fn(async () => ({ text: "PDF TEXT", numpages: 3 })) }));
vi.mock("mammoth", () => ({ extractRawText: vi.fn(async () => ({ value: "DOCX TEXT" })) }));

import { extractFile, isImage } from "@/lib/extract";
const fx = (f: string) => path.join(__dirname, "fixtures", f);

describe("extract", () => {
  it("reads txt", async () => {
    const r = await extractFile(fx("sample.txt"));
    expect(r.kind).toBe("text");
    expect(r.text).toContain("powerhouse");
  });
  it("reads md", async () => {
    const r = await extractFile(fx("sample.md"));
    expect(r.text).toContain("Osmosis");
  });
  it("routes pdf to pdf-parse", async () => {
    const r = await extractFile("whatever/notes.pdf");
    expect(r.text).toBe("PDF TEXT");
    expect(r.pages).toBe(3);
  });
  it("routes docx to mammoth", async () => {
    const r = await extractFile("whatever/notes.docx");
    expect(r.text).toBe("DOCX TEXT");
  });
  it("flags images", async () => {
    const r = await extractFile("photo.PNG");
    expect(r.kind).toBe("image");
    expect(isImage("a.jpg")).toBe(true);
  });
  it("marks empty pdf text as needs_vision", async () => {
    const pdfParse = (await import("pdf-parse")).default as unknown as ReturnType<typeof vi.fn>;
    pdfParse.mockResolvedValueOnce({ text: "   ", numpages: 2 });
    const r = await extractFile("scan.pdf");
    expect(r.kind).toBe("needs_vision");
  });
  it("rejects unknown extensions", async () => {
    await expect(extractFile("x.xyz")).rejects.toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/extract.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Write src/lib/extract.ts**

```ts
import fs from "fs/promises";
import path from "path";

export interface ExtractResult {
  kind: "text" | "image" | "needs_vision";
  text: string;
  pages?: number;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
export function isImage(file: string): boolean {
  return IMAGE_EXT.has(path.extname(file).toLowerCase());
}

export async function extractFile(filePath: string): Promise<ExtractResult> {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXT.has(ext)) return { kind: "image", text: "" };
  if (ext === ".txt" || ext === ".md") {
    return { kind: "text", text: await fs.readFile(filePath, "utf8") };
  }
  if (ext === ".pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(await fs.readFile(filePath));
    const text = data.text?.trim() ?? "";
    if (!text) return { kind: "needs_vision", text: "", pages: data.numpages };
    return { kind: "text", text, pages: data.numpages };
  }
  if (ext === ".docx" || ext === ".doc") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ path: filePath });
    return { kind: "text", text: value };
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

Note: mock uses `readFile` before pdf-parse; for the mocked pdf tests the file path doesn't exist — guard: in test, paths `whatever/notes.pdf` will fail `fs.readFile`. Fix in implementation: for pdf, wrap read in try and pass path buffer only if file exists — NO. Correct fix in the TEST fixtures: create real dummy files. Add step: write empty placeholder files `tests/fixtures/notes.pdf`, `tests/fixtures/notes.docx`, adjust test paths to `fx("notes.pdf")` / `fx("notes.docx")` and `fx("notes.pdf")` for the needs_vision case. mammoth mock takes `{path}` so any path works; pdf mock ignores buffer content so an empty file is fine.

- [ ] **Step 5: Run tests, fix, verify pass**

Run: `npx vitest run tests/extract.test.ts` — Expected: PASS (after fixture files added per note above).

- [ ] **Step 6: Commit**

```bash
git add src/lib/extract.ts tests/extract.test.ts tests/fixtures && git commit -m "feat: file text extraction with vision fallback flag"
```

---

### Task 4: Method prompt builders

**Files:**
- Create: `src/lib/prompts.ts`
- Test: `tests/prompts.test.ts`

Each method has: an initial user prompt built from material, and a system prompt that also governs follow-up turns (Feynman grading, PQ4R stepping, quiz grading).

- [ ] **Step 1: Write the failing test**

`tests/prompts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildMethodPrompt, METHODS, type MethodId } from "@/lib/prompts";

describe("prompts", () => {
  const material = "Osmosis is diffusion of water.";
  it("knows all five methods", () => {
    expect(Object.keys(METHODS).sort()).toEqual(["feynman", "pomodoro", "pq4r", "quiz", "summary"]);
  });
  it("embeds material and method structure", () => {
    for (const m of Object.keys(METHODS) as MethodId[]) {
      const p = buildMethodPrompt(m, material, {});
      expect(p.user).toContain("Osmosis");
      expect(p.system.length).toBeGreaterThan(50);
    }
  });
  it("quiz respects count and difficulty options", () => {
    const p = buildMethodPrompt("quiz", material, { count: 7, difficulty: "hard" });
    expect(p.user).toContain("7");
    expect(p.user).toContain("hard");
  });
  it("pomodoro respects block length", () => {
    const p = buildMethodPrompt("pomodoro", material, { blockMin: 30 });
    expect(p.user).toContain("30");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompts.test.ts` — Expected: FAIL.

- [ ] **Step 3: Write src/lib/prompts.ts**

```ts
export type MethodId = "feynman" | "pq4r" | "quiz" | "summary" | "pomodoro";

export interface MethodPrompt { system: string; user: string; }
export interface MethodOptions { count?: number; difficulty?: string; blockMin?: number; }

export const METHODS: Record<MethodId, { label: string; icon: string }> = {
  feynman: { label: "Feynman Explainer", icon: "🎓" },
  pq4r: { label: "PQ4R Session", icon: "❓" },
  quiz: { label: "Quiz Bank", icon: "📝" },
  summary: { label: "Summary Sheet", icon: "📋" },
  pomodoro: { label: "Pomodoro Planner", icon: "⏱️" },
};

const FEYNMAN_SYSTEM = `You are a Feynman-technique tutor. Rules:
1. TEACH: explain the material in plain language a smart 12-year-old understands. Use analogies. Any technical term must be defined in-line the moment it appears.
2. FLIP: after teaching, ask the student to explain the concept back in their own words.
3. GAP-HUNT: when the student replies with their explanation, grade it honestly. List concrete gaps and fuzzy spots, then re-teach ONLY those weak points, then ask them to try again. When their explanation is solid, say so plainly and stop.
Always respond in markdown.`;

const PQ4R_SYSTEM = `You are a PQ4R study guide running a 6-step session: Preview, Question, Read, Reflect, Recite, Review.
Run ONE step at a time and clearly label it (e.g. "## Step 2 of 6 — Question").
- Preview: skimmable outline of the material.
- Question: turn the outline headings into questions the student should be able to answer.
- Read: point them at one section at a time with what to look for.
- Reflect: prompts connecting new material to prior knowledge.
- Recite: ask them to answer the step-2 questions from memory; grade their replies with feedback.
- Review: produce a weak-spot sheet based on their recite performance.
Wait for the student's reply before advancing to the next step. Always respond in markdown.`;

const QUIZ_SYSTEM = `You are a quiz generator and grader.
When asked to generate: output ONLY a JSON code block containing an array of questions:
\`\`\`json
[{"id":1,"type":"mcq","question":"...","choices":["A ...","B ...","C ...","D ..."],"answer":"A"},
 {"id":2,"type":"short","question":"...","answer":"expected key points"}]
\`\`\`
When the student submits answers: grade each one, state correct/incorrect, explain why, and end with a score line "SCORE: x/y". Respond in markdown (JSON only for generation).`;

const SUMMARY_SYSTEM = `You produce condensed exam cheat sheets: key concepts, definitions, formulas, and memory hooks. Dense but scannable markdown with headings and bullet lists. No filler prose.`;

const POMODORO_SYSTEM = `You are a study-session planner using the Pomodoro technique.
Output ONLY a JSON code block:
\`\`\`json
{"blocks":[{"n":1,"minutes":25,"topic":"...","goal":"one concrete, checkable goal"}]}
\`\`\`
Chunk the material into focused blocks. Goals must be verifiable ("can label all organelles"), not vague ("understand cells").`;

export function buildMethodPrompt(method: MethodId, material: string, opts: MethodOptions): MethodPrompt {
  const mat = `STUDY MATERIAL:\n"""\n${material}\n"""`;
  switch (method) {
    case "feynman":
      return { system: FEYNMAN_SYSTEM, user: `${mat}\n\nStart phase 1 (TEACH) now, then flip to me.` };
    case "pq4r":
      return { system: PQ4R_SYSTEM, user: `${mat}\n\nBegin with Step 1 of 6 — Preview.` };
    case "quiz": {
      const count = opts.count ?? 8;
      const difficulty = opts.difficulty ?? "mixed";
      return { system: QUIZ_SYSTEM, user: `${mat}\n\nGenerate ${count} questions, difficulty: ${difficulty}. Mix mcq and short types.` };
    }
    case "summary":
      return { system: SUMMARY_SYSTEM, user: `${mat}\n\nProduce the cheat sheet.` };
    case "pomodoro": {
      const blockMin = opts.blockMin ?? 25;
      return { system: POMODORO_SYSTEM, user: `${mat}\n\nPlan a session with ${blockMin}-minute focus blocks.` };
    }
  }
}

export const CHAT_SYSTEM = `You are a study assistant embedded in a node-canvas study app. You can see the student's uploaded material and recent generated results (provided below as context). Answer study questions, re-explain, make mnemonics, or quiz on request. Be concise and concrete. Respond in markdown.`;

export function buildChatContext(material: string, recentResults: string): string {
  const parts: string[] = [];
  if (material) parts.push(`CANVAS MATERIAL:\n"""\n${material}\n"""`);
  if (recentResults) parts.push(`RECENT RESULTS:\n"""\n${recentResults}\n"""`);
  return parts.join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prompts.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts.ts tests/prompts.test.ts && git commit -m "feat: study-method prompt builders"
```

---

### Task 5: Graph validation and resolution

**Files:**
- Create: `src/lib/graph.ts`
- Test: `tests/graph.test.ts`

Canvas JSON uses React Flow shape: `nodes: [{id, type, data}]`, `edges: [{source, target}]`. Node `type` ∈ `input | brain | output`. This module answers: is a wire legal? and: for an output node, which brain and which input nodes feed it?

- [ ] **Step 1: Write the failing test**

`tests/graph.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isValidEdge, resolveOutput, type Graph } from "@/lib/graph";

const g: Graph = {
  nodes: [
    { id: "f1", type: "input", data: { fileId: 11 } },
    { id: "f2", type: "input", data: { fileId: 12 } },
    { id: "b1", type: "brain", data: { provider: "claude", model: "sonnet" } },
    { id: "o1", type: "output", data: { method: "quiz" } },
    { id: "o2", type: "output", data: { method: "summary" } },
  ],
  edges: [
    { source: "f1", target: "b1" },
    { source: "f2", target: "b1" },
    { source: "b1", target: "o1" },
  ],
};

describe("graph", () => {
  it("allows input→brain and brain→output only", () => {
    expect(isValidEdge(g, "f1", "b1")).toBe(true);
    expect(isValidEdge(g, "b1", "o1")).toBe(true);
    expect(isValidEdge(g, "f1", "o1")).toBe(false);
    expect(isValidEdge(g, "o1", "b1")).toBe(false);
    expect(isValidEdge(g, "b1", "b1")).toBe(false);
  });
  it("resolves output → brain → inputs", () => {
    const r = resolveOutput(g, "o1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.brain.data.provider).toBe("claude");
      expect(r.inputs.map(n => n.id).sort()).toEqual(["f1", "f2"]);
    }
  });
  it("reports unwired output", () => {
    const r = resolveOutput(g, "o2");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/brain/i);
  });
  it("reports brain with no inputs", () => {
    const g2: Graph = { nodes: g.nodes, edges: [{ source: "b1", target: "o1" }] };
    const r = resolveOutput(g2, "o1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/input/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/graph.test.ts` → FAIL.

- [ ] **Step 3: Write src/lib/graph.ts**

```ts
export type NodeType = "input" | "brain" | "output";
export interface GNode { id: string; type: NodeType | string; data: Record<string, unknown>; }
export interface GEdge { source: string; target: string; }
export interface Graph { nodes: GNode[]; edges: GEdge[]; }

const LEGAL: Record<string, string> = { input: "brain", brain: "output" };

export function isValidEdge(g: Graph, sourceId: string, targetId: string): boolean {
  const s = g.nodes.find(n => n.id === sourceId);
  const t = g.nodes.find(n => n.id === targetId);
  if (!s || !t || s.id === t.id) return false;
  return LEGAL[s.type as string] === t.type;
}

export type Resolution =
  | { ok: true; brain: GNode; inputs: GNode[] }
  | { ok: false; error: string };

export function resolveOutput(g: Graph, outputId: string): Resolution {
  const out = g.nodes.find(n => n.id === outputId && n.type === "output");
  if (!out) return { ok: false, error: "Output node not found." };
  const brainEdge = g.edges.find(e => e.target === outputId);
  const brain = brainEdge && g.nodes.find(n => n.id === brainEdge.source && n.type === "brain");
  if (!brain) return { ok: false, error: "No brain connected to this output. Wire a brain node into it." };
  const inputs = g.edges
    .filter(e => e.target === brain.id)
    .map(e => g.nodes.find(n => n.id === e.source && n.type === "input"))
    .filter((n): n is GNode => Boolean(n));
  if (inputs.length === 0) return { ok: false, error: "The brain has no input files. Wire at least one input node into it." };
  return { ok: true, brain, inputs };
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/graph.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph.ts tests/graph.test.ts && git commit -m "feat: typed-port graph validation and output resolution"
```

---

### Task 6: Brain drivers (types, Ollama, Claude, registry)

**Files:**
- Create: `src/lib/brains/types.ts`, `src/lib/brains/ollama.ts`, `src/lib/brains/claude.ts`, `src/lib/brains/index.ts`
- Test: `tests/ollama.test.ts`

Claude driver is a thin Agent SDK wrapper — verified by manual smoke (Task 14), not unit tests (would spawn real CLI). Ollama driver is tested with mocked `fetch`.

- [ ] **Step 1: Write src/lib/brains/types.ts**

```ts
export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  /** base64-encoded images (no data: prefix) attached to a user message */
  images?: string[];
}

export interface StreamOpts {
  model: string;
  system: string;
  messages: ChatMsg[];
}

export interface BrainDriver {
  id: "claude" | "ollama";
  label: string;
  listModels(): Promise<string[]>;
  status(): Promise<{ ok: boolean; hint?: string }>;
  stream(opts: StreamOpts): AsyncGenerator<string>;
}
```

- [ ] **Step 2: Write the failing Ollama test**

`tests/ollama.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { ollamaDriver } from "@/lib/brains/ollama";

afterEach(() => vi.unstubAllGlobals());

function ndjsonResponse(lines: object[]): Response {
  const body = lines.map(l => JSON.stringify(l)).join("\n") + "\n";
  return new Response(body, { status: 200 });
}

describe("ollama driver", () => {
  it("lists models from /api/tags", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ models: [{ name: "llama3.2" }, { name: "qwen2.5" }] }))));
    expect(await ollamaDriver.listModels()).toEqual(["llama3.2", "qwen2.5"]);
  });
  it("status not-ok with hint when unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const s = await ollamaDriver.status();
    expect(s.ok).toBe(false);
    expect(s.hint).toMatch(/ollama/i);
  });
  it("streams chat content chunks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjsonResponse([
      { message: { content: "Hel" } }, { message: { content: "lo" } }, { done: true },
    ])));
    const chunks: string[] = [];
    for await (const c of ollamaDriver.stream({ model: "llama3.2", system: "s", messages: [{ role: "user", content: "hi" }] }))
      chunks.push(c);
    expect(chunks.join("")).toBe("Hello");
  });
});
```

- [ ] **Step 3: Run test to verify it fails** — `npx vitest run tests/ollama.test.ts` → FAIL.

- [ ] **Step 4: Write src/lib/brains/ollama.ts**

```ts
import type { BrainDriver, StreamOpts } from "./types";

const BASE = process.env.OLLAMA_URL ?? "http://localhost:11434";
const HINT = "Ollama unreachable. Start it (run `ollama serve` or launch the Ollama app) and try again.";

export const ollamaDriver: BrainDriver = {
  id: "ollama",
  label: "Ollama (local)",

  async listModels() {
    const res = await fetch(`${BASE}/api/tags`);
    const data = (await res.json()) as { models: { name: string }[] };
    return data.models.map(m => m.name);
  },

  async status() {
    try {
      const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok ? { ok: true } : { ok: false, hint: HINT };
    } catch {
      return { ok: false, hint: HINT };
    }
  },

  async *stream(opts: StreamOpts) {
    const messages = [
      { role: "system", content: opts.system },
      ...opts.messages.map(m => ({ role: m.role, content: m.content, ...(m.images?.length ? { images: m.images } : {}) })),
    ];
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: opts.model, messages, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const obj = JSON.parse(line);
        const chunk = obj?.message?.content;
        if (chunk) yield chunk as string;
      }
    }
  },
};
```

- [ ] **Step 5: Run test to verify it passes** — `npx vitest run tests/ollama.test.ts` → PASS.

- [ ] **Step 6: Write src/lib/brains/claude.ts**

```ts
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { exec } from "child_process";
import type { BrainDriver, StreamOpts } from "./types";

const MODELS = ["sonnet", "opus", "haiku"];
const HINT = "Claude Code CLI not available or not logged in. Install Claude Code and run `claude` once to log in with your subscription.";

function buildPrompt(opts: StreamOpts): string | AsyncIterable<SDKUserMessage> {
  const last = opts.messages[opts.messages.length - 1];
  const history = opts.messages.slice(0, -1)
    .map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  const text = history ? `CONVERSATION SO FAR:\n${history}\n\nUSER: ${last.content}` : last.content;
  if (!last.images?.length) return text;
  // streaming-input mode required for image blocks
  async function* gen(): AsyncIterable<SDKUserMessage> {
    yield {
      type: "user",
      session_id: "",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          ...last.images!.map(b64 => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/png" as const, data: b64 },
          })),
          { type: "text" as const, text },
        ],
      },
    };
  }
  return gen();
}

export const claudeDriver: BrainDriver = {
  id: "claude",
  label: "Claude (subscription)",

  async listModels() { return MODELS; },

  status() {
    return new Promise(resolve => {
      exec("claude --version", { timeout: 5000, shell: process.platform === "win32" ? "cmd.exe" : undefined },
        err => resolve(err ? { ok: false, hint: HINT } : { ok: true }));
    });
  },

  async *stream(opts: StreamOpts) {
    const q = query({
      prompt: buildPrompt(opts),
      options: {
        model: opts.model,
        systemPrompt: opts.system,
        allowedTools: [],
        maxTurns: 1,
        permissionMode: "bypassPermissions",
      },
    });
    for await (const message of q) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") yield block.text;
        }
      }
      if (message.type === "result" && message.subtype !== "success") {
        throw new Error(`Claude run failed: ${message.subtype}`);
      }
    }
  },
};
```

Note for implementer: if the installed `@anthropic-ai/claude-agent-sdk` version has different type names, check `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` and adapt the message-shape code — the streaming loop pattern (`for await` over `query()`, text blocks on `assistant` messages) is stable.

- [ ] **Step 7: Write src/lib/brains/index.ts**

```ts
import type { BrainDriver } from "./types";
import { claudeDriver } from "./claude";
import { ollamaDriver } from "./ollama";

export const DRIVERS: Record<string, BrainDriver> = {
  claude: claudeDriver,
  ollama: ollamaDriver,
};

export function getDriver(id: string): BrainDriver {
  const d = DRIVERS[id];
  if (!d) throw new Error(`Unknown brain provider: ${id}`);
  return d;
}
```

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit` — Expected: clean (fix any SDK type-shape drift per note).

```bash
git add src/lib/brains tests/ollama.test.ts && git commit -m "feat: claude and ollama brain drivers behind one interface"
```

---

### Task 7: Workflow runner

**Files:**
- Create: `src/lib/runner.ts`
- Test: `tests/runner.test.ts`

Runner: given db, graph, output node id → resolve, gather material (extracted text + images), build method prompt, stream from driver, persist run row. Driver injected for testability.

- [ ] **Step 1: Write the failing test**

`tests/runner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { openDb, createWorkflow } from "@/lib/db";
import { runOutputNode } from "@/lib/runner";
import type { BrainDriver } from "@/lib/brains/types";
import type { Graph } from "@/lib/graph";

const mockDriver: BrainDriver = {
  id: "ollama", label: "mock",
  listModels: async () => ["m"],
  status: async () => ({ ok: true }),
  async *stream(opts) {
    expect(opts.system.length).toBeGreaterThan(10);
    expect(opts.messages[0].content).toContain("MOCK MATERIAL");
    yield "Hello ";
    yield "world";
  },
};

function setup() {
  const db = openDb(":memory:");
  const wf = createWorkflow(db, "t");
  db.prepare(
    "INSERT INTO files (workflow_id, node_id, filename, path, mime, extracted_text, status) VALUES (?,?,?,?,?,?,?)"
  ).run(wf.id, "f1", "a.txt", "x", "text/plain", "MOCK MATERIAL about osmosis", "ready");
  const graph: Graph = {
    nodes: [
      { id: "f1", type: "input", data: {} },
      { id: "b1", type: "brain", data: { provider: "ollama", model: "m" } },
      { id: "o1", type: "output", data: { method: "summary" } },
    ],
    edges: [{ source: "f1", target: "b1" }, { source: "b1", target: "o1" }],
  };
  return { db, wf, graph };
}

describe("runner", () => {
  it("streams chunks and persists the run", async () => {
    const { db, wf, graph } = setup();
    const chunks: string[] = [];
    let runId = 0;
    for await (const ev of runOutputNode(db, wf.id, graph, "o1", { driver: mockDriver })) {
      if (ev.type === "start") runId = ev.runId;
      if (ev.type === "chunk") chunks.push(ev.text);
    }
    expect(chunks.join("")).toBe("Hello world");
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as { status: string; result_md: string };
    expect(row.status).toBe("done");
    expect(row.result_md).toBe("Hello world");
  });
  it("yields error event for unwired node and keeps partial result on driver failure", async () => {
    const { db, wf, graph } = setup();
    const events = [];
    for await (const ev of runOutputNode(db, wf.id, { ...graph, edges: [] }, "o1", { driver: mockDriver }))
      events.push(ev);
    expect(events[0].type).toBe("error");

    const failing: BrainDriver = { ...mockDriver, async *stream() { yield "partial"; throw new Error("boom"); } };
    let runId = 0; let sawError = false;
    for await (const ev of runOutputNode(db, wf.id, graph, "o1", { driver: failing })) {
      if (ev.type === "start") runId = ev.runId;
      if (ev.type === "error") sawError = true;
    }
    expect(sawError).toBe(true);
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as { status: string; result_md: string };
    expect(row.status).toBe("error");
    expect(row.result_md).toBe("partial");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/runner.test.ts` → FAIL.

- [ ] **Step 3: Write src/lib/runner.ts**

```ts
import fs from "fs/promises";
import type { DB } from "./db";
import type { Graph } from "./graph";
import { resolveOutput } from "./graph";
import { buildMethodPrompt, type MethodId, type MethodOptions } from "./prompts";
import { getDriver } from "./brains";
import type { BrainDriver, ChatMsg } from "./brains/types";

export type RunEvent =
  | { type: "start"; runId: number }
  | { type: "chunk"; text: string }
  | { type: "done"; runId: number }
  | { type: "error"; message: string };

interface FileRow { node_id: string; filename: string; path: string; extracted_text: string | null; status: string; }

/** Gather extracted text + image base64s for the given input node ids. */
export async function gatherMaterial(db: DB, workflowId: number, inputNodeIds: string[]) {
  const rows = db.prepare(
    `SELECT node_id, filename, path, extracted_text, status FROM files
     WHERE workflow_id = ? AND node_id IN (${inputNodeIds.map(() => "?").join(",")})`
  ).all(workflowId, ...inputNodeIds) as FileRow[];
  const texts: string[] = [];
  const images: string[] = [];
  for (const r of rows) {
    if (r.status === "image" || r.status === "needs_vision") {
      try { images.push((await fs.readFile(r.path)).toString("base64")); } catch { /* file moved */ }
    } else if (r.extracted_text) {
      texts.push(`--- ${r.filename} ---\n${r.extracted_text}`);
    }
  }
  return { material: texts.join("\n\n"), images };
}

export async function* runOutputNode(
  db: DB, workflowId: number, graph: Graph, outputId: string,
  opts?: { driver?: BrainDriver; methodOptions?: MethodOptions }
): AsyncGenerator<RunEvent> {
  const res = resolveOutput(graph, outputId);
  if (!res.ok) { yield { type: "error", message: res.error }; return; }

  const method = (graph.nodes.find(n => n.id === outputId)!.data.method ?? "summary") as MethodId;
  const provider = String(res.brain.data.provider ?? "claude");
  const model = String(res.brain.data.model ?? "sonnet");
  const driver = opts?.driver ?? getDriver(provider);

  const { material, images } = await gatherMaterial(db, workflowId, res.inputs.map(n => n.id));
  if (!material && images.length === 0) { yield { type: "error", message: "Connected inputs have no readable content yet." }; return; }

  const prompt = buildMethodPrompt(method, material || "(material provided as attached images)", opts?.methodOptions ?? {});
  const messages: ChatMsg[] = [{ role: "user", content: prompt.user, ...(images.length ? { images } : {}) }];

  const info = db.prepare(
    "INSERT INTO runs (workflow_id, node_id, method, brain, model, thread_json) VALUES (?,?,?,?,?,?)"
  ).run(workflowId, outputId, method, driver.id, model, JSON.stringify([{ role: "user", content: prompt.user }]));
  const runId = Number(info.lastInsertRowid);
  yield { type: "start", runId };

  let acc = "";
  try {
    for await (const chunk of driver.stream({ model, system: prompt.system, messages })) {
      acc += chunk;
      yield { type: "chunk", text: chunk };
    }
    const thread = [{ role: "user", content: prompt.user }, { role: "assistant", content: acc }];
    db.prepare("UPDATE runs SET status='done', result_md=?, thread_json=? WHERE id=?")
      .run(acc, JSON.stringify(thread), runId);
    yield { type: "done", runId };
  } catch (e) {
    db.prepare("UPDATE runs SET status='error', result_md=? WHERE id=?").run(acc, runId);
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 4: Run all tests** — `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runner.ts tests/runner.test.ts && git commit -m "feat: workflow runner with streaming and partial-result persistence"
```

---

### Task 8: API routes — workflows, files, brains

**Files:**
- Create: `src/app/api/workflows/route.ts`, `src/app/api/workflows/[id]/route.ts`, `src/app/api/files/route.ts`, `src/app/api/brains/route.ts`

Thin adapters over lib; no unit tests (logic lives in tested libs), verified via dev-server curl smoke in final step.

- [ ] **Step 1: Write workflows routes**

`src/app/api/workflows/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb, createWorkflow, listWorkflows } from "@/lib/db";

export async function GET() {
  return NextResponse.json(listWorkflows(getDb()));
}

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  return NextResponse.json(createWorkflow(getDb(), name.trim()));
}
```

`src/app/api/workflows/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb, getWorkflow, saveCanvas, deleteWorkflow } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const wf = getWorkflow(getDb(), Number(id));
  return wf ? NextResponse.json(wf) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { react_flow_json } = await req.json();
  saveCanvas(getDb(), Number(id), react_flow_json);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  deleteWorkflow(getDb(), Number(id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write file upload route**

`src/app/api/files/route.ts`:
```ts
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getDb } from "@/lib/db";
import { extractFile, estimateTokens } from "@/lib/extract";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const workflowId = Number(form.get("workflowId"));
  const nodeId = String(form.get("nodeId") ?? "");
  if (!file || !workflowId || !nodeId)
    return NextResponse.json({ error: "file, workflowId, nodeId required" }, { status: 400 });

  const dir = path.join(process.cwd(), "uploads", String(workflowId));
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${Date.now()}-${file.name}`);
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));

  const db = getDb();
  let status = "ready", text: string | null = null, pages: number | undefined, warning: string | undefined;
  try {
    const r = await extractFile(dest);
    pages = r.pages;
    if (r.kind === "text") text = r.text;
    else if (r.kind === "image") status = "image";
    else { status = "needs_vision"; warning = "No text layer found — pages will be sent as images to a vision-capable brain."; }
  } catch (e) {
    status = "error";
    warning = e instanceof Error ? e.message : String(e);
  }
  const info = db.prepare(
    "INSERT INTO files (workflow_id, node_id, filename, path, mime, extracted_text, status) VALUES (?,?,?,?,?,?,?)"
  ).run(workflowId, nodeId, file.name, dest, file.type || "application/octet-stream", text, status);

  return NextResponse.json({
    id: Number(info.lastInsertRowid), filename: file.name, status, pages, warning,
    tokens: text ? estimateTokens(text) : 0,
  });
}
```

- [ ] **Step 3: Write brains status route**

`src/app/api/brains/route.ts`:
```ts
import { NextResponse } from "next/server";
import { DRIVERS } from "@/lib/brains";

export async function GET() {
  const out: Record<string, { ok: boolean; hint?: string; models: string[] }> = {};
  await Promise.all(Object.values(DRIVERS).map(async d => {
    const status = await d.status();
    let models: string[] = [];
    if (status.ok) { try { models = await d.listModels(); } catch { /* leave empty */ } }
    out[d.id] = { ...status, models };
  }));
  return NextResponse.json(out);
}
```

- [ ] **Step 4: Smoke via dev server**

Run: `npm run dev` then:
```bash
curl -s -X POST localhost:3000/api/workflows -H "content-type: application/json" -d '{"name":"Test"}'
curl -s localhost:3000/api/workflows
curl -s localhost:3000/api/brains
```
Expected: JSON workflow with id; list containing it; brains object with `claude`/`ollama` status fields.

- [ ] **Step 5: Commit**

```bash
git add src/app/api && git commit -m "feat: workflows, file upload, and brain status API routes"
```

---

### Task 9: API routes — run (SSE), reply, chat, quiz, pomodoro

**Files:**
- Create: `src/app/api/run/route.ts`, `src/app/api/runs/[id]/reply/route.ts`, `src/app/api/chat/route.ts`, `src/app/api/quiz/route.ts`, `src/app/api/pomodoro/route.ts`

- [ ] **Step 1: Write shared SSE helper inline pattern + run route**

`src/app/api/run/route.ts`:
```ts
import { getDb, getWorkflow } from "@/lib/db";
import { runOutputNode } from "@/lib/runner";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { workflowId, nodeId, methodOptions } = await req.json();
  const db = getDb();
  const wf = getWorkflow(db, workflowId);
  if (!wf) return new Response("workflow not found", { status: 404 });
  const graph = JSON.parse(wf.react_flow_json);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const ev of runOutputNode(db, workflowId, graph, nodeId, { methodOptions })) send(ev);
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
      send({ done: true });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}
```

- [ ] **Step 2: Write reply route (powers Feynman flip, PQ4R steps, quiz grading)**

`src/app/api/runs/[id]/reply/route.ts`:
```ts
import { getDb } from "@/lib/db";
import { getDriver } from "@/lib/brains";
import type { ChatMsg } from "@/lib/brains/types";
import { buildMethodPrompt, type MethodId } from "@/lib/prompts";

export const dynamic = "force-dynamic";

interface RunRow { id: number; method: string; brain: string; model: string; thread_json: string; }

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { message } = await req.json();
  const db = getDb();
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(Number(id)) as RunRow | undefined;
  if (!run) return new Response("run not found", { status: 404 });

  const thread = JSON.parse(run.thread_json) as ChatMsg[];
  thread.push({ role: "user", content: message });
  const system = buildMethodPrompt(run.method as MethodId, "", {}).system;
  const driver = getDriver(run.brain);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let acc = "";
      try {
        for await (const chunk of driver.stream({ model: run.model, system, messages: thread })) {
          acc += chunk;
          send({ type: "chunk", text: chunk });
        }
        thread.push({ role: "assistant", content: acc });
        db.prepare("UPDATE runs SET thread_json = ? WHERE id = ?").run(JSON.stringify(thread), run.id);
        send({ type: "done", runId: run.id });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
      send({ done: true });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
```

- [ ] **Step 3: Write chat route**

`src/app/api/chat/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDriver } from "@/lib/brains";
import type { ChatMsg } from "@/lib/brains/types";
import { CHAT_SYSTEM, buildChatContext } from "@/lib/prompts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const workflowId = Number(new URL(req.url).searchParams.get("workflowId"));
  const rows = getDb().prepare(
    "SELECT role, content FROM chat_messages WHERE workflow_id = ? ORDER BY id"
  ).all(workflowId);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { workflowId, message, provider = "claude", model = "sonnet" } = await req.json();
  const db = getDb();

  const material = (db.prepare(
    "SELECT filename, extracted_text FROM files WHERE workflow_id = ? AND extracted_text IS NOT NULL"
  ).all(workflowId) as { filename: string; extracted_text: string }[])
    .map(f => `--- ${f.filename} ---\n${f.extracted_text}`).join("\n\n").slice(0, 60_000);
  const recent = (db.prepare(
    "SELECT method, result_md FROM runs WHERE workflow_id = ? AND status='done' ORDER BY id DESC LIMIT 3"
  ).all(workflowId) as { method: string; result_md: string }[])
    .map(r => `[${r.method}]\n${r.result_md}`).join("\n\n").slice(0, 20_000);

  const history = (db.prepare(
    "SELECT role, content FROM chat_messages WHERE workflow_id = ? ORDER BY id DESC LIMIT 20"
  ).all(workflowId) as ChatMsg[]).reverse();

  db.prepare("INSERT INTO chat_messages (workflow_id, role, content) VALUES (?,?,?)").run(workflowId, "user", message);

  const system = `${CHAT_SYSTEM}\n\n${buildChatContext(material, recent)}`;
  const messages: ChatMsg[] = [...history, { role: "user", content: message }];
  const driver = getDriver(provider);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let acc = "";
      try {
        for await (const chunk of driver.stream({ model, system, messages })) {
          acc += chunk;
          send({ type: "chunk", text: chunk });
        }
        db.prepare("INSERT INTO chat_messages (workflow_id, role, content) VALUES (?,?,?)").run(workflowId, "assistant", acc);
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
      send({ done: true });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}
```

- [ ] **Step 4: Write quiz + pomodoro routes**

`src/app/api/quiz/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  const { runId, attempts } = await req.json() as
    { runId: number; attempts: { question: string; user_answer: string; correct: boolean | null; feedback: string }[] };
  const db = getDb();
  const ins = db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct, feedback) VALUES (?,?,?,?,?)");
  for (const a of attempts)
    ins.run(runId, a.question, a.user_answer, a.correct === null ? null : a.correct ? 1 : 0, a.feedback);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/pomodoro/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  const workflowId = Number(new URL(req.url).searchParams.get("workflowId"));
  const db = getDb();
  const today = db.prepare(
    "SELECT COALESCE(SUM(planned_min),0) m FROM pomodoro_blocks WHERE workflow_id=? AND date(completed_at)=date('now')"
  ).get(workflowId) as { m: number };
  const week = db.prepare(
    "SELECT COALESCE(SUM(planned_min),0) m FROM pomodoro_blocks WHERE workflow_id=? AND completed_at >= datetime('now','-7 days')"
  ).get(workflowId) as { m: number };
  return NextResponse.json({ todayMin: today.m, weekMin: week.m });
}

export async function POST(req: Request) {
  const { workflowId, label, plannedMin } = await req.json();
  getDb().prepare("INSERT INTO pomodoro_blocks (workflow_id, label, planned_min) VALUES (?,?,?)")
    .run(workflowId, label, plannedMin);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Typecheck, run tests, commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: clean + all pass.

```bash
git add src/app/api && git commit -m "feat: run/reply/chat SSE routes plus quiz and pomodoro persistence"
```

---

### Task 10: Frontend — store, top bar, palette, canvas, node components

**Files:**
- Create: `src/store.ts`, `src/components/TopBar.tsx`, `src/components/Palette.tsx`, `src/components/Canvas.tsx`, `src/components/nodes/InputNode.tsx`, `src/components/nodes/BrainNode.tsx`, `src/components/nodes/OutputNode.tsx`
- Modify: `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Write src/store.ts (React context, no extra deps)**

```tsx
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

export interface PomodoroBlock { n: number; minutes: number; topic: string; goal: string; }
export interface BrainsStatus { [id: string]: { ok: boolean; hint?: string; models: string[] }; }

interface AppState {
  workflowId: number | null;
  setWorkflowId: (id: number | null) => void;
  openRunId: number | null;                 // run shown in ResultPanel
  setOpenRunId: (id: number | null) => void;
  openMethod: string | null;
  setOpenMethod: (m: string | null) => void;
  plan: PomodoroBlock[] | null;             // active pomodoro plan
  setPlan: (p: PomodoroBlock[] | null) => void;
  brains: BrainsStatus;
  setBrains: (b: BrainsStatus) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [workflowId, setWorkflowId] = useState<number | null>(null);
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  const [openMethod, setOpenMethod] = useState<string | null>(null);
  const [plan, setPlan] = useState<PomodoroBlock[] | null>(null);
  const [brains, setBrains] = useState<BrainsStatus>({});
  return (
    <Ctx.Provider value={{ workflowId, setWorkflowId, openRunId, setOpenRunId, openMethod, setOpenMethod, plan, setPlan, brains, setBrains }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

/** Consume an SSE POST response, invoking onEvent per data line. */
export async function readSse(res: Response, onEvent: (obj: any) => void) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);
      if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)));
    }
  }
}
```

- [ ] **Step 2: Write node components**

`src/components/nodes/InputNode.tsx`:
```tsx
"use client";
import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { useRef, useState } from "react";
import { useApp } from "@/store";

export default function InputNode({ id, data }: NodeProps) {
  const { workflowId } = useApp();
  const rf = useReactFlow();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const d = data as { filename?: string; status?: string; tokens?: number; warning?: string };

  async function upload(files: FileList | null) {
    if (!files?.length || !workflowId) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("workflowId", String(workflowId));
      form.append("nodeId", id);
      const res = await fetch("/api/files", { method: "POST", body: form });
      const j = await res.json();
      rf.updateNodeData(id, { filename: j.filename, status: j.status, tokens: j.tokens, warning: j.warning });
    }
    setBusy(false);
  }

  const badge = d.status === "error" ? "⛔" : d.status === "needs_vision" ? "⚠️" : d.status ? "✓" : "";
  return (
    <div className="node node-input" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files); }}>
      <div className="node-title">📄 Input {badge}</div>
      {d.filename
        ? <div className="node-sub">{d.filename}{d.tokens ? ` · ~${d.tokens} tok` : ""}</div>
        : <button className="node-btn" onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : "Choose / drop file"}</button>}
      {d.warning && <div className="node-warn">{d.warning}</div>}
      <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
        onChange={e => upload(e.target.files)} multiple />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

`src/components/nodes/BrainNode.tsx`:
```tsx
"use client";
import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { useApp } from "@/store";

export default function BrainNode({ id, data }: NodeProps) {
  const rf = useReactFlow();
  const { brains } = useApp();
  const d = data as { provider?: string; model?: string };
  const provider = d.provider ?? "claude";
  const st = brains[provider];
  const models = st?.models ?? [];

  return (
    <div className="node node-brain">
      <Handle type="target" position={Position.Left} />
      <div className="node-title">🧠 Brain <span title={st?.hint ?? ""}>{st ? (st.ok ? "🟢" : "🔴") : "…"}</span></div>
      <select className="node-select" value={provider}
        onChange={e => rf.updateNodeData(id, { provider: e.target.value, model: "" })}>
        <option value="claude">Claude (subscription)</option>
        <option value="ollama">Ollama (local)</option>
      </select>
      <select className="node-select" value={d.model ?? ""} onChange={e => rf.updateNodeData(id, { model: e.target.value })}>
        <option value="" disabled>model…</option>
        {models.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      {st && !st.ok && <div className="node-warn">{st.hint}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

`src/components/nodes/OutputNode.tsx`:
```tsx
"use client";
import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { useState } from "react";
import { useApp, readSse } from "@/store";
import { METHODS } from "@/lib/prompts";

export default function OutputNode({ id, data }: NodeProps) {
  const { workflowId, setOpenRunId, setOpenMethod, setPlan } = useApp();
  const rf = useReactFlow();
  const d = data as { method?: string; runId?: number; preview?: string; state?: string; error?: string };
  const method = d.method ?? "summary";
  const [running, setRunning] = useState(false);

  async function run() {
    if (!workflowId || running) return;
    setRunning(true);
    rf.updateNodeData(id, { state: "running", error: undefined, preview: "" });
    let acc = "", runId = 0;
    const res = await fetch("/api/run", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowId, nodeId: id }),
    });
    await readSse(res, ev => {
      if (ev.type === "start") { runId = ev.runId; rf.updateNodeData(id, { runId: ev.runId }); }
      if (ev.type === "chunk") { acc += ev.text; rf.updateNodeData(id, { preview: acc.slice(-160) }); }
      if (ev.type === "error") rf.updateNodeData(id, { state: "error", error: ev.message });
      if (ev.type === "done") {
        rf.updateNodeData(id, { state: "done" });
        if (method === "pomodoro") {
          const m = acc.match(/```json\s*([\s\S]*?)```/);
          if (m) { try { setPlan(JSON.parse(m[1]).blocks); } catch { /* malformed plan */ } }
        }
      }
    });
    setRunning(false);
  }

  const meta = METHODS[method as keyof typeof METHODS] ?? { label: method, icon: "📤" };
  return (
    <div className="node node-output">
      <Handle type="target" position={Position.Left} />
      <div className="node-title">{meta.icon} {meta.label}</div>
      <div className="node-row">
        <button className="node-btn" onClick={run} disabled={running}>{running ? "⏳ Running…" : "▶ Run"}</button>
        {d.runId && d.state !== "running" && (
          <button className="node-btn" onClick={() => { setOpenRunId(d.runId!); setOpenMethod(method); }}>Open</button>
        )}
      </div>
      {d.state === "error" && <div className="node-warn">{d.error} <button className="node-btn" onClick={run}>Retry</button></div>}
      {d.preview && <div className="node-preview">{d.preview}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Write Palette and TopBar**

`src/components/Palette.tsx`:
```tsx
"use client";
import { METHODS } from "@/lib/prompts";

const ITEMS = [
  { type: "input", data: {}, label: "📄 File Input", cls: "pal-input" },
  { type: "brain", data: { provider: "claude", model: "sonnet" }, label: "🧠 Brain", cls: "pal-brain" },
  ...Object.entries(METHODS).map(([method, m]) => ({
    type: "output", data: { method }, label: `${m.icon} ${m.label}`, cls: "pal-output",
  })),
];

export default function Palette() {
  return (
    <aside className="palette">
      <div className="palette-head">Drag onto canvas</div>
      {ITEMS.map((it, i) => (
        <div key={i} className={`pal-item ${it.cls}`} draggable
          onDragStart={e => e.dataTransfer.setData("application/sg-node", JSON.stringify({ type: it.type, data: it.data }))}>
          {it.label}
        </div>
      ))}
    </aside>
  );
}
```

`src/components/TopBar.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/store";

interface Wf { id: number; name: string; }

export default function TopBar({ onRunAll }: { onRunAll: () => void }) {
  const { workflowId, setWorkflowId, setBrains } = useApp();
  const [wfs, setWfs] = useState<Wf[]>([]);

  async function refresh() {
    const list: Wf[] = await (await fetch("/api/workflows")).json();
    setWfs(list);
    if (list.length && workflowId === null) setWorkflowId(list[0].id);
  }
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const load = () => fetch("/api/brains").then(r => r.json()).then(setBrains);
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [setBrains]);

  async function create() {
    const name = prompt("Workflow name?");
    if (!name) return;
    const wf = await (await fetch("/api/workflows", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
    })).json();
    await refresh();
    setWorkflowId(wf.id);
  }

  return (
    <div className="topbar">
      <strong>🎓 Study Guide</strong>
      <select value={workflowId ?? ""} onChange={e => setWorkflowId(Number(e.target.value))}>
        {wfs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <button onClick={create}>+ New</button>
      <button onClick={onRunAll}>▶▶ Run All</button>
    </div>
  );
}
```

- [ ] **Step 4: Write Canvas.tsx**

```tsx
"use client";
import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge,
  type Connection, type Edge, type Node, useReactFlow, ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { isValidEdge } from "@/lib/graph";
import { useApp } from "@/store";
import InputNode from "./nodes/InputNode";
import BrainNode from "./nodes/BrainNode";
import OutputNode from "./nodes/OutputNode";

const nodeTypes = { input: InputNode, brain: BrainNode, output: OutputNode };

function CanvasInner({ runAllRef }: { runAllRef: React.MutableRefObject<() => void> }) {
  const { workflowId } = useApp();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const rf = useReactFlow();
  const loaded = useRef(false);

  // load canvas on workflow switch
  useEffect(() => {
    if (!workflowId) return;
    loaded.current = false;
    fetch(`/api/workflows/${workflowId}`).then(r => r.json()).then(wf => {
      const g = JSON.parse(wf.react_flow_json);
      setNodes(g.nodes ?? []);
      setEdges(g.edges ?? []);
      loaded.current = true;
    });
  }, [workflowId, setNodes, setEdges]);

  // debounced autosave
  useEffect(() => {
    if (!workflowId || !loaded.current) return;
    const t = setTimeout(() => {
      fetch(`/api/workflows/${workflowId}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ react_flow_json: JSON.stringify({ nodes, edges }) }),
      });
    }, 600);
    return () => clearTimeout(t);
  }, [nodes, edges, workflowId]);

  const graph = { nodes: nodes.map(n => ({ id: n.id, type: n.type ?? "", data: n.data })), edges };

  const isValidConnection = useCallback(
    (c: Connection | Edge) => isValidEdge(graph, c.source!, c.target!),
    [graph]);

  const onConnect = useCallback((c: Connection) => setEdges(es => addEdge(c, es)), [setEdges]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/sg-node");
    if (!raw) return;
    const { type, data } = JSON.parse(raw);
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setNodes(ns => [...ns, { id: `${type}-${Date.now()}`, type, position: pos, data: { ...data } }]);
  }, [rf, setNodes]);

  // Run All = click every output node's run via a DOM-free approach: trigger a custom event per node
  runAllRef.current = () => {
    document.querySelectorAll<HTMLButtonElement>(".node-output .node-btn").forEach(b => {
      if (b.textContent?.includes("Run")) b.click();
    });
  };

  return (
    <ReactFlow
      nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onConnect={onConnect} isValidConnection={isValidConnection}
      onDrop={onDrop} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      fitView deleteKeyCode={["Backspace", "Delete"]}>
      <Background gap={20} />
      <Controls />
    </ReactFlow>
  );
}

export default function Canvas({ runAllRef }: { runAllRef: React.MutableRefObject<() => void> }) {
  return <ReactFlowProvider><CanvasInner runAllRef={runAllRef} /></ReactFlowProvider>;
}
```

- [ ] **Step 5: Write page.tsx layout shell + CSS**

`src/app/page.tsx`:
```tsx
"use client";
import { useRef } from "react";
import { AppProvider } from "@/store";
import TopBar from "@/components/TopBar";
import Palette from "@/components/Palette";
import Canvas from "@/components/Canvas";
import ResultPanel from "@/components/ResultPanel";
import ChatPanel from "@/components/ChatPanel";
import PomodoroBar from "@/components/PomodoroBar";

export default function Home() {
  const runAllRef = useRef<() => void>(() => {});
  return (
    <AppProvider>
      <div className="shell">
        <TopBar onRunAll={() => runAllRef.current()} />
        <PomodoroBar />
        <div className="main">
          <Palette />
          <div className="canvas-wrap"><Canvas runAllRef={runAllRef} /></div>
          <ChatPanel />
        </div>
        <ResultPanel />
      </div>
    </AppProvider>
  );
}
```

Append to `src/app/globals.css`:
```css
.shell { display: flex; flex-direction: column; height: 100vh; }
.main { display: flex; flex: 1; min-height: 0; }
.canvas-wrap { flex: 1; min-width: 0; }
.topbar { display: flex; gap: 10px; align-items: center; padding: 8px 14px; background: var(--panel); border-bottom: 1px solid var(--border); }
.topbar select, .topbar button { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; }
.palette { width: 190px; background: var(--panel); border-right: 1px solid var(--border); padding: 10px; overflow-y: auto; }
.palette-head { font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.pal-item { padding: 8px 10px; margin-bottom: 6px; border-radius: 8px; border: 1px solid var(--border); cursor: grab; font-size: 13px; background: var(--bg); }
.pal-input { border-left: 3px solid var(--blue); }
.pal-brain { border-left: 3px solid var(--purple); }
.pal-output { border-left: 3px solid var(--green); }
.node { border-radius: 10px; padding: 10px; font-size: 12px; background: var(--panel); min-width: 170px; max-width: 230px; }
.node-input { border: 2px solid var(--blue); }
.node-brain { border: 2px solid var(--purple); }
.node-output { border: 2px solid var(--green); }
.node-title { font-weight: 600; margin-bottom: 6px; }
.node-sub { color: var(--muted); word-break: break-all; }
.node-row { display: flex; gap: 6px; }
.node-btn { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; font-size: 12px; }
.node-select { width: 100%; margin-top: 4px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 3px; }
.node-warn { margin-top: 6px; color: var(--amber); font-size: 11px; }
.node-preview { margin-top: 6px; color: var(--muted); font-size: 11px; max-height: 60px; overflow: hidden; border-top: 1px dashed var(--border); padding-top: 4px; }
.react-flow__edge-path { stroke: #6b7280; }
```

`ResultPanel`, `ChatPanel`, `PomodoroBar` don't exist yet — create empty stubs so the page compiles, filled in Tasks 11–13:
```tsx
"use client";
export default function ResultPanel() { return null; }
```
(same pattern for `ChatPanel.tsx`, `PomodoroBar.tsx`).

- [ ] **Step 6: Manual verify**

Run: `npm run dev`. Expected: canvas renders; drag palette items on; wires connect only Input→Brain and Brain→Output (invalid attempts refuse to attach); reload restores layout; file upload on an input node shows ✓ + token estimate; brain node shows status dots.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: node canvas with typed ports, palette, autosave, upload and brain nodes"
```

---

### Task 11: ResultPanel — streaming results, follow-up thread, quiz interaction

**Files:**
- Modify: `src/components/ResultPanel.tsx` (replace stub)
- Modify: `src/app/globals.css` (append panel styles)

Covers spec: result full view, Feynman flip/gap-hunt, PQ4R stepper (both are just follow-up turns — system prompts drive the behavior), quiz answering + grading + attempt storage + retry-misses.

- [ ] **Step 1: Write ResultPanel.tsx**

```tsx
"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useApp, readSse } from "@/store";

interface Msg { role: "user" | "assistant"; content: string; }
interface QuizQ { id: number; type: "mcq" | "short"; question: string; choices?: string[]; answer: string; }

function parseQuiz(md: string): QuizQ[] | null {
  const m = md.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try { const a = JSON.parse(m[1]); return Array.isArray(a) ? a : null; } catch { return null; }
}

export default function ResultPanel() {
  const { openRunId, setOpenRunId, openMethod } = useApp();
  const [thread, setThread] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!openRunId) return;
    setThread([]); setQuizAnswers({});
    fetch(`/api/runs/${openRunId}`).then(r => r.json()).then(run => setThread(JSON.parse(run.thread_json)));
  }, [openRunId]);

  if (!openRunId) return null;
  const quiz = openMethod === "quiz" && thread.length >= 2 ? parseQuiz(thread[1].content) : null;

  async function send(message: string) {
    setBusy(true);
    setThread(t => [...t, { role: "user", content: message }, { role: "assistant", content: "" }]);
    const res = await fetch(`/api/runs/${openRunId}/reply`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }),
    });
    let acc = "";
    await readSse(res, ev => {
      if (ev.type === "chunk") { acc += ev.text; setThread(t => [...t.slice(0, -1), { role: "assistant", content: acc }]); }
      if (ev.type === "error") setThread(t => [...t.slice(0, -1), { role: "assistant", content: `⛔ ${ev.message}` }]);
    });
    setBusy(false);
    return acc;
  }

  async function submitQuiz() {
    if (!quiz) return;
    const answerText = quiz.map(q => `Q${q.id}: ${quizAnswers[q.id] ?? "(blank)"}`).join("\n");
    const feedback = await send(`My answers:\n${answerText}\n\nGrade them.`);
    await fetch("/api/quiz", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: openRunId,
        attempts: quiz.map(q => ({ question: q.question, user_answer: quizAnswers[q.id] ?? "", correct: null, feedback })),
      }),
    });
  }

  return (
    <div className="result-panel">
      <div className="result-head">
        <strong>Result — run #{openRunId}</strong>
        <button className="node-btn" onClick={() => setOpenRunId(null)}>✕ Close</button>
      </div>
      <div className="result-body">
        {thread.slice(1).map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === "assistant" ? <ReactMarkdown>{m.content}</ReactMarkdown> : <em>{m.content}</em>}
          </div>
        ))}
        {quiz && (
          <div className="quiz-form">
            {quiz.map(q => (
              <div key={q.id} className="quiz-q">
                <div><b>Q{q.id}.</b> {q.question}</div>
                {q.type === "mcq" && q.choices ? q.choices.map(c => (
                  <label key={c} style={{ display: "block" }}>
                    <input type="radio" name={`q${q.id}`} checked={quizAnswers[q.id] === c}
                      onChange={() => setQuizAnswers(a => ({ ...a, [q.id]: c }))} /> {c}
                  </label>
                )) : (
                  <input className="node-select" placeholder="your answer"
                    value={quizAnswers[q.id] ?? ""} onChange={e => setQuizAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
                )}
              </div>
            ))}
            <button className="node-btn" disabled={busy} onClick={submitQuiz}>Submit answers for grading</button>
            <button className="node-btn" disabled={busy}
              onClick={() => send("Generate a new, harder set of questions focused on what I answered weakly above. Same JSON format.")}>
              🔁 Retry misses
            </button>
          </div>
        )}
      </div>
      <div className="result-input">
        <input value={draft} placeholder={openMethod === "feynman" ? "Explain it back in your own words…" : openMethod === "pq4r" ? "Reply to continue to the next step…" : "Follow up…"}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && draft.trim() && !busy) { send(draft.trim()); setDraft(""); } }} />
        <button className="node-btn" disabled={busy || !draft.trim()} onClick={() => { send(draft.trim()); setDraft(""); }}>Send</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add GET run route** (panel loads thread)

`src/app/api/runs/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(Number(id));
  return run ? NextResponse.json(run) : NextResponse.json({ error: "not found" }, { status: 404 });
}
```

- [ ] **Step 3: Append panel CSS**

```css
.result-panel { position: fixed; right: 0; top: 0; bottom: 0; width: min(560px, 90vw); background: var(--panel); border-left: 1px solid var(--border); display: flex; flex-direction: column; z-index: 30; }
.result-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.result-body { flex: 1; overflow-y: auto; padding: 14px; }
.result-body h1, .result-body h2, .result-body h3 { margin: 12px 0 6px; }
.result-body ul, .result-body ol { margin: 6px 0 6px 20px; }
.result-body pre { background: var(--bg); padding: 8px; border-radius: 8px; overflow-x: auto; margin: 8px 0; }
.msg { margin-bottom: 12px; }
.msg-user { color: var(--muted); border-left: 3px solid var(--border); padding-left: 8px; }
.result-input { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--border); }
.result-input input { flex: 1; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.quiz-form { border-top: 1px dashed var(--border); margin-top: 10px; padding-top: 10px; }
.quiz-q { margin-bottom: 12px; }
```

- [ ] **Step 4: Manual verify**

Run: `npm run dev`. With Ollama running (or Claude logged in): upload a .md file → wire → run Summary → Open → full markdown renders. Run Feynman → reply with your own explanation → gap-hunt response streams. Run Quiz → interactive form renders → submit → grading streams → `quiz_attempts` row exists (`npx better-sqlite3 data.sqlite "select count(*) from quiz_attempts"` or check via any sqlite tool).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: result panel with follow-up thread and interactive quiz"
```

---

### Task 12: ChatPanel

**Files:**
- Modify: `src/components/ChatPanel.tsx` (replace stub)
- Modify: `src/app/globals.css` (append)

- [ ] **Step 1: Write ChatPanel.tsx**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useApp, readSse } from "@/store";

interface Msg { role: string; content: string; }

export default function ChatPanel() {
  const { workflowId, brains } = useApp();
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState("claude");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workflowId) return;
    fetch(`/api/chat?workflowId=${workflowId}`).then(r => r.json()).then(setMsgs);
  }, [workflowId]);
  useEffect(() => { bottom.current?.scrollIntoView(); }, [msgs]);

  async function send() {
    const message = draft.trim();
    if (!message || busy || !workflowId) return;
    setDraft(""); setBusy(true);
    setMsgs(m => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    const model = provider === "claude" ? "sonnet" : (brains.ollama?.models[0] ?? "");
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowId, message, provider, model }),
    });
    let acc = "";
    await readSse(res, ev => {
      if (ev.type === "chunk") { acc += ev.text; setMsgs(m => [...m.slice(0, -1), { role: "assistant", content: acc }]); }
      if (ev.type === "error") setMsgs(m => [...m.slice(0, -1), { role: "assistant", content: `⛔ ${ev.message}` }]);
    });
    setBusy(false);
  }

  if (!open) return <button className="chat-toggle" onClick={() => setOpen(true)}>💬</button>;
  return (
    <aside className="chat-panel">
      <div className="chat-head">
        <strong>💬 Chat</strong>
        <select value={provider} onChange={e => setProvider(e.target.value)}>
          <option value="claude">Claude</option><option value="ollama">Ollama</option>
        </select>
        <button className="node-btn" onClick={() => setOpen(false)}>—</button>
      </div>
      <div className="chat-body">
        {msgs.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === "assistant" ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="result-input">
        <input value={draft} placeholder="Ask about your material…" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()} />
        <button className="node-btn" disabled={busy} onClick={send}>Send</button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Append CSS**

```css
.chat-panel { width: 320px; background: var(--panel); border-left: 1px solid var(--border); display: flex; flex-direction: column; }
.chat-head { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.chat-head select { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; }
.chat-body { flex: 1; overflow-y: auto; padding: 12px; font-size: 13px; }
.chat-toggle { position: fixed; right: 14px; bottom: 14px; z-index: 20; border-radius: 50%; width: 44px; height: 44px; border: 1px solid var(--border); background: var(--panel); color: var(--text); font-size: 18px; }
```

- [ ] **Step 3: Manual verify** — chat answers questions about uploaded material; history survives reload; collapse/expand works.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: context-aware docked chat panel"
```

---

### Task 13: PomodoroBar

**Files:**
- Modify: `src/components/PomodoroBar.tsx` (replace stub)
- Modify: `src/app/globals.css` (append)

- [ ] **Step 1: Write PomodoroBar.tsx**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store";

const BREAK_MIN = 5, LONG_BREAK_MIN = 15;

export default function PomodoroBar() {
  const { plan, setPlan, workflowId } = useApp();
  const [blockIdx, setBlockIdx] = useState(0);
  const [phase, setPhase] = useState<"idle" | "focus" | "break">("idle");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState<{ todayMin: number; weekMin: number } | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!workflowId) return;
    fetch(`/api/pomodoro?workflowId=${workflowId}`).then(r => r.json()).then(setStats);
  }, [workflowId, phase]);

  function notify(msg: string) {
    try {
      if (Notification.permission === "granted") new Notification("🍅 Study Guide", { body: msg });
      else if (Notification.permission !== "denied") Notification.requestPermission();
    } catch { /* notifications unavailable */ }
    new AudioContext().resume().then(ctx0 => {
      const ctx = ctx0 as AudioContext; const o = ctx.createOscillator(); o.connect(ctx.destination);
      o.frequency.value = 660; o.start(); setTimeout(() => o.stop(), 300);
    }).catch(() => {});
  }

  function startBlock(i: number) {
    if (!plan) return;
    setBlockIdx(i); setPhase("focus"); setSecondsLeft(plan[i].minutes * 60); setPaused(false);
  }

  useEffect(() => {
    if (phase === "idle" || paused) return;
    tick.current = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [phase, paused]);

  useEffect(() => {
    if (phase === "idle" || secondsLeft > 0) return;
    if (phase === "focus" && plan) {
      const b = plan[blockIdx];
      fetch("/api/pomodoro", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowId, label: b.topic, plannedMin: b.minutes }),
      });
      const isLong = (blockIdx + 1) % 4 === 0;
      notify(`Block ${b.n} done! ${isLong ? "Long break" : "Break"} time.`);
      setPhase("break"); setSecondsLeft((isLong ? LONG_BREAK_MIN : BREAK_MIN) * 60);
    } else if (phase === "break" && plan) {
      if (blockIdx + 1 < plan.length) { notify(`Break over — next: ${plan[blockIdx + 1].topic}`); startBlock(blockIdx + 1); }
      else { notify("Session complete! 🎉"); setPhase("idle"); setPlan(null); }
    }
  }, [secondsLeft, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan) return null;
  const b = plan[blockIdx];
  const mm = String(Math.max(0, Math.floor(secondsLeft / 60))).padStart(2, "0");
  const ss = String(Math.max(0, secondsLeft % 60)).padStart(2, "0");
  const total = phase === "focus" ? b.minutes * 60 : phase === "break" ? BREAK_MIN * 60 : 1;
  const pct = phase === "idle" ? 0 : (1 - secondsLeft / total) * 100;

  return (
    <div className="pomo-bar">
      <span className="pomo-time">🍅 {phase === "idle" ? "--:--" : `${mm}:${ss}`}</span>
      <div className="pomo-mid">
        <div className="pomo-label">
          {phase === "idle" ? `Plan ready: ${plan.length} blocks — press Start` :
           phase === "break" ? "Break ☕" : `Block ${b.n}/${plan.length} — ${b.topic} (goal: ${b.goal})`}
        </div>
        <div className="pomo-track"><div className="pomo-fill" style={{ width: `${pct}%` }} /></div>
      </div>
      {phase === "idle"
        ? <button className="node-btn" onClick={() => startBlock(0)}>▶ Start session</button>
        : <>
            <button className="node-btn" onClick={() => setPaused(p => !p)}>{paused ? "▶ Resume" : "⏸ Pause"}</button>
            <button className="node-btn" onClick={() => setSecondsLeft(0)}>⏭ Skip</button>
          </>}
      {stats && <span className="pomo-stats">today {stats.todayMin}m · week {stats.weekMin}m</span>}
      <button className="node-btn" onClick={() => { setPhase("idle"); setPlan(null); }}>✕</button>
    </div>
  );
}
```

- [ ] **Step 2: Append CSS**

```css
.pomo-bar { display: flex; gap: 12px; align-items: center; padding: 6px 14px; background: #241a18; border-bottom: 1px solid var(--border); }
.pomo-time { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pomo-mid { flex: 1; min-width: 0; }
.pomo-label { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pomo-track { height: 5px; background: var(--border); border-radius: 3px; margin-top: 3px; }
.pomo-fill { height: 100%; background: var(--red); border-radius: 3px; transition: width 1s linear; }
.pomo-stats { font-size: 11px; color: var(--muted); white-space: nowrap; }
```

- [ ] **Step 3: Manual verify** — run Pomodoro Planner node → bar appears with plan → Start → countdown, pause/skip work, block completion logs stats (check `today Xm` increments after skipping a block to 0).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: pomodoro timer bar with plan blocks, notifications and stats"
```

---

### Task 14: README, smoke checklist, final verification, push

**Files:**
- Create: `README.md`, `docs/SMOKE.md`

- [ ] **Step 1: Write README.md**

```markdown
# Study Guide

Local-first, node-canvas study app. Wire your study files into an LLM brain and
out to study-method nodes — Feynman explainer, PQ4R sessions, quizzes, summaries,
and a Pomodoro session planner with a built-in timer. Everything runs on your
machine; nothing is uploaded anywhere.

## Bring your own brain

- **Claude (subscription)** — install [Claude Code](https://claude.com/claude-code),
  run `claude` once to log in. No API key needed.
- **Ollama (local)** — install [Ollama](https://ollama.com), pull a model
  (`ollama pull llama3.2`), keep it running.

## Run

    npm install
    npm run dev

Open http://localhost:3000

## Use

1. **+ New** workflow.
2. Drag **File Input** onto the canvas, drop in a PDF / Word / text / markdown / image.
3. Drag a **Brain**, pick Claude or Ollama + model.
4. Drag output nodes (Feynman, PQ4R, Quiz, Summary, Pomodoro Planner).
5. Wire Input → Brain → Outputs. Press **▶ Run** on a node (or **▶▶ Run All**).
6. Open results, reply in-panel (explain back for Feynman, step through PQ4R,
   answer quiz questions). Start the Pomodoro session from the top bar.

Notes from Notability/Notion: export as PDF from the app, then drop the PDF in.

## Tests

    npm test
```

- [ ] **Step 2: Write docs/SMOKE.md**

```markdown
# Manual smoke checklist (real brains — run locally)

- [ ] `npm test` all green; `npx tsc --noEmit` clean
- [ ] Claude node shows 🟢 when `claude --version` works; 🔴 with hint otherwise
- [ ] Ollama node shows 🟢 when Ollama running; model dropdown populated
- [ ] Upload PDF → ✓ + token estimate; upload image → thumbnail-less image status; scanned PDF → ⚠️ needs_vision
- [ ] Invalid wire (input→output) rejected
- [ ] Summary run streams into node preview; Open shows full markdown
- [ ] Feynman: teach → explain back → gap-hunt loop works
- [ ] PQ4R: steps advance one reply at a time
- [ ] Quiz: form renders, grading returns SCORE line, retry-misses regenerates
- [ ] Pomodoro: plan → timer bar → notification at block end → stats increment
- [ ] Chat: answers question about uploaded file content; history survives reload
- [ ] Restart `npm run dev`: canvas, results, chat all restored
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: typecheck clean, all tests pass, production build succeeds.

- [ ] **Step 4: Commit and push**

```bash
git add -A && git commit -m "docs: README and smoke checklist" && git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** §2 architecture → Tasks 1,8,9; §3 node catalog → Tasks 6,10 (File Stack folded into multi-file upload on one input node — Input node accepts multiple files, satisfying the bundle use-case); §4 canvas rules → Tasks 5,10; §5 pomodoro → Task 13 (durations adjustable = constants at top of file; settings UI deferred, acceptable v1); §6 chat → Task 12; §7 error handling → Tasks 3 (needs_vision), 6 (status hints), 7 (partial results + retry), 10 (token estimate); §8 schema → Task 2; §9 testing → Tasks 2–7 unit/integration with mock driver, Task 14 smoke; §10 README/push → Task 14.
- **Known simplifications (documented, intentional):** quiz `correct` stored null (grading is prose feedback; parseable scoring is v2); vision fallback sends whole file as one image for images and skips per-page pdf rendering (needs_vision PDFs are sent as raw file bytes base64 — if a brain rejects that, hint tells user to re-export pages as images); Run All uses DOM button clicks (simple, works for v1).
- **Type consistency check:** `ExtractResult.kind` values used in Task 8 upload route match Task 3; `RunEvent` shapes in Task 9 SSE match Task 7; `thread_json` roles match `ChatMsg`; `METHODS` keys match `MethodId` everywhere.
