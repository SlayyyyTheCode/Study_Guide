"use client";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export default function FlowEdge(props: EdgeProps) {
  const [path] = getBezierPath(props);
  const state = (props.data?.state as string) ?? "idle";
  return (
    <>
      <BaseEdge id={props.id} path={path} className={`flow-edge flow-edge-${state}`} />
      {state === "running" && (
        <circle r="4" className="flow-edge-dot">
          <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </>
  );
}
