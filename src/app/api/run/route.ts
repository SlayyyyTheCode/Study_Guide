import { getDb, getWorkflow } from "@/lib/db";
import { runOutputNode } from "@/lib/runner";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { workflowId, nodeId, methodOptions } = await req.json();
  const db = getDb();
  const wf = getWorkflow(db, workflowId);
  if (!wf) return new Response("workflow not found", { status: 404 });
  const graph = JSON.parse(wf.react_flow_json);

  return sseResponse(req, async send => {
    for await (const ev of runOutputNode(db, workflowId, graph, nodeId, { methodOptions })) send(ev);
  });
}
