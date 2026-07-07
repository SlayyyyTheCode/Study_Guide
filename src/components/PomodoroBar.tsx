"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store";

const BREAK_MIN = 5, LONG_BREAK_MIN = 15;

export default function PomodoroBar() {
  const { plan, setPlan, workflowId } = useApp();
  const [blockIdx, setBlockIdx] = useState(0);
  const [phase, setPhase] = useState<"idle" | "focus" | "break">("idle");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState<{ todayMin: number; weekMin: number } | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakTotalSeconds = useRef(BREAK_MIN * 60);

  useEffect(() => {
    if (!workflowId) return;
    fetch(`/api/pomodoro?workflowId=${workflowId}`).then(r => r.json()).then(setStats);
  }, [workflowId, phase]);

  function notify(msg: string) {
    try {
      if (Notification.permission === "granted") new Notification("🍅 Study Guide", { body: msg });
      else if (Notification.permission !== "denied") Notification.requestPermission();
    } catch { /* notifications unavailable */ }
    try {
      const ctx = new AudioContext(); const o = ctx.createOscillator(); o.connect(ctx.destination);
      o.frequency.value = 660; o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 300);
    } catch { /* audio unavailable */ }
  }

  function startBlock(i: number) {
    if (!plan) return;
    setBlockIdx(i); setPhase("focus"); setSecondsLeft(plan[i].minutes * 60); setPaused(false);
  }

  useEffect(() => {
    if (phase === "idle" || paused) return;
    tick.current = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [phase, paused]);

  useEffect(() => {
    if (phase === "idle" || secondsLeft > 0) return;
    if (phase === "focus" && plan) {
      const b = plan[blockIdx];
      fetch("/api/pomodoro", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowId, label: b.topic, plannedMin: b.minutes }),
      });
      const isLong = (blockIdx + 1) % 4 === 0;
      const breakMin = isLong ? LONG_BREAK_MIN : BREAK_MIN;
      notify(`Block ${b.n} done! ${isLong ? "Long break" : "Break"} time.`);
      breakTotalSeconds.current = breakMin * 60;
      setPhase("break"); setSecondsLeft(breakMin * 60);
    } else if (phase === "break" && plan) {
      if (blockIdx + 1 < plan.length) { notify(`Break over — next: ${plan[blockIdx + 1].topic}`); startBlock(blockIdx + 1); }
      else { notify("Session complete! 🎉"); setPhase("idle"); setPlan(null); }
    }
  }, [secondsLeft, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan) return null;
  const b = plan[blockIdx];
  const mm = String(Math.max(0, Math.floor(secondsLeft / 60))).padStart(2, "0");
  const ss = String(Math.max(0, secondsLeft % 60)).padStart(2, "0");
  const total = phase === "focus" ? b.minutes * 60 : phase === "break" ? breakTotalSeconds.current : 1;
  const pct = phase === "idle" ? 0 : (1 - secondsLeft / total) * 100;

  return (
    <div className="pomo-bar">
      <span className="pomo-time">🍅 {phase === "idle" ? "--:--" : `${mm}:${ss}`}</span>
      <div className="pomo-mid">
        <div className="pomo-label">
          {phase === "idle" ? `Plan ready: ${plan.length} blocks — press Start` :
           phase === "break" ? "Break ☕" : `Block ${b.n}/${plan.length} — ${b.topic} (goal: ${b.goal})`}
        </div>
        <div className="pomo-track"><div className="pomo-fill" style={{ width: `${pct}%` }} /></div>
      </div>
      {phase === "idle"
        ? <button type="button" className="node-btn" onClick={() => startBlock(0)}>▶ Start session</button>
        : <>
            <button type="button" className="node-btn" onClick={() => setPaused(p => !p)} aria-label={paused ? "Resume timer" : "Pause timer"}>
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button type="button" className="node-btn" onClick={() => setSecondsLeft(0)} aria-label="Skip to next phase">⏭ Skip</button>
          </>}
      {stats && <span className="pomo-stats">today {stats.todayMin}m · week {stats.weekMin}m</span>}
      <button type="button" className="node-btn" onClick={() => { setPhase("idle"); setPlan(null); }} aria-label="End pomodoro session">✕</button>
    </div>
  );
}
