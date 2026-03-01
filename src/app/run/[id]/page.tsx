"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import type { Run, AgentResult, ReasoningNode } from "@/lib/types";
import { ReasoningTree } from "@/components/reasoning-tree";

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  if (status === "done") return "Done";
  if (status === "running") return "Thinking";
  if (status === "error") return "Failed";
  return "Waiting";
}

function formatDuration(start: number | null, end: number | null): string {
  if (!start || !end) return "";
  return `${((end - start) / 1000).toFixed(1)}s`;
}

/** Count total tool calls across the entire reasoning tree */
function countToolCalls(node: ReasoningNode | null): number {
  if (!node) return 0;
  const own = Array.isArray(node.tooluse) ? node.tooluse.length : 0;
  const children = Array.isArray(node.subtask)
    ? node.subtask.reduce((acc, child) => acc + countToolCalls(child), 0)
    : 0;
  return own + children;
}

/** Get the last meaningful streaming line (non-empty) for card preview */
function lastStreamingLine(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  if (status === "done")
    return <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success" />;
  if (status === "running")
    return <span className="inline-block h-1.5 w-1.5 flex-shrink-0 animate-subtle-pulse rounded-full bg-warning" />;
  if (status === "error")
    return <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-danger" />;
  return <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white/10" />;
}

// ── Agent card — compact with live preview ────────────────────────────────────

function AgentCard({
  agent,
  isSelected,
  onClick,
}: {
  agent: AgentResult;
  isSelected: boolean;
  onClick: () => void;
}) {
  const toolCount = countToolCalls(agent.reasoning);
  const latestLine = agent.status === "running" ? lastStreamingLine(agent.streamingOutput) : "";

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col gap-2 rounded-xl border p-3.5 text-left transition-all duration-150 ${
        isSelected
          ? "border-white/[0.14] bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]"
          : "border-white/[0.06] bg-white/[0.025] hover:border-white/[0.1] hover:bg-white/[0.045]"
      }`}
    >
      {/* Top row: emoji + status */}
      <div className="flex items-center justify-between">
        <span className="text-base leading-none">{agent.emoji}</span>
        <div className="flex items-center gap-1.5">
          <StatusDot status={agent.status} />
          <span
            className={`text-[10px] font-medium ${
              agent.status === "running"
                ? "text-warning/80"
                : agent.status === "done"
                ? "text-success/80"
                : agent.status === "error"
                ? "text-danger/80"
                : "text-white/20"
            }`}
          >
            {statusLabel(agent.status)}
          </span>
        </div>
      </div>

      {/* Label */}
      <div
        className={`text-[11px] font-medium leading-tight tracking-tight transition-colors ${
          isSelected ? "text-foreground" : "text-white/60 group-hover:text-white/80"
        }`}
      >
        {agent.label}
      </div>

      {/* Live preview line — shown while running */}
      {agent.status === "running" && (
        <div className="flex items-start gap-1.5">
          <span className="mt-[3px] h-1 w-1 flex-shrink-0 animate-subtle-pulse rounded-full bg-warning/60" />
          <p className="line-clamp-2 text-[10px] leading-[1.4] text-white/35">
            {latestLine || "Starting research…"}
          </p>
        </div>
      )}

      {/* Done summary: root reasoning title + tool count */}
      {agent.status === "done" && agent.reasoning && (
        <div className="space-y-1">
          <p className="line-clamp-2 text-[10px] leading-[1.4] text-white/35">
            {agent.reasoning.title}
          </p>
          {toolCount > 0 && (
            <div className="flex items-center gap-1">
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-white/20">
                <circle cx="6.5" cy="6.5" r="4.5" />
                <path d="M10 10l3.5 3.5" strokeLinecap="round" />
              </svg>
              <span className="font-mono text-[10px] text-white/25">
                {toolCount} {toolCount === 1 ? "search" : "searches"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pending placeholder */}
      {agent.status === "pending" && (
        <p className="text-[10px] text-white/15">Queued</p>
      )}

      {/* Duration */}
      {agent.status === "done" && agent.startedAt && agent.completedAt && (
        <span className="font-mono text-[10px] text-white/20">
          {formatDuration(agent.startedAt, agent.completedAt)}
        </span>
      )}

      {/* Selected indicator stripe */}
      {isSelected && (
        <span className="absolute bottom-0 left-3 right-3 h-px rounded-full bg-accent/40" />
      )}
    </button>
  );
}

// ── Agent detail pane ─────────────────────────────────────────────────────────

function ThoughtsFeed({
  streamingOutput,
  isRunning,
  scrollRef,
}: {
  streamingOutput: string;
  isRunning: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const thoughts = streamingOutput
    ? streamingOutput.split("\n\n").filter(Boolean)
    : [];

  if (thoughts.length === 0) {
    if (isRunning) {
      return (
        <div className="flex items-center gap-2 text-[11px] text-white/30">
          <span className="h-3 w-3 animate-spin rounded-full border border-white/10 border-t-white/40" />
          Initializing…
        </div>
      );
    }
    return <p className="text-[11px] text-white/20">No thoughts recorded.</p>;
  }

  return (
    <div ref={scrollRef} className="max-h-72 overflow-y-auto space-y-2">
      {thoughts.map((thought, i) => {
        const isLatest = isRunning && i === thoughts.length - 1;
        return (
          <div
            key={i}
            className={`rounded-lg border px-3 py-2.5 ${
              isLatest
                ? "border-warning/15 bg-warning/[0.04]"
                : "border-white/[0.05] bg-white/[0.02]"
            }`}
          >
            <p
              className={`text-[11px] leading-relaxed ${
                isLatest ? "text-white/60" : "text-white/35"
              }`}
            >
              {thought}
              {isLatest && (
                <span className="ml-0.5 inline-block h-3 w-px animate-subtle-pulse bg-warning/50" />
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function AgentDetailPane({ agent }: { agent: AgentResult }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [manualTab, setManualTab] = useState<"thoughts" | "output" | "reasoning" | null>(null);

  const hasThoughts = Boolean(agent.streamingOutput);
  const hasOutput = Boolean(agent.output);
  const hasReasoning = Boolean(agent.reasoning);
  const toolCount = countToolCalls(agent.reasoning);

  // Default tab: thoughts while running (or if done and we have them),
  // fall back to output if no thoughts, fall back to reasoning
  const defaultTab: "thoughts" | "output" | "reasoning" =
    agent.status === "running"
      ? "thoughts"
      : hasThoughts
      ? "thoughts"
      : hasOutput
      ? "output"
      : "reasoning";

  const tab = manualTab ?? defaultTab;

  // Auto-scroll thoughts panel while streaming
  useEffect(() => {
    if (agent.status === "running" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agent.streamingOutput, agent.status]);

  // Reset manual tab when a new agent is selected (agent.name changes)
  const prevName = useRef(agent.name);
  useEffect(() => {
    if (prevName.current !== agent.name) {
      prevName.current = agent.name;
      setManualTab(null);
    }
  }, [agent.name]);

  if (agent.status === "pending") {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="text-[11px] text-white/20">Waiting to start…</span>
      </div>
    );
  }

  if (agent.status === "error") {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="text-[11px] text-danger/70">Agent failed to complete.</span>
      </div>
    );
  }

  // Build tab list based on what's available
  type TabKey = "thoughts" | "output" | "reasoning";
  const tabs: { key: TabKey; label: React.ReactNode }[] = [];

  if (hasThoughts || agent.status === "running") {
    tabs.push({
      key: "thoughts",
      label: (
        <span className="flex items-center gap-1.5">
          {agent.status === "running" ? (
            <>
              <span className="h-1 w-1 animate-subtle-pulse rounded-full bg-warning/70" />
              Thinking
            </>
          ) : (
            "Thoughts"
          )}
        </span>
      ),
    });
  }

  if (hasOutput) {
    tabs.push({ key: "output", label: "Output" });
  }

  if (hasReasoning) {
    tabs.push({
      key: "reasoning",
      label: (
        <span className="flex items-center gap-1.5">
          Reasoning trace
          {toolCount > 0 && (
            <span className="rounded bg-white/[0.06] px-1 py-px font-mono text-[9px] text-white/30">
              {toolCount}
            </span>
          )}
        </span>
      ),
    });
  }

  return (
    <div>
      {/* Tab bar */}
      {tabs.length > 1 && (
        <div className="mb-4 flex gap-0 border-b border-white/[0.06]">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setManualTab(key)}
              className={`relative pb-2.5 pr-4 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                tab === key ? "text-foreground" : "text-white/30 hover:text-white/60"
              }`}
            >
              {label}
              {tab === key && (
                <span className="absolute bottom-0 left-0 right-4 h-px bg-foreground/60" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Thoughts tab */}
      {tab === "thoughts" && (
        <ThoughtsFeed
          streamingOutput={agent.streamingOutput}
          isRunning={agent.status === "running"}
          scrollRef={scrollRef}
        />
      )}

      {/* Output tab */}
      {tab === "output" && (
        <div className="max-h-72 overflow-y-auto">
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-white/60">
            {agent.output ?? ""}
          </p>
        </div>
      )}

      {/* Reasoning tab */}
      {tab === "reasoning" && agent.reasoning && (
        <ReasoningTree node={agent.reasoning} />
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [activeTab, setActiveTab] = useState<"blog" | "thread" | "hn">("blog");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Unwrap params (Next.js 16 async params)
  useEffect(() => {
    params.then((p) => setRunId(p.id));
  }, [params]);

  // Poll every 1.5s until done
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/run/${runId}/status`);
        if (!res.ok) return;
        const data: Run = await res.json();
        setRun(data);

        // Auto-select first running agent, then fall back to first
        setSelectedAgent((prev) => {
          if (prev) return prev;
          const agents = Object.values(data.agents);
          const running = agents.find((a) => a.status === "running");
          return running?.name ?? agents[0]?.name ?? null;
        });

        const allDone =
          Object.values(data.agents).every(
            (a) => a.status === "done" || a.status === "error"
          ) &&
          (data.synthesizer.status === "done" || data.synthesizer.status === "error");

        if (!allDone && !cancelled) setTimeout(poll, 1500);
      } catch {
        if (!cancelled) setTimeout(poll, 1500);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!run) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-[11px] text-white/30">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border border-white/10 border-t-white/40" />
          Loading run…
        </div>
      </div>
    );
  }

  const agents: AgentResult[] = Object.values(run.agents);
  const agentsDone = agents.filter((a) => a.status === "done").length;
  const allAgentsDone = agents.every((a) => a.status === "done" || a.status === "error");
  const activeAgent = agents.find((a) => a.name === selectedAgent) ?? agents[0];

  const contentTabs = [
    { key: "blog" as const, label: "Blog Post" },
    { key: "thread" as const, label: "Thread" },
    { key: "hn" as const, label: "HN" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-[11px] text-white/40 transition-colors hover:text-white/70"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-accent">
              <path d="M8 1L14.5 5v6L8 15 1.5 11V5L8 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 1v6.5m0 0L1.5 5m6.5 2.5L14.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            Ship and Tell
          </Link>
          <span className="text-white/[0.15]">/</span>
          <span className="truncate text-[11px] text-white/60">{run.prTitle}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* PR meta */}
        <div className="mb-8">
          <h1 className="text-sm font-medium tracking-tight text-foreground">{run.prTitle}</h1>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="text-[11px] text-white/35">{run.repoName}</span>
            <span className="text-white/10">·</span>
            <a
              href={run.prUrl}
              className="text-[11px] text-white/35 transition-colors hover:text-white/60"
              target="_blank"
              rel="noopener noreferrer"
            >
              View PR ↗
            </a>
          </div>
        </div>

        {/* ── Research Agents ──────────────────────────────────────────────── */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-medium uppercase tracking-widest text-white/25">
              Research Agents
            </h2>
            <span className="font-mono text-[10px] text-white/20">
              {agentsDone}/{agents.length}
            </span>
          </div>

          {/* 5 agent cards */}
          <div className="grid grid-cols-5 gap-2">
            {agents.map((agent) => (
              <AgentCard
                key={agent.name}
                agent={agent}
                isSelected={selectedAgent === agent.name}
                onClick={() => setSelectedAgent(agent.name)}
              />
            ))}
          </div>

          {/* Detail pane */}
          {activeAgent && (
            <div className="mt-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-5">
              {/* Pane header */}
              <div className="mb-4 flex items-center gap-2.5 border-b border-white/[0.05] pb-3.5">
                <span className="text-sm">{activeAgent.emoji}</span>
                <span className="text-[11px] font-medium text-foreground/80">
                  {activeAgent.label}
                </span>
                <span className="text-white/[0.15]">·</span>
                <div className="flex items-center gap-1.5">
                  <StatusDot status={activeAgent.status} />
                  <span className="text-[10px] text-white/35">
                    {statusLabel(activeAgent.status)}
                    {activeAgent.status === "done" &&
                      activeAgent.startedAt &&
                      activeAgent.completedAt &&
                      ` · ${formatDuration(activeAgent.startedAt, activeAgent.completedAt)}`}
                  </span>
                </div>
              </div>

              <AgentDetailPane agent={activeAgent} />
            </div>
          )}
        </section>

        {/* ── Synthesizer ──────────────────────────────────────────────────── */}
        <section className="mb-8">
          <div className="mb-3">
            <h2 className="text-[10px] font-medium uppercase tracking-widest text-white/25">
              Synthesizer
            </h2>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm">
                🧠
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-foreground/80">Content Synthesis</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <StatusDot status={run.synthesizer.status} />
                  <span className="text-[10px] text-white/35">
                    {run.synthesizer.status === "pending" && !allAgentsDone && "Waiting for agents"}
                    {run.synthesizer.status === "pending" && allAgentsDone && "Starting…"}
                    {run.synthesizer.status === "running" && "Writing blog post, thread, and HN post…"}
                    {run.synthesizer.status === "done" && "Content ready"}
                    {run.synthesizer.status === "error" && "Synthesis failed"}
                  </span>
                </div>
              </div>
              {run.synthesizer.status === "running" && (
                <div className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border border-accent/20 border-t-accent/70" />
              )}
            </div>

            {/* Progress bar */}
            {run.synthesizer.status !== "done" && run.synthesizer.status !== "error" && (
              <div className="mt-3 h-px overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    run.synthesizer.status === "running" ? "bg-accent/60" : "bg-white/10"
                  }`}
                  style={{
                    width:
                      run.synthesizer.status === "running"
                        ? "66%"
                        : `${(agentsDone / agents.length) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Published badges ─────────────────────────────────────────────── */}
        {(run.devtoUrl || run.slackPosted) && (
          <div className="mb-8 flex items-center gap-2">
            {run.devtoUrl && (
              <a
                href={run.devtoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-success/[0.07] px-3 py-1.5 text-[10px] font-medium text-success/80 transition-colors hover:bg-success/10"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Published to dev.to
              </a>
            )}
            {run.slackPosted && (
              <span className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[10px] text-white/35">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Notified Slack
              </span>
            )}
          </div>
        )}

        {/* ── Generated Content ─────────────────────────────────────────────── */}
        {run.synthesizer.status === "done" && run.synthesizer.blogPost && (
          <section>
            <div className="mb-3">
              <h2 className="text-[10px] font-medium uppercase tracking-widest text-white/25">
                Generated Content
              </h2>
            </div>

            {/* Tab bar */}
            <div className="flex gap-0 border-b border-white/[0.06]">
              {contentTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`relative pb-2.5 pr-5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                    activeTab === t.key
                      ? "text-foreground"
                      : "text-white/30 hover:text-white/60"
                  }`}
                >
                  {t.label}
                  {activeTab === t.key && (
                    <span className="absolute bottom-0 left-0 right-5 h-px bg-foreground/60" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="mt-0 rounded-b-xl border border-t-0 border-white/[0.06] bg-white/[0.025] p-5">
              {activeTab === "blog" && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold text-foreground">
                    {run.synthesizer.blogPost.title}
                  </h2>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {run.synthesizer.blogPost.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/40"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-white/60">
                      {run.synthesizer.blogPost.body}
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "thread" && (
                <div className="space-y-2">
                  {run.synthesizer.twitterThread.map((tweet, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-mono text-[9px] text-white/20">
                          {i + 1}/{run.synthesizer.twitterThread.length}
                        </span>
                        <span
                          className={`font-mono text-[9px] ${
                            tweet.length > 280 ? "text-danger/70" : "text-white/20"
                          }`}
                        >
                          {tweet.length}/280
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-white/70">{tweet}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "hn" && run.synthesizer.hnPost && (
                <div>
                  <div className="mb-3">
                    <span className="mb-1.5 block text-[9px] uppercase tracking-widest text-white/25">
                      Title
                    </span>
                    <p className="text-[11px] font-medium text-foreground/80">
                      {run.synthesizer.hnPost.title}
                    </p>
                  </div>
                  <div>
                    <span className="mb-1.5 block text-[9px] uppercase tracking-widest text-white/25">
                      Text
                    </span>
                    <p className="text-[11px] leading-relaxed text-white/60">
                      {run.synthesizer.hnPost.text}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
