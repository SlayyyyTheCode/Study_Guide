import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listCategories, ensureCategory } from "@/lib/library";

export async function GET() { return NextResponse.json(listCategories(getDb())); }
export async function POST(req: Request) {
  const { name, icon } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  return NextResponse.json(ensureCategory(getDb(), name.trim(), icon));
}
