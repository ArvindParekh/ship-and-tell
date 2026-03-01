import Link from "next/link";

import { getAllRuns } from "@/lib/runs";
import type { Run } from "@/lib/types";
import { SimulateMergeButton } from "@/components/simulate-merge-button";

export const dynamic = "force-dynamic";

function StatusBadge({ run }: { run: Run }) {
  const allDone =
    Object.values(run.agents).every((a) => a.status === "done") &&
    run.synthesizer.status === "done";
  const hasError =
    Object.values(run.agents).some((a) => a.status === "error") ||
    run.synthesizer.status === "error";

  if (hasError) return <span className="text-sm text-red-400">Error</span>;
  if (allDone)
    return <span className="text-sm text-emerald-400">Done</span>;
  return (
    <span className="animate-pulse text-sm text-amber-400">Running...</span>
  );
}

export default function DashboardPage() {
  const runs = getAllRuns();

  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold">Ship and Tell</h1>
            <p className="text-zinc-400">
              Auto-publishes content every time a PR merges.
            </p>
          </div>
          <SimulateMergeButton />
        </div>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 p-12 text-center text-zinc-500">
            Waiting for a PR to merge...
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <Link key={run.id} href={`/run/${run.id}`}>
                <div className="cursor-pointer rounded-xl border border-zinc-800 p-6 transition-colors hover:border-zinc-600">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-lg font-semibold">{run.prTitle}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {run.repoName}
                      </p>
                    </div>
                    <StatusBadge run={run} />
                  </div>
                  {run.devtoUrl && (
                    <p className="mt-3 text-sm text-emerald-400">
                      Published to dev.to
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
