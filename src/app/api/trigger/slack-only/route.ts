import { NextResponse } from "next/server";

import { createRun, updateAgent, updateSynthesizer, updateRun, getRun } from "@/lib/runs";
import { postToSlack } from "@/lib/slack";
import type { AgentName } from "@/lib/types";

/**
 * POST /api/trigger/slack-only
 * Creates a run pre-populated with canned agent + synthesizer output and fires
 * the Slack review message — no Subconscious agents, zero credits burned.
 * Useful for demoing the Slack button flow.
 */
export async function POST() {
  const run = createRun({
    prTitle: "Add streaming thought feed to agent dashboard",
    prUrl: "https://github.com/acme/ship-and-tell/pull/42",
    repoName: "acme/ship-and-tell",
    prBody: "Replaces the plain status indicator with a real-time thought feed that shows each agent reasoning step as it arrives via the Subconscious stream API.",
    diff: "",
  });

  // Populate mock agent results so the dashboard shows completed agents
  const mockAgents: Record<AgentName, { output: string; thoughts: string }> = {
    problem_hunter: {
      output: "The main pain point is developer blindness during AI processing. Users hit 'run' and stare at a spinner with no feedback. This PR solves it by surfacing reasoning steps in real time, turning a black box into a transparent process.",
      thoughts: "Looking at the PR diff to understand what problem this solves.\n\nThe key insight is that AI agents are opaque — users don't know what's happening inside.\n\nThis streaming thought feed makes the AI's reasoning visible, which builds trust and keeps users engaged.",
    },
    prior_art: {
      output: "Similar approaches exist in ChatGPT's 'thinking' indicator, Perplexity's source-citation streaming, and Vercel's v0 live generation UI. However, none expose the full reasoning tree with tool calls — this implementation goes deeper by showing individual thought steps as discrete cards.",
      thoughts: "Searching for prior art in AI transparency UIs.\n\nFound several examples: ChatGPT shows a 'thinking' spinner, Perplexity streams citations, v0 shows live code generation.\n\nThis approach is more granular — it shows individual reasoning steps rather than just a progress indicator.",
    },
    community_finder: {
      output: "Target communities: r/nextjs (280k members), Hacker News (Show HN format), Dev.to #ai and #webdev tags, Twitter/X AI developer community. The 'built in 48 hours' angle plays well on HN and indie hacker communities.",
      thoughts: "Identifying developer communities that would care about this.\n\nNext.js and React communities are obvious targets.\n\nThe hackathon angle and AI transparency story would resonate on Hacker News.",
    },
    technical_explainer: {
      output: "The implementation uses the Subconscious stream API which emits raw JSON deltas. A regex extracts thought strings from the accumulating JSON payload. React state updates on each chunk, rendering thoughts as individual cards with CSS transitions. The latest thought pulses amber while older ones fade — creating a 'thinking in front of you' effect.",
      thoughts: "Breaking down the technical implementation.\n\nThe stream API emits JSON deltas that need parsing — they use regex extraction.\n\nThe UI pattern is clever: each thought gets its own card with visual hierarchy based on recency.",
    },
    timing_analyst: {
      output: "AI-powered developer tools are trending strongly. GitHub Copilot crossed 1M subscribers, Cursor raised $60M, and there's growing demand for AI transparency in dev workflows. The 'show your work' pattern is emerging as a differentiator. Shipping this now catches the wave of interest in observable AI.",
      thoughts: "Analyzing the current market timing for AI dev tools.\n\nAI coding tools are exploding — Copilot, Cursor, Windsurf all growing fast.\n\nThere's a growing backlash against black-box AI — transparency is becoming a selling point.",
    },
  };

  const now = Date.now();
  for (const [name, data] of Object.entries(mockAgents)) {
    updateAgent(run.id, name as AgentName, {
      status: "done",
      output: data.output,
      streamingOutput: data.thoughts,
      startedAt: now - 30000 - Math.random() * 15000,
      completedAt: now - 5000 - Math.random() * 10000,
    });
  }

  updateSynthesizer(run.id, {
    status: "done",
    blogPost: {
      title: "How We Built a Real-Time AI Thought Feed in 48 Hours",
      body: `When we set out to build Ship and Tell, we wanted developers to actually *see* the AI working — not just wait for a result.\n\nWe tapped into the Subconscious stream API and built a live thought feed that surfaces each reasoning step as it arrives. The result is a UI that feels alive: amber cards pulse in as new thoughts land, older ones dim, and the final answer snaps into place when the agent finishes.\n\nHere's how we pulled it off in a single hackathon weekend.`,
      tags: ["ai", "nextjs", "typescript", "hackathon"],
    },
    twitterThread: [
      "We built a real-time AI thought feed that shows every reasoning step as it happens — live, in the browser. Here's how 🧵",
      "The Subconscious stream API emits raw JSON deltas. We extract thought strings with a regex and push them into React state on every chunk.",
      "Each thought gets its own card. The latest glows amber. Older ones fade. It makes the AI feel like it's actually *thinking* in front of you.",
      "The full pipeline: 5 parallel research agents → synthesizer → Block Kit Slack message with one-click publish buttons. No manual copy-paste.",
      "Built in 48 hours with Next.js 16, React 19, Tailwind CSS 4, and the Subconscious SDK. Ship and Tell is open source — link in bio.",
    ],
    hnPost: {
      title: "Ship and Tell – GitHub webhook that auto-writes your release blog post",
      text: "Merge a PR and get a blog post, Twitter thread, and HN submission drafted by 5 parallel AI research agents — then publish with one click from Slack.",
    },
    startedAt: Date.now() - 45000,
    completedAt: Date.now(),
  });

  const fullRun = getRun(run.id)!;
  const slackMessageTs = await postToSlack(fullRun);
  updateRun(run.id, { slackPosted: slackMessageTs !== null, slackMessageTs });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  return NextResponse.json({
    runId: run.id,
    slackPosted: slackMessageTs !== null,
    slackMessageTs,
    dashboardUrl: `${baseUrl}/run/${run.id}`,
  });
}
