"use client";

import { useState } from "react";

import type { ReasoningNode } from "@/lib/types";

// ── Tool metadata ──────────────────────────────────────────────────────────────

type ToolMeta = { label: string; color: string; bg: string };

function getToolMeta(rawName: string): ToolMeta {
  const n = rawName.toLowerCase();
  if (n.includes("tweet") || n.includes("twitter"))
    return { label: "Tweet Search", color: "text-sky-400", bg: "bg-sky-400/8" };
  if (n.includes("paper") || n.includes("research"))
    return { label: "Research Paper", color: "text-violet-400", bg: "bg-violet-400/8" };
  if (n.includes("news"))
    return { label: "News Search", color: "text-orange-400", bg: "bg-orange-400/8" };
  if (n.includes("page") || n.includes("read"))
    return { label: "Page Reader", color: "text-blue-400", bg: "bg-blue-400/8" };
  if (n.includes("people") || n.includes("person"))
    return { label: "People Search", color: "text-pink-400", bg: "bg-pink-400/8" };
  if (n.includes("compan"))
    return { label: "Company Search", color: "text-amber-400", bg: "bg-amber-400/8" };
  if (n.includes("similar") || n.includes("find_similar"))
    return { label: "Find Similar", color: "text-cyan-400", bg: "bg-cyan-400/8" };
  if (n.includes("fresh"))
    return { label: "Fresh Search", color: "text-lime-400", bg: "bg-lime-400/8" };
  if (n.includes("fast"))
    return { label: "Fast Search", color: "text-emerald-400", bg: "bg-emerald-400/8" };
  if (n.includes("search") || n.includes("web") || n.includes("google"))
    return { label: "Web Search", color: "text-emerald-400", bg: "bg-emerald-400/8" };
  return { label: rawName.replace(/_/g, " "), color: "text-white/40", bg: "bg-white/4" };
}

function extractToolName(tool: unknown): string {
  if (typeof tool === "string") return tool;
  if (tool && typeof tool === "object") {
    const t = tool as Record<string, unknown>;
    return (
      (typeof t.name === "string" ? t.name : null) ??
      (typeof t.id === "string" ? t.id : null) ??
      (typeof t.type === "string" ? t.type : null) ??
      "tool"
    );
  }
  return "tool";
}

/** Extract query/input/output from a tool call object */
function extractToolDetails(tool: unknown): { input?: string; output?: string; url?: string } {
  if (!tool || typeof tool !== "object") return {};
  const t = tool as Record<string, unknown>;
  const input =
    typeof t.input === "string" ? t.input :
    typeof t.query === "string" ? t.query :
    typeof t.q === "string" ? t.q :
    typeof t.text === "string" ? t.text :
    typeof t.url === "string" ? t.url :
    null;
  const output =
    typeof t.output === "string" ? t.output :
    typeof t.result === "string" ? t.result :
    typeof t.content === "string" ? t.content :
    null;
  const url = typeof t.url === "string" ? t.url : null;
  return {
    ...(input ? { input } : {}),
    ...(output ? { output } : {}),
    ...(url && url !== input ? { url } : {}),
  };
}

// ── Stable path-based ID generation ───────────────────────────────────────────
// IDs are like "s:0", "t:0:2", "c:0" etc. so they are stable across re-renders.
// Format:
//   step node at path "0-1"         → "s:0-1"
//   tool call #2 inside step "0-1"  → "t:0-1:2"
//   conclusion inside step "0-1"    → "c:0-1"

// ── Flattened tree rows ────────────────────────────────────────────────────────

type FlatRow =
  | { kind: "step"; id: string; node: ReasoningNode; depth: number; hasChildren: boolean; path: string }
  | { kind: "tool"; id: string; tool: unknown; toolIndex: number; depth: number }
  | { kind: "conclusion"; id: string; text: string; depth: number };

function flattenTree(
  node: ReasoningNode,
  depth: number,
  path: string,
  collapsed: Set<string>
): FlatRow[] {
  const stepId = `s:${path}`;
  const hasTooluse = Array.isArray(node.tooluse) && node.tooluse.length > 0;
  const hasSubtask = Array.isArray(node.subtask) && node.subtask.length > 0;
  const hasConclusion = Boolean(node.conclusion?.trim());
  const hasChildren = hasTooluse || hasSubtask || hasConclusion;

  const rows: FlatRow[] = [
    { kind: "step", id: stepId, node, depth, hasChildren, path },
  ];

  if (collapsed.has(stepId)) return rows;

  if (hasTooluse) {
    node.tooluse.forEach((tool, idx) => {
      rows.push({ kind: "tool", id: `t:${path}:${idx}`, tool, toolIndex: idx, depth: depth + 1 });
    });
  }

  if (hasSubtask) {
    node.subtask.forEach((child, idx) => {
      rows.push(...flattenTree(child, depth + 1, `${path}-${idx}`, collapsed));
    });
  }

  if (hasConclusion) {
    rows.push({ kind: "conclusion", id: `c:${path}`, text: node.conclusion, depth: depth + 1 });
  }

  return rows;
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function ChevronRightIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function ToolCallIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M9.5 2a4.5 4.5 0 00-4 6.5L2 12a2 2 0 002.8 2.8l3.5-3.5A4.5 4.5 0 109.5 2z" />
      <circle cx="9.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SubtaskCountIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="2" y="2" width="12" height="12" rx="2.5" />
      <path d="M5 8h6M8 5v6" strokeLinecap="round" />
    </svg>
  );
}

function ConclusionIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M4 8l3 3 5-5" />
      <circle cx="8" cy="8" r="6" />
    </svg>
  );
}

function ThoughtDotIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="8" cy="8" r="2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="14" cy="14" r="0.8" />
    </svg>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function NodeDetail({ rows, selectedId }: { rows: FlatRow[]; selectedId: string }) {
  const row = rows.find((r) => r.id === selectedId);
  if (!row) return null;

  if (row.kind === "step") {
    const { node } = row;
    const hasThought = Boolean(node.thought?.trim());
    const hasConclusion = Boolean(node.conclusion?.trim());
    const toolCount = Array.isArray(node.tooluse) ? node.tooluse.length : 0;
    const subtaskCount = Array.isArray(node.subtask) ? node.subtask.length : 0;

    return (
      <div className="space-y-4 py-0.5">
        {/* Header */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-medium uppercase tracking-widest text-white/20">
              Step
            </span>
            {toolCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-px text-[9px] text-white/30">
                <ToolCallIcon /> {toolCount} {toolCount === 1 ? "call" : "calls"}
              </span>
            )}
            {subtaskCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-px text-[9px] text-white/30">
                <SubtaskCountIcon /> {subtaskCount} {subtaskCount === 1 ? "subtask" : "subtasks"}
              </span>
            )}
          </div>
          <p className="text-[12px] font-medium leading-snug text-foreground/90">
            {node.title || "Untitled step"}
          </p>
        </div>

        {/* Thought */}
        {hasThought && (
          <div>
            <div className="mb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/20">
              Reasoning
            </div>
            <p className="whitespace-pre-wrap text-[11px] leading-[1.7] text-white/55 italic">
              {node.thought}
            </p>
          </div>
        )}

        {/* Tool calls summary */}
        {toolCount > 0 && (
          <div>
            <div className="mb-2 text-[9px] font-medium uppercase tracking-widest text-white/20">
              Tool Calls ({toolCount})
            </div>
            <div className="space-y-1.5">
              {node.tooluse.map((tool, i) => {
                const name = extractToolName(tool);
                const meta = getToolMeta(name);
                const details = extractToolDetails(tool);
                return (
                  <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <span className={`font-mono text-[10px] font-medium ${meta.color}`}>
                      {name.replace(/_/g, " ")}
                    </span>
                    {details.input && (
                      <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                        <span className="text-white/20">query: </span>
                        {details.input}
                      </p>
                    )}
                    {details.url && details.url !== details.input && (
                      <p className="mt-0.5 break-all font-mono text-[9px] text-white/25">
                        {details.url}
                      </p>
                    )}
                    {details.output && (
                      <p className="mt-1.5 max-h-28 overflow-y-auto text-[10px] leading-relaxed text-white/35">
                        {details.output}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Conclusion */}
        {hasConclusion && (
          <div>
            <div className="mb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/20">
              Conclusion
            </div>
            <div className="rounded-r-lg border-l-2 border-accent/40 bg-accent/[0.05] py-2.5 pl-3 pr-3">
              <p className="text-[11px] leading-[1.7] text-white/65">
                {node.conclusion}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (row.kind === "tool") {
    const name = extractToolName(row.tool);
    const meta = getToolMeta(name);
    const details = extractToolDetails(row.tool);
    const rawObj = row.tool && typeof row.tool === "object" ? row.tool as Record<string, unknown> : null;

    return (
      <div className="space-y-4 py-0.5">
        <div>
          <div className="mb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/20">
            Tool Call #{row.toolIndex + 1}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] px-2.5 py-1 font-mono text-[11px] font-medium ${meta.color}`}
          >
            <ToolCallIcon />
            {name.replace(/_/g, " ")}
          </span>
        </div>

        {details.input && (
          <div>
            <div className="mb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/20">
              Query / Input
            </div>
            <p className="whitespace-pre-wrap text-[11px] leading-[1.7] text-white/55">
              {details.input}
            </p>
          </div>
        )}

        {details.url && details.url !== details.input && (
          <div>
            <div className="mb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/20">
              URL
            </div>
            <p className="break-all font-mono text-[10px] text-white/35">{details.url}</p>
          </div>
        )}

        {details.output && (
          <div>
            <div className="mb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/20">
              Output
            </div>
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-[11px] leading-[1.7] text-white/50">
              {details.output}
            </p>
          </div>
        )}

        {/* Raw fallback when nothing else is extractable */}
        {rawObj && !details.input && !details.output && (
          <div>
            <div className="mb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/20">
              Raw
            </div>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-white/30">
              {JSON.stringify(rawObj, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (row.kind === "conclusion") {
    return (
      <div className="py-0.5">
        <div className="mb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/20">
          Conclusion
        </div>
        <div className="rounded-r-lg border-l-2 border-accent/40 bg-accent/[0.05] py-2.5 pl-3 pr-3">
          <p className="whitespace-pre-wrap text-[11px] leading-[1.7] text-white/65">
            {row.text}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

// ── Tree row ───────────────────────────────────────────────────────────────────

function TreeRow({
  row,
  isSelected,
  isCollapsed,
  onSelect,
  onToggle,
}: {
  row: FlatRow;
  isSelected: boolean;
  isCollapsed: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const depth = row.depth;
  const indentPx = depth * 14;

  if (row.kind === "step") {
    const { node, hasChildren } = row;
    const toolCount = Array.isArray(node.tooluse) ? node.tooluse.length : 0;
    const subtaskCount = Array.isArray(node.subtask) ? node.subtask.length : 0;
    const hasConclusion = Boolean(node.conclusion?.trim());
    const hasThought = Boolean(node.thought?.trim());

    return (
      <div style={{ paddingLeft: indentPx }}>
        <button
          onClick={() => {
            onSelect(row.id);
            if (hasChildren) onToggle(row.id);
          }}
          className={`group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-100 ${
            isSelected ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"
          }`}
        >
          {/* Chevron */}
          <span
            className={`mt-[3px] h-[9px] w-[9px] flex-shrink-0 transition-colors ${
              hasChildren
                ? isSelected ? "text-white/50" : "text-white/20 group-hover:text-white/40"
                : "text-transparent"
            }`}
          >
            {hasChildren ? (isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />) : null}
          </span>

          {/* Type dot */}
          <span
            className={`mt-[5px] h-[5px] w-[5px] flex-shrink-0 rounded-full transition-colors ${
              hasConclusion
                ? isSelected ? "bg-accent" : "bg-accent/50"
                : toolCount > 0
                ? isSelected ? "bg-emerald-400" : "bg-emerald-400/45"
                : isSelected ? "bg-white/35" : "bg-white/15"
            }`}
          />

          {/* Content */}
          <div className="min-w-0 flex-1">
            <p
              className={`text-[11px] leading-snug transition-colors ${
                depth === 0
                  ? isSelected ? "font-medium text-foreground" : "text-white/70 group-hover:text-white/90"
                  : isSelected ? "text-foreground/80" : "text-white/45 group-hover:text-white/70"
              }`}
            >
              {node.title || "Step"}
            </p>

            {/* Meta chips */}
            <div className="mt-0.5 flex items-center gap-2.5">
              {toolCount > 0 && (
                <span className="flex items-center gap-1 text-[9px] text-white/25">
                  <ToolCallIcon /> {toolCount}
                </span>
              )}
              {subtaskCount > 0 && (
                <span className="flex items-center gap-1 text-[9px] text-white/25">
                  <SubtaskCountIcon /> {subtaskCount}
                </span>
              )}
              {hasThought && !toolCount && !subtaskCount && (
                <span className="text-[9px] text-white/20">
                  <ThoughtDotIcon />
                </span>
              )}
              {hasConclusion && (
                <span className="text-[9px] text-accent/40">
                  <ConclusionIcon />
                </span>
              )}
            </div>
          </div>
        </button>
      </div>
    );
  }

  if (row.kind === "tool") {
    const name = extractToolName(row.tool);
    const meta = getToolMeta(name);
    const displayName = name.replace(/_/g, " ");

    return (
      <div style={{ paddingLeft: indentPx }}>
        <button
          onClick={() => onSelect(row.id)}
          className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-100 ${
            isSelected ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"
          }`}
        >
          {/* Spacer for chevron column */}
          <span className="h-[9px] w-[9px] flex-shrink-0" />

          {/* Colored tool dot */}
          <span
            className={`mt-px h-[4px] w-[4px] flex-shrink-0 rounded-full ${meta.color.replace("text-", "bg-")} ${
              isSelected ? "opacity-90" : "opacity-45"
            }`}
          />

          {/* Tool name */}
          <span
            className={`font-mono text-[10px] transition-colors ${
              isSelected ? meta.color : meta.color + " opacity-55 group-hover:opacity-85"
            }`}
          >
            {displayName}
          </span>

          <span className="text-white/20">
            <ToolCallIcon />
          </span>
        </button>
      </div>
    );
  }

  if (row.kind === "conclusion") {
    return (
      <div style={{ paddingLeft: indentPx }}>
        <button
          onClick={() => onSelect(row.id)}
          className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-100 ${
            isSelected ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"
          }`}
        >
          <span className="h-[9px] w-[9px] flex-shrink-0" />
          <span className={`mt-px h-[4px] w-[4px] flex-shrink-0 rounded-full bg-accent/50`} />
          <span
            className={`text-[10px] transition-colors ${
              isSelected ? "text-accent/80" : "text-accent/40 group-hover:text-accent/65"
            }`}
          >
            Conclusion
          </span>
          <span className="text-accent/30">
            <ConclusionIcon />
          </span>
        </button>
      </div>
    );
  }

  return null;
}

// ── Stats ──────────────────────────────────────────────────────────────────────

function countAllStats(node: ReasoningNode): { tools: number; steps: number } {
  const tools = Array.isArray(node.tooluse) ? node.tooluse.length : 0;
  const subtasks = Array.isArray(node.subtask) ? node.subtask : [];
  const childStats = subtasks.reduce(
    (acc, c) => {
      const s = countAllStats(c);
      return { tools: acc.tools + s.tools, steps: acc.steps + s.steps + 1 };
    },
    { tools: 0, steps: 0 }
  );
  return { tools: tools + childStats.tools, steps: childStats.steps };
}

// ── Main exported component ────────────────────────────────────────────────────

interface ReasoningTreeProps {
  node: ReasoningNode;
}

export function ReasoningTree({ node }: ReasoningTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = flattenTree(node, 0, "0", collapsed);
  const effectiveSelected = selectedId ?? rows[0]?.id ?? null;
  const stats = countAllStats(node);

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Stats bar */}
      <div className="flex items-center gap-4 border-b border-white/[0.05] pb-2.5">
        <StatPill label="steps" value={stats.steps + 1} />
        {stats.tools > 0 && <StatPill label="tool calls" value={stats.tools} />}
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-4" style={{ minHeight: 280 }}>
        {/* Left: tree panel */}
        <div
          className="flex-shrink-0 overflow-y-auto space-y-px"
          style={{ width: "45%", maxHeight: 360 }}
        >
          {rows.map((row) => (
            <TreeRow
              key={row.id}
              row={row}
              isSelected={row.id === effectiveSelected}
              isCollapsed={row.kind === "step" && collapsed.has(row.id)}
              onSelect={(id) => setSelectedId(id)}
              onToggle={toggleCollapsed}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="w-px flex-shrink-0 self-stretch bg-white/[0.05]" />

        {/* Right: detail panel */}
        <div
          className="min-w-0 flex-1 overflow-y-auto"
          style={{ maxHeight: 360 }}
        >
          {effectiveSelected ? (
            <NodeDetail rows={rows} selectedId={effectiveSelected} />
          ) : (
            <div className="flex h-full min-h-[120px] items-center justify-center">
              <span className="text-[11px] text-white/20">Select a step to inspect</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-mono text-[11px] font-medium text-white/50">{value}</span>
      <span className="text-[9px] text-white/20">{label}</span>
    </div>
  );
}
