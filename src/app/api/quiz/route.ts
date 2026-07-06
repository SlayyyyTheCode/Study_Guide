import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  const { runId, attempts } = await req.json() as
    { runId: number; attempts: { question: string; user_answer: string; correct: boolean | null; feedback: string }[] };
  const db = getDb();
  const ins = db.prepare("INSERT INTO quiz_attempts (run_id, question, user_answer, correct, feedback) VALUES (?,?,?,?,?)");
  for (const a of attempts)
    ins.run(runId, a.question, a.user_answer, a.correct === null ? null : a.correct ? 1 : 0, a.feedback);
  return NextResponse.json({ ok: true });
}
