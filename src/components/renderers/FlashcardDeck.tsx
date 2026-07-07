"use client";
import { useEffect, useMemo, useState } from "react";
import type { Card } from "@/lib/parse";

interface Props { cards: Card[]; runId?: number; libraryItemId?: number; }

export default function FlashcardDeck({ cards, runId, libraryItemId }: Props) {
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, boolean>>({}); // idx → missed

  useEffect(() => { // Space flips
    const h = (e: KeyboardEvent) => { if (e.key === " " && pos < order.length) { e.preventDefault(); setFlipped(f => !f); } };
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

  useEffect(() => {
    if (!done || order.length === 0) return;
    fetch("/api/flashcards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId, libraryItemId,
        results: order.map(i => ({ front: cards[i].front, back: cards[i].back, missed: !!results[i] })),
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
            <button type="button" className="node-btn" onClick={() => { setOrder(missedIdx); setPos(0); setResults({}); setFlipped(false); }}>
              🔁 Review {missedIdx.length} missed
            </button>
          )}
          <button type="button" className="node-btn" onClick={() => { setOrder(cards.map((_, i) => i)); setPos(0); setResults({}); setFlipped(false); }}>
            Restart
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
