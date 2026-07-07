import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLibraryItem, updateLibraryItem, deleteLibraryItem } from "@/lib/library";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = getLibraryItem(getDb(), Number(id));
  return item ? NextResponse.json(item) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { title, categoryId } = await req.json();
  updateLibraryItem(getDb(), Number(id), { title, categoryId });
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  deleteLibraryItem(getDb(), Number(id));
  return NextResponse.json({ ok: true });
}
