import { describe, it, expect } from "vitest";
import { fuzzy } from "@/lib/fuzzy";

describe("fuzzy", () => {
  it("matches subsequences case-insensitively", () => {
    expect(fuzzy("fla", "🃏 Flashcards")).toBe(true);
    expect(fuzzy("qb", "📝 Quiz Bank")).toBe(true);
    expect(fuzzy("xyz", "📝 Quiz Bank")).toBe(false);
    expect(fuzzy("", "anything")).toBe(true);
  });
});
