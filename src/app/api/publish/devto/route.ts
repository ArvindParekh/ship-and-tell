import { NextRequest, NextResponse } from "next/server";

import { getRun, updateRun } from "@/lib/runs";
import { publishToDevTo } from "@/lib/devto";

/**
 * GET /api/publish/devto?runId=xxx
 *
 * Called when the user clicks the "Publish to dev.to" button in Slack.
 * Creates a draft on dev.to and redirects the browser to the draft editor.
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

  if (!run.synthesizer.blogPost) {
    return NextResponse.json({ error: "No blog post to publish" }, { status: 400 });
  }

  const devtoUrl = await publishToDevTo(run.synthesizer.blogPost);
  if (devtoUrl) {
    updateRun(runId, { devtoUrl });
    // Redirect to the draft editor page
    return NextResponse.redirect(devtoUrl);
  }

  // Publishing failed — redirect to dashboard with an error indication
  return NextResponse.redirect("https://dev.to/dashboard");
}
