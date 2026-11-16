import fs from "fs/promises";
import path from "path";
import { checkJobspy } from "@/lib/jobspy-version";

// Same bundler hint as dataDir(): the lock file is read at runtime, not bundled.
function lockFilePath(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.JOBSPY_LOCK_FILE || path.join(process.cwd(), "..", "uv.lock")
  );
}

async function readLockFile(): Promise<string | null> {
  try {
    return await fs.readFile(lockFilePath(), "utf8");
  } catch {
    return null;
  }
}

export async function GET() {
  return Response.json(await checkJobspy({ lockText: await readLockFile() }));
}
