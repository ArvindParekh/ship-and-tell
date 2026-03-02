/**
 * The SDK types say ReasoningNode is { title, thought, tooluse: unknown[], subtask: ReasoningNode[], conclusion }
 * but at runtime the shape differs:
 *   - `reasoning` from run.result is an ARRAY of nodes, not a single node
 *   - `tooluse` is a single object { tool_name, parameters, tool_result }, not an array
 *   - `subtask` may or may not be present
 *
 * We define our own flexible type to handle whatever the API actually sends.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReasoningData = any;

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
  reasoning: ReasoningData | null;
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
  slackMessageTs: string | null;
}
