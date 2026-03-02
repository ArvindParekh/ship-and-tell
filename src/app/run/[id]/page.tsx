"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import type { Run, AgentResult } from "@/lib/types";
import { ReasoningTree } from "@/components/reasoning-tree";

// ---- Tiny helpers ----

function statusLabel(status: string): string {
  if (status === "done") return "Complete";
  if (status === "running") return "Running";
  if (status === "error") return "Failed";
  return "Pending";
}

function formatDuration(start: number | null, end: number | null): string {
  if (!start || !end) return "";
  return `${((end - start) / 1000).toFixed(1)}s`;
}

// ---- Status dot ----

function StatusDot({ status }: { status: string }) {
  if (status === "done") {
    return <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success" />;
  }
  if (status === "running") {
    return (
      <span className="inline-block h-1.5 w-1.5 flex-shrink-0 animate-subtle-pulse rounded-full bg-warning" />
    );
  }
  if (status === "error") {
    return <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-danger" />;
  }
  return (
    <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/20" />
  );
}

// ---- Live streaming text with blinking cursor ----

function StreamingText({ text }: { text: string }) {
  return (
    <span className="text-xs leading-relaxed text-muted-foreground">
      {text}
      <span className="ml-0.5 inline-block h-3 w-px animate-subtle-pulse bg-muted-foreground/60" />
    </span>
  );
}

// ---- Agent detail pane ----

function AgentDetailPane({ agent }: { agent: AgentResult }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showReasoning, setShowReasoning] = useState(false);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (agent.status === "running" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agent.streamingOutput, agent.status]);

  if (agent.status === "pending") {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground/40">
        Waiting for other agents to start...
      </div>
    );
  }

  if (agent.status === "error") {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="text-xs text-danger">Agent failed to complete.</span>
      </div>
    );
  }

  if (agent.status === "running") {
    return (
      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto pr-1"
      >
        {agent.streamingOutput ? (
          <StreamingText text={agent.streamingOutput} />
        ) : (
          <span className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <span className="h-3 w-3 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/60" />
            Starting research...
          </span>
        )}
      </div>
    );
  }

  // Status === "done"
  return (
    <div>
      {/* Output */}
      <div className="mb-4 max-h-64 overflow-y-auto pr-1">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {agent.output ?? ""}
        </p>
      </div>

      {/* Reasoning toggle */}
      {agent.reasoning && (
        <div>
          <button
            onClick={() => setShowReasoning((v) => !v)}
            className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              className={`transition-transform ${showReasoning ? "rotate-90" : ""}`}
            >
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reasoning trace
          </button>

          {showReasoning && (
            <div className="rounded-lg border border-border bg-background/30 px-4 py-3">
              <ReasoningTree data={agent.reasoning} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main page ----

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

  // Poll every 2 seconds until everything is done
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

        // Auto-select first running or first agent
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
          (data.synthesizer.status === "done" ||
            data.synthesizer.status === "error");

        if (!allDone && !cancelled) {
          setTimeout(poll, 1500);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 1500);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [runId]);

  if (!run) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground" />
          Loading run...
        </div>
      </div>
    );
  }

  const agents: AgentResult[] = Object.values(run.agents);
  const agentsDone = agents.filter((a) => a.status === "done").length;
  const allAgentsDone = agents.every(
    (a) => a.status === "done" || a.status === "error"
  );
  const activeAgent = agents.find((a) => a.name === selectedAgent) ?? agents[0];

  const tabs = [
    { key: "blog" as const, label: "Blog Post" },
    { key: "thread" as const, label: "Thread" },
    { key: "hn" as const, label: "HN Post" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className="text-accent"
            >
              <path
                d="M8 1L14.5 5v6L8 15 1.5 11V5L8 1z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M8 1v6.5m0 0L1.5 5m6.5 2.5L14.5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            Ship and Tell
          </Link>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-muted-foreground/30"
          >
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="truncate text-sm text-foreground">{run.prTitle}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* PR meta */}
        <div className="mb-8">
          <h1 className="text-base font-medium tracking-tight text-foreground">
            {run.prTitle}
          </h1>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{run.repoName}</span>
            <span className="text-muted-foreground/20">|</span>
            <a
              href={run.prUrl}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              View PR
            </a>
          </div>
        </div>

        {/* ── Research Agents section ── */}
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
              Research Agents
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground/40">
              {agentsDone}/{agents.length}
            </span>
          </div>

          {/* Agent selector tabs */}
          <div className="mb-0 grid grid-cols-5 gap-1.5">
            {agents.map((agent) => {
              const isSelected = selectedAgent === agent.name;
              return (
                <button
                  key={agent.name}
                  onClick={() => setSelectedAgent(agent.name)}
                  className={`group rounded-lg border p-3 text-left transition-all ${
                    isSelected
                      ? "border-border-hover bg-surface-hover"
                      : "border-border bg-surface hover:border-border-hover hover:bg-surface-hover"
                  }`}
                >
                  <div className="mb-2 text-base">{agent.emoji}</div>
                  <div
                    className={`mb-1.5 text-[11px] font-medium leading-tight ${
                      isSelected ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {agent.label}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={agent.status} />
                    <span className="text-[10px] text-muted-foreground/60">
                      {statusLabel(agent.status)}
                    </span>
                  </div>
                  {agent.status === "done" && agent.startedAt && agent.completedAt && (
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground/30">
                      {formatDuration(agent.startedAt, agent.completedAt)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Agent detail pane */}
          {activeAgent && (
            <div className="rounded-b-lg border border-t-0 border-border-hover bg-surface p-5">
              {/* Pane header */}
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm">{activeAgent.emoji}</span>
                <span className="text-xs font-medium text-foreground">
                  {activeAgent.label}
                </span>
                <span className="text-muted-foreground/30">·</span>
                <div className="flex items-center gap-1.5">
                  <StatusDot status={activeAgent.status} />
                  <span className="text-xs text-muted-foreground/60">
                    {statusLabel(activeAgent.status)}
                    {activeAgent.status === "done" && activeAgent.startedAt && activeAgent.completedAt &&
                      ` · ${formatDuration(activeAgent.startedAt, activeAgent.completedAt)}`
                    }
                  </span>
                </div>
              </div>

              <AgentDetailPane agent={activeAgent} />
            </div>
          )}
        </div>

        {/* ── Synthesizer ── */}
        <div className="mb-8">
          <div className="mb-3">
            <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
              Synthesizer
            </h2>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-accent-muted text-sm">
                {"\u{1F9E0}"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground">
                  Content Synthesis
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <StatusDot status={run.synthesizer.status} />
                  <span className="text-[11px] text-muted-foreground">
                    {run.synthesizer.status === "pending" && !allAgentsDone && "Waiting for agents"}
                    {run.synthesizer.status === "pending" && allAgentsDone && "Starting..."}
                    {run.synthesizer.status === "running" && "Writing blog post, thread, and HN post..."}
                    {run.synthesizer.status === "done" && "Content ready"}
                    {run.synthesizer.status === "error" && "Synthesis failed"}
                  </span>
                </div>
              </div>
              {run.synthesizer.status === "running" && (
                <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border border-accent/20 border-t-accent" />
              )}
            </div>

            {/* Progress bar */}
            {run.synthesizer.status !== "done" && run.synthesizer.status !== "error" && (
              <div className="mt-3 h-px overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    run.synthesizer.status === "running"
                      ? "w-2/3 bg-accent"
                      : "bg-muted-foreground/20"
                  }`}
                  style={{
                    width:
                      run.synthesizer.status === "pending"
                        ? `${(agentsDone / agents.length) * 100}%`
                        : undefined,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Published actions */}
        {(run.devtoUrl || run.slackPosted) && (
          <div className="mb-8 flex items-center gap-3">
            {run.devtoUrl && (
              <a
                href={run.devtoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-hover hover:bg-surface-hover"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Published to dev.to
              </a>
            )}
            {run.slackPosted && (
              <span className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Notified Slack
              </span>
            )}
          </div>
        )}

        {/* Content tabs */}
        {run.synthesizer.status === "done" && run.synthesizer.blogPost && (
          <div>
            <div className="mb-3">
              <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Generated Content
              </h2>
            </div>

            {/* Tab bar */}
            <div className="mb-0 flex gap-1 border-b border-border">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-3 pb-2.5 pt-1 text-xs transition-colors ${
                    activeTab === tab.key
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="rounded-b-lg border border-t-0 border-border bg-surface p-5">
              {activeTab === "blog" && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold text-foreground">
                    {run.synthesizer.blogPost.title}
                  </h2>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {run.synthesizer.blogPost.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="max-h-96 overflow-y-auto pr-1">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {run.synthesizer.blogPost.body}
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "thread" && (
                <div className="space-y-2">
                  {run.synthesizer.twitterThread.map((tweet, i) => (
                    <div key={i} className="rounded-md border border-border p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-muted-foreground/40">
                          {i + 1}/{run.synthesizer.twitterThread.length}
                        </span>
                        <span
                          className={`font-mono text-[10px] ${
                            tweet.length > 280 ? "text-danger" : "text-muted-foreground/30"
                          }`}
                        >
                          {tweet.length}/280
                        </span>
                      </div>
                      <p className="text-xs text-foreground">{tweet}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "hn" && run.synthesizer.hnPost && (
                <div>
                  <div className="mb-3">
                    <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground/40">
                      Title
                    </span>
                    <p className="text-xs font-medium text-foreground">
                      {run.synthesizer.hnPost.title}
                    </p>
                  </div>
                  <div>
                    <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground/40">
                      Text
                    </span>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {run.synthesizer.hnPost.text}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
