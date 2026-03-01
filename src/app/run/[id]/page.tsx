"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { Run, AgentResult } from "@/lib/types";

export default function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [activeTab, setActiveTab] = useState<"blog" | "thread" | "hn">("blog");

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

        const allDone =
          Object.values(data.agents).every(
            (a) => a.status === "done" || a.status === "error"
          ) &&
          (data.synthesizer.status === "done" ||
            data.synthesizer.status === "error");

        if (!allDone && !cancelled) {
          setTimeout(poll, 2000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!run) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        Loading...
      </div>
    );
  }

  const agents: AgentResult[] = Object.values(run.agents);

  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-white">
      <div className="mx-auto max-w-4xl">
        {/* Back link */}
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          &larr; All runs
        </Link>

        {/* Header */}
        <div className="mb-8">
          <p className="mb-1 text-sm text-zinc-400">{run.repoName}</p>
          <h1 className="text-2xl font-bold">{run.prTitle}</h1>
          <a
            href={run.prUrl}
            className="text-sm text-blue-400 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            View PR on GitHub &rarr;
          </a>
        </div>

        {/* Agent Cards Grid */}
        <div className="mb-8 grid grid-cols-5 gap-3">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className={`rounded-xl border p-4 transition-all duration-500 ${
                agent.status === "done"
                  ? "border-emerald-500 bg-emerald-950/30"
                  : agent.status === "running"
                    ? "animate-pulse border-amber-500 bg-amber-950/30"
                    : agent.status === "error"
                      ? "border-red-500 bg-red-950/30"
                      : "border-zinc-800 bg-zinc-900/30"
              }`}
            >
              <div className="mb-2 text-2xl">{agent.emoji}</div>
              <div className="text-xs font-semibold text-zinc-300">
                {agent.label}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {agent.status === "pending" && "Waiting..."}
                {agent.status === "running" && "Researching..."}
                {agent.status === "done" && "Done"}
                {agent.status === "error" && "Error"}
              </div>
              {agent.status === "done" &&
                agent.completedAt &&
                agent.startedAt && (
                  <div className="mt-1 text-xs text-zinc-600">
                    {((agent.completedAt - agent.startedAt) / 1000).toFixed(1)}s
                  </div>
                )}
            </div>
          ))}
        </div>

        {/* Synthesizer Status */}
        <div
          className={`mb-8 rounded-xl border p-6 transition-all duration-500 ${
            run.synthesizer.status === "done"
              ? "border-purple-500 bg-purple-950/30"
              : run.synthesizer.status === "running"
                ? "animate-pulse border-purple-400 bg-purple-950/20"
                : "border-zinc-800 bg-zinc-900/30"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{"\u{1F9E0}"}</span>
            <div>
              <div className="font-semibold">Synthesizer</div>
              <div className="text-sm text-zinc-400">
                {run.synthesizer.status === "pending" &&
                  "Waiting for all agents to finish..."}
                {run.synthesizer.status === "running" &&
                  "Writing blog post, thread, and HN post..."}
                {run.synthesizer.status === "done" && "Content ready"}
                {run.synthesizer.status === "error" && "Synthesis failed"}
              </div>
            </div>
          </div>
        </div>

        {/* Published links */}
        {run.devtoUrl && (
          <div className="mb-8 flex gap-4">
            <a
              href={run.devtoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Read on dev.to &rarr;
            </a>
            {run.slackPosted && (
              <span className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300">
                Posted to Slack
              </span>
            )}
          </div>
        )}

        {/* Content tabs */}
        {run.synthesizer.status === "done" && run.synthesizer.blogPost && (
          <div>
            <div className="mb-4 flex gap-2">
              {(["blog", "thread", "hn"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "bg-white text-black"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {tab === "blog"
                    ? "Blog Post"
                    : tab === "thread"
                      ? "Thread"
                      : "HN Post"}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              {activeTab === "blog" && (
                <div>
                  <h2 className="mb-4 text-xl font-bold">
                    {run.synthesizer.blogPost.title}
                  </h2>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
                    {run.synthesizer.blogPost.body}
                  </pre>
                  <div className="mt-4 flex gap-2">
                    {run.synthesizer.blogPost.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "thread" && (
                <div className="space-y-4">
                  {run.synthesizer.twitterThread.map((tweet, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-zinc-700 p-4"
                    >
                      <div className="mb-2 text-xs text-zinc-500">
                        Tweet {i + 1}/{run.synthesizer.twitterThread.length}
                      </div>
                      <p className="text-zinc-200">{tweet}</p>
                      <div className="mt-2 text-xs text-zinc-600">
                        {tweet.length}/280 chars
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "hn" && run.synthesizer.hnPost && (
                <div>
                  <div className="mb-1 text-xs text-zinc-500">Title</div>
                  <p className="mb-4 text-lg font-semibold">
                    {run.synthesizer.hnPost.title}
                  </p>
                  <div className="mb-1 text-xs text-zinc-500">Text</div>
                  <p className="leading-relaxed text-zinc-300">
                    {run.synthesizer.hnPost.text}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
