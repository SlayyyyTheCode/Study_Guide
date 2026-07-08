import { describe, it, expect } from "vitest";
import { isValidEdge, resolveOutput, type Graph } from "@/lib/graph";

const g: Graph = {
  nodes: [
    { id: "f1", type: "input", data: { fileId: 11 } },
    { id: "f2", type: "input", data: { fileId: 12 } },
    { id: "b1", type: "brain", data: { provider: "claude", model: "sonnet" } },
    { id: "o1", type: "output", data: { method: "quiz" } },
    { id: "o2", type: "output", data: { method: "summary" } },
  ],
  edges: [
    { source: "f1", target: "b1" },
    { source: "f2", target: "b1" },
    { source: "b1", target: "o1" },
  ],
};

describe("graph", () => {
  it("allows input→brain and brain→output only", () => {
    expect(isValidEdge(g, "f1", "b1")).toBe(true);
    expect(isValidEdge(g, "b1", "o1")).toBe(true);
    expect(isValidEdge(g, "f1", "o1")).toBe(false);
    expect(isValidEdge(g, "o1", "b1")).toBe(false);
    expect(isValidEdge(g, "b1", "b1")).toBe(false);
  });
  it("resolves output → brain → inputs", () => {
    const r = resolveOutput(g, "o1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.brain.data.provider).toBe("claude");
      expect(r.inputs.map(n => n.id).sort()).toEqual(["f1", "f2"]);
    }
  });
  it("reports unwired output", () => {
    const r = resolveOutput(g, "o2");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/brain/i);
  });
  it("reports brain with no inputs", () => {
    const g2: Graph = { nodes: g.nodes, edges: [{ source: "b1", target: "o1" }] };
    const r = resolveOutput(g2, "o1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/input/i);
  });
  it("library nodes connect only to brains and count as inputs", () => {
    const g3: Graph = {
      nodes: [
        { id: "L1", type: "library", data: { libraryItemId: 5 } },
        { id: "b1", type: "brain", data: { provider: "claude", model: "sonnet" } },
        { id: "o1", type: "output", data: { method: "summary" } },
      ],
      edges: [{ source: "L1", target: "b1" }, { source: "b1", target: "o1" }],
    };
    expect(isValidEdge(g3, "L1", "b1")).toBe(true);
    expect(isValidEdge(g3, "L1", "o1")).toBe(false);
    const r = resolveOutput(g3, "o1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inputs.map(n => n.id)).toEqual(["L1"]);
  });
});
