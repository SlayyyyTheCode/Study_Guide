"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useApp } from "@/store";
import { parseCards, parseMindmap, type Card } from "@/lib/parse";
import FlashcardDeck from "@/components/renderers/FlashcardDeck";
import MindMapView from "@/components/renderers/MindMapView";

interface LibraryItem { id: number; title: string; kind: string; content_md: string; method: string | null; category_id: number; }
interface ReviewRow { front: string; next_review_at: string | null; }

/** Read-only preview of a saved library item (no follow-up input). */
export default function LibraryPreviewPanel() {
  const { libraryPreviewId, setLibraryPreviewId } = useApp();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dueCards, setDueCards] = useState<Card[] | null>(null);
  const previewRef = useRef<number | null>(null);
  previewRef.current = libraryPreviewId;

  useEffect(() => {
    if (!libraryPreviewId) { setItem(null); return; }
    setItem(null); setLoading(true); setError("");
    fetch(`/api/library/${libraryPreviewId}`)
      .then(r => {
        if (!r.ok) throw new Error(`Could not load item (${r.status})`);
        return r.json();
      })
      .then(it => { if (previewRef.current === libraryPreviewId) setItem(it); })
      .catch(e => { if (previewRef.current === libraryPreviewId) setError(e instanceof Error ? e.message : "Could not load item"); })
      .finally(() => { if (previewRef.current === libraryPreviewId) setLoading(false); });
  }, [libraryPreviewId]);

  useEffect(() => {
    if (!libraryPreviewId) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setLibraryPreviewId(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [libraryPreviewId, setLibraryPreviewId]);

  useEffect(() => {
    if (!item || item.method !== "flashcards") { setDueCards(null); return; }
    const cards = parseCards(item.content_md);
    if (!cards) { setDueCards(null); return; }
    fetch(`/api/flashcards?libraryItemId=${item.id}`)
      .then(r => r.ok ? r.json() : [])
      .then((reviews: ReviewRow[]) => {
        const nowSql = new Date().toISOString().slice(0, 19).replace("T", " "); // match SQLite datetime('now') format
        const due = cards.filter(c => {
          const r = reviews.find(x => x.front === c.front);
          return !r || !r.next_review_at || r.next_review_at <= nowSql;
        });
        setDueCards(due.length > 0 ? due : cards);
      })
      .catch(() => setDueCards(cards));
  }, [item]);

  if (!libraryPreviewId) return null;

  const cards = item?.method === "flashcards" ? parseCards(item.content_md) : null;
  const map = item?.method === "mindmap" ? parseMindmap(item.content_md) : null;

  return (
    <div className="result-panel">
      <div className="result-head">
        <strong>📚 {item?.title ?? "Loading…"}</strong>
        <button type="button" className="node-btn" onClick={() => setLibraryPreviewId(null)} aria-label="Close library preview">
          ✕ Close
        </button>
      </div>
      <div className="result-body">
        {loading && !item && <div className="node-sub">Loading…</div>}
        {error && <p className="lib-error" role="alert">{error}</p>}
        {item && (
          cards ? <FlashcardDeck key={item.id} cards={dueCards ?? cards} libraryItemId={item.id} title={item.title} />
          : map ? <MindMapView key={item.id} map={map} />
          : <ReactMarkdown>{item.content_md}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}
