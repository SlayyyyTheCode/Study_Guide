import { describe, it, expect } from "vitest";
import { parseJsonBlock, parseCards, parseMindmap, parseQuizResults } from "@/lib/parse";

const wrap = (j: string) => "intro text\n```json\n" + j + "\n```\ntrailing";

describe("parse", () => {
  it("parseJsonBlock extracts the LAST fenced json block", () => {
    const md = wrap('{"a":1}') + "\n" + wrap('{"a":2}');
    expect(parseJsonBlock<{ a: number }>(md)?.a).toBe(2);
  });
  it("parseJsonBlock returns null on malformed json or no block", () => {
    expect(parseJsonBlock("no block here")).toBeNull();
    expect(parseJsonBlock(wrap("{oops"))).toBeNull();
  });
  it("parseCards validates shape", () => {
    expect(parseCards(wrap('{"cards":[{"front":"F","back":"B"}]}'))).toEqual([{ front: "F", back: "B" }]);
    expect(parseCards(wrap('{"cards":"nope"}'))).toBeNull();
    expect(parseCards(wrap('{"cards":[{"front":"F"}]}'))).toBeNull();
  });
  it("parseMindmap validates recursive tree", () => {
    const t = parseMindmap(wrap('{"root":"Bio","children":[{"label":"Cells","children":[{"label":"Organelles"}]}]}'));
    expect(t?.root).toBe("Bio");
    expect(t?.children[0].children?.[0].label).toBe("Organelles");
    expect(parseMindmap(wrap('{"children":[]}'))).toBeNull();
  });
  it("parseQuizResults validates shape", () => {
    expect(parseQuizResults(wrap('{"results":[{"id":1,"correct":true},{"id":2,"correct":false}]}')))
      .toEqual([{ id: 1, correct: true }, { id: 2, correct: false }]);
    expect(parseQuizResults(wrap('{"results":"nope"}'))).toBeNull();
    expect(parseQuizResults(wrap('{"results":[{"id":1}]}'))).toBeNull();
  });
});
