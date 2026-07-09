# Study Guide v3 — Spaced Repetition, Weak-Spot Review, Analytics, Anki Export

**Date:** 2026-07-08
**Status:** Approved by user (brainstorming session, 6 parts)
**Baseline:** main @ a66082a (v2 spec: 2026-07-07-v2-library-tools-polish-design.md)

## 1. Goals

Four retention/productivity additions on top of the shipped v1+v2 app:
1. **Spaced repetition (SM-2)** for saved flashcard decks.
2. **Weak-spot review session** aggregating due/struggling flashcards and recently-missed quiz questions across everything.
3. **Analytics dashboard** — streaks, study time, quiz score trend, flashcard mastery, weakest topics.
4. **Anki export** — tab-separated text, importable via Anki's native File → Import.

A prerequisite surfaced during design: quiz grading today never records real correct/incorrect (`quiz_attempts.correct` is always `null`, grading is prose-only). Weak-spot and analytics both need real per-question correctness, so fixing that is part of this release.

## 2. Schema + Quiz Grading Fix (shared foundation)

**`flashcard_reviews`** gains four columns via a code-level migration (SQLite has no `ADD COLUMN IF NOT EXISTS`; check `PRAGMA table_info(flashcard_reviews)` at startup and `ALTER TABLE` once if missing):
- `ease_factor REAL DEFAULT 2.5`
- `interval_days INTEGER DEFAULT 0`
- `repetitions INTEGER DEFAULT 0`
- `next_review_at TEXT` (nullable — null means never reviewed, treated as due now)

The existing `missed` counter is unchanged (kept for raw stats alongside the new SM-2 state). Pre-existing rows (from before this migration, real user data already in `data.sqlite`) get the column defaults on `ALTER TABLE` — `ease_factor 2.5`, `interval_days 0`, `repetitions 0`, `next_review_at NULL` — which means every card reviewed before v3 is simply treated as due now on first load. No backfill logic needed; this is the correct behavior (nothing to schedule forward from before scheduling existed).

**Quiz grading** now asks the model, after its existing prose feedback + `SCORE: x/y` line, to emit one more fenced block:
```json
{"results":[{"id":1,"correct":true},{"id":2,"correct":false}]}
```
The submit-grading code (currently in `ResultPanel.tsx`) parses this block and posts real `correct: true/false` per question to `/api/quiz`. If the block is missing or malformed, it falls back to today's behavior (`correct: null`) for that submission only — the prose feedback still displays normally either way; nothing breaks.

## 3. Spaced Repetition (SM-2)

Applies only to **saved library flashcard decks** (`flashcard_reviews.library_item_id` set). In-thread/unsaved run decks keep today's simple got/missed tracking — no scheduling, since they aren't persistent recurring content.

**Quality mapping** (binary UI → SM-2's 0–5 scale): Got it → quality 5, Missed → quality 2.

**Algorithm**, applied immediately on each answer via a pure function `applySm2(card, quality)` in `src/lib/spacedRepetition.ts` (no DB/React dependency, unit-testable in isolation, defensive defaults for any missing input field):
- Missed (quality < 3): `repetitions = 0`, `interval_days = 1`, `ease_factor` unchanged.
- Got it (quality ≥ 3): `repetitions += 1`; `interval_days` = 1 if `repetitions == 1`, 6 if `repetitions == 2`, else `round(prevInterval × ease_factor)`; `ease_factor = max(1.3, ease_factor + 0.1)`.
- `next_review_at = now + interval_days` (days).

**Surface:** the Library drawer shows a **"N due"** badge on saved flashcard items (`next_review_at <= now OR next_review_at IS NULL`). Clicking preview opens the deck filtered to due cards only; if none are due, opens the full deck as today.

## 4. Weak-Spot Review Session

**🔥 Weak Spots** button in TopBar opens a session panel (same visual family as ResultPanel) with two sections, both pure aggregation — **no brain call involved**, so it opens instantly:

1. **Due/struggling flashcards** — the top ~20 cards across *all* saved library decks that are due or high-miss (`missed >= 2`), most-overdue first, rendered with the existing `FlashcardDeck` component. Answering Got it/Missed updates the *same* `flashcard_reviews` row the drawer badge reads — not a separate copy.
2. **Recently missed quiz questions** — a read-only recap (question, your answer, the correct-answer feedback, source workflow), from `quiz_attempts` where `correct = 0`, most recent ~20. This is a reminder, not a live re-quiz — regrading here would require picking a brain/model for an ad-hoc session, deferred as unnecessary complexity for a "surface what you got wrong" feature.

Empty state (nothing due, nothing recently missed) shows a plain message, not a blank panel.

**New API:** `GET /api/weakspots` — the two aggregation queries in one payload. `/api/flashcards` POST gains an optional `reviewId` field so this session updates a specific row directly rather than re-deriving it from run/library-item + front-text matching.

## 5. Analytics Dashboard

**📊 Stats** button in TopBar opens a drawer panel (reuses the Library drawer's visual styling). One new endpoint, `GET /api/stats`, computed entirely from existing tables:

- **Study streak** — consecutive calendar days with any activity (a run, a completed Pomodoro block, or a flashcard review all count).
- **Study time** — today / this week / all-time from `pomodoro_blocks.planned_min`, plus a per-day list for the last 7 days.
- **Quiz score trend** — per quiz run, correct-count / total, using only rows with a real `correct` value (pre-fix `null` rows are skipped, not shown as 0%).
- **Flashcard mastery** — ratio of cards with `repetitions >= 2` to total distinct cards reviewed.
- **Weakest spots** — two separate top-3 lists (different groupings, not merged): weakest flashcard categories (via `library_items.category_id`) and weakest quiz topics (via workflow name).

Read-only, one refresh action. Every ratio guards against zero-data ("No quiz data yet" instead of `NaN%`).

## 6. Anki Export

Client-side only — no new API route, no new dependency. `cardsToTsv(cards): string` formats front\tback per line (internal tabs → spaces, internal newlines → `<br>` since Anki fields support HTML). An export button appears anywhere a flashcard deck already renders — the in-thread `ResultPanel` view and the saved-item `LibraryPreviewPanel` — triggering a Blob download of a sanitized-filename `.txt`. Anki's File → Import reads it directly.

## 7. Error Handling

- `applySm2` defaults any missing ease/interval/repetition input defensively, independent of the startup migration.
- Weak-spot panel: explicit empty-state message when nothing qualifies.
- Malformed quiz-grading JSON block: silent fallback to `correct: null`, prose feedback unaffected.
- Stats: every ratio/percentage guards divide-by-zero.
- Migration: `PRAGMA table_info` check + one-time `ALTER TABLE`, safe to run against the user's existing real `data.sqlite`.

## 8. Testing

- Unit: `applySm2` table-driven (first/second/third+ success intervals, failure reset, EF floor at 1.3).
- Unit: quiz-grading JSON parser (valid block, malformed block → null fallback).
- Unit: weak-spot and stats aggregation queries against in-memory DB fixtures (same pattern as `tests/library.test.ts`).
- Unit: `cardsToTsv` escaping (internal tabs, internal newlines).
- All 47 existing tests stay green.
- SMOKE.md gains a v3 section: due badge appears and filters correctly; weak-spot session shows both sections and Got it/Missed persists; stats panel shows sane numbers on sparse data; a real quiz submission populates non-null `correct` values; exported `.txt` imports into real Anki if available.

## 9. Rollout

- Branch `feature/app-v3`, subagent-driven execution with two-stage review per task (same process as v1/v2), merge to main + push on completion.
- README gains sections for spaced repetition, weak spots, stats, and Anki export.

## 10. Out of Scope (v4 candidates)

- True binary `.apkg` export (Anki's internal SQLite package format — no maintained Node library exists; would need a from-scratch implementation for marginal convenience over the TSV import).
- Live re-quiz inside the weak-spot session.
- Per-card manual difficulty override beyond binary Got it/Missed.
- Carried from earlier backlogs: video inputs, Notion API connector, OpenAI-compatible brain, light theme.
