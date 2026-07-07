import { NextResponse } from "next/server";
import { DRIVERS } from "@/lib/brains";

export async function GET() {
  const out: Record<string, { ok: boolean; hint?: string; models: string[] }> = {};
  await Promise.all(Object.values(DRIVERS).map(async d => {
    const status = await d.status();
    let models: string[] = [];
    if (status.ok) { try { models = await d.listModels(); } catch { /* leave empty */ } }
    out[d.id] = { ...status, models };
  }));
  return NextResponse.json(out);
}
