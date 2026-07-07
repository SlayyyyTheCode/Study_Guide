# Study Guide v2 — Library, New Tools & Visual Polish

**Date:** 2026-07-07
**Status:** Approved by user (brainstorming session, 4 parts)
**Baseline:** v1 at main c857081 (spec: 2026-07-06-study-guide-design.md)

## 1. Goals

Three additions to the shipped v1 app, keeping its architecture intact:
1. **Content Library** — persistent, categorized store of files and generated results, recallable into any workflow.
2. **Two new output nodes** — Flashcards and Mind-map — plus a Library input node.
3. **Visual & interaction upgrades** — animated flow edges, node state glow, minimap + canvas niceties, Ctrl+K quick-add, dark-theme polish pass.

## 2. Library Subsystem

### Schema (new tables; existing tables untouched)
- `categories`: id, name (unique), icon (emoji, default 📁), created_at
- `library_items`: id, category_id → categories, title, kind (`file` | `result`), content_md (extracted text or result markdown — snapshot copy), source_path (original upload path, nullable), method (nullable; for results: quiz/summary/feynman/pq4r/pomodoro/flashcards/mindmap), created_at

Snapshot-copy design (approach A): library items are independent copies. Workflow deletion never touches them. Content duplication accepted (single-user scale).

### Save flows
- **Auto-capture on upload:** every successful file upload also inserts a library item; category defaults to one named after the current workflow (auto-created). Category changeable later from the drawer.
- **Explicit save for results:** ResultPanel gains a **💾 Save to library** button → small dialog: title (prefilled "<Method> — <date>") + category picker (existing + "new category" inline). Saves current `result_md` (for flashcards/mindmap: the JSON-bearing markdown, so recall re-renders interactively).
- Deleting a category moves its items to auto-category **Uncategorized**; items are never silently deleted.

### Library drawer (UI)
- 📚 button in TopBar toggles a 380px drawer sliding over the canvas from the right (overlay, does not squeeze chat). 200ms ease-out.
- Contents: search box (filters title + content substring), collapsible category tree with item counts, item rows (kind icon, title, date).
- Item actions (hover/kebab): Preview, Rename, Move to category, Delete (confirm). Preview opens the panel with the item's native renderer: flashcards items open the interactive deck (review mode), mindmap items open the outline/graph view, everything else renders as markdown. This — not the canvas — is how saved decks/maps are re-used interactively; dragging any item to the canvas always makes it input *material*.
- **Drag item from drawer onto canvas → creates a Library input node** pre-loaded with that item.

### Library input node (blue family)
- Shows item title + category chip. Downstream-identical to a file input: its `content_md` is gathered as material.
- Mode toggle: single item, or **entire category** (concatenates all items in the category, `--- title ---` separators, same format as multi-file gathering).
- Stores `library_item_id` (or `category_id` for category mode) in node data; renders a warning badge if the referenced item/category was deleted.

### API
- `GET /api/library?search=&categoryId=` — list items (id, title, kind, method, category, created_at; no content for list speed)
- `POST /api/library` — create item {title, kind, content_md, categoryId | newCategoryName, method?, source_path?}
- `GET/PATCH/DELETE /api/library/[id]` — fetch full item / rename+recategorize / delete
- `GET/POST/PATCH/DELETE /api/categories` — CRUD; DELETE moves items to Uncategorized

## 3. New Output Nodes

Both follow the existing pattern: new `MethodId`, prompt template with fenced-JSON contract, renderer in ResultPanel. Runner, graph rules, SSE, persistence unchanged.

### 🃏 Flashcards (`flashcards`)
- Prompt contract: ```json {"cards":[{"front":"…","back":"…"}]}``` — count option (default 15), focus option (free text, e.g. "definitions only").
- ResultPanel deck mode: front → flip (click or Space) → **Got it** / **Missed** → next; progress "7/15"; end screen with score and **Review misses** (replays missed only).
- New table `flashcard_reviews`: id, run_id, front, back, missed (count), last_reviewed. Misses upserted on review.
- Savable to library; recalled deck opens in review mode.

### 🕸️ Mind-map (`mindmap`)
- Prompt contract: ```json {"root":"topic","children":[{"label":"…","children":[…]}]}``` (recursive).
- ResultPanel renders: (a) collapsible indented outline; (b) read-only visual graph using React Flow with simple tree auto-layout (no new dependency). Toggle between views.
- Export to markdown outline button. Savable to library (JSON markdown snapshot).

## 4. Visual & Interaction Upgrades

1. **Animated flow edges** — custom edge component. States: idle (calm gray bezier), running (colored marching dashes + traveling pulse dot via SVG animateMotion), done (brief bright tint, fades). While an output node runs, every edge on its resolved path (inputs→brain→output) animates.
2. **Node state glow** — CSS-driven: `.node-running` pulsing blue glow; done = single 600ms green flash; error = steady red glow until retry; new nodes scale-in 200ms.
3. **MiniMap & niceties** — React Flow MiniMap bottom-left, node colors by type; snap-to-grid toggle (8px) in TopBar; node hover lift (translateY −1px + shadow).
4. **Ctrl+K quick-add** — custom command-bar overlay (no external dep): fuzzy match over node catalog incl. library items by title; Enter inserts at canvas center; double-click canvas opens it at cursor; arrows/Enter/Esc keyboard flow.
5. **Theme pass** — 3-level surface elevation, subtle node header gradients, 200ms panel slide transitions, 8px spacing audit, focus rings preserved. Dark-only.

Performance guard: all canvas animations pause when the tab is hidden (visibility listener toggles `animation-play-state`; SVG animations gated by a `reduced` class).

## 5. Error Handling

- Flashcards/mindmap JSON parse failure → raw markdown shown + **Regenerate** button (reply asking for valid JSON) — same family as quiz fallback.
- Library item referencing deleted content: impossible by design (snapshots); missing source_path only hides "open original".
- Library node whose item/category was deleted → warning badge + run error "Library item no longer exists."
- Migration: `CREATE TABLE IF NOT EXISTS` for new tables on startup; existing data.sqlite untouched.

## 6. Testing

- Unit: library CRUD + Uncategorized fallback; category auto-create on upload capture; flashcards/mindmap prompt builders; JSON parsers incl. malformed inputs; fuzzy matcher for Ctrl+K.
- Integration: runner gathers material from library-input nodes (single + category mode, mock driver); library item survives workflow deletion.
- All 24 existing tests stay green. SMOKE.md extended: drawer drag-recall, deck review flow, mindmap render + toggle, Ctrl+K insert, animated edges during run.

## 7. Rollout

- Branch `feature/app-v2`; subagent-driven execution with two-stage review per task (same as v1); merge to main + push to GitHub on completion.
- README: Library section, new node docs. SMOKE.md updated.

## 8. Out of Scope (v3 candidates)

- Spaced-repetition scheduling (flashcard_reviews table is the foundation).
- Library export/import (Anki, markdown bundle).
- Light theme.
- Video inputs, Notion API, OpenAI-compatible brain (carried from v1 backlog).
