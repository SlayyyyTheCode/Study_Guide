import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { exec } from "child_process";
import type { BrainDriver, StreamOpts } from "./types";

const MODELS = ["sonnet", "opus", "haiku"];
const HINT = "Claude Code CLI not found. Install it and run `claude` once to log in with your subscription.";
const STATUS_TTL_MS = 20_000;
let statusCache: { at: number; result: { ok: boolean; hint?: string } } | null = null;

function buildPrompt(opts: StreamOpts): string | AsyncIterable<SDKUserMessage> {
  const last = opts.messages[opts.messages.length - 1];
  const history = opts.messages.slice(0, -1)
    .map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  const text = history ? `CONVERSATION SO FAR:\n${history}\n\nUSER: ${last.content}` : last.content;
  if (!last.images?.length) return text;
  async function* gen(): AsyncIterable<SDKUserMessage> {
    yield {
      type: "user",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          ...last.images!.map(b64 => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/png" as const, data: b64 },
          })),
          { type: "text" as const, text },
        ],
      },
    };
  }
  return gen();
}

export const claudeDriver: BrainDriver = {
  id: "claude",
  label: "Claude (subscription)",

  async listModels() { return MODELS; },

  status() {
    // Spawning `claude --version` is a slow child-process launch (hundreds of
    // ms on Windows). The status endpoint is polled every 30s by the UI, so
    // cache the result briefly to avoid a spawn on every poll.
    const now = Date.now();
    if (statusCache && now - statusCache.at < STATUS_TTL_MS) return Promise.resolve(statusCache.result);
    return new Promise(resolve => {
      exec("claude --version", { timeout: 5000 }, err => {
        const result = err ? { ok: false, hint: HINT } : { ok: true };
        statusCache = { at: Date.now(), result };
        resolve(result);
      });
    });
  },

  async *stream(opts: StreamOpts) {
    const q = query({
      prompt: buildPrompt(opts),
      options: {
        model: opts.model,
        systemPrompt: opts.system,
        // Pure text-in/text-out completion: `tools: []` disables ALL built-in
        // tools (allowedTools only controls auto-approval, not availability).
        // With no tools there is nothing to permission, so no permissionMode
        // override is needed.
        tools: [],
        maxTurns: 1,
        // Fully isolate from the user's local Claude Code config so no
        // filesystem settings or MCP servers leak into this completion call.
        settingSources: [],
        mcpServers: {},
      },
    });
    for await (const message of q) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") yield block.text;
        }
      }
      if (message.type === "result" && message.subtype !== "success") {
        throw new Error(`Claude run failed: ${message.subtype}`);
      }
    }
  },
};
