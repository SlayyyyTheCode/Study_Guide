export interface Sm2State { easeFactor: number; intervalDays: number; repetitions: number; }

/**
 * Binary-input SM-2. The UI only has Got it / Missed, not SM-2's native 0-5
 * quality scale, so `missed=false` maps to quality 5 (perfect) and
 * `missed=true` maps to quality 2 (fail) — the standard simplification for
 * binary-recall apps. Scheduling is expressed as a day-count interval; the
 * caller turns that into an actual date via SQL (`datetime('now', '+N days')`)
 * rather than computing dates here, so this function stays pure and
 * timezone/format-agnostic.
 */
export function applySm2(state: Partial<Sm2State> | undefined | null, missed: boolean): Sm2State {
  const easeFactor = state?.easeFactor ?? 2.5;
  const prevInterval = state?.intervalDays ?? 0;
  const prevRepetitions = state?.repetitions ?? 0;

  if (missed) {
    return { easeFactor, intervalDays: 1, repetitions: 0 };
  }
  const repetitions = prevRepetitions + 1;
  const intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(prevInterval * easeFactor);
  return { easeFactor: Math.max(1.3, easeFactor + 0.1), intervalDays, repetitions };
}
