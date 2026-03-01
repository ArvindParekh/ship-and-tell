import { NextRequest, NextResponse } from "next/server";

import { createRun } from "@/lib/runs";
import { fetchDiff } from "@/lib/github";
import { processRun } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prTitle, prUrl, repoName, prBody, diffUrl } = body as {
    prTitle: string;
    prUrl: string;
    repoName: string;
    prBody: string;
    diffUrl?: string;
  };

  const diff = diffUrl ? await fetchDiff(diffUrl) : "No diff provided";
  const run = createRun({ prTitle, prUrl, repoName, prBody, diff });

  // Fire async, return run ID immediately
  processRun(run.id, { prTitle, prUrl, repoName, prBody, diff });

  return NextResponse.json({
    runId: run.id,
    dashboardUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/run/${run.id}`,
  });
}
