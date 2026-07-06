import type { BrainDriver, StreamOpts } from "./types";

const BASE = process.env.OLLAMA_URL ?? "http://localhost:11434";
const HINT = "Ollama unreachable. Start it (run `ollama serve` or launch the Ollama app) and try again.";

export const ollamaDriver: BrainDriver = {
  id: "ollama",
  label: "Ollama (local)",

  async listModels() {
    const res = await fetch(`${BASE}/api/tags`);
    const data = (await res.json()) as { models: { name: string }[] };
    return data.models.map(m => m.name);
  },

  async status() {
    try {
      const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok ? { ok: true } : { ok: false, hint: HINT };
    } catch {
      return { ok: false, hint: HINT };
    }
  },

  async *stream(opts: StreamOpts) {
    const messages = [
      { role: "system", content: opts.system },
      ...opts.messages.map(m => ({ role: m.role, content: m.content, ...(m.images?.length ? { images: m.images } : {}) })),
    ];
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: opts.model, messages, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const obj = JSON.parse(line);
        const chunk = obj?.message?.content;
        if (chunk) yield chunk as string;
      }
    }
  },
};
