import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { exec } from "child_process";
import type { BrainDriver, StreamOpts } from "./types";

const MODELS = ["sonnet", "opus", "haiku"];
const HINT = "Claude Code CLI not available or not logged in. Install Claude Code and run `claude` once to log in with your subscription.";

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
    return new Promise(resolve => {
      exec("claude --version", { timeout: 5000 },
        err => resolve(err ? { ok: false, hint: HINT } : { ok: true }));
    });
  },

  async *stream(opts: StreamOpts) {
    const q = query({
      prompt: buildPrompt(opts),
      options: {
        model: opts.model,
        systemPrompt: opts.system,
        allowedTools: [],
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
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
