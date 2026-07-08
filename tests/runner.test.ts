import { describe, it, expect } from "vitest";
import { openDb, createWorkflow } from "@/lib/db";
import { runOutputNode, type RunEvent } from "@/lib/runner";
import type { BrainDriver } from "@/lib/brains/types";
import type { Graph } from "@/lib/graph";
import { ensureCategory, createLibraryItem } from "@/lib/library";

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

  it("gathers material from library nodes (single item and category mode)", async () => {
    const db = openDb(":memory:");
    const wf = createWorkflow(db, "t2");
    const cat = ensureCategory(db, "Bio");
    const item = createLibraryItem(db, { title: "Notes", kind: "file", content_md: "LIBRARY MATERIAL osmosis", categoryId: cat.id });
    createLibraryItem(db, { title: "More", kind: "result", content_md: "SECOND ITEM", categoryId: cat.id });

    const mk = (data: Record<string, unknown>): Graph => ({
      nodes: [
        { id: "L1", type: "library", data },
        { id: "b1", type: "brain", data: { provider: "ollama", model: "m" } },
        { id: "o1", type: "output", data: { method: "summary" } },
      ],
      edges: [{ source: "L1", target: "b1" }, { source: "b1", target: "o1" }],
    });
    const capture: string[] = [];
    const driver: BrainDriver = {
      ...mockDriver,
      async *stream(opts) { capture.push(opts.messages[0].content); yield "ok"; },
    };

    for await (const _ of runOutputNode(db, wf.id, mk({ libraryItemId: item.id }), "o1", { driver })) { /* drain */ }
    expect(capture[0]).toContain("LIBRARY MATERIAL");

    for await (const _ of runOutputNode(db, wf.id, mk({ categoryId: cat.id }), "o1", { driver })) { /* drain */ }
    expect(capture[1]).toContain("LIBRARY MATERIAL");
    expect(capture[1]).toContain("SECOND ITEM");
  });

  it("errors cleanly when library item is gone", async () => {
    const db = openDb(":memory:");
    const wf = createWorkflow(db, "t3");
    const g: Graph = {
      nodes: [
        { id: "L1", type: "library", data: { libraryItemId: 999 } },
        { id: "b1", type: "brain", data: { provider: "ollama", model: "m" } },
        { id: "o1", type: "output", data: { method: "summary" } },
      ],
      edges: [{ source: "L1", target: "b1" }, { source: "b1", target: "o1" }],
    };
    const events: RunEvent[] = [];
    for await (const ev of runOutputNode(db, wf.id, g, "o1", { driver: mockDriver })) events.push(ev);
    expect(events.some(e => e.type === "error" && /library/i.test(e.message))).toBe(true);
  });
});
