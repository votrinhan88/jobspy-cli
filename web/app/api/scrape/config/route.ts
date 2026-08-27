import type { NextRequest } from "next/server";
import { getActiveProfile } from "@/lib/profile";
import { readConfig, writeConfig, type ScrapeConfig } from "@/lib/config";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  const config = await readConfig(profile);
  return Response.json(config);
}

export async function PUT(request: NextRequest) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  const body: ScrapeConfig = await request.json();
  await writeConfig(profile, body);
  return Response.json(body);
}
