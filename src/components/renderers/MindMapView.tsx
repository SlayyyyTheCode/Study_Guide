"use client";
import { useMemo, useState } from "react";
import { ReactFlow, Background, type Node, type Edge } from "@xyflow/react";
import type { MindMap, MindNode } from "@/lib/parse";

function layout(map: MindMap): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []; const edges: Edge[] = [];
  let row = 0;
  function walk(n: MindNode, depth: number, parentId: string | null): void {
    const id = `m${nodes.length}`;
    nodes.push({ id, position: { x: depth * 220, y: row * 56 }, data: { label: n.label }, type: "default" });
    if (parentId) edges.push({ id: `e${id}`, source: parentId, target: id });
    const kids = n.children ?? [];
    if (kids.length === 0) row++;
    kids.forEach(k => walk(k, depth + 1, id));
  }
  walk({ label: map.root, children: map.children }, 0, null);
  return { nodes, edges };
}

function Outline({ n, depth }: { n: MindNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const kids = n.children ?? [];
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <button type="button" className="mm-row" onClick={() => kids.length && setOpen(o => !o)}>
        {kids.length ? (open ? "▾" : "▸") : "•"} {n.label}
      </button>
      {open && kids.map((k, i) => <Outline key={i} n={k} depth={depth + 1} />)}
    </div>
  );
}

export default function MindMapView({ map }: { map: MindMap }) {
  const [view, setView] = useState<"outline" | "graph">("outline");
  const { nodes, edges } = useMemo(() => layout(map), [map]);

  function toMarkdown(n: MindNode, depth: number): string {
    return `${"  ".repeat(depth)}- ${n.label}\n` + (n.children ?? []).map(k => toMarkdown(k, depth + 1)).join("");
  }
  function exportMd() {
    const md = `# ${map.root}\n\n` + map.children.map(c => toMarkdown(c, 0)).join("");
    navigator.clipboard.writeText(md);
  }

  return (
    <div className="mindmap">
      <div className="mm-bar">
        <button type="button" className="node-btn" onClick={() => setView(v => v === "outline" ? "graph" : "outline")}>
          {view === "outline" ? "🕸️ Graph view" : "☰ Outline view"}
        </button>
        <button type="button" className="node-btn" onClick={exportMd}>⧉ Copy as markdown</button>
      </div>
      {view === "outline"
        ? <Outline n={{ label: map.root, children: map.children }} depth={0} />
        : <div className="mm-graph"><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}><Background gap={20} /></ReactFlow></div>}
    </div>
  );
}
