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
  // dx/dy are the grab offset in container-relative coordinates; boundsLeft/Top
  // let onPointerMove convert viewport clientX/Y into that same coordinate
  // space without re-measuring the container on every move event.
  const dragRef = useRef<{ dx: number; dy: number; boundsLeft: number; boundsTop: number } | null>(null);
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
    const bounds = boundsRef.current?.getBoundingClientRect();
    if (!bounds) return;
    // Grab offset must be computed in the same (container-relative) space as
    // `pos`, not raw viewport coordinates — otherwise the box jumps relative
    // to the cursor by however far the canvas sits from the viewport origin.
    const containerX = e.clientX - bounds.left;
    const containerY = e.clientY - bounds.top;
    dragRef.current = { dx: containerX - pos.x, dy: containerY - pos.y, boundsLeft: bounds.left, boundsTop: bounds.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const containerX = e.clientX - d.boundsLeft;
    const containerY = e.clientY - d.boundsTop;
    setPos(clamp(containerX - d.dx, containerY - d.dy));
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
