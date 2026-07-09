# Manual smoke checklist (real brains — run locally)

- [ ] `npm test` all green; `npx tsc --noEmit` clean
- [ ] Claude brain node shows 🟢 when `claude --version` works; 🔴 with hint otherwise
- [ ] Ollama brain node shows 🟢 when Ollama running; model dropdown populated
- [ ] Upload PDF → ✓ + token estimate; upload image → image status; scanned PDF → ⚠️ needs_vision warning
- [ ] Invalid wire (input→output, output→brain) refused by canvas
- [ ] Summary run streams into node preview; Open shows full markdown in panel
- [ ] Feynman: teach → explain back in panel → gap-hunt loop responds
- [ ] PQ4R: steps advance one reply at a time with step labels
- [ ] Quiz: form renders from JSON, submit grades with SCORE line, retry-misses swaps in a fresh interactive set
- [ ] Pomodoro: planner run → "Plan ready" bar → Start → countdown; pause/resume/skip work; notification + beep at block end; stats (today/week) increment
- [ ] Chat: answers question about uploaded file content; history survives reload; Ollama option disabled when no models
- [ ] Close panel mid-stream then open another run: no cross-run text bleed
- [ ] Restart `npm run dev`: canvas layout, results, chat history all restored

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
- [ ] MiniMap floats top-left, drag grip moves it, — minimizes to a bar (persists across reload); snap toggle affects dragging
- [ ] Regenerate button appears when flashcards/mindmap JSON is malformed

## v2.1 additions
- [ ] Cornell Notes run → Cues / Notes / Summary sections render, scannable
- [ ] Oxbridge Tutorial run → asks one question at a time (never a list), reply box shows tutorial placeholder, pushes back on a weak answer instead of just saying "correct"
- [ ] Quiz wired to two file inputs → questions mix across both sources instead of grouping by source
- [ ] Existing outputs (Feynman/PQ4R/Quiz/Summary/Flashcards/Mind Map/Chat) read noticeably shorter and more direct than before

## v3 additions
- [ ] Answer flashcards in a saved deck across two sessions → Library drawer shows a "N due" badge that shrinks as cards are reviewed and their scheduled interval grows
- [ ] Miss a card twice → it still shows as due regardless of its scheduled date (high-miss override)
- [ ] Submit a quiz → check the SCORE line's math matches the app's later display of correct/incorrect (grading now records real values, not always blank); the raw results JSON block is not shown in the chat transcript
- [ ] 🔥 Weak Spots → shows due/struggling flashcards from multiple different decks mixed together, plus a missed-quiz recap; answering a card here updates the same due badge in the drawer
- [ ] Weak Spots with nothing due/missed → shows the empty-state message, not a blank panel
- [ ] 📊 Stats → streak, study time, quiz trend, flashcard mastery, weakest categories/topics all show sane numbers (or "no data yet") even on a lightly-used profile
- [ ] Export a flashcard deck to Anki → downloaded .txt imports cleanly via Anki's File → Import (or at minimum, front/back columns are correctly tab-separated when opened in a text editor)
- [ ] Weak Spots, Stats, Library drawer, and any result/preview panel are mutually exclusive — opening one closes the others, no stacked overlays
