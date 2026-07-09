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
- **🗒️ Cornell Notes** — cue column + notes + summary, the format taught at
  Cornell and Harvard study centers.
- **🎩 Oxbridge Tutorial** — the Oxford/Cambridge tutorial method: one pointed
  question at a time, the AI pushes back on weak answers instead of lecturing.
- **📚 Library item** — recall stored content (drag from drawer or Ctrl+K).

Quiz Bank also **interleaves** questions across multiple wired-in sources
instead of grouping by source — mixed-topic practice, shown to beat blocking
one topic at a time. All outputs default to short, direct answers; ask for
more depth in the follow-up box if you want it.

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

## Shortcuts

- **Ctrl+K** (or double-click the canvas) — quick-add any node by typing.
- **Space** — flip the current flashcard.
- **Esc** — close panels.

## Tests

```
npm test
```
