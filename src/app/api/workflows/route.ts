import { NextResponse } from "next/server";
import { getDb, createWorkflow, listWorkflows } from "@/lib/db";

export async function GET() {
  return NextResponse.json(listWorkflows(getDb()));
}

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  return NextResponse.json(createWorkflow(getDb(), name.trim()));
}
