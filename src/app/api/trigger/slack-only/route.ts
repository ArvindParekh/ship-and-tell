import { NextResponse } from "next/server";

import { createRun, updateAgent, updateSynthesizer, updateRun, getRun } from "@/lib/runs";
import { postToSlack } from "@/lib/slack";
import type { AgentName } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Mock data ──────────────────────────────────────────────────────────────────

interface MockAgent {
  thoughts: string[];
  output: string;
  /** Base delay in ms before this agent starts "running" */
  startDelay: number;
  /** Interval between thought bubbles in ms */
  thoughtInterval: number;
  /** Delay after last thought before marking "done" */
  finishDelay: number;
}

const MOCK_AGENTS: Record<AgentName, MockAgent> = {
  problem_hunter: {
    startDelay: 300,
    thoughtInterval: 1200,
    finishDelay: 800,
    thoughts: [
      "Looking at the PR diff to understand what problem this solves.",
      "The key insight is that AI agents are opaque — users hit 'run' and stare at a spinner with no feedback on what's happening.",
      "This streaming thought feed makes the AI's reasoning visible in real time, turning a black box into a transparent process.",
      "The psychological impact matters: visible progress keeps users engaged and builds trust in the output.",
    ],
    output: "The main pain point is developer blindness during AI processing. Users hit 'run' and stare at a spinner with no feedback. This PR solves it by surfacing reasoning steps in real time, turning a black box into a transparent process.",
  },
  prior_art: {
    startDelay: 600,
    thoughtInterval: 1400,
    finishDelay: 1000,
    thoughts: [
      "Searching for prior art in AI transparency UIs.",
      "Found several examples: ChatGPT shows a 'thinking' spinner, Perplexity streams citations, v0 shows live code generation.",
      "None of these expose the full reasoning tree with tool calls — most just show a progress indicator or partial text.",
      "This approach is more granular — it shows individual reasoning steps as discrete cards with visual hierarchy.",
    ],
    output: "Similar approaches exist in ChatGPT's 'thinking' indicator, Perplexity's source-citation streaming, and Vercel's v0 live generation UI. However, none expose the full reasoning tree with tool calls — this implementation goes deeper by showing individual thought steps as discrete cards.",
  },
  community_finder: {
    startDelay: 400,
    thoughtInterval: 1100,
    finishDelay: 900,
    thoughts: [
      "Identifying developer communities that would care about this.",
      "Next.js and React communities are obvious targets — r/nextjs has 280k members.",
      "The hackathon angle and AI transparency story would resonate on Hacker News as a Show HN.",
      "Dev.to #ai and #webdev tags, plus the Twitter/X AI developer community for thread distribution.",
    ],
    output: "Target communities: r/nextjs (280k members), Hacker News (Show HN format), Dev.to #ai and #webdev tags, Twitter/X AI developer community. The 'built in 48 hours' angle plays well on HN and indie hacker communities.",
  },
  technical_explainer: {
    startDelay: 500,
    thoughtInterval: 1300,
    finishDelay: 1100,
    thoughts: [
      "Breaking down the technical implementation details.",
      "The Subconscious stream API emits raw JSON deltas — not clean text. A regex extracts thought strings from the accumulating payload.",
      "React state updates on each chunk, rendering thoughts as individual cards with CSS transitions.",
      "The UI pattern is clever: each thought gets its own card with visual hierarchy based on recency. Latest glows amber, older ones fade.",
      "The three-tab detail pane (Thoughts / Output / Reasoning trace) gives users multiple ways to inspect agent work.",
    ],
    output: "The implementation uses the Subconscious stream API which emits raw JSON deltas. A regex extracts thought strings from the accumulating JSON payload. React state updates on each chunk, rendering thoughts as individual cards with CSS transitions. The latest thought pulses amber while older ones fade — creating a 'thinking in front of you' effect.",
  },
  timing_analyst: {
    startDelay: 700,
    thoughtInterval: 1200,
    finishDelay: 700,
    thoughts: [
      "Analyzing the current market timing for AI dev tools.",
      "AI coding tools are exploding — GitHub Copilot crossed 1M subscribers, Cursor raised $60M, Windsurf growing fast.",
      "There's a growing backlash against black-box AI — developers want transparency into what the model is doing.",
      "The 'show your work' pattern is emerging as a key differentiator. Shipping this now catches the wave.",
    ],
    output: "AI-powered developer tools are trending strongly. GitHub Copilot crossed 1M subscribers, Cursor raised $60M, and there's growing demand for AI transparency in dev workflows. The 'show your work' pattern is emerging as a differentiator. Shipping this now catches the wave of interest in observable AI.",
  },
};

const SYNTHESIZER_DATA = {
  blogPost: {
    title: "How We Built a Real-Time AI Thought Feed in 48 Hours",
    body: "When we set out to build Ship and Tell, we wanted developers to actually *see* the AI working — not just wait for a result.\n\nWe tapped into the Subconscious stream API and built a live thought feed that surfaces each reasoning step as it arrives. The result is a UI that feels alive: amber cards pulse in as new thoughts land, older ones dim, and the final answer snaps into place when the agent finishes.\n\nHere's how we pulled it off in a single hackathon weekend.\n\n## The Problem\n\nMost AI tools are black boxes. You click a button, wait, and eventually get output. There's no feedback loop, no sense of progress, and no way to understand *why* the AI produced what it did.\n\nWe wanted to change that.\n\n## The Architecture\n\nShip and Tell listens for GitHub webhook events. When a PR merges, it spawns 5 parallel research agents via the Subconscious SDK:\n\n1. **Problem Hunter** — identifies the pain point the PR addresses\n2. **Prior Art** — finds similar solutions and prior work\n3. **Community Finder** — maps target developer communities\n4. **Technical Explainer** — breaks down the implementation\n5. **Timing Analyst** — evaluates market timing\n\nEach agent streams its reasoning in real time. The frontend polls every 1.5 seconds and renders each thought as a discrete card.\n\n## The Streaming Challenge\n\nThe Subconscious stream API emits raw JSON deltas — not clean text. We wrote a regex extractor that parses thought strings from the accumulating JSON payload and pushes them into React state on every chunk.\n\n## The Result\n\nAfter all 5 agents finish, a synthesizer combines their research into a blog post, Twitter thread, and HN submission. A Slack message arrives with one-click publish buttons — no copy-paste required.\n\nBuilt in 48 hours with Next.js 16, React 19, Tailwind CSS 4, and the Subconscious SDK.",
    tags: ["ai", "nextjs", "typescript", "hackathon"],
  },
  twitterThread: [
    "We built a real-time AI thought feed that shows every reasoning step as it happens — live, in the browser. Here's how \u{1F9F5}",
    "The Subconscious stream API emits raw JSON deltas. We extract thought strings with a regex and push them into React state on every chunk.",
    "Each thought gets its own card. The latest glows amber. Older ones fade. It makes the AI feel like it's actually *thinking* in front of you.",
    "The full pipeline: 5 parallel research agents \u{2192} synthesizer \u{2192} Block Kit Slack message with one-click publish buttons. No manual copy-paste.",
    "Built in 48 hours with Next.js 16, React 19, Tailwind CSS 4, and the Subconscious SDK. Ship and Tell is open source — link in bio.",
  ],
  hnPost: {
    title: "Ship and Tell \u{2013} GitHub webhook that auto-writes your release blog post",
    text: "Merge a PR and get a blog post, Twitter thread, and HN submission drafted by 5 parallel AI research agents — then publish with one click from Slack.",
  },
};

// ── Simulation runner (fire-and-forget) ────────────────────────────────────────

async function simulateRun(runId: string) {
  const agentEntries = Object.entries(MOCK_AGENTS) as [AgentName, MockAgent][];

  // Run all agents in parallel with staggered starts
  await Promise.all(
    agentEntries.map(async ([name, mock]) => {
      // Staggered start
      await sleep(mock.startDelay);
      updateAgent(runId, name, { status: "running", startedAt: Date.now() });

      // Stream thoughts one by one
      const accumulated: string[] = [];
      for (const thought of mock.thoughts) {
        await sleep(mock.thoughtInterval);
        accumulated.push(thought);
        updateAgent(runId, name, { streamingOutput: accumulated.join("\n\n") });
      }

      // Finish
      await sleep(mock.finishDelay);
      updateAgent(runId, name, {
        status: "done",
        output: mock.output,
        completedAt: Date.now(),
      });
    })
  );

  // Synthesizer phase
  updateSynthesizer(runId, { status: "running", startedAt: Date.now() });
  await sleep(2500);

  updateSynthesizer(runId, {
    status: "done",
    ...SYNTHESIZER_DATA,
    completedAt: Date.now(),
  });

  // Post to Slack
  const fullRun = getRun(runId)!;
  const slackMessageTs = await postToSlack(fullRun);
  updateRun(runId, { slackPosted: slackMessageTs !== null, slackMessageTs });
}

// ── Route handler ──────────────────────────────────────────────────────────────

/**
 * POST /api/trigger/slack-only
 * Creates a run and simulates the full agent pipeline with realistic timing.
 * No Subconscious agents, zero credits burned.
 */
export async function POST() {
  const run = createRun({
    prTitle: "Add streaming thought feed to agent dashboard",
    prUrl: "https://github.com/acme/ship-and-tell/pull/42",
    repoName: "acme/ship-and-tell",
    prBody: "Replaces the plain status indicator with a real-time thought feed that shows each agent reasoning step as it arrives via the Subconscious stream API.",
    diff: "",
  });

  // Fire-and-forget — the dashboard polls for updates
  void simulateRun(run.id);

  return NextResponse.json({ runId: run.id });
}
