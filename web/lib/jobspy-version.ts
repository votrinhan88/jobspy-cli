const PYPI_URL = "https://pypi.org/pypi/python-jobspy/json";
const LOOKUP_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type JobspyVersionCheck = {
  installed: string | null;
  latest: string | null;
  outdated: boolean;
};

let cache: { version: string; at: number } | null = null;

export function resetJobspyCache(): void {
  cache = null;
}

export function readLockedVersion(lockText: string): string | null {
  for (const block of lockText.split("[[package]]")) {
    if (!/^\s*name = "python-jobspy"\s*$/m.test(block)) continue;
    const match = block.match(/^version = "([^"]+)"\s*$/m);
    return match ? match[1] : null;
  }
  return null;
}

export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".");
  const partsB = b.split(".");
  if (![...partsA, ...partsB].every((part) => /^\d+$/.test(part))) return 0;
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = Number(partsA[i] ?? 0) - Number(partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchLatestVersion(
  fetchImpl: typeof fetch,
  now: () => number
): Promise<string | null> {
  if (cache && now() - cache.at < CACHE_TTL_MS) return cache.version;
  try {
    const res = await fetchImpl(PYPI_URL, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = await res.json();
    const version = body?.info?.version;
    if (typeof version !== "string") return null;
    cache = { version, at: now() };
    return version;
  } catch {
    return null;
  }
}

export async function checkJobspy({
  lockText,
  fetchImpl = fetch,
  now = Date.now,
}: {
  lockText: string | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<JobspyVersionCheck> {
  const installed = lockText === null ? null : readLockedVersion(lockText);
  const latest = await fetchLatestVersion(fetchImpl, now);
  const outdated =
    installed !== null && latest !== null && compareVersions(installed, latest) < 0;
  return { installed, latest, outdated };
}
