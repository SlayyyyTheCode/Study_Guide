"use client";
import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/store";
import FlashcardDeck from "@/components/renderers/FlashcardDeck";

interface WeakCard {
  id: number; front: string; back: string; missed: number;
  next_review_at: string | null; library_item_id: number;
  source_title: string; category_name: string;
}
interface QuizMiss { question: string; user_answer: string; feedback: string | null; created_at: string; workflow_name: string; }

export default function WeakSpotsPanel() {
  const { weakSpotsOpen, setWeakSpotsOpen } = useApp();
  const [cards, setCards] = useState<WeakCard[]>([]);
  const [quizMisses, setQuizMisses] = useState<QuizMiss[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    fetch("/api/weakspots")
      .then(r => { if (!r.ok) throw new Error(`Could not load weak spots (${r.status})`); return r.json(); })
      .then((d: { cards: WeakCard[]; quizMisses: QuizMiss[] }) => { setCards(d.cards); setQuizMisses(d.quizMisses); })
      .catch(e => {
        setError(e instanceof Error ? e.message : "Could not load weak spots");
        setCards([]); setQuizMisses([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (weakSpotsOpen) load(); }, [weakSpotsOpen, load]);

  useEffect(() => {
    if (!weakSpotsOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setWeakSpotsOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [weakSpotsOpen, setWeakSpotsOpen]);

  if (!weakSpotsOpen) return null;

  const deckCards = cards.map(c => ({ front: c.front, back: c.back }));
  const sourceIds = cards.map(c => c.library_item_id);

  return (
    <div className="result-panel">
      <div className="result-head">
        <strong>🔥 Weak Spots</strong>
        <button type="button" className="node-btn" onClick={() => setWeakSpotsOpen(false)} aria-label="Close weak spots">
          ✕ Close
        </button>
      </div>
      <div className="result-body">
        {loading && <p className="node-sub" role="status">Loading…</p>}
        {error && <p className="lib-error" role="alert">{error}</p>}
        {!loading && !error && cards.length === 0 && quizMisses.length === 0 && (
          <p className="lib-empty">Nothing due or missed right now — nice work! Come back after more study sessions.</p>
        )}
        {cards.length > 0 && (
          <>
            <h3>Due / struggling flashcards</h3>
            {/* Keyed by the resolved card set (not a fetch-start counter) so the
                deck only remounts once the new cards/sourceIds are actually in
                state — otherwise a stale order/pos/results could be reused
                against the new props and post SM-2 results against the wrong
                library_item_id (see ResultPanel's cardsSrc.idx). */}
            <FlashcardDeck key={cards.map(c => c.id).join("|")} cards={deckCards} sourceIds={sourceIds} title="weak-spot-review" />
          </>
        )}
        {quizMisses.length > 0 && (
          <>
            <h3>Recently missed quiz questions</h3>
            {quizMisses.map(q => (
              <div key={`${q.created_at}-${q.question}`} className="weakspot-quiz-item">
                <div className="node-sub">{q.workflow_name} · {q.created_at.slice(0, 10)}</div>
                <p><b>Q:</b> {q.question}</p>
                <p><b>Your answer:</b> {q.user_answer}</p>
                {q.feedback && <p><b>Feedback:</b> {q.feedback}</p>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
