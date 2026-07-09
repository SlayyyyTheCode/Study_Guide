"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "@/lib/parse";
import { cardsToTsv, sanitizeFilename } from "@/lib/anki";
import { downloadTextFile } from "@/lib/download";

interface Props { cards: Card[]; runId?: number; libraryItemId?: number; sourceIds?: number[]; title?: string; }

export default function FlashcardDeck({ cards, runId, libraryItemId, sourceIds, title }: Props) {
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, boolean>>({}); // idx → missed
  // Guards the completion POST: fires at most once per finished round, even
  // when React StrictMode double-invokes effects in dev.
  const postedRef = useRef(false);

  useEffect(() => { // Space flips — unless the user is typing in a form field
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === " " && pos < order.length) { e.preventDefault(); setFlipped(f => !f); }
    };
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

  function restart(nextOrder: number[]) {
    postedRef.current = false; // new round → allow its completion POST
    setOrder(nextOrder); setPos(0); setResults({}); setFlipped(false);
  }

  function exportAnki() {
    downloadTextFile(`${sanitizeFilename(title ?? "flashcards")}.txt`, cardsToTsv(cards));
  }

  useEffect(() => {
    if (!done || order.length === 0 || postedRef.current) return;
    postedRef.current = true;
    fetch("/api/flashcards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId, libraryItemId,
        results: order.map(i => ({
          front: cards[i].front, back: cards[i].back, missed: !!results[i],
          ...(sourceIds ? { libraryItemId: sourceIds[i] } : {}),
        })),
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
            <button type="button" className="node-btn" onClick={() => restart(missedIdx)}>
              🔁 Review {missedIdx.length} missed
            </button>
          )}
          <button type="button" className="node-btn" onClick={() => restart(cards.map((_, i) => i))}>
            Restart
          </button>
          <button type="button" className="node-btn" onClick={exportAnki} aria-label="Export deck to Anki">
            ⬇ Export to Anki (.txt)
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
