import type { NextRequest } from "next/server";
import { getActiveProfile } from "@/lib/profile";
import { readConfig, writeConfig, type ScrapeConfig } from "@/lib/config";
import { isValidSchedule, registerSchedule } from "@/lib/scheduler";

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
  const schedule = body.schedule ?? null;
  if (schedule !== null && !isValidSchedule(schedule)) {
    return Response.json({ error: "Invalid cron expression" }, { status: 400 });
  }
  if (schedule !== null && (!Array.isArray(body.job) || body.job.length === 0)) {
    return Response.json(
      { error: "Add at least one keyword before you enable a schedule" },
      { status: 400 }
    );
  }
  const config: ScrapeConfig = { ...body, schedule };
  await writeConfig(profile, config);
  registerSchedule(profile, schedule);
  return Response.json(config);
}
