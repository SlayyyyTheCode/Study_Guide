"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useApp, readSse } from "@/store";
import { parseCards, parseMindmap } from "@/lib/parse";
import { METHODS } from "@/lib/prompts";
import FlashcardDeck from "@/components/renderers/FlashcardDeck";
import MindMapView from "@/components/renderers/MindMapView";

interface Msg { role: "user" | "assistant"; content: string; }
interface QuizQ { id: number; type: "mcq" | "short"; question: string; choices?: string[]; answer: string; }
interface CategoryRow { id: number; name: string; icon: string; }
interface LibraryItem { id: number; title: string; kind: string; content_md: string; method: string | null; category_id: number; }

function parseQuiz(md: string): QuizQ[] | null {
  const m = md.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try { const a = JSON.parse(m[1]); return Array.isArray(a) ? a : null; } catch { return null; }
}

export default function ResultPanel() {
  const { openRunId, setOpenRunId, openMethod, libraryPreviewId, setLibraryPreviewId } = useApp();
  const [thread, setThread] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const openRunRef = useRef<number | null>(null);
  openRunRef.current = openRunId;

  // Library preview mode: fetch the saved item instead of a run thread.
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRef = useRef<number | null>(null);
  previewRef.current = libraryPreviewId;

  useEffect(() => {
    if (!libraryPreviewId) { setPreviewItem(null); return; }
    setPreviewItem(null); setPreviewLoading(true);
    fetch(`/api/library/${libraryPreviewId}`)
      .then(r => r.json())
      .then(item => { if (previewRef.current === libraryPreviewId) setPreviewItem(item); })
      .finally(() => setPreviewLoading(false));
  }, [libraryPreviewId]);

  useEffect(() => {
    if (!libraryPreviewId) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setLibraryPreviewId(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [libraryPreviewId, setLibraryPreviewId]);

  // Save-to-library dialog
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [saveCategoryId, setSaveCategoryId] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!openRunId) return;
    setThread([]); setQuizAnswers({}); setLoading(true); setBusy(false);
    fetch(`/api/runs/${openRunId}`)
      .then(r => r.json())
      .then(run => { if (openRunRef.current === openRunId) setThread(JSON.parse(run.thread_json)); })
      .finally(() => setLoading(false));
    // Abort any in-flight reply stream when the open run changes or the panel unmounts.
    return () => { abortRef.current?.abort(); abortRef.current = null; };
  }, [openRunId]);

  useEffect(() => {
    if (!openRunId) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpenRunId(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openRunId, setOpenRunId]);

  // Derive the quiz from the LAST assistant message containing a ```json array
  // block, so "Retry misses" swaps the form to the newly generated question set.
  const quizSrc = useMemo(() => {
    if (openMethod !== "quiz") return null;
    for (let i = thread.length - 1; i >= 1; i--) {
      if (thread[i].role !== "assistant") continue;
      const q = parseQuiz(thread[i].content);
      if (q) return { idx: i, quiz: q };
    }
    return null;
  }, [openMethod, thread]);
  const quizIdx = quizSrc?.idx ?? -1;
  useEffect(() => { setQuizAnswers({}); }, [quizIdx]);

  // Same backwards-scan pattern for flashcards / mindmap, so Regenerate swaps
  // in whichever later assistant message actually parses.
  const cardsSrc = useMemo(() => {
    if (openMethod !== "flashcards") return null;
    for (let i = thread.length - 1; i >= 1; i--) {
      if (thread[i].role !== "assistant") continue;
      const c = parseCards(thread[i].content);
      if (c) return { idx: i, cards: c };
    }
    return null;
  }, [openMethod, thread]);

  const mindmapSrc = useMemo(() => {
    if (openMethod !== "mindmap") return null;
    for (let i = thread.length - 1; i >= 1; i--) {
      if (thread[i].role !== "assistant") continue;
      const m = parseMindmap(thread[i].content);
      if (m) return { idx: i, map: m };
    }
    return null;
  }, [openMethod, thread]);

  if (!openRunId && !libraryPreviewId) return null;
  const quiz = quizSrc?.quiz ?? null;
  const needsParsedRenderer = openMethod === "flashcards" || openMethod === "mindmap";
  const lastAssistantIdx = (() => {
    for (let i = thread.length - 1; i >= 1; i--) if (thread[i].role === "assistant") return i;
    return -1;
  })();

  async function send(message: string) {
    const runId = openRunId;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setThread(t => [...t, { role: "user", content: message }, { role: "assistant", content: "" }]);
    let acc = "";
    try {
      const res = await fetch(`/api/runs/${runId}/reply`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }), signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* body not JSON */ }
        if (openRunRef.current === runId)
          setThread(t => [...t.slice(0, -1), { role: "assistant", content: `⛔ ${msg}` }]);
        return acc;
      }
      await readSse(res, ev => {
        if (openRunRef.current !== runId) return; // run switched mid-stream — drop stale events
        if (ev.type === "chunk") { acc += ev.text; setThread(t => [...t.slice(0, -1), { role: "assistant", content: acc }]); }
        if (ev.type === "error") setThread(t => [...t.slice(0, -1), { role: "assistant", content: `⛔ ${ev.message}` }]);
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      if (!aborted && openRunRef.current === runId) {
        const msg = e instanceof Error ? e.message : String(e);
        setThread(t => [...t.slice(0, -1), { role: "assistant", content: `⛔ ${msg}` }]);
      }
    } finally {
      setBusy(false);
    }
    return acc;
  }

  async function submitQuiz() {
    if (!quiz) return;
    const answered = quiz;
    const answers = quizAnswers;
    const answerText = answered.map(q => `Q${q.id}: ${answers[q.id] ?? "(blank)"}`).join("\n");
    const feedback = await send(`My answers:\n${answerText}\n\nGrade them.`);
    await fetch("/api/quiz", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: openRunId,
        attempts: answered.map(q => ({ question: q.question, user_answer: answers[q.id] ?? "", correct: null, feedback })),
      }),
    });
  }

  function openSaveDialog() {
    const label = openMethod ? METHODS[openMethod as keyof typeof METHODS]?.label : undefined;
    setSaveTitle(`${label ?? "Result"} — ${new Date().toISOString().slice(0, 10)}`);
    setNewCategory(null);
    setSavedFlash(false);
    setSaveOpen(true);
    fetch("/api/categories").then(r => r.json()).then((cats: CategoryRow[]) => {
      setCategories(cats);
      setSaveCategoryId(cats[0] ? String(cats[0].id) : "");
    }).catch(() => {});
  }

  async function saveToLibrary() {
    if (lastAssistantIdx < 0 || !saveTitle.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: saveTitle.trim(),
        kind: "result",
        content_md: thread[lastAssistantIdx].content,
        method: openMethod,
      };
      if (newCategory !== null && newCategory.trim()) body.newCategoryName = newCategory.trim();
      else body.categoryId = Number(saveCategoryId);
      await fetch("/api/library", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      setSaveOpen(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (libraryPreviewId) {
    const previewCards = previewItem?.method === "flashcards" ? parseCards(previewItem.content_md) : null;
    const previewMap = previewItem?.method === "mindmap" ? parseMindmap(previewItem.content_md) : null;
    return (
      <div className="result-panel">
        <div className="result-head">
          <strong>📚 {previewItem?.title ?? "Loading…"}</strong>
          <button type="button" className="node-btn" onClick={() => setLibraryPreviewId(null)} aria-label="Close library preview">
            ✕ Close
          </button>
        </div>
        <div className="result-body">
          {previewLoading && !previewItem && <div className="node-sub">Loading…</div>}
          {previewItem && (
            previewCards ? <FlashcardDeck cards={previewCards} libraryItemId={previewItem.id} />
            : previewMap ? <MindMapView map={previewMap} />
            : <ReactMarkdown>{previewItem.content_md}</ReactMarkdown>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="result-panel">
      <div className="result-head">
        <strong>Result — run #{openRunId}</strong>
        {!loading && thread.length > 0 && (
          <button type="button" className="node-btn" onClick={openSaveDialog} aria-label="Save result to library">
            💾 Save
          </button>
        )}
        {savedFlash && <span className="node-sub">Saved ✓</span>}
        <button type="button" className="node-btn" onClick={() => setOpenRunId(null)} aria-label="Close result panel">
          ✕ Close
        </button>
      </div>
      {saveOpen && (
        <div className="save-dialog">
          <input aria-label="Save title" value={saveTitle} onChange={e => setSaveTitle(e.target.value)} />
          {newCategory === null ? (
            <select aria-label="Category" value={saveCategoryId} onChange={e => {
              if (e.target.value === "__new__") setNewCategory(""); else setSaveCategoryId(e.target.value);
            }}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              <option value="__new__">+ New category…</option>
            </select>
          ) : (
            <input aria-label="New category name" placeholder="New category name" value={newCategory}
              onChange={e => setNewCategory(e.target.value)} />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="node-btn" disabled={saving || !saveTitle.trim()} onClick={saveToLibrary}>Save</button>
            <button type="button" className="node-btn" onClick={() => setSaveOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="result-body">
        {loading && thread.length === 0 && <div className="node-sub">Loading…</div>}
        {thread.slice(1).map((m, i) => {
          const idx = i + 1; // account for the slice(1) offset
          if (m.role === "assistant" && openMethod === "flashcards" && cardsSrc?.idx === idx)
            return <div key={i} className="msg msg-assistant"><FlashcardDeck cards={cardsSrc.cards} runId={openRunId ?? undefined} /></div>;
          if (m.role === "assistant" && openMethod === "mindmap" && mindmapSrc?.idx === idx)
            return <div key={i} className={`msg msg-${m.role}`}><MindMapView map={mindmapSrc.map} /></div>;
          return (
            <div key={i} className={`msg msg-${m.role}`}>
              {m.role === "assistant" ? <ReactMarkdown>{m.content}</ReactMarkdown> : <em>{m.content}</em>}
            </div>
          );
        })}
        {needsParsedRenderer && !cardsSrc && !mindmapSrc && thread.length > 1 && (
          <button type="button" className="node-btn" disabled={busy} aria-label="Regenerate valid output"
            onClick={() => send("Your last output was not valid JSON. Reply with ONLY a corrected JSON block in the required format.")}>
            🔁 Regenerate
          </button>
        )}
        {quiz && (
          <div className="quiz-form">
            {quiz.map(q => (
              <div key={q.id} className="quiz-q">
                <div><b>Q{q.id}.</b> {q.question}</div>
                {q.type === "mcq" && q.choices ? q.choices.map(c => (
                  <label key={c} style={{ display: "block" }}>
                    <input type="radio" name={`q${q.id}`} checked={quizAnswers[q.id] === c}
                      onChange={() => setQuizAnswers(a => ({ ...a, [q.id]: c }))} /> {c}
                  </label>
                )) : (
                  <input className="node-select" placeholder="your answer" aria-label={`Answer for question ${q.id}`}
                    value={quizAnswers[q.id] ?? ""} onChange={e => setQuizAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
                )}
              </div>
            ))}
            <button type="button" className="node-btn" disabled={busy} onClick={submitQuiz}>Submit answers for grading</button>
            <button type="button" className="node-btn" disabled={busy} aria-label="Retry with harder questions"
              onClick={() => send("Generate a new, harder set of questions focused on what I answered weakly above. Same JSON format.")}>
              🔁 Retry misses
            </button>
          </div>
        )}
      </div>
      <div className="result-input">
        <input value={draft} aria-label="Follow-up message"
          placeholder={openMethod === "feynman" ? "Explain it back in your own words…" : openMethod === "pq4r" ? "Reply to continue to the next step…" : "Follow up…"}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && draft.trim() && !busy) { send(draft.trim()); setDraft(""); } }} />
        <button type="button" className="node-btn" disabled={busy || !draft.trim()} onClick={() => { send(draft.trim()); setDraft(""); }}>
          Send
        </button>
      </div>
    </div>
  );
}
