"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useApp, readSse } from "@/store";
import { parseCards, parseMindmap, parseQuizResults, stripTrailingJsonBlock } from "@/lib/parse";
import { METHODS, type MethodId } from "@/lib/prompts";

const FOLLOW_UP_PLACEHOLDERS: Partial<Record<MethodId, string>> = {
  feynman: "Explain it back in your own words…",
  pq4r: "Reply to continue to the next step…",
  tutorial: "Answer or push back on the tutor's question…",
};
import FlashcardDeck from "@/components/renderers/FlashcardDeck";
import MindMapView from "@/components/renderers/MindMapView";
import SaveDialog from "@/components/SaveDialog";

interface Msg { role: "user" | "assistant"; content: string; }
interface QuizQ { id: number; type: "mcq" | "short"; question: string; choices?: string[]; answer: string; }

function parseQuiz(md: string): QuizQ[] | null {
  const m = md.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try { const a = JSON.parse(m[1]); return Array.isArray(a) ? a : null; } catch { return null; }
}

export default function ResultPanel() {
  const { openRunId, setOpenRunId, openMethod } = useApp();
  const [thread, setThread] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const openRunRef = useRef<number | null>(null);
  openRunRef.current = openRunId;

  useEffect(() => {
    if (!openRunId) return;
    setThread([]); setQuizAnswers({}); setLoading(true); setBusy(false);
    setSaveOpen(false); setSavedFlash(false); // don't leak dialog state across runs
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

  if (!openRunId) return null;
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
    const results = parseQuizResults(feedback);
    await fetch("/api/quiz", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: openRunId,
        attempts: answered.map(q => {
          const r = results?.find(x => x.id === q.id);
          return { question: q.question, user_answer: answers[q.id] ?? "", correct: r ? r.correct : null, feedback };
        }),
      }),
    });
  }

  const methodLabel = openMethod ? METHODS[openMethod as keyof typeof METHODS]?.label : undefined;

  return (
    <div className="result-panel">
      <div className="result-head">
        <strong>Result — run #{openRunId}</strong>
        {!loading && lastAssistantIdx >= 0 && (
          <button type="button" className="node-btn" onClick={() => { setSavedFlash(false); setSaveOpen(true); }}
            aria-label="Save result to library">
            💾 Save
          </button>
        )}
        {savedFlash && <span className="node-sub">Saved ✓</span>}
        <button type="button" className="node-btn" onClick={() => setOpenRunId(null)} aria-label="Close result panel">
          ✕ Close
        </button>
      </div>
      {saveOpen && lastAssistantIdx >= 0 && (
        <SaveDialog
          defaultTitle={`${methodLabel ?? "Result"} — ${new Date().toISOString().slice(0, 10)}`}
          contentMd={thread[lastAssistantIdx].content}
          method={openMethod}
          onClose={() => setSaveOpen(false)}
          onSaved={() => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000); }}
        />
      )}
      <div className="result-body">
        {loading && thread.length === 0 && <div className="node-sub">Loading…</div>}
        {thread.slice(1).map((m, i) => {
          const idx = i + 1; // account for the slice(1) offset
          if (m.role === "assistant" && cardsSrc?.idx === idx)
            return <div key={i} className="msg msg-assistant"><FlashcardDeck key={cardsSrc.idx} cards={cardsSrc.cards} runId={openRunId ?? undefined} /></div>;
          if (m.role === "assistant" && mindmapSrc?.idx === idx)
            return <div key={i} className="msg msg-assistant"><MindMapView key={mindmapSrc.idx} map={mindmapSrc.map} /></div>;
          const displayContent = m.role === "assistant" && openMethod === "quiz" ? stripTrailingJsonBlock(m.content) : m.content;
          // A quiz-generation message is entirely a JSON fence with no prose,
          // so stripping it leaves nothing to show — the quiz form below
          // (derived separately from quizSrc) is the actual rendering of it.
          if (m.role === "assistant" && displayContent.trim() === "") return null;
          return (
            <div key={i} className={`msg msg-${m.role}`}>
              {m.role === "assistant" ? <ReactMarkdown>{displayContent}</ReactMarkdown> : <em>{m.content}</em>}
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
          placeholder={FOLLOW_UP_PLACEHOLDERS[openMethod as MethodId] ?? "Follow up…"}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && draft.trim() && !busy) { send(draft.trim()); setDraft(""); } }} />
        <button type="button" className="node-btn" disabled={busy || !draft.trim()} onClick={() => { send(draft.trim()); setDraft(""); }}>
          Send
        </button>
      </div>
    </div>
  );
}
