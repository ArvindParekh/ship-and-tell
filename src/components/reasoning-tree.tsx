"use client";

import { useState } from "react";

import type { ReasoningNode } from "@/lib/types";

interface Props {
  node: ReasoningNode;
  depth?: number;
}

function ToolBadge({ tool }: { tool: unknown }) {
  // tooluse items are unknown[] — extract a display name defensively
  let label = "tool";
  if (typeof tool === "string") {
    label = tool;
  } else if (tool && typeof tool === "object") {
    const t = tool as Record<string, unknown>;
    label =
      (typeof t.name === "string" ? t.name : null) ??
      (typeof t.id === "string" ? t.id : null) ??
      (typeof t.type === "string" ? t.type : null) ??
      "tool";
  }
  return (
    <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {label}
    </span>
  );
}

export function ReasoningTree({ node, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.subtask && node.subtask.length > 0;
  const hasTools = node.tooluse && node.tooluse.length > 0;
  const hasThought = Boolean(node.thought?.trim());
  const hasConclusion = Boolean(node.conclusion?.trim());
  const isExpandable = hasThought || hasTools || hasConclusion || hasChildren;

  return (
    <div className={depth > 0 ? "ml-4 border-l border-border pl-3" : ""}>
      {/* Node header */}
      <button
        onClick={() => isExpandable && setExpanded((v) => !v)}
        className={`group flex w-full items-start gap-2 py-1.5 text-left ${
          isExpandable ? "cursor-pointer" : "cursor-default"
        }`}
        disabled={!isExpandable}
      >
        {/* Expand indicator */}
        <span className="mt-0.5 flex-shrink-0 font-mono text-[10px] text-muted-foreground/40 transition-colors group-hover:text-muted-foreground">
          {isExpandable ? (expanded ? "▾" : "▸") : "·"}
        </span>

        {/* Title */}
        <span
          className={`text-xs leading-relaxed ${
            depth === 0
              ? "font-medium text-foreground"
              : "text-muted-foreground"
          }`}
        >
          {node.title || "Step"}
        </span>

        {/* Tool badges inline when collapsed */}
        {!expanded && hasTools && (
          <span className="flex flex-shrink-0 flex-wrap gap-1">
            {node.tooluse.map((tool, i) => (
              <ToolBadge key={i} tool={tool} />
            ))}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="pb-1 pl-4">
          {/* Thought */}
          {hasThought && (
            <p className="mb-2 text-xs leading-relaxed text-muted-foreground/80">
              {node.thought}
            </p>
          )}

          {/* Tool calls */}
          {hasTools && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {node.tooluse.map((tool, i) => (
                <ToolBadge key={i} tool={tool} />
              ))}
            </div>
          )}

          {/* Subtasks (recursive) */}
          {hasChildren && (
            <div className="mt-1 space-y-0.5">
              {node.subtask.map((child, i) => (
                <ReasoningTree key={i} node={child} depth={depth + 1} />
              ))}
            </div>
          )}

          {/* Conclusion */}
          {hasConclusion && (
            <div className="mt-2 rounded border-l-2 border-accent/40 pl-2.5">
              <p className="text-[11px] italic leading-relaxed text-muted-foreground/70">
                {node.conclusion}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
