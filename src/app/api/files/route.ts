import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getDb, getWorkflow } from "@/lib/db";
import { extractFile, estimateTokens } from "@/lib/extract";
import { captureFileToLibrary } from "@/lib/library";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const workflowId = Number(form.get("workflowId"));
  const nodeId = String(form.get("nodeId") ?? "");
  if (!file || !workflowId || !nodeId)
    return NextResponse.json({ error: "file, workflowId, nodeId required" }, { status: 400 });

  const dir = path.join(process.cwd(), "uploads", String(workflowId));
  await fs.mkdir(dir, { recursive: true });
  const safeName = path.basename(file.name).replace(/[^\w.\- ]/g, "_");
  const dest = path.join(dir, `${Date.now()}-${safeName}`);
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));

  const db = getDb();
  let status = "ready", text: string | null = null, pages: number | undefined, warning: string | undefined;
  try {
    const r = await extractFile(dest);
    pages = r.pages;
    if (r.kind === "text") text = r.text;
    else if (r.kind === "image") status = "image";
    else { status = "needs_vision"; warning = "No text layer found — pages will be sent as images to a vision-capable brain."; }
  } catch (e) {
    status = "error";
    warning = e instanceof Error ? e.message : String(e);
  }
  // Insert + library capture run in one transaction so a capture failure can't leave half-state.
  const fileId = db.transaction(() => {
    const info = db.prepare(
      "INSERT INTO files (workflow_id, node_id, filename, path, mime, extracted_text, status) VALUES (?,?,?,?,?,?,?)"
    ).run(workflowId, nodeId, file.name, dest, file.type || "application/octet-stream", text, status);

    // Images/needs_vision files have no extracted text to snapshot into the library; they stay workflow-local.
    if (status === "ready" && text) {
      const wf = getWorkflow(db, workflowId);
      captureFileToLibrary(db, wf?.name, file.name, text, dest);
    }
    return Number(info.lastInsertRowid);
  })();

  return NextResponse.json({
    id: fileId, filename: file.name, status, pages, warning,
    tokens: text ? estimateTokens(text) : 0,
  });
}
