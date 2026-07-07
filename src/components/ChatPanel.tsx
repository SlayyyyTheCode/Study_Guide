"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useApp, readSse } from "@/store";

interface Msg { role: string; content: string; }

export default function ChatPanel() {
  const { workflowId, brains } = useApp();
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState("claude");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workflowId) return;
    fetch(`/api/chat?workflowId=${workflowId}`).then(r => r.json()).then(setMsgs);
  }, [workflowId]);
  useEffect(() => { bottom.current?.scrollIntoView(); }, [msgs]);

  async function send() {
    const message = draft.trim();
    if (!message || busy || !workflowId) return;
    setDraft(""); setBusy(true);
    setMsgs(m => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    const model = provider === "claude" ? "sonnet" : (brains.ollama?.models[0] ?? "");
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowId, message, provider, model }),
      });
      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* body not JSON */ }
        setMsgs(m => [...m.slice(0, -1), { role: "assistant", content: `⛔ ${msg}` }]);
        return;
      }
      let acc = "";
      await readSse(res, ev => {
        if (ev.type === "chunk") { acc += ev.text; setMsgs(m => [...m.slice(0, -1), { role: "assistant", content: acc }]); }
        if (ev.type === "error") setMsgs(m => [...m.slice(0, -1), { role: "assistant", content: `⛔ ${ev.message}` }]);
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        const msg = e instanceof Error ? e.message : String(e);
        setMsgs(m => [...m.slice(0, -1), { role: "assistant", content: `⛔ ${msg}` }]);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button type="button" className="chat-toggle" onClick={() => setOpen(true)} aria-label="Open chat">💬</button>;

  const lastAssistantEmpty = busy && msgs.length > 0 && msgs[msgs.length - 1].role === "assistant" && msgs[msgs.length - 1].content === "";

  return (
    <aside className="chat-panel">
      <div className="chat-head">
        <strong>💬 Chat</strong>
        <select aria-label="Chat brain" value={provider} onChange={e => setProvider(e.target.value)}>
          <option value="claude">Claude</option>
          <option value="ollama" disabled={(brains.ollama?.models ?? []).length === 0} title="No Ollama models detected">
            Ollama
          </option>
        </select>
        <button type="button" className="node-btn" onClick={() => setOpen(false)} aria-label="Collapse chat">—</button>
      </div>
      <div className="chat-body">
        {msgs.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === "assistant" ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
          </div>
        ))}
        {lastAssistantEmpty && <span className="chat-thinking">thinking<span className="dots">…</span></span>}
        <div ref={bottom} />
      </div>
      <div className="result-input">
        <input value={draft} aria-label="Chat message" placeholder="Ask about your material…" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()} />
        <button type="button" className="node-btn" disabled={busy} onClick={send}>Send</button>
      </div>
    </aside>
  );
}
