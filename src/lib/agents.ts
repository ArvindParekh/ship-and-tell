import { Subconscious } from "subconscious";

import type { PlatformTool, ReasoningNode, RunStream } from "subconscious";

const client = new Subconscious({ apiKey: process.env.SUBCONSCIOUS_API_KEY! });

// --- Shared tool definitions ---

const TWEET_SEARCH: PlatformTool = { type: "platform", id: "tweet_search", options: {} };
const WEB_SEARCH: PlatformTool = { type: "platform", id: "web_search", options: {} };
const RESEARCH_PAPER: PlatformTool = { type: "platform", id: "research_paper_search", options: {} };
const NEWS_SEARCH: PlatformTool = { type: "platform", id: "news_search", options: {} };
const FIND_SIMILAR: PlatformTool = { type: "platform", id: "find_similar", options: {} };
const FRESH_SEARCH: PlatformTool = { type: "platform", id: "fresh_search", options: {} };
const PAGE_READER: PlatformTool = { type: "platform", id: "page_reader", options: {} };
const GOOGLE_SEARCH: PlatformTool = { type: "platform", id: "google_search", options: {} };
const FAST_SEARCH: PlatformTool = { type: "platform", id: "fast_search", options: {} };

// --- Shared stream runner ---
// Manually iterates the async generator to capture the Run return value
// (for-await discards the generator's return value, so we need manual iteration)

type AgentOutput = { output: string; reasoning: ReasoningNode | null };

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

  // next.value is Run | undefined (the generator's return value)
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
You are the Problem Hunter. Your only job is to find evidence of REAL PAIN that the following pull request solves.

## The Pull Request
**Repo:** ${pr.repoName}
**Title:** ${pr.title}
**Description:** ${pr.body}
**Diff (truncated):**
\`\`\`
${pr.diff}
\`\`\`

## Your Task
1. Understand the core problem this PR addresses. Be specific -- not "improves performance" but "reduces cold start latency on Kubernetes pod scheduling."
2. Search Twitter/X for engineers complaining about this exact problem. Find real quotes, real frustration, real context.
3. Search the web for Stack Overflow threads, GitHub issues, forum posts, or blog posts where people have hit this problem.
4. Find the LANGUAGE real users use to describe this pain. Not technical jargon from docs -- the frustrated language of someone who just spent 4 hours debugging.

## Output Format
Return a structured report with:
- **Core problem in one sentence** (be specific and concrete)
- **Who feels this pain** (job titles, contexts, project types)
- **3-5 real quotes or paraphrases** from your search showing people describing this problem (include source URLs)
- **The emotional language people use** (frustrated words, metaphors, curses -- the authentic voice of the pain)
- **Scale of the problem** (how many people hit this? any metrics?)

Be specific. Be concrete. Do not generalize. Real quotes over summaries.
      `.trim(),
      tools: [TWEET_SEARCH, WEB_SEARCH, GOOGLE_SEARCH],
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
You are the Prior Art Archaeologist. Your job is to find the history of attempts to solve the problem addressed by this pull request -- what existed before, what failed, and why this approach is different.

## The Pull Request
**Repo:** ${pr.repoName}
**Title:** ${pr.title}
**Description:** ${pr.body}

## Your Task
1. Identify the core technical or product problem this PR addresses.
2. Search for prior solutions: older libraries, deprecated approaches, previous GitHub issues marked "wontfix," previous PRs that tried and failed, blog posts from 2-5 years ago describing workarounds.
3. Search for academic papers or technical reports that relate to this problem domain.
4. Understand WHY existing solutions were insufficient -- what constraint did they hit?

## Output Format
Return:
- **The problem's history** -- how long has this been a known issue? (even if no prior art: say "first real solution")
- **2-4 prior approaches** with name, what they tried, and why they fell short
- **Any academic or research context** (papers, RFCs, design docs) -- even tangential is useful
- **The key insight this PR has** that prior approaches missed
- **A "before vs after" framing** in one paragraph -- what was life like before this? What changes?

Be historically accurate. Do not make up prior art. If there is none, say so honestly and focus on the "first real solution" angle.
      `.trim(),
      tools: [WEB_SEARCH, RESEARCH_PAPER, GOOGLE_SEARCH],
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
You are the Community Finder. Your job is to find the specific online communities, subreddits, Discord servers, newsletters, and Twitter/X accounts where this pull request would be relevant and celebrated.

## The Pull Request
**Repo:** ${pr.repoName}
**Title:** ${pr.title}
**Description:** ${pr.body}

## Your Task
1. Understand the technical domain of this PR (e.g., Kubernetes, React, Rust, ML infrastructure, etc.)
2. Find the active online communities discussing this domain right now -- not just the obvious ones (e.g., not just r/programming for a Go project).
3. Find the specific Twitter/X accounts and influencers who cover this exact topic and have engaged audiences.
4. Find newsletters or publications that cover this area.
5. Identify the best framing for each community -- how would you introduce this PR to each one differently?

## Output Format
Return:
- **Top 3-5 communities** with name, URL if available, audience size estimate, and why this PR fits there
- **Top 3-5 Twitter/X accounts** who would care, with handle and their audience focus
- **1-2 newsletters** in this space
- **Community-specific framing** -- one sentence that would work as a submission title for each community
- **Hashtags** that are actually used (not generic -- search to verify they're real and active)
      `.trim(),
      tools: [TWEET_SEARCH, FIND_SIMILAR, NEWS_SEARCH, GOOGLE_SEARCH],
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
You are the Technical Explainer. Your job is to understand exactly what this PR does technically and explain it at two levels: to a senior engineer and to a curious intermediate engineer.

## The Pull Request
**Repo:** ${pr.repoName}
**Title:** ${pr.title}
**Description:** ${pr.body}
**Diff (truncated):**
\`\`\`
${pr.diff}
\`\`\`

## Your Task
1. Read the diff carefully. Understand the design pattern being used or changed.
2. Identify the key technical decision made (e.g., "switched from polling to event-driven", "replaced O(n^2) lookup with hashmap", "moved side effects out of the render cycle").
3. Search for documentation or blog posts that explain this design pattern in depth so you can reference them.
4. Identify the tradeoffs -- what does this approach give up to gain what it gains?
5. Find a good analogy or mental model that makes this click for someone who hasn't encountered it.

## Output Format
Return:
- **The core technical decision in one sentence** (precise, no filler)
- **ELI-senior-engineer explanation** (2-3 paragraphs, can use jargon, focus on the interesting design decision)
- **ELI-intermediate explanation** (1-2 paragraphs, use an analogy, avoid unexplained jargon)
- **The key tradeoff** -- what did this sacrifice? What did it gain?
- **The interesting insight** -- what's the non-obvious thing a reader should walk away understanding?
- **2-3 reference links** for further reading on the patterns used
      `.trim(),
      tools: [WEB_SEARCH, PAGE_READER, GOOGLE_SEARCH, FAST_SEARCH],
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
You are the Timing Analyst. Your job is to answer one question: why does this PR matter RIGHT NOW specifically, in this exact week and month?

## The Pull Request
**Repo:** ${pr.repoName}
**Title:** ${pr.title}
**Description:** ${pr.body}

## Your Task
1. Search for recent news (last 7 days) in the technical domain this PR touches.
2. Search for recent announcements, releases, or controversies that make this PR more timely.
3. Find if any major companies just shipped something that creates new demand for what this PR solves.
4. Find if there's a conference, RFC deadline, or community event happening soon that makes this timing perfect.
5. Find what the current discourse is in this domain -- what are people arguing about? Does this PR take a side?

## Output Format
Return:
- **The timing hook** -- one punchy sentence: "This lands the same week that X happened"
- **Recent context** (2-3 developments from the last 7-30 days that make this relevant)
- **The trend this PR is part of** -- is this the 3rd PR this month solving similar things? Is there a movement?
- **What's coming** -- any upcoming events, deadlines, or releases that make this even more timely?
- **The "why now" paragraph** -- 3-4 sentences that could be the opening of a blog post explaining why this is the perfect moment for this PR
      `.trim(),
      tools: [FRESH_SEARCH, NEWS_SEARCH, TWEET_SEARCH],
    },
  });
  return runStreaming(stream, onDelta);
}

// --- Synthesizer ---

// IMPORTANT: Replace the WRITING_STYLE_EXAMPLES with 2-3 real paragraphs from
// your actual blog posts or tweets BEFORE the demo. This is what makes the
// output sound like you and not like generic AI content.

const WRITING_STYLE_EXAMPLES = `
--- EXAMPLE 1 (from a past blog post) ---
[REPLACE THIS: paste a real paragraph from one of your blog posts]

--- EXAMPLE 2 (from a past blog post) ---
[REPLACE THIS: paste another real paragraph]

--- EXAMPLE 3 (from a tweet thread) ---
[REPLACE THIS: paste a tweet thread you wrote that you're proud of]
`;

export async function runSynthesizer(
  prContext: { title: string; body: string; repoName: string; prUrl: string },
  agentOutputs: Record<string, string>
): Promise<{
  blogPost: { title: string; body: string; tags: string[] };
  twitterThread: string[];
  hnPost: { title: string; text: string };
}> {
  const run = await client.run({
    engine: "tim-gpt",
    input: {
      instructions: `
You are a writing synthesizer. You have received research from 5 independent agents about a GitHub pull request. Your job is to write three pieces of content that will be published immediately after a PR is merged.

## The Pull Request
**Repo:** ${prContext.repoName}
**Title:** ${prContext.title}
**Description:** ${prContext.body}
**URL:** ${prContext.prUrl}

## Research from 5 Independent Agents

### Agent 1 -- Problem Hunter (real pain, real quotes)
${agentOutputs.problem_hunter}

### Agent 2 -- Prior Art Archaeologist (history, what failed before)
${agentOutputs.prior_art}

### Agent 3 -- Community Finder (where to share, how to frame)
${agentOutputs.community_finder}

### Agent 4 -- Technical Explainer (what it does, the insight)
${agentOutputs.technical_explainer}

### Agent 5 -- Timing Analyst (why now, recent context)
${agentOutputs.timing_analyst}

## Author's Writing Style
Study these examples carefully. Your output must sound like this author wrote it -- not like generic AI content.

${WRITING_STYLE_EXAMPLES}

## Rules
- Never start a blog post with "I'm excited to share" or "Today I want to talk about"
- Never use the phrase "In conclusion" or "In summary"
- Lead with the problem or the tension, not the solution
- Short sentences. Active voice. No filler.
- The blog post should read like a senior engineer thinking out loud, not a technical writer polishing a doc
- Twitter thread: tweet 1 is the hook (no "thread" cliche), each tweet stands alone, last tweet has the PR link
- HN post: plain, no hype, assumes technical reader, leads with what it does not why it's cool

## Required Output Format
You MUST respond with ONLY valid JSON, no markdown fences, no preamble. Exactly this structure:

{
  "blogPost": {
    "title": "string -- punchy, specific, no clickbait",
    "body": "string -- full blog post in markdown, 400-600 words",
    "tags": ["string", "string", "string", "string"]
  },
  "twitterThread": [
    "tweet 1 (hook, under 280 chars)",
    "tweet 2 (the problem context, under 280 chars)",
    "tweet 3 (what changed / the insight, under 280 chars)",
    "tweet 4 (technical detail for engineers, under 280 chars)",
    "tweet 5 (link + CTA, under 280 chars)"
  ],
  "hnPost": {
    "title": "string -- HN-appropriate title, factual, under 80 chars",
    "text": "string -- plain text, 100-150 words, no markdown"
  }
}
      `.trim(),
      tools: [],
    },
    options: { awaitCompletion: true },
  });

  const raw = run.result?.answer ?? "{}";
  // Strip any accidental markdown fences before parsing
  const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean);
}
