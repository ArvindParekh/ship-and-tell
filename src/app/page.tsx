import Link from "next/link";

import { getAllRuns } from "@/lib/runs";
import type { Run } from "@/lib/types";
import { SimulateMergeButton } from "@/components/simulate-merge-button";

export const dynamic = "force-dynamic";

function StatusDot({ run }: { run: Run }) {
  const allDone =
    Object.values(run.agents).every((a) => a.status === "done") &&
    run.synthesizer.status === "done";
  const hasError =
    Object.values(run.agents).some((a) => a.status === "error") ||
    run.synthesizer.status === "error";

  if (hasError) {
    return (
      <span className="flex items-center gap-2 text-xs text-danger">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
        Failed
      </span>
    );
  }
  if (allDone) {
    return (
      <span className="flex items-center gap-2 text-xs text-success">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
        Complete
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-warning">
      <span className="inline-block h-1.5 w-1.5 animate-subtle-pulse rounded-full bg-warning" />
      Running
    </span>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function AgentProgress({ run }: { run: Run }) {
  const agents = Object.values(run.agents);
  const done = agents.filter((a) => a.status === "done").length;
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {done}/{agents.length}
    </span>
  );
}

export default function DashboardPage() {
  const runs = getAllRuns();

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10">
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
            </div>
            <span className="text-sm font-medium tracking-tight text-foreground">
              Ship and Tell
            </span>
          </div>
          <SimulateMergeButton />
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-sm font-medium text-muted-foreground">Runs</h1>
        </div>

        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border py-20">
            <div className="mb-3 h-8 w-8 rounded-full border border-border" />
            <p className="text-sm text-muted-foreground">
              No runs yet. Merge a PR or simulate one to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_80px_80px] gap-4 border-b border-border bg-surface px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>PR</span>
              <span>Status</span>
              <span className="text-right">Agents</span>
              <span className="text-right">Time</span>
            </div>

            {/* Rows */}
            {runs.map((run, i) => (
              <Link key={run.id} href={`/run/${run.id}`}>
                <div
                  className={`grid grid-cols-[1fr_120px_80px_80px] gap-4 px-4 py-3 transition-colors hover:bg-surface-hover ${
                    i < runs.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {run.prTitle}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {run.repoName}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <StatusDot run={run} />
                  </div>
                  <div className="flex items-center justify-end">
                    <AgentProgress run={run} />
                  </div>
                  <div className="flex items-center justify-end">
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatTime(run.createdAt)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
