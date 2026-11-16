import { getActiveProfile } from "@/lib/profile";
import { startScrape } from "@/lib/scrape-runner";

export async function POST() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const result = await startScrape(profile);
  if (result.started) {
    return Response.json({ status: "running" }, { status: 202 });
  }
  if (result.reason === "no_keywords") {
    return Response.json(
      { error: "Add at least one keyword before you run a scrape" },
      { status: 400 }
    );
  }
  return Response.json({ error: "Scrape already running" }, { status: 409 });
}
