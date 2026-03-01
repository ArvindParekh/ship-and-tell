"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SAMPLE_PR = {
  prTitle:
    "fix: reduce scheduler latency by switching to event-driven pod assignment",
  prUrl: "https://github.com/yourusername/your-repo/pull/1",
  repoName: "yourusername/your-repo",
  prBody:
    "This PR replaces the polling-based scheduler with an event-driven approach, reducing average scheduling latency from 800ms to 120ms under load.",
  diffUrl: "https://github.com/yourusername/your-repo/pull/1.diff",
};

export function SimulateMergeButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(SAMPLE_PR),
      });
      const data = await res.json();
      if (data.runId) {
        router.push(`/run/${data.runId}`);
      }
    } catch (err) {
      console.error("Trigger failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-xl border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
    >
      {loading ? "Triggering..." : "Simulate Merge"}
    </button>
  );
}
