"use client";
import { useRef } from "react";
import { AppProvider } from "@/store";
import TopBar from "@/components/TopBar";
import Palette from "@/components/Palette";
import Canvas from "@/components/Canvas";
import ChatPanel from "@/components/ChatPanel";
import ResultPanel from "@/components/ResultPanel";
import PomodoroBar from "@/components/PomodoroBar";
import LibraryDrawer from "@/components/LibraryDrawer";

export default function Home() {
  const runAllRef = useRef<(() => void) | null>(null);

  return (
    <AppProvider>
      <div className="shell">
        <TopBar onRunAll={() => runAllRef.current?.()} />
        <PomodoroBar />
        <div className="main">
          <Palette />
          <Canvas runAllRef={runAllRef} />
          <ChatPanel />
        </div>
        <ResultPanel />
        <LibraryDrawer />
      </div>
    </AppProvider>
  );
}
