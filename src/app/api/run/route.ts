import { getDb, getWorkflow } from "@/lib/db";
import { runOutputNode } from "@/lib/runner";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { workflowId, nodeId, methodOptions } = await req.json();
  const db = getDb();
  const wf = getWorkflow(db, workflowId);
  if (!wf) return new Response("workflow not found", { status: 404 });
  const graph = JSON.parse(wf.react_flow_json);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const ev of runOutputNode(db, workflowId, graph, nodeId, { methodOptions })) send(ev);
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
      send({ done: true });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}
