import type { DB } from "./db";

export interface DailyMinutes { date: string; minutes: number; }
export interface QuizScorePoint { runId: number; date: string; correct: number; total: number; }
export interface WeakestFlashcardCategory { name: string; missRate: number; reviewed: number; }
export interface WeakestQuizTopic { name: string; missRate: number; attempted: number; }
export interface Stats {
  streakDays: number;
  studyMinutesToday: number;
  studyMinutesWeek: number;
  studyMinutesAllTime: number;
  dailyMinutes: DailyMinutes[];
  quizScoreTrend: QuizScorePoint[];
  flashcardMastery: { mastered: number; total: number };
  weakestFlashcardCategories: WeakestFlashcardCategory[];
  weakestQuizTopics: WeakestQuizTopic[];
}

/** Consecutive-day streak ending today, or yesterday if nothing happened yet today. */
export function computeStreak(dates: string[], today: Date = new Date()): number {
  const set = new Set(dates);
  let streak = 0;
  const cursor = new Date(today);
  if (!set.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!set.has(key)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function getStats(db: DB): Stats {
  const activityDates = (db.prepare(`
    SELECT date(created_at) AS d FROM runs
    UNION SELECT date(completed_at) FROM pomodoro_blocks
    UNION SELECT date(last_reviewed) FROM flashcard_reviews
  `).all() as { d: string }[]).map(r => r.d);
  const streakDays = computeStreak(activityDates);

  const dailyMinutes = db.prepare(`
    SELECT date(completed_at) AS date, SUM(planned_min) AS minutes
    FROM pomodoro_blocks GROUP BY date ORDER BY date DESC LIMIT 7
  `).all() as DailyMinutes[];
  const todayKey = new Date().toISOString().slice(0, 10);
  const studyMinutesToday = dailyMinutes[0]?.date === todayKey ? dailyMinutes[0].minutes : 0;
  const studyMinutesWeek = dailyMinutes.reduce((sum, d) => sum + d.minutes, 0);
  const { total: studyMinutesAllTime } = db.prepare(
    "SELECT COALESCE(SUM(planned_min), 0) AS total FROM pomodoro_blocks"
  ).get() as { total: number };

  const quizScoreTrend = db.prepare(`
    SELECT r.id AS runId, date(r.created_at) AS date,
           SUM(CASE WHEN qa.correct = 1 THEN 1 ELSE 0 END) AS correct, COUNT(*) AS total
    FROM quiz_attempts qa JOIN runs r ON r.id = qa.run_id
    WHERE qa.correct IS NOT NULL
    GROUP BY qa.run_id ORDER BY r.created_at DESC LIMIT 10
  `).all() as QuizScorePoint[];

  const mastery = db.prepare(`
    SELECT SUM(CASE WHEN repetitions >= 2 THEN 1 ELSE 0 END) AS mastered, COUNT(*) AS total
    FROM flashcard_reviews WHERE library_item_id IS NOT NULL
  `).get() as { mastered: number | null; total: number };

  const weakestFlashcardCategories = (db.prepare(`
    SELECT c.name AS name, SUM(fr.missed) AS misses, COUNT(*) AS reviewed
    FROM flashcard_reviews fr
    JOIN library_items li ON li.id = fr.library_item_id
    JOIN categories c ON c.id = li.category_id
    GROUP BY c.id HAVING reviewed > 0
    ORDER BY (CAST(misses AS REAL) / reviewed) DESC LIMIT 3
  `).all() as { name: string; misses: number; reviewed: number }[])
    .map(r => ({ name: r.name, missRate: r.misses / r.reviewed, reviewed: r.reviewed }));

  const weakestQuizTopics = (db.prepare(`
    SELECT w.name AS name, SUM(CASE WHEN qa.correct = 0 THEN 1 ELSE 0 END) AS misses, COUNT(*) AS attempted
    FROM quiz_attempts qa
    JOIN runs r ON r.id = qa.run_id
    JOIN workflows w ON w.id = r.workflow_id
    WHERE qa.correct IS NOT NULL
    GROUP BY r.workflow_id HAVING attempted > 0
    ORDER BY (CAST(misses AS REAL) / attempted) DESC LIMIT 3
  `).all() as { name: string; misses: number; attempted: number }[])
    .map(r => ({ name: r.name, missRate: r.misses / r.attempted, attempted: r.attempted }));

  return {
    streakDays, studyMinutesToday, studyMinutesWeek, studyMinutesAllTime, dailyMinutes,
    quizScoreTrend, flashcardMastery: { mastered: mastery.mastered ?? 0, total: mastery.total },
    weakestFlashcardCategories, weakestQuizTopics,
  };
}
