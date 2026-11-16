import fs from "fs/promises";
import { dismissedBoardsPath } from "./profile";
import { isBoardEntry } from "./board-discovery";

export async function readDismissedBoards(profile: string): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(dismissedBoardsPath(profile), "utf-8"));
    return Array.isArray(parsed) ? parsed.filter(isBoardEntry) : [];
  } catch {
    return [];
  }
}

export async function dismissBoard(profile: string, entry: string): Promise<string[]> {
  const current = await readDismissedBoards(profile);
  const next = current.includes(entry) ? current : [...current, entry];
  await fs.writeFile(dismissedBoardsPath(profile), JSON.stringify(next, null, 2), "utf-8");
  return next;
}
