import { describe, it, expect, vi, afterEach } from "vitest";
import { ollamaDriver } from "@/lib/brains/ollama";

afterEach(() => vi.unstubAllGlobals());

function ndjsonResponse(lines: object[]): Response {
  const body = lines.map(l => JSON.stringify(l)).join("\n") + "\n";
  return new Response(body, { status: 200 });
}

describe("ollama driver", () => {
  it("lists models from /api/tags", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ models: [{ name: "llama3.2" }, { name: "qwen2.5" }] }))));
    expect(await ollamaDriver.listModels()).toEqual(["llama3.2", "qwen2.5"]);
  });
  it("status not-ok with hint when unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const s = await ollamaDriver.status();
    expect(s.ok).toBe(false);
    expect(s.hint).toMatch(/ollama/i);
  });
  it("streams chat content chunks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjsonResponse([
      { message: { content: "Hel" } }, { message: { content: "lo" } }, { done: true },
    ])));
    const chunks: string[] = [];
    for await (const c of ollamaDriver.stream({ model: "llama3.2", system: "s", messages: [{ role: "user", content: "hi" }] }))
      chunks.push(c);
    expect(chunks.join("")).toBe("Hello");
  });
});
