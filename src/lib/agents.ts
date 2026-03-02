import { Subconscious } from "subconscious";

import type { PlatformTool, RunStream } from "subconscious";

import type { ReasoningData } from "@/lib/types";

const client = new Subconscious({ apiKey: process.env.SUBCONSCIOUS_API_KEY! });

// --- Shared tool definitions ---

const WEB_SEARCH: PlatformTool = { type: "platform", id: "web_search", options: {} };
const FAST_SEARCH: PlatformTool = { type: "platform", id: "fast_search", options: {} };

// --- Shared stream runner ---

type AgentOutput = { output: string; reasoning: ReasoningData | null };

async function runStreaming(
  stream: RunStream,
  onDelta?: (accumulated: string) => void
): Promise<AgentOutput> {
  let accumulated = "";
  let next = await stream.next();

  while (!next.done) {
    const event = next.value;
    if (event.type === "delta") {
      accumulated += event.content;
      onDelta?.(accumulated);
    } else if (event.type === "error") {
      throw new Error(event.message);
    }
    next = await stream.next();
  }

  const run = next.value;
  return {
    output: accumulated || run?.result?.answer || "No output",
    reasoning: run?.result?.reasoning ?? null,
  };
}

// --- Agent 1: Problem Hunter ---

export async function runProblemHunter(
  pr: { title: string; body: string; diff: string; repoName: string },
  onDelta?: (accumulated: string) => void
): Promise<AgentOutput> {
  const stream = client.stream({
    engine: "tim-gpt",
    input: {
      instructions: `
You are the Problem Hunter. Be FAST and BRIEF. Do ONE quick search, then answer.

**Repo:** ${pr.repoName} | **Title:** ${pr.title}
**Description:** ${pr.body}

Do one web search about the problem this PR solves. Then return ONLY:
- **Problem** (1 sentence)
- **Who feels it** (1 sentence)
- **One real quote or paraphrase** from your search (with URL)
- **Scale** (1 sentence)

Keep total output under 150 words. Be concrete, not generic.
      `.trim(),
      tools: [FAST_SEARCH],
    },
  });
  return runStreaming(stream, onDelta);
}

// --- Agent 2: Prior Art Archaeologist ---

export async function runPriorArt(
  pr: { title: string; body: string; repoName: string },
  onDelta?: (accumulated: string) => void
): Promise<AgentOutput> {
  const stream = client.stream({
    engine: "tim-gpt",
    input: {
      instructions: `
You are the Prior Art Archaeologist. Be FAST and BRIEF. Do ONE quick search, then answer.

**Repo:** ${pr.repoName} | **Title:** ${pr.title}
**Description:** ${pr.body}

Do one web search for prior solutions to this problem. Then return ONLY:
- **History** (1 sentence -- how long has this been an issue?)
- **1-2 prior approaches** (name + why they fell short, 1 sentence each)
- **Key insight of this PR** (1 sentence)

Keep total output under 120 words.
      `.trim(),
      tools: [FAST_SEARCH],
    },
  });
  return runStreaming(stream, onDelta);
}

// --- Agent 3: Community Finder ---

export async function runCommunityFinder(
  pr: { title: string; body: string; repoName: string },
  onDelta?: (accumulated: string) => void
): Promise<AgentOutput> {
  const stream = client.stream({
    engine: "tim-gpt",
    input: {
      instructions: `
You are the Community Finder. Be FAST and BRIEF. Do ONE quick search, then answer.

**Repo:** ${pr.repoName} | **Title:** ${pr.title}
**Description:** ${pr.body}

Do one web search for communities discussing this domain. Then return ONLY:
- **Top 3 communities** (name + why this PR fits, 1 sentence each)
- **2 Twitter/X accounts** who would care (handle + focus)
- **3 hashtags** that are actually used

Keep total output under 120 words.
      `.trim(),
      tools: [FAST_SEARCH],
    },
  });
  return runStreaming(stream, onDelta);
}

// --- Agent 4: Technical Explainer ---

export async function runTechnicalExplainer(
  pr: { title: string; body: string; diff: string; repoName: string },
  onDelta?: (accumulated: string) => void
): Promise<AgentOutput> {
  const stream = client.stream({
    engine: "tim-gpt",
    input: {
      instructions: `
You are the Technical Explainer. Be FAST and BRIEF. Do ONE quick search, then answer.

**Repo:** ${pr.repoName} | **Title:** ${pr.title}
**Description:** ${pr.body}
**Diff (truncated):**
\`\`\`
${pr.diff}
\`\`\`

Do one search about the main technical pattern used. Then return ONLY:
- **Core decision** (1 sentence)
- **How it works** (2-3 sentences, plain English)
- **Key tradeoff** (1 sentence)
- **One reference link**

Keep total output under 120 words.
      `.trim(),
      tools: [WEB_SEARCH],
    },
  });
  return runStreaming(stream, onDelta);
}

// --- Agent 5: Timing Analyst ---

export async function runTimingAnalyst(
  pr: { title: string; body: string; repoName: string },
  onDelta?: (accumulated: string) => void
): Promise<AgentOutput> {
  const stream = client.stream({
    engine: "tim-gpt",
    input: {
      instructions: `
You are the Timing Analyst. Be FAST and BRIEF. Do ONE quick search, then answer.

**Repo:** ${pr.repoName} | **Title:** ${pr.title}
**Description:** ${pr.body}

Do one search for recent news in this domain. Then return ONLY:
- **Timing hook** (1 punchy sentence: "This lands the same week that X happened")
- **1-2 recent developments** (1 sentence each)
- **Why now** (2 sentences max)

Keep total output under 100 words.
      `.trim(),
      tools: [FAST_SEARCH],
    },
  });
  return runStreaming(stream, onDelta);
}

// --- Synthesizer ---

export async function runSynthesizer(
  prContext: { title: string; body: string; repoName: string; prUrl: string },
  agentOutputs: Record<string, string>
): Promise<{
  blogPost: { title: string; body: string; tags: string[] };
  twitterThread: string[];
  hnPost: { title: string; text: string };
}> {
  const cap = (s: string) => (s.length > 1500 ? s.slice(0, 1500) + "\n[truncated]" : s);

  const run = await client.run({
    engine: "tim-gpt",
    input: {
      instructions: `
You are a writing synthesizer. Write SHORT content from these agent reports about a PR.

**Repo:** ${prContext.repoName} | **Title:** ${prContext.title}
**Description:** ${prContext.body} | **URL:** ${prContext.prUrl}

## Agent Research
**Problem Hunter:** ${cap(agentOutputs.problem_hunter ?? "")}
**Prior Art:** ${cap(agentOutputs.prior_art ?? "")}
**Community Finder:** ${cap(agentOutputs.community_finder ?? "")}
**Technical Explainer:** ${cap(agentOutputs.technical_explainer ?? "")}
**Timing Analyst:** ${cap(agentOutputs.timing_analyst ?? "")}

## Rules
- Blog post: 150-200 words MAX. Lead with the problem. Short sentences. No filler.
- Twitter thread: 3 tweets only (hook, insight, link). Each under 280 chars.
- HN post: 2-3 sentences plain text. No hype.

Respond with ONLY valid JSON, no markdown fences:
{
  "blogPost": { "title": "string", "body": "string -- markdown, 150-200 words", "tags": ["string","string","string","string"] },
  "twitterThread": ["tweet 1","tweet 2","tweet 3"],
  "hnPost": { "title": "string -- under 80 chars", "text": "string -- 2-3 sentences" }
}
      `.trim(),
      tools: [],
    },
    options: { awaitCompletion: true },
  });

  const raw = run.result?.answer ?? "{}";
  const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean);
}
