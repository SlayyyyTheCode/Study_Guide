import { describe, it, expect } from "vitest";
import { openDb, createWorkflow } from "@/lib/db";
import { runOutputNode } from "@/lib/runner";
import type { BrainDriver } from "@/lib/brains/types";
import type { Graph } from "@/lib/graph";

const mockDriver: BrainDriver = {
  id: "ollama", label: "mock",
  listModels: async () => ["m"],
  status: async () => ({ ok: true }),
  async *stream(opts) {
    expect(opts.system.length).toBeGreaterThan(10);
    expect(opts.messages[0].content).toContain("MOCK MATERIAL");
    yield "Hello ";
    yield "world";
  },
};

function setup() {
  const db = openDb(":memory:");
  const wf = createWorkflow(db, "t");
  db.prepare(
    "INSERT INTO files (workflow_id, node_id, filename, path, mime, extracted_text, status) VALUES (?,?,?,?,?,?,?)"
  ).run(wf.id, "f1", "a.txt", "x", "text/plain", "MOCK MATERIAL about osmosis", "ready");
  const graph: Graph = {
    nodes: [
      { id: "f1", type: "input", data: {} },
      { id: "b1", type: "brain", data: { provider: "ollama", model: "m" } },
      { id: "o1", type: "output", data: { method: "summary" } },
    ],
    edges: [{ source: "f1", target: "b1" }, { source: "b1", target: "o1" }],
  };
  return { db, wf, graph };
}

describe("runner", () => {
  it("streams chunks and persists the run", async () => {
    const { db, wf, graph } = setup();
    const chunks: string[] = [];
    let runId = 0;
    for await (const ev of runOutputNode(db, wf.id, graph, "o1", { driver: mockDriver })) {
      if (ev.type === "start") runId = ev.runId;
      if (ev.type === "chunk") chunks.push(ev.text);
    }
    expect(chunks.join("")).toBe("Hello world");
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as { status: string; result_md: string };
    expect(row.status).toBe("done");
    expect(row.result_md).toBe("Hello world");
  });
  it("yields error event for unwired node and keeps partial result on driver failure", async () => {
    const { db, wf, graph } = setup();
    const events = [];
    for await (const ev of runOutputNode(db, wf.id, { ...graph, edges: [] }, "o1", { driver: mockDriver }))
      events.push(ev);
    expect(events[0].type).toBe("error");

    const failing: BrainDriver = { ...mockDriver, async *stream() { yield "partial"; throw new Error("boom"); } };
    let runId = 0; let sawError = false;
    for await (const ev of runOutputNode(db, wf.id, graph, "o1", { driver: failing })) {
      if (ev.type === "start") runId = ev.runId;
      if (ev.type === "error") sawError = true;
    }
    expect(sawError).toBe(true);
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as { status: string; result_md: string };
    expect(row.status).toBe("error");
    expect(row.result_md).toBe("partial");
  });
});
