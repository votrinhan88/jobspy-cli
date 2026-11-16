import type { ResumeMeta } from "./library";

export type TagCount = { tag: string; count: number };

const segments = (tag: string) => [...new Set(tag.split("-"))];

// Every hyphen segment of a name is a tag. Only the most common ones are shown, so the bar stays short.
export function topTags(resumes: ResumeMeta[], limit = 10): TagCount[] {
  const counts = new Map<string, number>();
  for (const meta of resumes) {
    for (const tag of segments(meta.tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

export function hasAllTags(meta: ResumeMeta, active: string[]): boolean {
  const own = segments(meta.tag);
  return active.every((tag) => own.includes(tag));
}
