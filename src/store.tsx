"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

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
  runningOutputs: string[];
  setRunning: (nodeId: string, running: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  libraryPreviewId: number | null;              // library item open in ResultPanel
  setLibraryPreviewId: (id: number | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [workflowId, setWorkflowId] = useState<number | null>(null);
  const [openRunId, setOpenRunIdRaw] = useState<number | null>(null);
  const [openMethod, setOpenMethod] = useState<string | null>(null);
  const [plan, setPlan] = useState<PomodoroBlock[] | null>(null);
  const [brains, setBrains] = useState<BrainsStatus>({});
  const [runningOutputs, setRunningOutputs] = useState<string[]>([]);
  const setRunning = useCallback((nodeId: string, running: boolean) => {
    setRunningOutputs(prev => running ? (prev.includes(nodeId) ? prev : [...prev, nodeId]) : prev.filter(id => id !== nodeId));
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [libraryPreviewId, setLibraryPreviewIdRaw] = useState<number | null>(null);
  // Run result and library preview are mutually exclusive panel modes:
  // opening one closes the other (also guarantees a single Escape listener).
  const setOpenRunId = useCallback((id: number | null) => {
    setOpenRunIdRaw(id);
    if (id !== null) setLibraryPreviewIdRaw(null);
  }, []);
  const setLibraryPreviewId = useCallback((id: number | null) => {
    setLibraryPreviewIdRaw(id);
    if (id !== null) setOpenRunIdRaw(null);
  }, []);
  return (
    <Ctx.Provider value={{
      workflowId, setWorkflowId, openRunId, setOpenRunId, openMethod, setOpenMethod, plan, setPlan, brains, setBrains,
      runningOutputs, setRunning, drawerOpen, setDrawerOpen, libraryPreviewId, setLibraryPreviewId,
    }}>
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
