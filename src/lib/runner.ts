import fs from "fs/promises";
import type { DB } from "./db";
import type { Graph } from "./graph";
import { resolveOutput } from "./graph";
import { buildMethodPrompt, type MethodId, type MethodOptions } from "./prompts";
import { getDriver } from "./brains";
import type { BrainDriver, ChatMsg } from "./brains/types";

export type RunEvent =
  | { type: "start"; runId: number }
  | { type: "chunk"; text: string }
  | { type: "done"; runId: number }
  | { type: "error"; message: string };

interface FileRow { node_id: string; filename: string; path: string; extracted_text: string | null; status: string; }

/** Gather extracted text + image base64s for the given input node ids. */
export async function gatherMaterial(db: DB, workflowId: number, inputNodeIds: string[]) {
  const rows = db.prepare(
    `SELECT node_id, filename, path, extracted_text, status FROM files
     WHERE workflow_id = ? AND node_id IN (${inputNodeIds.map(() => "?").join(",")})`
  ).all(workflowId, ...inputNodeIds) as FileRow[];
  const texts: string[] = [];
  const images: string[] = [];
  for (const r of rows) {
    if (r.status === "image" || r.status === "needs_vision") {
      try { images.push((await fs.readFile(r.path)).toString("base64")); } catch { /* file moved */ }
    } else if (r.extracted_text) {
      texts.push(`--- ${r.filename} ---\n${r.extracted_text}`);
    }
  }
  return { material: texts.join("\n\n"), images };
}

export async function* runOutputNode(
  db: DB, workflowId: number, graph: Graph, outputId: string,
  opts?: { driver?: BrainDriver; methodOptions?: MethodOptions }
): AsyncGenerator<RunEvent> {
  const res = resolveOutput(graph, outputId);
  if (!res.ok) { yield { type: "error", message: res.error }; return; }

  const method = (graph.nodes.find(n => n.id === outputId)!.data.method ?? "summary") as MethodId;
  const provider = String(res.brain.data.provider ?? "claude");
  const model = String(res.brain.data.model ?? "sonnet");
  const driver = opts?.driver ?? getDriver(provider);

  const { material, images } = await gatherMaterial(db, workflowId, res.inputs.map(n => n.id));
  if (!material && images.length === 0) { yield { type: "error", message: "Connected inputs have no readable content yet." }; return; }

  const prompt = buildMethodPrompt(method, material || "(material provided as attached images)", opts?.methodOptions ?? {});
  const messages: ChatMsg[] = [{ role: "user", content: prompt.user, ...(images.length ? { images } : {}) }];

  const info = db.prepare(
    "INSERT INTO runs (workflow_id, node_id, method, brain, model, thread_json) VALUES (?,?,?,?,?,?)"
  ).run(workflowId, outputId, method, driver.id, model, JSON.stringify([{ role: "user", content: prompt.user }]));
  const runId = Number(info.lastInsertRowid);
  yield { type: "start", runId };

  let acc = "";
  try {
    for await (const chunk of driver.stream({ model, system: prompt.system, messages })) {
      acc += chunk;
      yield { type: "chunk", text: chunk };
    }
    const thread = [{ role: "user", content: prompt.user }, { role: "assistant", content: acc }];
    db.prepare("UPDATE runs SET status='done', result_md=?, thread_json=? WHERE id=?")
      .run(acc, JSON.stringify(thread), runId);
    yield { type: "done", runId };
  } catch (e) {
    db.prepare("UPDATE runs SET status='error', result_md=? WHERE id=?").run(acc, runId);
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
