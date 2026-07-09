import { describe, it, expect } from "vitest";
import { cardsToTsv, sanitizeFilename } from "@/lib/anki";

describe("anki export", () => {
  it("formats cards as tab-separated lines", () => {
    expect(cardsToTsv([{ front: "Q1", back: "A1" }, { front: "Q2", back: "A2" }])).toBe("Q1\tA1\nQ2\tA2");
  });
  it("escapes internal tabs and newlines so they don't corrupt the TSV structure", () => {
    expect(cardsToTsv([{ front: "a\tb", back: "line1\nline2" }])).toBe("a b\tline1<br>line2");
  });
  it("sanitizes filenames to a safe, non-empty slug", () => {
    expect(sanitizeFilename("Cell Biology Ch. 3!")).toBe("cell-biology-ch-3");
    expect(sanitizeFilename("   ")).toBe("flashcards");
  });
});
