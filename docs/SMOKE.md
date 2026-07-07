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
