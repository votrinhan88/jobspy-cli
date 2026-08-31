import fs from "fs/promises";
import { getActiveProfile, scrapeLogPath } from "@/lib/profile";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  try {
    const text = await fs.readFile(scrapeLogPath(profile), "utf-8");
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch {
    return new Response("", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
