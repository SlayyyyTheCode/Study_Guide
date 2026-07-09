import { describe, it, expect } from "vitest";
import { buildMethodPrompt, METHODS, type MethodId } from "@/lib/prompts";

describe("prompts", () => {
  const material = "Osmosis is diffusion of water.";
  it("knows all nine methods", () => {
    expect(Object.keys(METHODS).sort()).toEqual([
      "cornell", "feynman", "flashcards", "mindmap", "pomodoro", "pq4r", "quiz", "summary", "tutorial",
    ]);
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
  it("flashcards respects count and focus", () => {
    const p = buildMethodPrompt("flashcards", material, { count: 20, focus: "definitions" });
    expect(p.user).toContain("20");
    expect(p.user).toContain("definitions");
  });
  it("mindmap prompt demands json tree", () => {
    const p = buildMethodPrompt("mindmap", material, {});
    expect(p.system).toContain('"root"');
  });
  it("cornell prompt asks for a cue column", () => {
    const p = buildMethodPrompt("cornell", material, {});
    expect(p.system).toMatch(/cue/i);
  });
  it("tutorial prompt is Socratic (question-first, not didactic)", () => {
    const p = buildMethodPrompt("tutorial", material, {});
    expect(p.system).toMatch(/one pointed .why. or .how. question/i);
  });
  it("quiz system instructs interleaving across multiple sources", () => {
    const p = buildMethodPrompt("quiz", material, {});
    expect(p.system).toMatch(/interleave/i);
  });
  it("quiz system requests a parseable per-question results block after grading", () => {
    const p = buildMethodPrompt("quiz", material, {});
    expect(p.system).toMatch(/"results"/);
  });
});
