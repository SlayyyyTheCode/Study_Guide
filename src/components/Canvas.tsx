"use client";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type IsValidConnection,
} from "@xyflow/react";
import { useApp } from "@/store";
import { isValidEdge, type Graph } from "@/lib/graph";
import InputNode from "@/components/nodes/InputNode";
import BrainNode from "@/components/nodes/BrainNode";
import OutputNode from "@/components/nodes/OutputNode";

const nodeTypes = { input: InputNode, brain: BrainNode, output: OutputNode };

export interface CanvasHandle {
  runAll: () => void;
}

interface Props {
  runAllRef: React.MutableRefObject<(() => void) | null>;
}

function CanvasInner({ runAllRef }: Props) {
  const { workflowId } = useApp();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { screenToFlowPosition } = useReactFlow();
  const loadedFor = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Load canvas whenever the active workflow changes.
  useEffect(() => {
    if (workflowId == null || loadedFor.current === workflowId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/workflows/${workflowId}`);
      if (!res.ok) return;
      const wf = await res.json();
      if (cancelled) return;
      loadedFor.current = workflowId;
      try {
        const parsed = JSON.parse(wf.react_flow_json);
        setNodes(parsed.nodes ?? []);
        setEdges(parsed.edges ?? []);
      } catch {
        setNodes([]);
        setEdges([]);
      }
    })();
    return () => { cancelled = true; };
  }, [workflowId, setNodes, setEdges]);

  // Debounced autosave. Each schedule snapshots {id, body} so a later flush
  // can never write the new workflow's state to the old workflow's id.
  const pendingSave = useRef<{ id: number; body: string } | null>(null);

  const putCanvas = useCallback((id: number, body: string) => {
    fetch(`/api/workflows/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true, // flush must survive tab close / page unload
    }).catch(() => { /* transient network error; next change retries */ });
  }, []);

  useEffect(() => {
    if (workflowId == null || loadedFor.current !== workflowId) return;
    const snapshot = {
      id: workflowId,
      body: JSON.stringify({ react_flow_json: JSON.stringify({ nodes, edges }) }),
    };
    pendingSave.current = snapshot;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      pendingSave.current = null;
      putCanvas(snapshot.id, snapshot.body);
    }, 600);
  }, [nodes, edges, workflowId, putCanvas]);

  // Flush a still-pending save when the workflow switches (or on unmount) so
  // edits made inside the debounce window are not silently dropped. Uses the
  // snapshot only, so it always targets the workflow the edits belong to.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const p = pendingSave.current;
      pendingSave.current = null;
      if (p) putCanvas(p.id, p.body); // fire-and-forget flush
    };
  }, [workflowId, putCanvas]);

  const buildGraph = useCallback((): Graph => ({
    nodes: nodes.map(n => ({ id: n.id, type: n.type ?? "", data: n.data as Record<string, unknown> })),
    edges: edges.map(e => ({ source: e.source, target: e.target })),
  }), [nodes, edges]);

  const isValidConnection: IsValidConnection = useCallback((conn: Edge | Connection) => {
    if (!conn.source || !conn.target) return false;
    return isValidEdge(buildGraph(), conn.source, conn.target);
  }, [buildGraph]);

  const onConnect = useCallback((conn: Connection) => {
    setEdges(eds => addEdge(conn, eds));
  }, [setEdges]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/sg-node");
    if (!raw) return;
    const { type, data } = JSON.parse(raw) as { type: string; data: Record<string, unknown> };
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = `${type}-${Date.now()}`;
    setNodes(nds => [...nds, { id, type, position, data }]);
  }, [screenToFlowPosition, setNodes]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  useEffect(() => {
    runAllRef.current = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const buttons = wrap.querySelectorAll<HTMLButtonElement>(".node-output .node-btn");
      buttons.forEach(btn => {
        if (btn.textContent?.includes("▶ Run") && !btn.disabled) btn.click();
      });
    };
  }, [runAllRef]);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      {nodes.length === 0 && (
        <div className="canvas-empty-hint" aria-hidden="true">
          Drag blocks from the left to build your study flow — Files → Brain → Study methods
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
      >
        <Background gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default function Canvas({ runAllRef }: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner runAllRef={runAllRef} />
    </ReactFlowProvider>
  );
}
