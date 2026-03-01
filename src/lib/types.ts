import type { ReasoningNode } from "subconscious";

export type { ReasoningNode };

export type AgentStatus = "pending" | "running" | "done" | "error";

export type AgentName =
  | "problem_hunter"
  | "prior_art"
  | "community_finder"
  | "technical_explainer"
  | "timing_analyst";

export interface AgentResult {
  name: AgentName;
  label: string;
  emoji: string;
  status: AgentStatus;
  output: string | null;
  reasoning: ReasoningNode | null;
  streamingOutput: string;
  startedAt: number | null;
  completedAt: number | null;
}

export interface SynthesizerResult {
  status: AgentStatus;
  blogPost: {
    title: string;
    body: string;
    tags: string[];
  } | null;
  twitterThread: string[];
  hnPost: {
    title: string;
    text: string;
  } | null;
  startedAt: number | null;
  completedAt: number | null;
}

export interface Run {
  id: string;
  createdAt: number;
  prTitle: string;
  prUrl: string;
  repoName: string;
  prBody: string;
  diff: string;
  agents: Record<AgentName, AgentResult>;
  synthesizer: SynthesizerResult;
  devtoUrl: string | null;
  slackPosted: boolean;
}
