import { describe, it, expect } from "vitest";
import { buildMethodPrompt, METHODS, type MethodId } from "@/lib/prompts";

describe("prompts", () => {
  const material = "Osmosis is diffusion of water.";
  it("knows all five methods", () => {
    expect(Object.keys(METHODS).sort()).toEqual(["feynman", "pomodoro", "pq4r", "quiz", "summary"]);
  });
  it("embeds material and method structure", () => {
    for (const m of Object.keys(METHODS) as MethodId[]) {
      const p = buildMethodPrompt(m, material, {});
      expect(p.user).toContain("Osmosis");
      expect(p.system.length).toBeGreaterThan(50);
    }
  });
  it("quiz respects count and difficulty options", () => {
    const p = buildMethodPrompt("quiz", material, { count: 7, difficulty: "hard" });
    expect(p.user).toContain("7");
    expect(p.user).toContain("hard");
  });
  it("pomodoro respects block length", () => {
    const p = buildMethodPrompt("pomodoro", material, { blockMin: 30 });
    expect(p.user).toContain("30");
  });
});
