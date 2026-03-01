import type { Run } from "./types";
import { buildTwitterIntentUrl } from "./twitter";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

/**
 * Post a Block Kit message to Slack with URL buttons for one-click publishing.
 * Returns the message timestamp (ts) on success, null on failure.
 */
export async function postToSlack(run: Run): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    console.warn("SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set, skipping Slack notification");
    return null;
  }

  const thread = run.synthesizer.twitterThread;
  const hnPost = run.synthesizer.hnPost;
  const blogPost = run.synthesizer.blogPost;

  // Build button URLs
  const devtoButtonUrl = `${BASE_URL}/api/publish/devto?runId=${run.id}`;
  const twitterButtonUrl = buildTwitterIntentUrl(thread[0] ?? "");
  const hnButtonUrl = hnPost
    ? `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(run.prUrl)}&t=${encodeURIComponent(hnPost.title)}`
    : "https://news.ycombinator.com/submit";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Ship and Tell: ${run.prTitle}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Repo:* ${run.repoName}\n*PR:* <${run.prUrl}|View on GitHub>\n*Dashboard:* <${BASE_URL}/run/${run.id}|View run>`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Blog Post*\n>${blogPost?.title ?? "No blog post generated"}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Twitter Thread Preview*\n${thread
          .slice(0, 3)
          .map((t, i) => `>${i + 1}. ${t}`)
          .join("\n")}${thread.length > 3 ? `\n>_...and ${thread.length - 3} more tweets_` : ""}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*HN Post*\n>${hnPost?.title ?? "No HN post generated"}`,
      },
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Publish to dev.to", emoji: true },
          url: devtoButtonUrl,
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Post to X/Twitter", emoji: true },
          url: twitterButtonUrl,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Submit to HN", emoji: true },
          url: hnButtonUrl,
        },
      ],
    },
  ];

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, blocks }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("Slack postMessage failed:", data.error);
      return null;
    }
    return data.ts as string;
  } catch (err) {
    console.error("Slack postMessage error:", err);
    return null;
  }
}
