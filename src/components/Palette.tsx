"use client";
import { METHODS, type MethodId } from "@/lib/prompts";
import type { DragEvent, KeyboardEvent } from "react";

interface PalItem {
  type: "input" | "brain" | "output";
  className: string;
  label: string;
  icon: string;
  data: Record<string, unknown>;
}

const ITEMS: PalItem[] = [
  { type: "input", className: "pal-input", label: "File Input", icon: "📄", data: {} },
  { type: "brain", className: "pal-brain", label: "Brain", icon: "🧠", data: { provider: "claude", model: "" } },
  ...(Object.entries(METHODS) as [MethodId, { label: string; icon: string }][]).map(([id, m]) => ({
    type: "output" as const,
    className: "pal-output",
    label: m.label,
    icon: m.icon,
    data: { method: id },
  })),
];

function dragPayload(item: PalItem) {
  return JSON.stringify({ type: item.type, data: item.data });
}

export default function Palette() {
  function onDragStart(e: DragEvent, item: PalItem) {
    e.dataTransfer.setData("application/sg-node", dragPayload(item));
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <aside className="palette">
      <div className="palette-head">Blocks</div>
      {ITEMS.map((item, i) => (
        <div
          key={`${item.type}-${i}`}
          className={`pal-item ${item.className}`}
          draggable
          role="button"
          tabIndex={0}
          title={`Drag onto the canvas to add ${item.label}`}
          onDragStart={e => onDragStart(e, item)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") e.preventDefault();
          }}
        >
          {item.icon} {item.label}
        </div>
      ))}
    </aside>
  );
}
