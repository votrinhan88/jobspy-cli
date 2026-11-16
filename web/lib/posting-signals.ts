const DAY_MS = 86_400_000;

function parseTimestamp(value: string): number | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : time;
}

export function firstSeenDays(firstSeenAt: string, now: number = Date.now()): number | null {
  const first = parseTimestamp(firstSeenAt);
  if (first === null) return null;
  return Math.max(0, Math.floor((now - first) / DAY_MS));
}

export function isReposted(firstSeenAt: string, datePosted: string): boolean {
  const first = parseTimestamp(firstSeenAt);
  const posted = parseTimestamp(datePosted);
  if (first === null || posted === null) return false;
  return posted - first > DAY_MS;
}
