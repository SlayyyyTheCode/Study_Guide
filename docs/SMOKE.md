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
- [ ] MiniMap bottom-left shows color-coded nodes; snap toggle affects dragging
- [ ] Regenerate button appears when flashcards/mindmap JSON is malformed
