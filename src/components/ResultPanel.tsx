"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useApp, readSse } from "@/store";

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
  const abortRef = useRef<AbortController | null>(null);
  const openRunRef = useRef<number | null>(null);
  openRunRef.current = openRunId;

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

  if (!openRunId) return null;
  const quiz = quizSrc?.quiz ?? null;

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

  return (
    <div className="result-panel">
      <div className="result-head">
        <strong>Result — run #{openRunId}</strong>
        <button type="button" className="node-btn" onClick={() => setOpenRunId(null)} aria-label="Close result panel">
          ✕ Close
        </button>
      </div>
      <div className="result-body">
        {loading && thread.length === 0 && <div className="node-sub">Loading…</div>}
        {thread.slice(1).map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === "assistant" ? <ReactMarkdown>{m.content}</ReactMarkdown> : <em>{m.content}</em>}
          </div>
        ))}
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
