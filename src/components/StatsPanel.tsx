"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useApp } from "@/store";

interface DailyMinutes { date: string; minutes: number; }
interface QuizScorePoint { runId: number; date: string; correct: number; total: number; }
interface WeakestFlashcardCategory { name: string; missRate: number; reviewed: number; }
interface WeakestQuizTopic { name: string; missRate: number; attempted: number; }
interface Stats {
  streakDays: number; studyMinutesToday: number; studyMinutesWeek: number; studyMinutesAllTime: number;
  dailyMinutes: DailyMinutes[]; quizScoreTrend: QuizScorePoint[];
  flashcardMastery: { mastered: number; total: number };
  weakestFlashcardCategories: WeakestFlashcardCategory[]; weakestQuizTopics: WeakestQuizTopic[];
}

export default function StatsPanel() {
  const { statsOpen, setStatsOpen } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0); // stale-response guard

  const load = useCallback(() => {
    const seq = ++seqRef.current;
    setLoading(true); setError("");
    fetch("/api/stats")
      .then(r => { if (!r.ok) throw new Error(`Could not load stats (${r.status})`); return r.json(); })
      .then(d => { if (seq !== seqRef.current) return; setStats(d); })
      .catch(e => {
        if (seq !== seqRef.current) return;
        setError(e instanceof Error ? e.message : "Could not load stats");
        setStats(null);
      })
      .finally(() => { if (seq === seqRef.current) setLoading(false); });
  }, []);

  useEffect(() => { if (statsOpen) load(); }, [statsOpen, load]);

  useEffect(() => {
    if (!statsOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setStatsOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [statsOpen, setStatsOpen]);

  if (!statsOpen) return null;

  return (
    <aside className="lib-drawer" role="dialog" aria-label="Stats">
      <div className="lib-head">
        <strong>📊 Stats</strong>
        <button type="button" className="node-btn" onClick={load} disabled={loading} aria-label="Refresh stats">⟳</button>
        <button type="button" className="node-btn" onClick={() => setStatsOpen(false)} aria-label="Close stats">✕</button>
      </div>
      <div className="lib-body">
        {loading && <p className="node-sub" role="status">Loading…</p>}
        {error && <p className="lib-error" role="alert">{error}</p>}
        {stats && (
          <>
            <div className="stats-section"><div className="stats-stat">🔥 {stats.streakDays}-day streak</div></div>
            <div className="stats-section">
              <h3>Study time</h3>
              <p>Today: {stats.studyMinutesToday}m · This week: {stats.studyMinutesWeek}m · All-time: {stats.studyMinutesAllTime}m</p>
            </div>
            <div className="stats-section">
              <h3>Quiz scores</h3>
              {stats.quizScoreTrend.length === 0
                ? <p className="node-sub">No quiz data yet</p>
                : stats.quizScoreTrend.map(q => (
                    <p key={q.runId}>{q.date}: {q.correct}/{q.total} ({Math.round((q.correct / q.total) * 100)}%)</p>
                  ))}
            </div>
            <div className="stats-section">
              <h3>Flashcard mastery</h3>
              {stats.flashcardMastery.total === 0
                ? <p className="node-sub">No flashcard data yet</p>
                : <p>{stats.flashcardMastery.mastered}/{stats.flashcardMastery.total} cards mastered ({Math.round((stats.flashcardMastery.mastered / stats.flashcardMastery.total) * 100)}%)</p>}
            </div>
            <div className="stats-section">
              <h3>Weakest flashcard categories</h3>
              {stats.weakestFlashcardCategories.length === 0
                ? <p className="node-sub">No data yet</p>
                : stats.weakestFlashcardCategories.map(c => <p key={c.name}>{c.name}: {Math.round(c.missRate * 100)}% missed</p>)}
            </div>
            <div className="stats-section">
              <h3>Weakest quiz topics</h3>
              {stats.weakestQuizTopics.length === 0
                ? <p className="node-sub">No data yet</p>
                : stats.weakestQuizTopics.map(t => <p key={t.name}>{t.name}: {Math.round(t.missRate * 100)}% missed</p>)}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
