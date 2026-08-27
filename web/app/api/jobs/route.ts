import { getActiveProfile, jobsCsvPath } from "@/lib/profile";
import { readJobs } from "@/lib/csv";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  const jobs = await readJobs(jobsCsvPath(profile));
  return Response.json(jobs);
}
