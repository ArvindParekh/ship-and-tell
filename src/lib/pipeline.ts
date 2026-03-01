import {
  updateAgent,
  updateSynthesizer,
  updateRun,
  getRun,
} from "@/lib/runs";
import {
  runProblemHunter,
  runPriorArt,
  runCommunityFinder,
  runTechnicalExplainer,
  runTimingAnalyst,
  runSynthesizer,
} from "@/lib/agents";
import { postToSlack } from "@/lib/slack";
import type { AgentName } from "@/lib/types";

/**
 * Runs the full agent pipeline for a given run ID.
 * Fires all 5 research agents in parallel, then runs the synthesizer,
 * and posts to Slack with one-click publish buttons.
 *
 * This is intentionally fire-and-forget -- call it without awaiting
 * so the HTTP response returns immediately.
 */
export async function processRun(
  runId: string,
  pr: {
    prTitle: string;
    prUrl: string;
    repoName: string;
    prBody: string;
    diff: string;
  }
) {
  type AgentFn = (onDelta: (text: string) => void) => ReturnType<typeof runProblemHunter>;

  const agentFunctions: Record<AgentName, AgentFn> = {
    problem_hunter: (onDelta) =>
      runProblemHunter(
        { title: pr.prTitle, body: pr.prBody, diff: pr.diff, repoName: pr.repoName },
        onDelta
      ),
    prior_art: (onDelta) =>
      runPriorArt(
        { title: pr.prTitle, body: pr.prBody, repoName: pr.repoName },
        onDelta
      ),
    community_finder: (onDelta) =>
      runCommunityFinder(
        { title: pr.prTitle, body: pr.prBody, repoName: pr.repoName },
        onDelta
      ),
    technical_explainer: (onDelta) =>
      runTechnicalExplainer(
        { title: pr.prTitle, body: pr.prBody, diff: pr.diff, repoName: pr.repoName },
        onDelta
      ),
    timing_analyst: (onDelta) =>
      runTimingAnalyst(
        { title: pr.prTitle, body: pr.prBody, repoName: pr.repoName },
        onDelta
      ),
  };

  // Mark all agents as running
  for (const name of Object.keys(agentFunctions) as AgentName[]) {
    updateAgent(runId, name, { status: "running", startedAt: Date.now() });
  }

  // Fire all 5 agents in parallel
  const agentEntries = Object.entries(agentFunctions) as [AgentName, AgentFn][];
  const results = await Promise.allSettled(
    agentEntries.map(async ([name, fn]) => {
      // onDelta: update streamingOutput incrementally as text arrives
      const onDelta = (accumulated: string) => {
        updateAgent(runId, name, { streamingOutput: accumulated });
      };

      try {
        const { output, reasoning } = await fn(onDelta);
        updateAgent(runId, name, {
          status: "done",
          output,
          reasoning,
          completedAt: Date.now(),
        });
        return { name, output };
      } catch (err) {
        console.error(`Agent ${name} failed:`, err);
        updateAgent(runId, name, {
          status: "error",
          completedAt: Date.now(),
        });
        throw err;
      }
    })
  );

  // Collect successful outputs
  const agentOutputs: Record<string, string> = {};
  for (const result of results) {
    if (result.status === "fulfilled") {
      agentOutputs[result.value.name] = result.value.output;
    }
  }

  // Run synthesizer
  updateSynthesizer(runId, { status: "running", startedAt: Date.now() });

  try {
    const synthesized = await runSynthesizer(
      {
        title: pr.prTitle,
        body: pr.prBody,
        repoName: pr.repoName,
        prUrl: pr.prUrl,
      },
      agentOutputs
    );

    updateSynthesizer(runId, {
      status: "done",
      ...synthesized,
      completedAt: Date.now(),
    });

    // Post to Slack with one-click publish buttons (no auto-publish)
    const run = getRun(runId)!;
    const slackMessageTs = await postToSlack(run);
    updateRun(runId, { slackPosted: slackMessageTs !== null, slackMessageTs });
  } catch (err) {
    console.error("Synthesizer error:", err);
    updateSynthesizer(runId, { status: "error", completedAt: Date.now() });
  }
}
