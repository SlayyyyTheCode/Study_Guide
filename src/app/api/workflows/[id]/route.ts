import { NextResponse } from "next/server";
import { getDb, getWorkflow, saveCanvas, deleteWorkflow } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const wf = getWorkflow(getDb(), Number(id));
  return wf ? NextResponse.json(wf) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { react_flow_json } = await req.json();
  saveCanvas(getDb(), Number(id), react_flow_json);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  deleteWorkflow(getDb(), Number(id));
  return NextResponse.json({ ok: true });
}
