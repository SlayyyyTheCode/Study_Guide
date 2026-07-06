# Study Guide — Design Spec

**Date:** 2026-07-06
**Status:** Approved by user (brainstorming session, 4 parts)
**User:** Single user, local machine, Claude subscription (Pro/Max via Claude Code login)

## 1. What It Is

A local-first, node-canvas study app. The user drags input nodes (study files), brain nodes (LLMs), and output nodes (study-method generators) onto a free-form canvas, wires them together N8N-style, and runs the workflow. Outputs teach using the Feynman technique, PQ4R method, quizzes, and summaries; a Pomodoro planner + timer structures the study session. A docked chat panel provides freeform conversation with full context of the canvas material.

## 2. Architecture

**Stack:** Next.js (App Router) — single process serving React frontend + API routes. Started locally with `npm run dev` (or `npm start` after build). No cloud deployment in v1.

```
Browser (React)
├── Node Canvas — React Flow, full free-form drag/wire
├── Chat Panel — docked right, collapsible
└── Pomodoro Timer Bar — fixed top, always visible

Next.js API routes (same process)
├── File Processor — PDF/docx/txt/md → text; images passed through to vision
├── Brain Router — one provider interface, two drivers:
│   ├── Claude driver — Claude Agent SDK, uses existing `claude` CLI login (subscription, no API key)
│   └── Ollama driver — HTTP to localhost:11434, model list auto-discovered
├── Workflow Runner — walks the canvas graph, executes, streams via SSE
└── Method Prompts — templates for Feynman / PQ4R / Quiz / Summary / Pomodoro-plan

Local storage
├── SQLite (better-sqlite3) — workflows/canvas layouts, chat history, quiz results, pomodoro stats
└── uploads/ — original dropped files
```

**Run flow:** canvas graph → validate wiring → extract file text → prompt chosen brain per output node → stream results into node cards → save to SQLite.

## 3. Node Catalog

### Input nodes (blue; no input port, one output port)
- **Document** — PDF, Word (.docx), TXT, MD. Node shows filename, page count, extract status.
- **Image** — PNG/JPG (photos of notes, diagrams). Thumbnail on node. Sent to vision-capable brain.
- **File Stack** — multiple files bundled as one source.

Notability/Notion content enters via export-to-PDF/image (no direct API in v1).

### Brain nodes (purple; many-in, many-out)
- **Claude** — Agent SDK on user's subscription login. Model picker (Sonnet/Opus/Haiku).
- **Ollama** — local models, dropdown auto-filled from `GET /api/tags`.
- Live status dot on node: green connected / red unreachable.

### Output nodes (green; one input port, result card)
- **Feynman Explainer** — 3 phases: (1) Teach: plain-language explanation, analogies, jargon only with instant definitions. (2) Flip: user explains the topic back in the result card. (3) Gap-hunt: brain grades the user's explanation, lists gaps, re-teaches only weak spots; loop until clean.
- **PQ4R Session** — guided stepper: Preview (outline) → Question (headings→questions) → Read (section pointers) → Reflect (connection prompts) → Recite (from-memory answers, graded) → Review (weak-spot sheet). Resumable mid-session.
- **Quiz Bank** — configurable question count + difficulty; MCQ auto-graded; short answers graded by brain with feedback; misses stored with a "retry misses" action.
- **Summary Sheet** — condensed key concepts/definitions/formulas; export to markdown.
- **Pomodoro Planner** — chunks connected material into 25-min focus blocks, each with topic, goal, and optional link to another output node ("do the quiz in block 3"). "Start session" activates the timer bar.

## 4. Canvas Rules

- Free placement, unlimited nodes (full-canvas option chosen over guided pipeline).
- Typed ports: only Input→Brain and Brain→Output connections allowed. Invalid wire attempt = red flash + shake, connection refused.
- Fan-in/fan-out: many inputs per brain, many outputs per brain, multiple brains per canvas.
- Per-output-node ▶ Run + global "Run All" in toolbar.
- Results render as expandable cards on the output node; click opens full view in side panel.
- Auto-save every mutation to SQLite; canvas restores exactly on reopen.
- Multiple named workflows ("Biology Ch.3"), switchable via top dropdown.

## 5. Pomodoro Timer Bar

- Fixed top bar: countdown, current block label + linked node, progress bar, pause / skip-to-break.
- Defaults 25/5, long break every 4th block; all durations adjustable in settings.
- Browser notification + sound at block/break boundaries.
- Completed blocks logged → stats view (streak, minutes today/week).

## 6. Chat Panel

- Docked right, collapsible.
- Uses a settings-selected default brain (Claude subscription by default).
- Context-aware: receives extracted text of files on the current canvas + recent run results.
- Freeform requests; applies method prompt templates when the user names a method.
- History persisted per workflow.

## 7. Error Handling

- Brain unreachable → red dot + actionable hint ("Run `claude login`", "Start Ollama").
- Extraction failure (e.g. scanned PDF with no text layer) → warning badge; fallback sends pages as images to a vision-capable brain.
- Mid-stream run failure → partial result kept, retry button on that node only; other nodes unaffected.
- Oversized material → chunking to fit context window; token estimate shown on node before run.

## 8. Persistence Schema (SQLite)

Tables (indicative): `workflows` (id, name, react_flow_json, updated_at), `files` (id, workflow_id, path, extracted_text, status), `runs` (id, node_id, brain, status, result_md, created_at), `chat_messages` (id, workflow_id, role, content, created_at), `quiz_attempts` (id, run_id, question, user_answer, correct, feedback), `pomodoro_blocks` (id, workflow_id, label, planned_min, completed_at).

## 9. Testing

- **Unit:** file extraction per format; graph validation (typed ports, cycle rejection); method prompt builders.
- **Integration:** workflow runner against a mock brain driver — no real LLM calls in CI/tests.
- **Manual smoke checklist:** real Claude + Ollama calls, executed by the user locally.

## 10. Repo & Rollout

- Git repo in this directory; remote: `https://github.com/SlayyyyTheCode/Study_Guide.git`.
- README with one-command start: `npm install && npm run dev`.
- Vercel: not used in v1 (Claude subscription cannot authenticate from cloud). UI kept deployable in case of a future API-key mode.
- Repo is public-friendly: no credentials or user data committed (uploads/, SQLite, .env are gitignored). Anyone cloning it runs the app locally against **their own** Claude Code login or Ollama install.

## 11. Out of Scope (v2 backlog)

- Video inputs (audio extraction + local Whisper transcription).
- Direct Notion API connector node.
- Generic OpenAI-compatible API brain (base URL + key: OpenAI, OpenRouter, LM Studio).
- Multi-user/auth — app is single-user by design.
