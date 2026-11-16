export const STALE_DAYS = 14;

const DAY_MS = 86_400_000;

export function isStale(
  lastSeenAt: string,
  now: number = Date.now(),
  days: number = STALE_DAYS
): boolean {
  const text = (lastSeenAt ?? "").trim();
  if (!text) return false;
  const seen = Date.parse(text);
  if (Number.isNaN(seen)) return false;
  return now - seen > days * DAY_MS;
}

// A scrape run stamps last_seen_at on every row it returns, so the newest value is the time of
// the latest crawl. This is the one place that defines it.
export function latestCrawlAt(jobs: { last_seen_at: string }[]): number | null {
  let latest: number | null = null;
  for (const job of jobs) {
    const seen = Date.parse((job.last_seen_at ?? "").trim());
    if (!Number.isNaN(seen) && (latest === null || seen > latest)) latest = seen;
  }
  return latest;
}

// A job is New when the latest crawl is the first one that returned it.
export function isNew(firstSeenAt: string, crawlAt: number | null): boolean {
  if (crawlAt === null) return false;
  return Date.parse((firstSeenAt ?? "").trim()) === crawlAt;
}

export function isClosed(closedAt: string): boolean {
  return (closedAt ?? "").trim() !== "";
}

export function formatLastSeen(lastSeenAt: string): string {
  const text = (lastSeenAt ?? "").trim();
  return text ? text.slice(0, 10) : "—";
}
