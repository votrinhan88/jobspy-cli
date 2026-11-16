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

export function isNewInRun(
  firstSeenAt: string,
  runStartedAt: string | null | undefined
): boolean {
  const first = Date.parse((firstSeenAt ?? "").trim());
  const run = Date.parse((runStartedAt ?? "").trim());
  if (Number.isNaN(first) || Number.isNaN(run)) return false;
  return first >= run;
}

export function isClosed(closedAt: string): boolean {
  return (closedAt ?? "").trim() !== "";
}

export function formatLastSeen(lastSeenAt: string): string {
  const text = (lastSeenAt ?? "").trim();
  return text ? text.slice(0, 10) : "—";
}
