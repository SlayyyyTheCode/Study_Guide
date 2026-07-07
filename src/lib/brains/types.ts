export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  /** base64-encoded images (no data: prefix) attached to a user message */
  images?: string[];
}

export interface StreamOpts {
  model: string;
  system: string;
  messages: ChatMsg[];
}

export interface BrainDriver {
  id: "claude" | "ollama";
  label: string;
  listModels(): Promise<string[]>;
  status(): Promise<{ ok: boolean; hint?: string }>;
  stream(opts: StreamOpts): AsyncGenerator<string>;
}
