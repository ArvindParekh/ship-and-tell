import type { Run } from "./types";
import { buildXThreadIntent } from "./twitter";

const SLACK_API = "https://slack.com/api";

/**
 * Post a Block Kit review message to Slack with URL buttons.
 * Each button opens a URL directly — no interaction webhook needed.
 * Returns the message `ts` (timestamp).
 * Requires SLACK_BOT_TOKEN and SLACK_CHANNEL_ID.
 */
export async function postToSlack(run: Run): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    console.warn("SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set, skipping Slack notification");
    return null;
  }

  const { blogPost, twitterThread, hnPost } = run.synthesizer;
  const firstTweet = twitterThread[0] ?? "(no tweet)";
  const blogPreview = blogPost
    ? `*${blogPost.title}*\n${blogPost.body.slice(0, 280)}…`
    : "(no blog post)";
  const hnTitle = hnPost?.title ?? "(no HN post)";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  // Build URLs for each button
  const devtoPublishUrl = `${baseUrl}/api/publish/devto?runId=${run.id}`;
  const xIntent = buildXThreadIntent(twitterThread);
  const xUrl = xIntent?.intentUrl ?? "https://twitter.com/intent/tweet";
  const hnUrl = hnPost
    ? `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(run.prUrl)}&t=${encodeURIComponent(hnPost.title)}`
    : "https://news.ycombinator.com/submit";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🚀 PR Shipped: ${run.prTitle}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Repo:* ${run.repoName}   |   *PR:* <${run.prUrl}|View on GitHub>   |   <${baseUrl}/run/${run.id}|Live dashboard>`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📝 *Blog post preview*\n${blogPreview}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🐦 *First tweet*\n${firstTweet}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔶 *HN title*\n${hnTitle}`,
      },
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "📝 Publish to dev.to", emoji: true },
          style: "primary",
          url: devtoPublishUrl,
          action_id: "link_devto",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🐦 Post X Thread", emoji: true },
          url: xUrl,
          action_id: "link_x",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🔶 Open HN Submit", emoji: true },
          url: hnUrl,
          action_id: "link_hn",
        },
      ],
    },
  ];

  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, blocks }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("Slack chat.postMessage failed:", data.error);
      return null;
    }

    return (data.ts as string) ?? null;
  } catch (err) {
    console.error("Slack postMessage error:", err);
    return null;
  }
}


