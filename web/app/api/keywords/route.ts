import fs from "fs/promises";
import path from "path";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export async function GET() {
  try {
    const text = await fs.readFile(path.join(REPO_ROOT, "keywords.txt"), "utf-8");
    const keywords = text.split("\n").map((l) => l.trim()).filter(Boolean);
    return Response.json({ keywords });
  } catch {
    return Response.json({ error: "keywords.txt not found" }, { status: 404 });
  }
}
