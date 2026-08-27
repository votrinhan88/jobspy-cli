import { getActiveProfile } from "@/lib/profile";
import { readScrapeStatus } from "@/lib/scrape-status";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  const status = await readScrapeStatus(profile);
  return Response.json(status);
}
