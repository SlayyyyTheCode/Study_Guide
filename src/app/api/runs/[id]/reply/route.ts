import { getDb } from "@/lib/db";
import { getDriver } from "@/lib/brains";
import type { ChatMsg } from "@/lib/brains/types";
import { buildMethodPrompt, type MethodId } from "@/lib/prompts";

export const dynamic = "force-dynamic";

interface RunRow { id: number; method: string; brain: string; model: string; thread_json: string; }

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { message } = await req.json();
  const db = getDb();
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(Number(id)) as RunRow | undefined;
  if (!run) return new Response("run not found", { status: 404 });

  const thread = JSON.parse(run.thread_json) as ChatMsg[];
  thread.push({ role: "user", content: message });
  const system = buildMethodPrompt(run.method as MethodId, "", {}).system;
  const driver = getDriver(run.brain);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let acc = "";
      try {
        for await (const chunk of driver.stream({ model: run.model, system, messages: thread })) {
          acc += chunk;
          send({ type: "chunk", text: chunk });
        }
        thread.push({ role: "assistant", content: acc });
        db.prepare("UPDATE runs SET thread_json = ? WHERE id = ?").run(JSON.stringify(thread), run.id);
        send({ type: "done", runId: run.id });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
      send({ done: true });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
