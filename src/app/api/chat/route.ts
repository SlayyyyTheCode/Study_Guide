import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDriver } from "@/lib/brains";
import type { ChatMsg } from "@/lib/brains/types";
import { CHAT_SYSTEM, buildChatContext } from "@/lib/prompts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const workflowId = Number(new URL(req.url).searchParams.get("workflowId"));
  const rows = getDb().prepare(
    "SELECT role, content FROM chat_messages WHERE workflow_id = ? ORDER BY id"
  ).all(workflowId);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { workflowId, message, provider = "claude", model = "sonnet" } = await req.json();
  const db = getDb();

  const material = (db.prepare(
    "SELECT filename, extracted_text FROM files WHERE workflow_id = ? AND extracted_text IS NOT NULL"
  ).all(workflowId) as { filename: string; extracted_text: string }[])
    .map(f => `--- ${f.filename} ---\n${f.extracted_text}`).join("\n\n").slice(0, 60_000);
  const recent = (db.prepare(
    "SELECT method, result_md FROM runs WHERE workflow_id = ? AND status='done' ORDER BY id DESC LIMIT 3"
  ).all(workflowId) as { method: string; result_md: string }[])
    .map(r => `[${r.method}]\n${r.result_md}`).join("\n\n").slice(0, 20_000);

  const history = (db.prepare(
    "SELECT role, content FROM chat_messages WHERE workflow_id = ? ORDER BY id DESC LIMIT 20"
  ).all(workflowId) as ChatMsg[]).reverse();

  db.prepare("INSERT INTO chat_messages (workflow_id, role, content) VALUES (?,?,?)").run(workflowId, "user", message);

  const system = `${CHAT_SYSTEM}\n\n${buildChatContext(material, recent)}`;
  const messages: ChatMsg[] = [...history, { role: "user", content: message }];
  const driver = getDriver(provider);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let acc = "";
      try {
        for await (const chunk of driver.stream({ model, system, messages })) {
          acc += chunk;
          send({ type: "chunk", text: chunk });
        }
        db.prepare("INSERT INTO chat_messages (workflow_id, role, content) VALUES (?,?,?)").run(workflowId, "assistant", acc);
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
      send({ done: true });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}
