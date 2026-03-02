"use client";

import { useState } from "react";

import type { ReasoningData } from "@/lib/types";

// ---- Helpers ----

function extractToolInfo(tool: Record<string, unknown>) {
  const name =
    (typeof tool.tool_name === "string" ? tool.tool_name : null) ??
    (typeof tool.name === "string" ? tool.name : null) ??
    (typeof tool.id === "string" ? tool.id : null) ??
    "tool";

  const params = tool.parameters ?? tool.params ?? tool.input ?? tool.args;
  const result = tool.tool_result ?? tool.result ?? tool.output;

  const query =
    params && typeof params === "object"
      ? (params as Record<string, unknown>).query ??
        (params as Record<string, unknown>).objective ??
        null
      : null;

  let results: Record<string, unknown>[] = [];
  if (result != null && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.results)) {
      results = r.results as Record<string, unknown>[];
    }
  }

  return { name, query, results };
}

// ---- Search results (collapsed by default) ----

function Sources({ results }: { results: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(false);

  if (results.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {results.length} source{results.length === 1 ? "" : "s"}
      </button>

      {open && (
        <div className="mt-1.5 space-y-px">
          {results.map((r, i) => {
            const title = typeof r.title === "string" ? r.title : null;
            const url = typeof r.url === "string" ? r.url : null;
            let hostname = "";
            if (url) {
              try { hostname = new URL(url).hostname.replace("www.", ""); } catch { /* ignore */ }
            }

            return (
              <div key={i} className="group flex items-baseline gap-2 py-0.5">
                <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/20">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground/80"
                    >
                      {title || hostname || url}
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/60">
                      {title || "Untitled"}
                    </span>
                  )}
                  {hostname && title && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground/25">
                      {hostname}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Single reasoning step ----

function Step({ step, isLast }: {
  step: Record<string, unknown>;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const title = typeof step.title === "string" ? step.title.trim() : null;
  const thought = typeof step.thought === "string" ? step.thought.trim() : null;
  const conclusion = typeof step.conclusion === "string" ? step.conclusion.trim() : null;

  // tooluse: single object or array
  const toolItems: Record<string, unknown>[] = [];
  if (step.tooluse) {
    if (Array.isArray(step.tooluse)) {
      for (const t of step.tooluse) {
        if (t && typeof t === "object") toolItems.push(t as Record<string, unknown>);
      }
    } else if (typeof step.tooluse === "object") {
      toolItems.push(step.tooluse as Record<string, unknown>);
    }
  }

  // subtask / subtasks
  const subtasks: Record<string, unknown>[] = [];
  const rawSubs = step.subtask ?? step.subtasks;
  if (Array.isArray(rawSubs)) {
    for (const s of rawSubs) {
      if (s && typeof s === "object") subtasks.push(s as Record<string, unknown>);
    }
  }

  const tools = toolItems.map(extractToolInfo);
  const hasBody = thought || tools.length > 0 || conclusion || subtasks.length > 0;

  return (
    <div className="relative flex gap-3">
      {/* Timeline track */}
      <div className="flex flex-col items-center pt-[7px]">
        <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/20" />
        {!isLast && (
          <div className="mt-1 w-px flex-1 bg-border" />
        )}
      </div>

      {/* Content */}
      <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-4"}`}>
        {/* Header row */}
        <button
          onClick={() => hasBody && setExpanded((v) => !v)}
          className={`group flex w-full items-start gap-2 text-left ${
            hasBody ? "cursor-pointer" : "cursor-default"
          }`}
          disabled={!hasBody}
        >
          <span className="flex-1 text-[12px] font-medium leading-snug text-foreground/80">
            {title || "Reasoning"}
          </span>

          {/* Inline tool tags when collapsed */}
          {!expanded && tools.length > 0 && (
            <span className="flex flex-shrink-0 items-center gap-1">
              {tools.map((t, i) => (
                <span
                  key={i}
                  className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/40"
                >
                  {t.name}
                </span>
              ))}
            </span>
          )}

          {hasBody && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className={`mt-px flex-shrink-0 text-muted-foreground/20 transition-all group-hover:text-muted-foreground/50 ${
                expanded ? "rotate-90" : ""
              }`}
            >
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Expanded body */}
        {expanded && hasBody && (
          <div className="mt-1.5 space-y-2">
            {/* Thought */}
            {thought && (
              <p className="text-[12px] leading-[1.6] text-muted-foreground/60">
                {thought}
              </p>
            )}

            {/* Tool calls — inline, compact */}
            {tools.map((t, i) => (
              <div key={i}>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/50">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="opacity-40">
                      <circle cx="8" cy="8" r="2" fill="currentColor" />
                      <path d="M8 2v2m0 8v2M2 8h2m8 0h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    {t.name}
                  </span>
                  {typeof t.query === "string" && t.query && (
                    <span className="truncate text-[11px] text-muted-foreground/30">
                      {t.query}
                    </span>
                  )}
                  {t.results.length > 0 && (
                    <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground/25">
                      {t.results.length} found
                    </span>
                  )}
                </div>
                <Sources results={t.results} />
              </div>
            ))}

            {/* Subtasks (recursive) */}
            {subtasks.length > 0 && (
              <div className="mt-1">
                {subtasks.map((sub, i) => (
                  <Step
                    key={i}
                    step={sub}
                    isLast={i === subtasks.length - 1}
                  />
                ))}
              </div>
            )}

            {/* Conclusion */}
            {conclusion && (
              <p className="text-[12px] leading-[1.6] text-foreground/60">
                {conclusion}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main export ----

export function ReasoningTree({ data }: { data: ReasoningData }) {
  if (!data) return null;

  // String — try to parse
  if (typeof data === "string") {
    try {
      return <ReasoningTree data={JSON.parse(data)} />;
    } catch {
      return (
        <p className="text-xs leading-relaxed text-muted-foreground/60">{data}</p>
      );
    }
  }

  // Array of steps (runtime shape)
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    return (
      <div>
        {data.map((step, i) => (
          <Step
            key={i}
            step={typeof step === "object" && step ? (step as Record<string, unknown>) : {}}
            isLast={i === data.length - 1}
          />
        ))}
      </div>
    );
  }

  // Single object
  if (typeof data === "object") {
    return <Step step={data as Record<string, unknown>} isLast={true} />;
  }

  // Fallback
  return (
    <pre className="text-[11px] leading-relaxed text-muted-foreground/40">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
