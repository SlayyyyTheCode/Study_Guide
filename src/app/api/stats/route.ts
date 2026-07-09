import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStats } from "@/lib/stats";

export async function GET() {
  return NextResponse.json(getStats(getDb()));
}
