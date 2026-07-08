"use client";
import { useRef, useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useApp, readSse } from "@/store";
import { METHODS, type MethodId } from "@/lib/prompts";

interface OutputData {
  method?: MethodId;
  runId?: number;
  state?: string;
  [key: string]: unknown;
}

export default function OutputNode({ id, data }: NodeProps) {
  const nodeData = data as OutputData;
  const { workflowId, setOpenRunId, setOpenMethod, setPlan, setRunning: setRunningGlobal } = useApp();
  const { updateNodeData } = useReactFlow();
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const accRef = useRef("");

  const method = (nodeData.method ?? "summary") as MethodId;
  const info = METHODS[method];

  async function run() {
    if (!workflowId || running) return;
    setRunning(true);
    setRunningGlobal(id, true);
    updateNodeData(id, { state: "running" });
    setError("");
    setPreview("");
    accRef.current = "";
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, nodeId: id }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Run failed (${res.status})`);
        updateNodeData(id, { state: "error" });
        setRunning(false);
        return;
      }
      await readSse(res, ev => {
        if (ev.type === "start") {
          updateNodeData(id, { runId: ev.runId });
        } else if (ev.type === "chunk") {
          accRef.current += ev.text;
          setPreview(accRef.current.slice(-160));
        } else if (ev.type === "error") {
          setError(ev.message);
          updateNodeData(id, { state: "error" });
        } else if (ev.type === "done") {
          if (method === "pomodoro") {
            const m = accRef.current.match(/```json\s*([\s\S]*?)```/);
            if (m) {
              try {
                const parsed = JSON.parse(m[1]);
                if (Array.isArray(parsed.blocks)) setPlan(parsed.blocks);
              } catch { /* ignore malformed plan */ }
            }
          }
          updateNodeData(id, { state: "done" });
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      updateNodeData(id, { state: "error" });
    } finally {
      setRunning(false);
      setRunningGlobal(id, false);
    }
  }

  function openResult() {
    if (!nodeData.runId) return;
    setOpenRunId(nodeData.runId);
    setOpenMethod(method);
  }

  return (
    <div className={`node node-output ${nodeData.state ? `node-${nodeData.state}` : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">{info.icon} {info.label}</div>
      <div className="node-row">
        <button
          type="button"
          className="node-btn"
          disabled={running || !workflowId}
          onClick={run}
          aria-label={`Run ${info.label}`}
        >
          {running ? "⏳ Running…" : "▶ Run"}
        </button>
        {nodeData.runId != null && !running && (
          <button type="button" className="node-btn" onClick={openResult} aria-label="Open result">
            Open
          </button>
        )}
        {error && !running && (
          <button type="button" className="node-btn" onClick={run} aria-label="Retry run">
            Retry
          </button>
        )}
      </div>
      {error && <div className="node-warn">{error}</div>}
      {preview && !error && (
        <div className={`node-preview${running ? " node-preview-running" : ""}`}>{preview}</div>
      )}
    </div>
  );
}
