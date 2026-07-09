import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getWeakSpots } from "@/lib/weakspots";

export async function GET() {
  return NextResponse.json(getWeakSpots(getDb()));
}
