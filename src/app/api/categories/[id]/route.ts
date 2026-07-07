import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { renameCategory, deleteCategory } from "@/lib/library";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  renameCategory(getDb(), Number(id), name.trim());
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  deleteCategory(getDb(), Number(id));
  return NextResponse.json({ ok: true });
}
