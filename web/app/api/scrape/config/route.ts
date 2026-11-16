import type { NextRequest } from "next/server";
import { getActiveProfile } from "@/lib/profile";
import { readConfig, validateConfig, writeConfig } from "@/lib/config";
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON" }, { status: 400 });
  }
  const checked = validateConfig(body);
  if (checked.errors.length > 0) {
    return Response.json({ error: checked.errors[0] }, { status: 400 });
  }
  const config = checked.config;
  if (config.schedule !== null && !isValidSchedule(config.schedule)) {
    return Response.json({ error: "Invalid cron expression" }, { status: 400 });
  }
  if (config.schedule !== null && config.job.length === 0) {
    return Response.json(
      { error: "Add at least one keyword before you enable a schedule" },
      { status: 400 }
    );
  }
  await writeConfig(profile, config);
  registerSchedule(profile, config.schedule);
  return Response.json(config);
}
