# Study Guide

Local-first, node-canvas study app. Wire your study files into an LLM brain and
out to study-method nodes — Feynman explainer, PQ4R sessions, quizzes, summaries,
and a Pomodoro session planner with a built-in timer. Everything runs on your
machine; nothing is uploaded anywhere.

Architecture details: [design spec](docs/superpowers/specs/2026-07-06-study-guide-design.md).

## Bring your own brain

- **Claude (subscription)** — install [Claude Code](https://claude.com/claude-code),
  run `claude` once to log in. No API key needed.
- **Ollama (local)** — install [Ollama](https://ollama.com), pull a model
  (`ollama pull llama3.2`), keep it running.

## Run

```
npm install
npm run dev
```

Open http://localhost:3000

## Use

1. A workflow ("My Study Session") is created for you on first launch — or press **+ New**.
2. Drag **File Input** onto the canvas, drop in a PDF / Word / text / markdown / image.
3. Drag a **Brain**, pick Claude or Ollama + model (status dot shows if it's reachable).
4. Drag output nodes (Feynman, PQ4R, Quiz, Summary, Pomodoro Planner).
5. Wire Input → Brain → Outputs. Invalid wires are refused. Press **▶ Run** on a
   node (or **▶▶ Run All**).
6. **Open** a result and reply in-panel: explain back for Feynman, step through
   PQ4R one reply at a time, answer quiz questions and submit for grading.
7. Run the Pomodoro Planner, then press **▶ Start session** in the top bar —
   25-minute focus blocks with breaks, notifications, and study stats.
8. Chat panel (right) sees your canvas files and recent results — ask anything.

Notes from Notability/Notion: export as PDF from the app, then drop the PDF in.
Everything auto-saves to a local SQLite file (`data.sqlite`); uploads stay in `uploads/`.

## Tests

```
npm test
```
