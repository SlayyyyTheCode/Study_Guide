import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(Number(id));
  return run ? NextResponse.json(run) : NextResponse.json({ error: "not found" }, { status: 404 });
}
