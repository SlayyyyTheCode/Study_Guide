import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  const workflowId = Number(new URL(req.url).searchParams.get("workflowId"));
  const db = getDb();
  const today = db.prepare(
    "SELECT COALESCE(SUM(planned_min),0) m FROM pomodoro_blocks WHERE workflow_id=? AND date(completed_at)=date('now')"
  ).get(workflowId) as { m: number };
  const week = db.prepare(
    "SELECT COALESCE(SUM(planned_min),0) m FROM pomodoro_blocks WHERE workflow_id=? AND completed_at >= datetime('now','-7 days')"
  ).get(workflowId) as { m: number };
  return NextResponse.json({ todayMin: today.m, weekMin: week.m });
}

export async function POST(req: Request) {
  const { workflowId, label, plannedMin } = await req.json();
  getDb().prepare("INSERT INTO pomodoro_blocks (workflow_id, label, planned_min) VALUES (?,?,?)")
    .run(workflowId, label, plannedMin);
  return NextResponse.json({ ok: true });
}
