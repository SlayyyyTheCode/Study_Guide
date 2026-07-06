/**
 * Shared SSE (server-sent events) response helper for streaming API routes.
 *
 * Protocol: `data: {json}\n\n` lines, terminated by `data: {"done":true}`.
 *
 * Abort design: send() consults req.signal.aborted and throws a sentinel
 * SseAbortError once the client has gone away. That makes the caller's
 * `for await` loop terminate, which triggers generator .return() semantics —
 * driver generators' try/finally cleanup (e.g. the ollama reader.cancel)
 * runs. The sentinel is caught silently here.
 *
 * Enqueue safety: every enqueue is wrapped and a `closed` flag is set the
 * first time the controller rejects (client disconnected mid-write), so a
 * late send can never surface as an unhandled rejection.
 */

class SseAbortError extends Error {
  constructor() {
    super("client aborted SSE stream");
    this.name = "SseAbortError";
  }
}

export function sseResponse(
  req: Request,
  fn: (send: (obj: unknown) => void) => Promise<void>
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const enqueue = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true; // controller already closed/errored — drop silently
        }
      };
      const send = (obj: unknown) => {
        if (req.signal.aborted) throw new SseAbortError();
        enqueue(obj);
      };
      try {
        await fn(send);
        enqueue({ done: true });
      } catch (e) {
        if (!(e instanceof SseAbortError)) {
          enqueue({ type: "error", message: e instanceof Error ? e.message : String(e) });
          enqueue({ done: true });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
