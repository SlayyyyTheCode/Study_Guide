"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

export interface PomodoroBlock { n: number; minutes: number; topic: string; goal: string; }
export interface BrainsStatus { [id: string]: { ok: boolean; hint?: string; models: string[] }; }

interface AppState {
  workflowId: number | null;
  setWorkflowId: (id: number | null) => void;
  openRunId: number | null;
  setOpenRunId: (id: number | null) => void;
  openMethod: string | null;
  setOpenMethod: (m: string | null) => void;
  plan: PomodoroBlock[] | null;
  setPlan: (p: PomodoroBlock[] | null) => void;
  brains: BrainsStatus;
  setBrains: (b: BrainsStatus) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [workflowId, setWorkflowId] = useState<number | null>(null);
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  const [openMethod, setOpenMethod] = useState<string | null>(null);
  const [plan, setPlan] = useState<PomodoroBlock[] | null>(null);
  const [brains, setBrains] = useState<BrainsStatus>({});
  return (
    <Ctx.Provider value={{ workflowId, setWorkflowId, openRunId, setOpenRunId, openMethod, setOpenMethod, plan, setPlan, brains, setBrains }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

/** Consume an SSE POST response, invoking onEvent per data line. */
export async function readSse(res: Response, onEvent: (obj: any) => void) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);
      if (line.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch {
          console.warn("readSse: skipping malformed SSE line", line);
        }
      }
    }
  }
}
