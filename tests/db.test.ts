import { describe, it, expect } from "vitest";
import { openDb, createWorkflow, listWorkflows, saveCanvas, getWorkflow } from "@/lib/db";

describe("db", () => {
  it("creates schema and round-trips a workflow", () => {
    const db = openDb(":memory:");
    const wf = createWorkflow(db, "Biology Ch.3");
    expect(wf.id).toBeGreaterThan(0);
    expect(listWorkflows(db).map(w => w.name)).toContain("Biology Ch.3");
    saveCanvas(db, wf.id, JSON.stringify({ nodes: [], edges: [] }));
    expect(JSON.parse(getWorkflow(db, wf.id)!.react_flow_json)).toEqual({ nodes: [], edges: [] });
  });
});
