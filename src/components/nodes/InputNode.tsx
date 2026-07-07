"use client";
import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useApp } from "@/store";

const ACCEPT = ".pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.gif,.webp";

interface InputData {
  filename?: string;
  status?: string;
  tokens?: number;
  warning?: string;
  [key: string]: unknown;
}

const STATUS_BADGE: Record<string, string> = {
  ready: "✅",
  image: "✅",
  needs_vision: "⚠️",
  error: "⛔",
  uploading: "⏳",
};

export default function InputNode({ id, data }: NodeProps) {
  const nodeData = data as InputData;
  const { workflowId } = useApp();
  const { updateNodeData } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    if (!workflowId) return;
    setUploading(true);
    updateNodeData(id, { status: "uploading" });
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("workflowId", String(workflowId));
        form.append("nodeId", id);
        const res = await fetch("/api/files", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) {
          updateNodeData(id, { filename: file.name, status: "error", warning: json.error ?? "upload failed" });
          continue;
        }
        updateNodeData(id, {
          filename: json.filename,
          status: json.status,
          tokens: json.tokens,
          warning: json.warning,
        });
      }
    } finally {
      setUploading(false);
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) void uploadFiles(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  const badge = nodeData.status ? STATUS_BADGE[nodeData.status] ?? "" : "";

  return (
    <div
      className={`node node-input${dragOver ? " node-dragover" : ""}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
    >
      <div className="node-title">📄 File Input {badge}</div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: "none" }}
        onChange={onChange}
        aria-label="Choose file to upload"
      />
      <button
        type="button"
        className="node-btn"
        disabled={uploading || !workflowId}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? "Uploading…" : "Choose / drop file"}
      </button>
      {nodeData.filename && (
        <div className="node-sub" title={nodeData.filename}>
          {nodeData.filename}
          {typeof nodeData.tokens === "number" && nodeData.tokens > 0 ? ` · ~${nodeData.tokens} tok` : ""}
        </div>
      )}
      {nodeData.warning && <div className="node-warn">{nodeData.warning}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
