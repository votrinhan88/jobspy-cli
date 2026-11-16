import type { NextRequest } from "next/server";
import { discoverBoards, isBoardEntry } from "@/lib/board-discovery";
import { readConfig } from "@/lib/config";
import { readJobs } from "@/lib/csv";
import { dismissBoard, readDismissedBoards } from "@/lib/dismissed-boards";
import { getActiveProfile, jobsCsvPath } from "@/lib/profile";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  const [jobs, config, dismissed] = await Promise.all([
    readJobs(jobsCsvPath(profile)),
    readConfig(profile),
    readDismissedBoards(profile),
  ]);
  return Response.json({ boards: discoverBoards(jobs, { existing: config.companies, dismissed }) });
}

export async function POST(request: NextRequest) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON" }, { status: 400 });
  }
  const entry = (body as { dismiss?: unknown } | null)?.dismiss;
  if (!isBoardEntry(entry)) {
    return Response.json({ error: "dismiss must be a board entry such as lever:acme" }, { status: 400 });
  }
  return Response.json({ dismissed: await dismissBoard(profile, entry) });
}
