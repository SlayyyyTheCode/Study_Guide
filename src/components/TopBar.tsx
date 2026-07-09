"use client";
import { useEffect, useState, useCallback } from "react";
import { useApp, type BrainsStatus } from "@/store";
import type { WorkflowRow } from "@/lib/db";

interface Props {
  onRunAll: () => void;
}

export default function TopBar({ onRunAll }: Props) {
  const { workflowId, setWorkflowId, setBrains, drawerOpen, setDrawerOpen, snap, setSnap, weakSpotsOpen, setWeakSpotsOpen } = useApp();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [error, setError] = useState("");

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error(`workflows load failed (${res.status})`);
      const list: WorkflowRow[] = await res.json();
      if (list.length === 0) {
        const createRes = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My Study Session" }),
        });
        if (!createRes.ok) throw new Error(`workflow create failed (${createRes.status})`);
        const created: WorkflowRow = await createRes.json();
        setWorkflows([created]);
        setWorkflowId(created.id);
        setError("");
        return;
      }
      setWorkflows(list);
      setWorkflowId(list[0].id);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workflows");
    }
  }, [setWorkflowId]);

  // Load once on mount; the workflow list is not expected to change from other tabs during a session.
  useEffect(() => {
    void loadWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadBrains() {
      try {
        const res = await fetch("/api/brains");
        const json: BrainsStatus = await res.json();
        if (!cancelled) setBrains(json);
      } catch { /* transient network error; next poll retries */ }
    }
    void loadBrains();
    const t = setInterval(loadBrains, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [setBrains]);

  async function newWorkflow() {
    const name = window.prompt("Name for the new workflow:");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(`workflow create failed (${res.status})`);
      const created: WorkflowRow = await res.json();
      setWorkflows(prev => [created, ...prev]);
      setWorkflowId(created.id);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workflow");
    }
  }

  return (
    <div className="topbar">
      <strong>Study Guide</strong>
      <select
        aria-label="Workflow"
        value={workflowId ?? ""}
        onChange={e => setWorkflowId(Number(e.target.value))}
      >
        {workflows.map(w => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
      <button type="button" onClick={newWorkflow} aria-label="Create new workflow">+ New</button>
      <button type="button" onClick={onRunAll} aria-label="Run all output nodes" disabled={!workflowId}>
        ▶▶ Run All
      </button>
      <button type="button" aria-pressed={snap} aria-label="Toggle snap to grid" onClick={() => setSnap(!snap)}>
        {snap ? "⊞ Snap on" : "⊡ Snap off"}
      </button>
      <button type="button" onClick={() => setDrawerOpen(!drawerOpen)} aria-label="Toggle library">
        📚 Library
      </button>
      <button type="button" onClick={() => setWeakSpotsOpen(!weakSpotsOpen)} aria-label="Toggle weak spots review">
        🔥 Weak Spots
      </button>
      {error && <span className="topbar-error" role="alert">{error}</span>}
    </div>
  );
}
