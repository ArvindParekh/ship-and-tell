import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { createRun } from "@/lib/runs";
import { fetchDiff } from "@/lib/github";
import { processRun } from "@/lib/pipeline";

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!signature || !secret) return false;
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex")}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  const payload = JSON.parse(rawBody);

  // Handle push events
  if (event === "push") {
    // Only trigger on pushes to the default branch
    const defaultRef = `refs/heads/${payload.repository?.default_branch ?? "main"}`;
    if (payload.ref !== defaultRef) {
      return NextResponse.json({ status: "ignored", reason: "not default branch" });
    }

    // Skip if no commits (e.g. branch deletion)
    if (!payload.commits?.length) {
      return NextResponse.json({ status: "ignored", reason: "no commits" });
    }

    const repoName: string = payload.repository.full_name;
    const compareUrl: string = payload.compare;
    const headCommit = payload.head_commit;
    const prTitle: string = headCommit?.message?.split("\n")[0] ?? "Push to main";
    const prBody: string = headCommit?.message ?? "";
    const prUrl: string = compareUrl;

    // Fetch the diff from the compare URL
    const diff = await fetchDiff(compareUrl);

    const run = createRun({ prTitle, prUrl, repoName, prBody, diff });

    // Fire async, return immediately
    processRun(run.id, { prTitle, prUrl, repoName, prBody, diff });

    return NextResponse.json({ runId: run.id });
  }

  // Handle PR merge events (legacy support)
  if (event === "pull_request") {
    if (payload.action !== "closed" || !payload.pull_request?.merged) {
      return NextResponse.json({ status: "ignored" });
    }

    const pr = payload.pull_request;
    const repoName: string = payload.repository.full_name;
    const prUrl: string = pr.html_url;
    const diffUrl: string = pr.diff_url;
    const prTitle: string = pr.title;
    const prBody: string = pr.body ?? "";

    const diff = await fetchDiff(diffUrl);
    const run = createRun({ prTitle, prUrl, repoName, prBody, diff });

    processRun(run.id, { prTitle, prUrl, repoName, prBody, diff });

    return NextResponse.json({ runId: run.id });
  }

  return NextResponse.json({ status: "ignored", reason: `unhandled event: ${event}` });
}
