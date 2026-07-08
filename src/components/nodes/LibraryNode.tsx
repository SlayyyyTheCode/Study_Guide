"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";

export default function LibraryNode({ data }: NodeProps) {
  const d = data as { libraryItemId?: number; categoryId?: number; title?: string; categoryName?: string };
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!d.libraryItemId) return;
    fetch(`/api/library/${d.libraryItemId}`).then(r => setMissing(!r.ok)).catch(() => {});
  }, [d.libraryItemId]);

  return (
    <div className="node node-library">
      <div className="node-title">📚 {d.categoryId ? "Category" : "Library item"} {missing && "⚠️"}</div>
      <div className="node-sub">{d.title}</div>
      {d.categoryName && <span className="lib-chip">{d.categoryName}</span>}
      {missing && <div className="node-warn">Library item no longer exists.</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
