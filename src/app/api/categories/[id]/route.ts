import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { renameCategory, deleteCategory } from "@/lib/library";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  renameCategory(getDb(), id, name.trim());
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  deleteCategory(getDb(), id);
  return NextResponse.json({ ok: true });
}
