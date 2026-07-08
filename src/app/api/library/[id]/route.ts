import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLibraryItem, updateLibraryItem, deleteLibraryItem } from "@/lib/library";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const item = getLibraryItem(getDb(), id);
  return item ? NextResponse.json(item) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function PATCH(req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const { title, categoryId } = await req.json();
  if (categoryId !== undefined && !Number.isFinite(Number(categoryId)))
    return NextResponse.json({ error: "invalid categoryId" }, { status: 400 });
  updateLibraryItem(getDb(), id, { title, categoryId });
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  deleteLibraryItem(getDb(), id);
  return NextResponse.json({ ok: true });
}
