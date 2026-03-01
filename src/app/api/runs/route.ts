import { NextResponse } from "next/server";

import { getAllRuns } from "@/lib/runs";

export async function GET() {
  return NextResponse.json(getAllRuns());
}
