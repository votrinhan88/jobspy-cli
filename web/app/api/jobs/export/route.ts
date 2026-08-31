import fs from "fs/promises";
import { getActiveProfile, jobsCsvPath } from "@/lib/profile";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  try {
    const bytes = await fs.readFile(jobsCsvPath(profile));
    return new Response(bytes, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="jobs.csv"`,
      },
    });
  } catch {
    return Response.json({ error: "No jobs file found" }, { status: 404 });
  }
}
