import { describe, it, expect } from "vitest";
import { applySm2 } from "@/lib/spacedRepetition";

describe("applySm2", () => {
  it("first success schedules a 1-day interval and bumps ease by 0.1", () => {
    expect(applySm2(undefined, false)).toEqual({ easeFactor: 2.6, intervalDays: 1, repetitions: 1 });
  });
  it("second consecutive success schedules a 6-day interval", () => {
    const r = applySm2({ easeFactor: 2.6, intervalDays: 1, repetitions: 1 }, false);
    expect(r).toEqual({ easeFactor: 2.7, intervalDays: 6, repetitions: 2 });
  });
  it("third+ success rounds prevInterval times easeFactor", () => {
    const r = applySm2({ easeFactor: 2.7, intervalDays: 6, repetitions: 2 }, false);
    expect(r.repetitions).toBe(3);
    expect(r.intervalDays).toBe(Math.round(6 * 2.7));
    expect(r.easeFactor).toBeCloseTo(2.8);
  });
  it("a miss resets repetitions and interval to 1 day, ease unchanged", () => {
    const r = applySm2({ easeFactor: 2.8, intervalDays: 16, repetitions: 3 }, true);
    expect(r).toEqual({ easeFactor: 2.8, intervalDays: 1, repetitions: 0 });
  });
  it("ease factor never drops below the 1.3 floor", () => {
    const r = applySm2({ easeFactor: 1.3, intervalDays: 1, repetitions: 1 }, false);
    expect(r.easeFactor).toBeGreaterThanOrEqual(1.3);
  });
  it("defaults missing state to ease 2.5 / interval 0 / repetitions 0", () => {
    expect(applySm2(null, false)).toEqual({ easeFactor: 2.6, intervalDays: 1, repetitions: 1 });
    expect(applySm2({}, true)).toEqual({ easeFactor: 2.5, intervalDays: 1, repetitions: 0 });
  });
});
