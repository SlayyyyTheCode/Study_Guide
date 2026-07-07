import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listLibraryItems, createLibraryItem, ensureCategory } from "@/lib/library";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const categoryIdRaw = url.searchParams.get("categoryId");
  const categoryId = categoryIdRaw !== null ? Number(categoryIdRaw) : undefined;
  if (categoryId !== undefined && !Number.isFinite(categoryId))
    return NextResponse.json({ error: "invalid categoryId" }, { status: 400 });
  return NextResponse.json(listLibraryItems(getDb(), { search, categoryId }));
}

export async function POST(req: Request) {
  const { title, kind, content_md, categoryId, newCategoryName, method, source_path } = await req.json();
  if (!title?.trim() || !kind || content_md === undefined)
    return NextResponse.json({ error: "title, kind, content_md required" }, { status: 400 });
  const db = getDb();
  const catId = newCategoryName?.trim() ? ensureCategory(db, newCategoryName.trim()).id : Number(categoryId);
  if (!catId) return NextResponse.json({ error: "categoryId or newCategoryName required" }, { status: 400 });
  return NextResponse.json(createLibraryItem(db, { title: title.trim(), kind, content_md, categoryId: catId, method, source_path }));
}
