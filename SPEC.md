# SHIP AND TELL — Complete Build Spec
> Hackathon project built on Subconscious.dev's agent platform.
> This document is the single source of truth. Read it entirely before writing a single line of code.

---

## What We're Building

A GitHub webhook listener that fires the moment a PR is merged. It spawns 5 independent research agents in parallel using the Subconscious API, each with a distinct mandate and its own search tools. Their outputs are fed to a synthesizer agent that writes a blog post, a Twitter/X thread, and a HN post — in the author's voice. The blog post is auto-published to dev.to. A Slack notification is sent. Everything is visible on a live dashboard that shows each agent's status in real time.

**The demo:** Merge a PR on stage. Show the dashboard. Watch 5 agent cards light up simultaneously. Watch the synthesizer run. See the blog post appear on dev.to. See the Slack message arrive. The whole thing takes under 90 seconds.

**Why this can't be done with a single Claude query:**
1. The 5 agents run in parallel with genuinely isolated contexts — they don't share search results
2. No human triggers it — a GitHub event does
3. It takes actions in the world (publishes to dev.to, posts to Slack)
4. The synthesizer resolves genuine information conflicts between agents that found different things

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | API routes + React frontend in one repo |
| Agent Runtime | Subconscious Node SDK | The hackathon platform |
| Styling | Tailwind CSS | Fast, no config |
| State (run tracking) | In-memory Map (Node.js global) | No DB setup time in a hackathon |
| Publishing | dev.to REST API | Simple API key auth, no OAuth |
| Notifications | Slack Incoming Webhook | No OAuth, just a URL |
| Webhook exposure | ngrok | Expose localhost to GitHub |
| Package manager | npm | Default |

---

## Environment Variables

Create a `.env.local` file in the project root with exactly these keys:

```env
SUBCONSCIOUS_API_KEY=        # From subconscious.dev dashboard
DEVTO_API_KEY=               # From dev.to Settings > Account > API Keys
SLACK_WEBHOOK_URL=           # From Slack App > Incoming Webhooks
GITHUB_WEBHOOK_SECRET=       # Any random string, e.g. "shippingtime2025" — set same value in GitHub webhook settings
NEXT_PUBLIC_BASE_URL=        # http://localhost:3000 in dev, your ngrok URL for demo
```

---

## Project Structure

```
ship-and-tell/
├── app/
│   ├── page.tsx                        # Dashboard — list of runs
│   ├── run/
│   │   └── [id]/
│   │       └── page.tsx               # Live run view — the demo screen
│   └── api/
│       ├── webhook/
│       │   └── github/
│       │       └── route.ts           # GitHub webhook handler
│       ├── trigger/
│       │   └── route.ts               # Manual trigger (POST with PR data) — demo fallback
│       └── run/
│           └── [id]/
│               └── status/
│                   └── route.ts       # Polling endpoint for live dashboard
├── lib/
│   ├── agents.ts                      # All 5 agent definitions + synthesizer
│   ├── runs.ts                        # In-memory run store
│   ├── github.ts                      # GitHub diff fetcher
│   ├── devto.ts                       # dev.to publisher
│   ├── slack.ts                       # Slack notifier
│   └── types.ts                       # All TypeScript types
├── components/
│   ├── AgentCard.tsx                  # Individual agent status card
│   ├── RunDashboard.tsx               # The 5-card live grid
│   └── ContentTabs.tsx                # Blog / Thread / HN tabs
├── .env.local
├── package.json
└── SPEC.md                            # This file
```

---

## Data Types

Define all types in `lib/types.ts` before writing any other code.

```typescript
// lib/types.ts

export type AgentStatus = 'pending' | 'running' | 'done' | 'error'

export type AgentName =
  | 'problem_hunter'
  | 'prior_art'
  | 'community_finder'
  | 'technical_explainer'
  | 'timing_analyst'

export interface AgentResult {
  name: AgentName
  label: string           // Human-readable label for the UI card
  emoji: string           // e.g. "🎯"
  status: AgentStatus
  output: string | null   // Raw string output from the agent
  startedAt: number | null
  completedAt: number | null
}

export interface SynthesizerResult {
  status: AgentStatus
  blogPost: {
    title: string
    body: string          // Markdown
    tags: string[]        // Max 4, dev.to compatible
  } | null
  twitterThread: string[] // Array of tweets, each under 280 chars
  hnPost: {
    title: string
    text: string          // Plain text, ~150 words
  } | null
  startedAt: number | null
  completedAt: number | null
}

export interface Run {
  id: string
  createdAt: number
  prTitle: string
  prUrl: string
  repoName: string
  prBody: string
  diff: string            // Raw diff text, truncated to 4000 chars
  agents: Record<AgentName, AgentResult>
  synthesizer: SynthesizerResult
  devtoUrl: string | null
  slackPosted: boolean
}
```

---

## In-Memory Run Store

```typescript
// lib/runs.ts
import { Run, AgentName, AgentResult, SynthesizerResult } from './types'
import { v4 as uuid } from 'uuid'

// Global map — persists across requests in the same Node.js process
const runs = new Map<string, Run>()

const AGENT_META: Record<AgentName, { label: string; emoji: string }> = {
  problem_hunter:       { label: 'Problem Hunter',      emoji: '🎯' },
  prior_art:            { label: 'Prior Art',            emoji: '📚' },
  community_finder:     { label: 'Community Finder',     emoji: '🌐' },
  technical_explainer:  { label: 'Technical Explainer',  emoji: '🔧' },
  timing_analyst:       { label: 'Timing Analyst',       emoji: '⚡' },
}

export function createRun(data: {
  prTitle: string
  prUrl: string
  repoName: string
  prBody: string
  diff: string
}): Run {
  const id = uuid()
  const agentNames: AgentName[] = [
    'problem_hunter',
    'prior_art',
    'community_finder',
    'technical_explainer',
    'timing_analyst',
  ]

  const agents = Object.fromEntries(
    agentNames.map((name) => [
      name,
      {
        name,
        label: AGENT_META[name].label,
        emoji: AGENT_META[name].emoji,
        status: 'pending',
        output: null,
        startedAt: null,
        completedAt: null,
      } as AgentResult,
    ])
  ) as Record<AgentName, AgentResult>

  const run: Run = {
    id,
    createdAt: Date.now(),
    ...data,
    agents,
    synthesizer: {
      status: 'pending',
      blogPost: null,
      twitterThread: [],
      hnPost: null,
      startedAt: null,
      completedAt: null,
    },
    devtoUrl: null,
    slackPosted: false,
  }

  runs.set(id, run)
  return run
}

export function getRun(id: string): Run | undefined {
  return runs.get(id)
}

export function getAllRuns(): Run[] {
  return Array.from(runs.values()).sort((a, b) => b.createdAt - a.createdAt)
}

export function updateAgent(
  runId: string,
  agentName: AgentName,
  update: Partial<AgentResult>
) {
  const run = runs.get(runId)
  if (!run) return
  run.agents[agentName] = { ...run.agents[agentName], ...update }
}

export function updateSynthesizer(
  runId: string,
  update: Partial<SynthesizerResult>
) {
  const run = runs.get(runId)
  if (!run) return
  run.synthesizer = { ...run.synthesizer, ...update }
}

export function updateRun(runId: string, update: Partial<Run>) {
  const run = runs.get(runId)
  if (!run) return
  Object.assign(run, update)
}
```

---

## GitHub Diff Fetcher

```typescript
// lib/github.ts

export async function fetchPRDiff(diffUrl: string): Promise<string> {
  // diffUrl looks like: https://github.com/owner/repo/pull/123.diff
  const res = await fetch(diffUrl, {
    headers: {
      Accept: 'application/vnd.github.v3.diff',
      // Add GitHub token if repo is private:
      // Authorization: `token ${process.env.GITHUB_TOKEN}`
    },
  })
  if (!res.ok) return 'Diff unavailable'
  const text = await res.text()
  // Truncate — diffs can be huge. 4000 chars is enough for context.
  return text.slice(0, 4000)
}
```

---

## Agent Definitions — THE MOST IMPORTANT FILE

Read every agent prompt carefully. These are what determine output quality. They are written deliberately — do not simplify or shorten them.

```typescript
// lib/agents.ts
import Subconscious from 'subconscious'

const client = new Subconscious({ apiKey: process.env.SUBCONSCIOUS_API_KEY! })

// ─── Shared tool definitions ────────────────────────────────────────────────

const TWEET_SEARCH    = { type: 'platform', id: 'tweet_search' }
const WEB_SEARCH      = { type: 'platform', id: 'web_search' }
const RESEARCH_PAPER  = { type: 'platform', id: 'research_paper_search' }
const NEWS_SEARCH     = { type: 'platform', id: 'news_search' }
const FIND_SIMILAR    = { type: 'platform', id: 'find_similar' }
const FRESH_SEARCH    = { type: 'platform', id: 'fresh_search' }
const PAGE_READER     = { type: 'platform', id: 'page_reader' }
const GOOGLE_SEARCH   = { type: 'platform', id: 'google_search' }
const FAST_SEARCH     = { type: 'platform', id: 'fast_search' }

// ─── Agent 1: Problem Hunter ─────────────────────────────────────────────────

export async function runProblemHunter(pr: {
  title: string
  body: string
  diff: string
  repoName: string
}): Promise<string> {
  const run = await client.run({
    engine: 'tim-gpt',
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
1. Understand the core problem this PR addresses. Be specific — not "improves performance" but "reduces cold start latency on Kubernetes pod scheduling."
2. Search Twitter/X for engineers complaining about this exact problem. Find real quotes, real frustration, real context.
3. Search the web for Stack Overflow threads, GitHub issues, forum posts, or blog posts where people have hit this problem.
4. Find the LANGUAGE real users use to describe this pain. Not technical jargon from docs — the frustrated language of someone who just spent 4 hours debugging.

## Output Format
Return a structured report with:
- **Core problem in one sentence** (be specific and concrete)
- **Who feels this pain** (job titles, contexts, project types)
- **3-5 real quotes or paraphrases** from your search showing people describing this problem (include source URLs)
- **The emotional language people use** (frustrated words, metaphors, curses — the authentic voice of the pain)
- **Scale of the problem** (how many people hit this? any metrics?)

Be specific. Be concrete. Do not generalize. Real quotes over summaries.
      `.trim(),
      tools: [TWEET_SEARCH, WEB_SEARCH, GOOGLE_SEARCH],
    },
    options: { awaitCompletion: true },
  })
  return run.result?.answer ?? 'No output'
}

// ─── Agent 2: Prior Art Archaeologist ───────────────────────────────────────

export async function runPriorArt(pr: {
  title: string
  body: string
  repoName: string
}): Promise<string> {
  const run = await client.run({
    engine: 'tim-gpt',
    input: {
      instructions: `
You are the Prior Art Archaeologist. Your job is to find the history of attempts to solve the problem addressed by this pull request — what existed before, what failed, and why this approach is different.

## The Pull Request
**Repo:** ${pr.repoName}
**Title:** ${pr.title}
**Description:** ${pr.body}

## Your Task
1. Identify the core technical or product problem this PR addresses.
2. Search for prior solutions: older libraries, deprecated approaches, previous GitHub issues marked "wontfix," previous PRs that tried and failed, blog posts from 2-5 years ago describing workarounds.
3. Search for academic papers or technical reports that relate to this problem domain.
4. Understand WHY existing solutions were insufficient — what constraint did they hit?

## Output Format
Return:
- **The problem's history** — how long has this been a known issue? (even if no prior art: say "first real solution")
- **2-4 prior approaches** with name, what they tried, and why they fell short
- **Any academic or research context** (papers, RFCs, design docs) — even tangential is useful
- **The key insight this PR has** that prior approaches missed
- **A "before vs after" framing** in one paragraph — what was life like before this? What changes?

Be historically accurate. Do not make up prior art. If there is none, say so honestly and focus on the "first real solution" angle.
      `.trim(),
      tools: [WEB_SEARCH, RESEARCH_PAPER, GOOGLE_SEARCH],
    },
    options: { awaitCompletion: true },
  })
  return run.result?.answer ?? 'No output'
}

// ─── Agent 3: Community Finder ───────────────────────────────────────────────

export async function runCommunityFinder(pr: {
  title: string
  body: string
  repoName: string
}): Promise<string> {
  const run = await client.run({
    engine: 'tim-gpt',
    input: {
      instructions: `
You are the Community Finder. Your job is to find the specific online communities, subreddits, Discord servers, newsletters, and Twitter/X accounts where this pull request would be relevant and celebrated.

## The Pull Request
**Repo:** ${pr.repoName}
**Title:** ${pr.title}
**Description:** ${pr.body}

## Your Task
1. Understand the technical domain of this PR (e.g., Kubernetes, React, Rust, ML infrastructure, etc.)
2. Find the active online communities discussing this domain right now — not just the obvious ones (e.g., not just r/programming for a Go project).
3. Find the specific Twitter/X accounts and influencers who cover this exact topic and have engaged audiences.
4. Find newsletters or publications that cover this area.
5. Identify the best framing for each community — how would you introduce this PR to each one differently?

## Output Format
Return:
- **Top 3-5 communities** with name, URL if available, audience size estimate, and why this PR fits there
- **Top 3-5 Twitter/X accounts** who would care, with handle and their audience focus
- **1-2 newsletters** in this space
- **Community-specific framing** — one sentence that would work as a submission title for each community
- **Hashtags** that are actually used (not generic — search to verify they're real and active)
      `.trim(),
      tools: [TWEET_SEARCH, FIND_SIMILAR, NEWS_SEARCH, GOOGLE_SEARCH],
    },
    options: { awaitCompletion: true },
  })
  return run.result?.answer ?? 'No output'
}

// ─── Agent 4: Technical Explainer ───────────────────────────────────────────

export async function runTechnicalExplainer(pr: {
  title: string
  body: string
  diff: string
  repoName: string
}): Promise<string> {
  const run = await client.run({
    engine: 'tim-gpt',
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
2. Identify the key technical decision made (e.g., "switched from polling to event-driven", "replaced O(n²) lookup with hashmap", "moved side effects out of the render cycle").
3. Search for documentation or blog posts that explain this design pattern in depth so you can reference them.
4. Identify the tradeoffs — what does this approach give up to gain what it gains?
5. Find a good analogy or mental model that makes this click for someone who hasn't encountered it.

## Output Format
Return:
- **The core technical decision in one sentence** (precise, no filler)
- **ELI-senior-engineer explanation** (2-3 paragraphs, can use jargon, focus on the interesting design decision)
- **ELI-intermediate explanation** (1-2 paragraphs, use an analogy, avoid unexplained jargon)
- **The key tradeoff** — what did this sacrifice? What did it gain?
- **The interesting insight** — what's the non-obvious thing a reader should walk away understanding?
- **2-3 reference links** for further reading on the patterns used
      `.trim(),
      tools: [WEB_SEARCH, PAGE_READER, GOOGLE_SEARCH, FAST_SEARCH],
    },
    options: { awaitCompletion: true },
  })
  return run.result?.answer ?? 'No output'
}

// ─── Agent 5: Timing Analyst ─────────────────────────────────────────────────

export async function runTimingAnalyst(pr: {
  title: string
  body: string
  repoName: string
}): Promise<string> {
  const run = await client.run({
    engine: 'tim-gpt',
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
5. Find what the current discourse is in this domain — what are people arguing about? Does this PR take a side?

## Output Format
Return:
- **The timing hook** — one punchy sentence: "This lands the same week that X happened"
- **Recent context** (2-3 developments from the last 7-30 days that make this relevant)
- **The trend this PR is part of** — is this the 3rd PR this month solving similar things? Is there a movement?
- **What's coming** — any upcoming events, deadlines, or releases that make this even more timely?
- **The "why now" paragraph** — 3-4 sentences that could be the opening of a blog post explaining why this is the perfect moment for this PR
      `.trim(),
      tools: [FRESH_SEARCH, NEWS_SEARCH, TWEET_SEARCH],
    },
    options: { awaitCompletion: true },
  })
  return run.result?.answer ?? 'No output'
}

// ─── Synthesizer ─────────────────────────────────────────────────────────────

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
`

export async function runSynthesizer(
  prContext: { title: string; body: string; repoName: string; prUrl: string },
  agentOutputs: Record<string, string>
): Promise<{
  blogPost: { title: string; body: string; tags: string[] }
  twitterThread: string[]
  hnPost: { title: string; text: string }
}> {
  const run = await client.run({
    engine: 'tim-gpt',
    input: {
      instructions: `
You are a writing synthesizer. You have received research from 5 independent agents about a GitHub pull request. Your job is to write three pieces of content that will be published immediately after a PR is merged.

## The Pull Request
**Repo:** ${prContext.repoName}
**Title:** ${prContext.title}
**Description:** ${prContext.body}
**URL:** ${prContext.prUrl}

## Research from 5 Independent Agents

### Agent 1 — Problem Hunter (real pain, real quotes)
${agentOutputs.problem_hunter}

### Agent 2 — Prior Art Archaeologist (history, what failed before)
${agentOutputs.prior_art}

### Agent 3 — Community Finder (where to share, how to frame)
${agentOutputs.community_finder}

### Agent 4 — Technical Explainer (what it does, the insight)
${agentOutputs.technical_explainer}

### Agent 5 — Timing Analyst (why now, recent context)
${agentOutputs.timing_analyst}

## Author's Writing Style
Study these examples carefully. Your output must sound like this author wrote it — not like generic AI content.

${WRITING_STYLE_EXAMPLES}

## Rules
- Never start a blog post with "I'm excited to share" or "Today I want to talk about"
- Never use the phrase "In conclusion" or "In summary"
- Lead with the problem or the tension, not the solution
- Short sentences. Active voice. No filler.
- The blog post should read like a senior engineer thinking out loud, not a technical writer polishing a doc
- Twitter thread: tweet 1 is the hook (no "thread 🧵" cliché), each tweet stands alone, last tweet has the PR link
- HN post: plain, no hype, assumes technical reader, leads with what it does not why it's cool

## Required Output Format
You MUST respond with ONLY valid JSON, no markdown fences, no preamble. Exactly this structure:

{
  "blogPost": {
    "title": "string — punchy, specific, no clickbait",
    "body": "string — full blog post in markdown, 400-600 words",
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
    "title": "string — HN-appropriate title, factual, under 80 chars",
    "text": "string — plain text, 100-150 words, no markdown"
  }
}
      `.trim(),
      tools: [],
    },
    options: { awaitCompletion: true },
  })

  const raw = run.result?.answer ?? '{}'
  // Strip any accidental markdown fences before parsing
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(clean)
}
```

---

## dev.to Publisher

```typescript
// lib/devto.ts

export async function publishToDevTo(post: {
  title: string
  body: string
  tags: string[]
}): Promise<string | null> {
  try {
    const res = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.DEVTO_API_KEY!,
      },
      body: JSON.stringify({
        article: {
          title: post.title,
          body_markdown: post.body,
          published: true,           // Set to false to review before publishing
          tags: post.tags.slice(0, 4),
        },
      }),
    })
    if (!res.ok) {
      console.error('dev.to publish failed:', await res.text())
      return null
    }
    const data = await res.json()
    return data.url as string
  } catch (err) {
    console.error('dev.to publish error:', err)
    return null
  }
}
```

---

## Slack Notifier

```typescript
// lib/slack.ts
import { Run } from './types'

export async function postToSlack(run: Run, devtoUrl: string | null) {
  const thread = run.synthesizer.twitterThread

  const message = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚀 New PR shipped: ${run.prTitle}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Repo:* ${run.repoName}\n*PR:* <${run.prUrl}|View on GitHub>`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📝 Blog post:*\n${devtoUrl ? `<${devtoUrl}|Read on dev.to>` : 'Failed to publish'}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🐦 Twitter thread (ready to post):*\n${thread
            .map((t, i) => `${i + 1}. ${t}`)
            .join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🟧 HN Post:*\n*Title:* ${run.synthesizer.hnPost?.title}\n${run.synthesizer.hnPost?.text}`,
        },
      },
    ],
  }

  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })
}
```

---

## API Routes

### GitHub Webhook Handler

```typescript
// app/api/webhook/github/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createRun, updateAgent, updateSynthesizer, updateRun, getRun } from '@/lib/runs'
import {
  runProblemHunter,
  runPriorArt,
  runCommunityFinder,
  runTechnicalExplainer,
  runTimingAnalyst,
  runSynthesizer,
} from '@/lib/agents'
import { fetchPRDiff } from '@/lib/github'
import { publishToDevTo } from '@/lib/devto'
import { postToSlack } from '@/lib/slack'
import { AgentName } from '@/lib/types'

function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false
  const expected = `sha256=${crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex')}`
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)

  // Only fire on merged PRs
  if (payload.action !== 'closed' || !payload.pull_request?.merged) {
    return NextResponse.json({ status: 'ignored' })
  }

  const pr = payload.pull_request
  const repoName = payload.repository.full_name
  const prUrl = pr.html_url
  const diffUrl = pr.diff_url
  const prTitle = pr.title
  const prBody = pr.body ?? ''

  // Fetch the diff
  const diff = await fetchPRDiff(diffUrl)

  // Create the run record
  const run = createRun({ prTitle, prUrl, repoName, prBody, diff })

  // Respond immediately — webhook must get a fast response
  // The actual work happens async
  processRun(run.id, { prTitle, prUrl, repoName, prBody, diff })

  return NextResponse.json({ runId: run.id })
}

async function processRun(
  runId: string,
  pr: { prTitle: string; prUrl: string; repoName: string; prBody: string; diff: string }
) {
  const agentFunctions: Record<AgentName, () => Promise<string>> = {
    problem_hunter: () =>
      runProblemHunter({ title: pr.prTitle, body: pr.prBody, diff: pr.diff, repoName: pr.repoName }),
    prior_art: () =>
      runPriorArt({ title: pr.prTitle, body: pr.prBody, repoName: pr.repoName }),
    community_finder: () =>
      runCommunityFinder({ title: pr.prTitle, body: pr.prBody, repoName: pr.repoName }),
    technical_explainer: () =>
      runTechnicalExplainer({ title: pr.prTitle, body: pr.prBody, diff: pr.diff, repoName: pr.repoName }),
    timing_analyst: () =>
      runTimingAnalyst({ title: pr.prTitle, body: pr.prBody, repoName: pr.repoName }),
  }

  // Mark all agents as running
  for (const name of Object.keys(agentFunctions) as AgentName[]) {
    updateAgent(runId, name, { status: 'running', startedAt: Date.now() })
  }

  // Fire all 5 agents in parallel
  const agentEntries = Object.entries(agentFunctions) as [AgentName, () => Promise<string>][]
  const results = await Promise.allSettled(
    agentEntries.map(async ([name, fn]) => {
      try {
        const output = await fn()
        updateAgent(runId, name, {
          status: 'done',
          output,
          completedAt: Date.now(),
        })
        return { name, output }
      } catch (err) {
        updateAgent(runId, name, { status: 'error', completedAt: Date.now() })
        throw err
      }
    })
  )

  // Collect successful outputs
  const agentOutputs: Record<string, string> = {}
  for (const result of results) {
    if (result.status === 'fulfilled') {
      agentOutputs[result.value.name] = result.value.output
    }
  }

  // Run synthesizer
  updateSynthesizer(runId, { status: 'running', startedAt: Date.now() })

  try {
    const synthesized = await runSynthesizer(
      { title: pr.prTitle, body: pr.prBody, repoName: pr.repoName, prUrl: pr.prUrl },
      agentOutputs
    )

    updateSynthesizer(runId, {
      status: 'done',
      ...synthesized,
      completedAt: Date.now(),
    })

    // Publish to dev.to
    const devtoUrl = await publishToDevTo(synthesized.blogPost)
    updateRun(runId, { devtoUrl })

    // Post to Slack
    const run = getRun(runId)!
    await postToSlack(run, devtoUrl)
    updateRun(runId, { slackPosted: true })
  } catch (err) {
    console.error('Synthesizer error:', err)
    updateSynthesizer(runId, { status: 'error', completedAt: Date.now() })
  }
}
```

### Status Polling Endpoint

```typescript
// app/api/run/[id]/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getRun } from '@/lib/runs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = getRun(params.id)
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(run)
}
```

### Manual Trigger (Demo Fallback)

```typescript
// app/api/trigger/route.ts
// Use this if the live GitHub webhook doesn't fire in time during the demo.
// POST with JSON body: { prTitle, prUrl, repoName, prBody, diffUrl }

import { NextRequest, NextResponse } from 'next/server'
import { createRun, updateAgent, updateSynthesizer, updateRun, getRun } from '@/lib/runs'
import {
  runProblemHunter, runPriorArt, runCommunityFinder,
  runTechnicalExplainer, runTimingAnalyst, runSynthesizer
} from '@/lib/agents'
import { fetchPRDiff } from '@/lib/github'
import { publishToDevTo } from '@/lib/devto'
import { postToSlack } from '@/lib/slack'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { prTitle, prUrl, repoName, prBody, diffUrl } = body

  const diff = diffUrl ? await fetchPRDiff(diffUrl) : 'No diff provided'
  const run = createRun({ prTitle, prUrl, repoName, prBody, diff })

  // Fire async, return run ID immediately
  import('./../../webhook/github/route').then(({ /* reuse processRun */ }) => {})
  
  // NOTE: Just duplicate the processRun logic here or import it from a shared module.
  // For speed, copy the processRun function body directly into this file.

  return NextResponse.json({
    runId: run.id,
    dashboardUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/run/${run.id}`,
  })
}
```

---

## Frontend — Dashboard Page

```tsx
// app/page.tsx
import { getAllRuns } from '@/lib/runs'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  const runs = getAllRuns()

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Ship and Tell</h1>
        <p className="text-zinc-400 mb-8">
          Auto-publishes content every time a PR merges.
        </p>

        {runs.length === 0 ? (
          <div className="border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
            Waiting for a PR to merge...
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <Link key={run.id} href={`/run/${run.id}`}>
                <div className="border border-zinc-800 rounded-xl p-6 hover:border-zinc-600 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-lg">{run.prTitle}</p>
                      <p className="text-zinc-400 text-sm mt-1">{run.repoName}</p>
                    </div>
                    <StatusBadge run={run} />
                  </div>
                  {run.devtoUrl && (
                    <p className="text-emerald-400 text-sm mt-3">
                      ✓ Published to dev.to
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ run }: { run: any }) {
  const allDone =
    Object.values(run.agents).every((a: any) => a.status === 'done') &&
    run.synthesizer.status === 'done'
  const hasError =
    Object.values(run.agents).some((a: any) => a.status === 'error') ||
    run.synthesizer.status === 'error'

  if (hasError) return <span className="text-red-400 text-sm">Error</span>
  if (allDone) return <span className="text-emerald-400 text-sm">✓ Done</span>
  return <span className="text-amber-400 text-sm animate-pulse">Running...</span>
}
```

---

## Frontend — Live Run Page (The Demo Screen)

This is the page you screen-share during the demo. Build it to look impressive.

```tsx
// app/run/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Run } from '@/lib/types'

export default function RunPage({ params }: { params: { id: string } }) {
  const [run, setRun] = useState<Run | null>(null)
  const [activeTab, setActiveTab] = useState<'blog' | 'thread' | 'hn'>('blog')

  // Poll every 2 seconds until everything is done
  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`/api/run/${params.id}/status`)
      const data: Run = await res.json()
      setRun(data)

      const allDone =
        Object.values(data.agents).every((a) => a.status === 'done' || a.status === 'error') &&
        (data.synthesizer.status === 'done' || data.synthesizer.status === 'error')

      if (!allDone) setTimeout(poll, 2000)
    }
    poll()
  }, [params.id])

  if (!run) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading...
      </div>
    )
  }

  const agents = Object.values(run.agents)

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <p className="text-zinc-400 text-sm mb-1">{run.repoName}</p>
          <h1 className="text-2xl font-bold">{run.prTitle}</h1>
          <a href={run.prUrl} className="text-blue-400 text-sm hover:underline" target="_blank">
            View PR on GitHub →
          </a>
        </div>

        {/* Agent Cards Grid */}
        <div className="grid grid-cols-5 gap-3 mb-8">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className={`rounded-xl border p-4 transition-all duration-500 ${
                agent.status === 'done'
                  ? 'border-emerald-500 bg-emerald-950/30'
                  : agent.status === 'running'
                  ? 'border-amber-500 bg-amber-950/30 animate-pulse'
                  : agent.status === 'error'
                  ? 'border-red-500 bg-red-950/30'
                  : 'border-zinc-800 bg-zinc-900/30'
              }`}
            >
              <div className="text-2xl mb-2">{agent.emoji}</div>
              <div className="text-xs font-semibold text-zinc-300">{agent.label}</div>
              <div className="text-xs mt-1 text-zinc-500">
                {agent.status === 'pending' && 'Waiting...'}
                {agent.status === 'running' && 'Researching...'}
                {agent.status === 'done' && '✓ Done'}
                {agent.status === 'error' && '✗ Error'}
              </div>
              {agent.status === 'done' && agent.completedAt && agent.startedAt && (
                <div className="text-xs text-zinc-600 mt-1">
                  {((agent.completedAt - agent.startedAt) / 1000).toFixed(1)}s
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Synthesizer Status */}
        <div
          className={`rounded-xl border p-6 mb-8 transition-all duration-500 ${
            run.synthesizer.status === 'done'
              ? 'border-purple-500 bg-purple-950/30'
              : run.synthesizer.status === 'running'
              ? 'border-purple-400 bg-purple-950/20 animate-pulse'
              : 'border-zinc-800 bg-zinc-900/30'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <div className="font-semibold">Synthesizer</div>
              <div className="text-sm text-zinc-400">
                {run.synthesizer.status === 'pending' && 'Waiting for all agents to finish...'}
                {run.synthesizer.status === 'running' && 'Writing blog post, thread, and HN post...'}
                {run.synthesizer.status === 'done' && '✓ Content ready'}
                {run.synthesizer.status === 'error' && '✗ Synthesis failed'}
              </div>
            </div>
          </div>
        </div>

        {/* Published links */}
        {run.devtoUrl && (
          <div className="flex gap-4 mb-8">
            <a
              href={run.devtoUrl}
              target="_blank"
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              ✓ Read on dev.to →
            </a>
            {run.slackPosted && (
              <span className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg text-sm">
                ✓ Posted to Slack
              </span>
            )}
          </div>
        )}

        {/* Content tabs */}
        {run.synthesizer.status === 'done' && run.synthesizer.blogPost && (
          <div>
            <div className="flex gap-2 mb-4">
              {(['blog', 'thread', 'hn'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-white text-black'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {tab === 'blog' ? '📝 Blog Post' : tab === 'thread' ? '🐦 Thread' : '🟧 HN Post'}
                </button>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              {activeTab === 'blog' && (
                <div>
                  <h2 className="text-xl font-bold mb-4">{run.synthesizer.blogPost.title}</h2>
                  <pre className="whitespace-pre-wrap text-zinc-300 text-sm font-sans leading-relaxed">
                    {run.synthesizer.blogPost.body}
                  </pre>
                  <div className="flex gap-2 mt-4">
                    {run.synthesizer.blogPost.tags.map((tag) => (
                      <span key={tag} className="bg-zinc-800 text-zinc-400 px-2 py-1 rounded text-xs">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'thread' && (
                <div className="space-y-4">
                  {run.synthesizer.twitterThread.map((tweet, i) => (
                    <div key={i} className="border border-zinc-700 rounded-lg p-4">
                      <div className="text-xs text-zinc-500 mb-2">Tweet {i + 1}/5</div>
                      <p className="text-zinc-200">{tweet}</p>
                      <div className="text-xs text-zinc-600 mt-2">{tweet.length}/280 chars</div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'hn' && run.synthesizer.hnPost && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Title</div>
                  <p className="font-semibold text-lg mb-4">{run.synthesizer.hnPost.title}</p>
                  <div className="text-xs text-zinc-500 mb-1">Text</div>
                  <p className="text-zinc-300 leading-relaxed">{run.synthesizer.hnPost.text}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## Setup Commands (Run in Order)

```bash
# 1. Create project
npx create-next-app@latest ship-and-tell --typescript --tailwind --app --no-src-dir
cd ship-and-tell

# 2. Install dependencies
npm install subconscious uuid
npm install -D @types/uuid

# 3. Create .env.local and fill in all 5 values
touch .env.local

# 4. Start dev server
npm run dev

# 5. In a new terminal, start ngrok
ngrok http 3000
# Copy the https://xxxx.ngrok.io URL

# 6. Add webhook in GitHub
# Go to: your demo repo → Settings → Webhooks → Add webhook
# Payload URL: https://xxxx.ngrok.io/api/webhook/github
# Content type: application/json
# Secret: same value as GITHUB_WEBHOOK_SECRET in .env.local
# Events: Pull requests only

# 7. Test with manual trigger before demo
curl -X POST http://localhost:3000/api/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "prTitle": "fix: reduce scheduler latency by switching to event-driven pod assignment",
    "prUrl": "https://github.com/yourusername/your-repo/pull/1",
    "repoName": "yourusername/your-repo",
    "prBody": "This PR replaces the polling-based scheduler with an event-driven approach, reducing average scheduling latency from 800ms to 120ms under load.",
    "diffUrl": "https://github.com/yourusername/your-repo/pull/1.diff"
  }'
```

---

## Pre-Demo Checklist

- [ ] `.env.local` has all 5 values filled in and tested
- [ ] dev.to API key works — test with a draft post (`published: false`)
- [ ] Slack webhook URL works — test with a `curl` POST
- [ ] Subconscious API key works — run a single agent test
- [ ] ngrok is running with a fixed domain (use `ngrok http 3000 --domain=your-fixed-domain`)
- [ ] GitHub webhook is set with the ngrok URL and correct secret
- [ ] Demo PR is staged in your repo with a good title and description
- [ ] WRITING_STYLE_EXAMPLES in `lib/agents.ts` has been replaced with your real writing
- [ ] You've done 2 full dry runs and the content output is good
- [ ] The best dry run output is saved as a screenshot (demo fallback)
- [ ] `/run/[id]` dashboard is open in Chrome at full screen, ready to share
- [ ] Slack is open on your phone to show the notification live

---

## Demo Script (What to Say)

> "Every time a PR merges in my repo, 5 agents fire simultaneously — not sequentially — each with a different mandate and their own private search context. None of them can see what the others find. Then a synthesizer reads all five outputs, resolves the contradictions, and writes three pieces of content in my voice. The blog post gets published to dev.to. A Slack message arrives. The whole thing takes about 60 seconds and requires zero human action."
>
> "This is what Subconscious makes possible that you literally cannot do with a single Claude prompt: genuinely parallel isolated agents, triggered by an event in the world, that take actions after they're done."
>
> *[Merge the PR]*
>
> *[Flip to the dashboard — show the 5 cards light up]*
>
> *[Show Slack notification on phone]*
>
> *[Show dev.to article in browser]*

---

## Idea 3 Bonus — Meeting Brief (If Time Allows)

If you finish Idea 1 with 30+ minutes remaining, build this as a second demo. It shares the parallel agent pattern — you're just pointing it at different inputs.

**Input:** A simple form: names of attendees (one per line), meeting topic.

**Agent per attendee** (all in parallel):
- Tools: People Search, Tweet Search, Company Search
- Goal: Build a profile — who are they, what are they thinking about publicly right now, what will impress them

**Synthesizer:** Per-person card — 3-sentence summary, their current intellectual focus, one question that shows you're sharp.

**Action:** POST to Slack with the full brief.

**No Calendar integration needed.** Manual trigger is fine for the demo.

This takes ~25 minutes to add if Idea 1 is solid. Add a `/meeting` route to the dashboard as a second entry point.
