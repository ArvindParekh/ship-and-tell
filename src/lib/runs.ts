import { v4 as uuid } from "uuid";

import type { Run, AgentName, AgentResult, SynthesizerResult } from "./types";

// Global map -- persists across requests in the same Node.js process
const runs = new Map<string, Run>();

const AGENT_META: Record<AgentName, { label: string; emoji: string }> = {
  problem_hunter: { label: "Problem Hunter", emoji: "\u{1F3AF}" },
  prior_art: { label: "Prior Art", emoji: "\u{1F4DA}" },
  community_finder: { label: "Community Finder", emoji: "\u{1F310}" },
  technical_explainer: { label: "Technical Explainer", emoji: "\u{1F527}" },
  timing_analyst: { label: "Timing Analyst", emoji: "\u{26A1}" },
};

export function createRun(data: {
  prTitle: string;
  prUrl: string;
  repoName: string;
  prBody: string;
  diff: string;
}): Run {
  const id = uuid();
  const agentNames: AgentName[] = [
    "problem_hunter",
    "prior_art",
    "community_finder",
    "technical_explainer",
    "timing_analyst",
  ];

  const agents = Object.fromEntries(
    agentNames.map((name) => [
      name,
      {
        name,
        label: AGENT_META[name].label,
        emoji: AGENT_META[name].emoji,
        status: "pending",
        output: null,
        startedAt: null,
        completedAt: null,
      } as AgentResult,
    ])
  ) as Record<AgentName, AgentResult>;

  const run: Run = {
    id,
    createdAt: Date.now(),
    ...data,
    agents,
    synthesizer: {
      status: "pending",
      blogPost: null,
      twitterThread: [],
      hnPost: null,
      startedAt: null,
      completedAt: null,
    },
    devtoUrl: null,
    slackPosted: false,
  };

  runs.set(id, run);
  return run;
}

export function getRun(id: string): Run | undefined {
  return runs.get(id);
}

export function getAllRuns(): Run[] {
  return Array.from(runs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function updateAgent(
  runId: string,
  agentName: AgentName,
  update: Partial<AgentResult>
) {
  const run = runs.get(runId);
  if (!run) return;
  run.agents[agentName] = { ...run.agents[agentName], ...update };
}

export function updateSynthesizer(
  runId: string,
  update: Partial<SynthesizerResult>
) {
  const run = runs.get(runId);
  if (!run) return;
  run.synthesizer = { ...run.synthesizer, ...update };
}

export function updateRun(runId: string, update: Partial<Run>) {
  const run = runs.get(runId);
  if (!run) return;
  Object.assign(run, update);
}
