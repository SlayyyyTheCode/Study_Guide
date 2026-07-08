"use client";
import { useEffect, useRef, useState } from "react";
import { MiniMap } from "@xyflow/react";

const STORAGE_KEY = "sg-minimap";
const DEFAULT_POS = { x: 12, y: 12 }; // top-left of the canvas

/**
 * MiniMap in a draggable, collapsible floating box. Rendered outside the
 * <ReactFlow> element (but inside ReactFlowProvider) so it can be positioned
 * freely within the canvas wrapper. Position + collapsed state persist in
 * localStorage — a UI preference, not study data, so it stays out of SQLite.
 */
export default function FloatingMiniMap({ boundsRef }: { boundsRef: React.RefObject<HTMLDivElement | null> }) {
  const [pos, setPos] = useState(DEFAULT_POS);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "");
      if (typeof s.x === "number" && typeof s.y === "number") setPos({ x: s.x, y: s.y });
      if (typeof s.collapsed === "boolean") setCollapsed(s.collapsed);
    } catch { /* first run or corrupt entry — defaults apply */ }
  }, []);

  function persist(next: { x: number; y: number; collapsed: boolean }) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage full/blocked */ }
  }

  function clamp(x: number, y: number) {
    const bounds = boundsRef.current?.getBoundingClientRect();
    const box = boxRef.current?.getBoundingClientRect();
    if (!bounds || !box) return { x, y };
    return {
      x: Math.min(Math.max(0, x), Math.max(0, bounds.width - box.width)),
      y: Math.min(Math.max(0, y), Math.max(0, bounds.height - box.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    setPos(clamp(e.clientX - dragRef.current.dx, e.clientY - dragRef.current.dy));
  }
  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    persist({ ...pos, collapsed });
  }

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    persist({ ...pos, collapsed: next });
  }

  return (
    <div
      ref={boxRef}
      className={`minimap-float ${collapsed ? "minimap-collapsed" : ""}`}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="minimap-bar">
        <span
          className="minimap-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title="Drag to move minimap"
          aria-label="Drag to move minimap"
          role="button"
        >
          ⠿ Map
        </span>
        <button
          type="button"
          className="minimap-toggle"
          aria-label={collapsed ? "Expand minimap" : "Minimize minimap"}
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          {collapsed ? "▣" : "—"}
        </button>
      </div>
      {!collapsed && (
        <MiniMap
          pannable
          zoomable
          nodeColor={n => n.type === "brain" ? "#b07ad9" : n.type === "output" ? "#4dab6d" : "#4a90d9"}
        />
      )}
    </div>
  );
}
