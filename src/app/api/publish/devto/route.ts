import { NextRequest, NextResponse } from "next/server";

import { getRun, updateRun } from "@/lib/runs";
import { publishToDevTo } from "@/lib/devto";

/**
 * GET /api/publish/devto?runId=xxx
 * Publishes the blog post as a draft on dev.to, then redirects to the article.
 * Designed to be used as a Slack URL button target.
 */
export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 });
  }

  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // If already published, redirect to existing URL
  if (run.devtoUrl) {
    return NextResponse.redirect(run.devtoUrl);
  }

  const { blogPost } = run.synthesizer;
  if (!blogPost) {
    return NextResponse.json({ error: "No blog post in this run" }, { status: 404 });
  }

  const url = await publishToDevTo(blogPost);
  if (!url) {
    return NextResponse.json({ error: "dev.to publish failed" }, { status: 502 });
  }

  updateRun(runId, { devtoUrl: url });
  return NextResponse.redirect(url);
}
