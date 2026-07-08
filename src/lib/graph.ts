export type NodeType = "input" | "library" | "brain" | "output";
export interface GNode { id: string; type: NodeType | string; data: Record<string, unknown>; }
export interface GEdge { source: string; target: string; }
export interface Graph { nodes: GNode[]; edges: GEdge[]; }

const LEGAL: Record<string, string> = { input: "brain", library: "brain", brain: "output" };

export function isValidEdge(g: Graph, sourceId: string, targetId: string): boolean {
  const s = g.nodes.find(n => n.id === sourceId);
  const t = g.nodes.find(n => n.id === targetId);
  if (!s || !t || s.id === t.id) return false;
  return LEGAL[s.type as string] === t.type;
}

export type Resolution =
  | { ok: true; brain: GNode; inputs: GNode[] }
  | { ok: false; error: string };

export function resolveOutput(g: Graph, outputId: string): Resolution {
  const out = g.nodes.find(n => n.id === outputId && n.type === "output");
  if (!out) return { ok: false, error: "Output node not found." };
  const brainEdge = g.edges.find(e => e.target === outputId);
  const brain = brainEdge && g.nodes.find(n => n.id === brainEdge.source && n.type === "brain");
  if (!brain) return { ok: false, error: "No brain connected to this output. Wire a brain node into it." };
  const inputs = g.edges
    .filter(e => e.target === brain.id)
    .map(e => g.nodes.find(n => n.id === e.source && (n.type === "input" || n.type === "library")))
    .filter((n): n is GNode => Boolean(n));
  if (inputs.length === 0) return { ok: false, error: "The brain has no input files. Wire at least one input node into it." };
  return { ok: true, brain, inputs };
}
