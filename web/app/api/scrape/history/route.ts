import { getActiveProfile } from "@/lib/profile";
import { readScrapeHistory } from "@/lib/scrape-status";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  const history = await readScrapeHistory(profile);
  return Response.json(history);
}
