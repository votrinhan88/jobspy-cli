import { getActiveProfile } from "@/lib/profile";
import { readStatusLog } from "@/lib/status-log";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  return Response.json(await readStatusLog(profile));
}
