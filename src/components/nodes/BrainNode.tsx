"use client";
import { type ChangeEvent } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useApp } from "@/store";

interface BrainData {
  provider?: string;
  model?: string;
  [key: string]: unknown;
}

export default function BrainNode({ id, data }: NodeProps) {
  const nodeData = data as BrainData;
  const { brains } = useApp();
  const { updateNodeData } = useReactFlow();

  const provider = nodeData.provider ?? "claude";
  const model = nodeData.model ?? "";
  const status = brains[provider];
  const models = status?.models ?? [];

  function onProviderChange(e: ChangeEvent<HTMLSelectElement>) {
    updateNodeData(id, { provider: e.target.value, model: "" });
  }

  function onModelChange(e: ChangeEvent<HTMLSelectElement>) {
    updateNodeData(id, { model: e.target.value });
  }

  const dot = status ? (status.ok ? "🟢" : "🔴") : "🔴";

  return (
    <div className="node node-brain">
      <Handle type="target" position={Position.Left} />
      <div className="node-title">🧠 Brain {dot}</div>
      <select
        className="node-select"
        aria-label="Brain provider"
        value={provider}
        onChange={onProviderChange}
      >
        <option value="claude">Claude</option>
        <option value="ollama">Ollama</option>
      </select>
      <select
        className="node-select"
        aria-label="Model"
        value={model}
        onChange={onModelChange}
        disabled={models.length === 0}
      >
        <option value="">— select model —</option>
        {models.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      {status && !status.ok && status.hint && (
        <div className="node-warn">{status.hint}</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
