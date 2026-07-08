"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { METHODS } from "@/lib/prompts";
import { fuzzy } from "@/lib/fuzzy";

export interface QuickAddEntry { label: string; type: string; data: Record<string, unknown>; }

const BASE: QuickAddEntry[] = [
  { label: "📄 File Input", type: "input", data: {} },
  { label: "🧠 Brain", type: "brain", data: { provider: "claude", model: "sonnet" } },
  ...Object.entries(METHODS).map(([method, m]) => ({ label: `${m.icon} ${m.label}`, type: "output", data: { method } })),
];

interface Props { at: { x: number; y: number } | null; onPick: (e: QuickAddEntry, at: { x: number; y: number } | null) => void; onClose: () => void; }

export default function QuickAdd({ at, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [libEntries, setLibEntries] = useState<QuickAddEntry[]>([]);
  const [libError, setLibError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Capture the previously focused element on mount; restore it on unmount
  // (covers every close path: Escape, backdrop click, pick).
  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      const el = restoreRef.current;
      if (el && document.contains(el)) el.focus();
    };
  }, []);

  useEffect(() => {
    fetch("/api/library").then(r => r.json()).then((items: { id: number; title: string; category_name: string }[]) =>
      setLibEntries(items.map(i => ({ label: `📚 ${i.title}`, type: "library", data: { libraryItemId: i.id, title: i.title, categoryName: i.category_name } })))
    ).catch(() => setLibError(true));
  }, []);

  const results = useMemo(() => {
    const all = [...BASE, ...libEntries];
    return (q ? all.filter(e => fuzzy(q, e.label)) : all).slice(0, 8);
  }, [q, libEntries]);

  useEffect(() => { setSel(0); }, [q]);

  return (
    <div className="quickadd-backdrop" onClick={onClose}>
      <div
        className="quickadd"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === "Escape") onClose(); }}
      >
        <input ref={inputRef} role="combobox" aria-expanded="true" aria-controls="qa-listbox"
          aria-activedescendant={results.length > 0 ? `qa-opt-${sel}` : undefined}
          aria-label="Quick add node" placeholder="Type to add a node… (quiz, pdf, flash…)" value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
            if (e.key === "Enter" && results[sel]) onPick(results[sel], at);
          }} />
        <div className="quickadd-list" id="qa-listbox" role="listbox">
          {results.map((r, i) => (
            <button type="button" key={r.label + i} id={`qa-opt-${i}`} role="option" aria-selected={i === sel}
              tabIndex={-1}
              className={`quickadd-row ${i === sel ? "quickadd-sel" : ""}`}
              onMouseEnter={() => setSel(i)} onClick={() => onPick(r, at)}>{r.label}</button>
          ))}
          {results.length === 0 && <div className="quickadd-empty">No match</div>}
          {libError && <div className="quickadd-empty">Library unavailable — showing built-ins</div>}
        </div>
      </div>
    </div>
  );
}
