import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { createRun } from "@/lib/runs";
import { fetchPRDiff } from "@/lib/github";
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

  const payload = JSON.parse(rawBody);

  // Only fire on merged PRs
  if (payload.action !== "closed" || !payload.pull_request?.merged) {
    return NextResponse.json({ status: "ignored" });
  }

  const pr = payload.pull_request;
  const repoName: string = payload.repository.full_name;
  const prUrl: string = pr.html_url;
  const diffUrl: string = pr.diff_url;
  const prTitle: string = pr.title;
  const prBody: string = pr.body ?? "";

  // Fetch the diff
  const diff = await fetchPRDiff(diffUrl);

  // Create the run record
  const run = createRun({ prTitle, prUrl, repoName, prBody, diff });

  // Respond immediately -- the actual work happens async
  processRun(run.id, { prTitle, prUrl, repoName, prBody, diff });

  return NextResponse.json({ runId: run.id });
}
