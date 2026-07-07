"use client";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!openRunId) return;
    setThread([]); setQuizAnswers({}); setLoading(true);
    fetch(`/api/runs/${openRunId}`)
      .then(r => r.json())
      .then(run => setThread(JSON.parse(run.thread_json)))
      .finally(() => setLoading(false));
  }, [openRunId]);

  useEffect(() => {
    if (!openRunId) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpenRunId(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openRunId, setOpenRunId]);

  if (!openRunId) return null;
  const quiz = openMethod === "quiz" && thread.length >= 2 ? parseQuiz(thread[1].content) : null;

  async function send(message: string) {
    setBusy(true);
    setThread(t => [...t, { role: "user", content: message }, { role: "assistant", content: "" }]);
    const res = await fetch(`/api/runs/${openRunId}/reply`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }),
    });
    let acc = "";
    await readSse(res, ev => {
      if (ev.type === "chunk") { acc += ev.text; setThread(t => [...t.slice(0, -1), { role: "assistant", content: acc }]); }
      if (ev.type === "error") setThread(t => [...t.slice(0, -1), { role: "assistant", content: `⛔ ${ev.message}` }]);
    });
    setBusy(false);
    return acc;
  }

  async function submitQuiz() {
    if (!quiz) return;
    const answerText = quiz.map(q => `Q${q.id}: ${quizAnswers[q.id] ?? "(blank)"}`).join("\n");
    const feedback = await send(`My answers:\n${answerText}\n\nGrade them.`);
    await fetch("/api/quiz", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: openRunId,
        attempts: quiz.map(q => ({ question: q.question, user_answer: quizAnswers[q.id] ?? "", correct: null, feedback })),
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
