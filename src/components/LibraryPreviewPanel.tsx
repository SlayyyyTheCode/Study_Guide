"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useApp } from "@/store";
import { parseCards, parseMindmap } from "@/lib/parse";
import FlashcardDeck from "@/components/renderers/FlashcardDeck";
import MindMapView from "@/components/renderers/MindMapView";

interface LibraryItem { id: number; title: string; kind: string; content_md: string; method: string | null; category_id: number; }

/** Read-only preview of a saved library item (no follow-up input). */
export default function LibraryPreviewPanel() {
  const { libraryPreviewId, setLibraryPreviewId } = useApp();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const previewRef = useRef<number | null>(null);
  previewRef.current = libraryPreviewId;

  useEffect(() => {
    if (!libraryPreviewId) { setItem(null); return; }
    setItem(null); setLoading(true);
    fetch(`/api/library/${libraryPreviewId}`)
      .then(r => r.json())
      .then(it => { if (previewRef.current === libraryPreviewId) setItem(it); })
      .finally(() => { if (previewRef.current === libraryPreviewId) setLoading(false); });
  }, [libraryPreviewId]);

  useEffect(() => {
    if (!libraryPreviewId) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setLibraryPreviewId(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [libraryPreviewId, setLibraryPreviewId]);

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
        {item && (
          cards ? <FlashcardDeck key={item.id} cards={cards} libraryItemId={item.id} />
          : map ? <MindMapView key={item.id} map={map} />
          : <ReactMarkdown>{item.content_md}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}
