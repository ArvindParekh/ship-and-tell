import type { Run } from "./types";

export async function postToSlack(run: Run, devtoUrl: string | null) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("SLACK_WEBHOOK_URL not set, skipping Slack notification");
    return;
  }

  const thread = run.synthesizer.twitterThread;

  const message = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `New PR shipped: ${run.prTitle}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Repo:* ${run.repoName}\n*PR:* <${run.prUrl}|View on GitHub>`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Blog post:*\n${devtoUrl ? `<${devtoUrl}|Read on dev.to>` : "Failed to publish"}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Twitter thread (ready to post):*\n${thread
            .map((t, i) => `${i + 1}. ${t}`)
            .join("\n")}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*HN Post:*\n*Title:* ${run.synthesizer.hnPost?.title}\n${run.synthesizer.hnPost?.text}`,
        },
      },
    ],
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}
