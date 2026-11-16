# Plan: All Remaining Features — Sequential Implementation

## Context

The core scrape → review → apply pipeline is working. This plan implements all remaining features in dependency order, autonomously, without stopping between steps. Each step must leave tests green and `pnpm build` clean before proceeding to the next.

---

## Step 1 — Scrape status counts (tiny fix)

**Problem:** `new_jobs`, `updated_jobs`, `total_jobs` in `scrape_status.json` are always `null`. Python prints `"Appended: N new jobs (M total)"` to stdout (→ `scrape.log`), but the Node close handler never reads it.

**Fix:** In `web/app/api/scrape/run/route.ts`, after the child exits with code 0, read `scrape.log`, parse the last `Appended: (\d+) new jobs \((\d+) total\)` line, and write those values into `scrape_status.json`.

**Files:** `web/app/api/scrape/run/route.ts` only.

---

## Step 2 — CV file serving + preview

**Problem:** Resume page shows filename/size but no way to view or download the actual file.

**New route:** `web/app/api/resume/file/route.ts`
- `GET` — reads active profile, detects `cv.pdf` or `cv.md` via `cvPath()` from `lib/profile.ts`, streams the file with correct `Content-Type` (`application/pdf` or `text/markdown`) and `Content-Disposition: inline; filename="cv.<ext>"`. Returns 404 if no file.

**Page update:** `web/app/resume/page.tsx`
- Add a "View" link (`<a href="/api/resume/file" target="_blank" class="btn btn-secondary btn-sm">View</a>`) next to the filename in the `.cv-meta-card`. For PDF this opens the browser PDF viewer; for MD it downloads.

**Files:** new `web/app/api/resume/file/route.ts`, `web/app/resume/page.tsx`.

---

## Step 3 — Job detail drawer

**Problem:** Jobs table links directly to external URL. Description, salary, remote flag, site, `job_url_direct` are in the CSV but never surfaced.

**Implementation:** Client-side only — no new API needed, data already in `GET /api/jobs`.
- Add `selectedJob: Job | null` state to `web/app/jobs/page.tsx`.
- Make the title cell a `<button>` that sets `selectedJob` instead of an `<a>`.
- Render a `<JobDrawer>` component (defined in the same file): fixed right panel, `position: fixed; right: 0; top: 0; height: 100%; width: 400px`, overlaid with a backdrop `<div>` that closes on click.
- Drawer content: title (with external link icon → `job_url`), company, location, posted date, site badge, remote badge, salary (if `min_amount` is set: `currency min–max / interval`), direct apply button (`job_url_direct` if set), and `description` in a scrollable `<pre>` or markdown block.
- "Shortlist" button also present in the drawer (same PATCH logic).
- CSS: `.drawer-backdrop`, `.drawer`, `.drawer-header`, `.drawer-body`, `.drawer-field`, `.drawer-label`, `.salary-display` added to `globals.css`.

**Files:** `web/app/jobs/page.tsx`, `web/app/globals.css`.

---

## Step 4 — Export CSV

**Problem:** No way to download filtered jobs from the browser.

**New route:** `web/app/api/jobs/export/route.ts`
- `GET` — reads `jobs.csv` for active profile via `jobsCsvPath()`, returns raw file bytes with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="jobs.csv"`.

**Page update:** `web/app/jobs/page.tsx`
- Add "Export CSV" `<a href="/api/jobs/export" download class="btn btn-secondary btn-sm">` in the page header's `.header-actions`.

**Files:** new `web/app/api/jobs/export/route.ts`, `web/app/jobs/page.tsx`.

---

## Step 5 — Scrape history

**Problem:** Only the last run's status is stored; previous runs are lost.

**Data:** New file `data/{profile}/scrape_history.json` — array of `ScrapeStatus` objects, newest first, capped at 20 entries.

**Lib:** Add `scrapeHistoryPath(profile)` to `web/lib/profile.ts`. Add `appendScrapeHistory(profile, entry: ScrapeStatus)` to `web/lib/scrape-status.ts` — reads array (or `[]`), prepends, slices to 20, writes back.

**Hook:** In `web/app/api/scrape/run/route.ts` close handler, after writing final status, call `appendScrapeHistory(profile, finalStatus)`.

**New route:** `web/app/api/scrape/history/route.ts`
- `GET` — returns `scrape_history.json` array (or `[]`).

**UI:** Add a "Run history" collapsible section at the bottom of `web/app/scrape/page.tsx`.
- Shows a compact table: Started | Duration | New | Total | Status chip.
- Duration computed as `(finished_at - started_at)` in seconds.
- Loaded on mount via `GET /api/scrape/history`. Refreshes after each run completes.
- CSS: `.history-table`, `.history-row`, `.history-duration` added to `globals.css`.

**Files:** `web/lib/profile.ts`, `web/lib/scrape-status.ts`, `web/app/api/scrape/run/route.ts`, new `web/app/api/scrape/history/route.ts`, `web/app/scrape/page.tsx`, `web/app/globals.css`.

---

## Step 6 — Keywords.txt import button

**Problem:** `keywords.txt` in the repo root contains the canonical 21 job titles. The scrape config job titles are managed independently in `scrape_config.json`. There's no UI to sync them.

**New route:** `web/app/api/keywords/route.ts`
- `GET` — reads `keywords.txt` from `REPO_ROOT` (same `path.resolve(process.cwd(), "..")` pattern used in `run/route.ts`), returns `{ keywords: string[] }` (non-blank lines, trimmed).

**UI:** In `web/app/scrape/page.tsx`, add a small "Import from keywords.txt" link-button next to the "Job titles" textarea label. On click, fetches `/api/keywords` and calls `updateConfig({ job: keywords })` then `flushConfig()`. Shows a brief inline confirmation ("21 keywords imported").

**Files:** new `web/app/api/keywords/route.ts`, `web/app/scrape/page.tsx`.

---

## Step 7 — Gap analysis (Claude API)

**Dependencies to install:** `pnpm add @anthropic-ai/sdk` in `web/`. API key stored in `web/.env.local` as `ANTHROPIC_API_KEY` (not committed; add to `.gitignore` if not already there).

**What it does:** Given the profile's CV and a job's description, call Claude to produce a structured gap assessment: match score (0–100), matched skills, missing skills, and a 1-sentence recommendation.

**New route:** `web/app/api/analyze/gap/route.ts`
- `POST { jobId: string }` — reads CV text from `data/{profile}/cv.md` (or extracts text from `cv.pdf` using `fs.readFile` as base64 passed to Claude as a document), reads job description from `jobs.csv` row by `jobId`, calls Claude (`claude-haiku-4-5-20251001` for speed and cost) with a structured prompt requesting JSON output `{ score, matched, missing, recommendation }`, returns the JSON. Returns 400 if no CV or no description, 503 if no API key.

**Prompt pattern:**
```
You are a career coach. Given a CV and a job description, return ONLY valid JSON:
{ "score": 0-100, "matched": ["skill"], "missing": ["skill"], "recommendation": "one sentence" }
CV: <cv text>
Job: <title at company — description>
```

**UI:** In the job detail drawer (Step 3), add an "Analyze fit" button. On click: shows a spinner, POSTs to `/api/analyze/gap`, renders result inline in the drawer — score badge (color-coded: green ≥70, amber 40–69, red <40), two pill lists (matched / missing), recommendation text.

**CSS:** `.gap-score`, `.gap-score--high/mid/low`, `.skill-pills`, `.skill-pill`, `.skill-pill--missing` added to `globals.css`.

**Files:** `web/package.json` (via pnpm add), new `web/app/api/analyze/gap/route.ts`, `web/app/jobs/page.tsx` (drawer update), `web/app/globals.css`.

---

## Step 8 — Job scoring

**What it does:** Batch-score all jobs in `jobs.csv` against the CV. Adds a `score` column (integer 0–100). Preserved on upsert (add `score` to `_PRESERVE_ON_UPSERT` in `scraper.py`... actually score is web-managed, not Python-managed, so Python never touches it).

**New route:** `web/app/api/analyze/score/route.ts`
- `POST` — reads CV, reads all jobs without a `score`, sends them to Claude in batches of 20 (to respect context limits) with a prompt: "Rate each job's fit against this CV 0-100. Return JSON array `[{jobId, score}]`." Calls `patchJob` for each result to write `score` field.

**`lib/csv.ts` update:** Allow `patchJob` to also patch a `score` field (extend the allowed patch keys).

**UI:** On the Jobs page header, add a "Score all" button. While running, shows a progress indicator. After completion, a `score` column appears in the table (sortable — add client-side sort). Score shown as a colored badge.

**`lib/statistics.ts` update:** Add average score and score distribution to `computeStatistics()`. Show on Statistics page.

**Files:** `web/lib/csv.ts`, new `web/app/api/analyze/score/route.ts`, `web/app/jobs/page.tsx`, `web/lib/statistics.ts`, `web/app/statistics/page.tsx`, `web/app/globals.css`.

---

## Step 9 — Semantic job search

**What it does:** Natural-language query field on the Jobs page. User types "remote ML roles with good salary" — Claude filters and ranks the visible jobs accordingly.

**New route:** `web/app/api/jobs/search/route.ts`
- `POST { query: string }` — reads all jobs, sends Claude a prompt with the query and a compact job list (jobId, title, company, location, is_remote, min_amount, status), asks Claude to return a JSON array of `jobId` strings ordered by relevance (only those that match). Uses `claude-haiku-4-5-20251001`.

**UI:** Replace the plain text filter input on the Jobs page with a dual-mode search bar:
- Typing triggers client-side filter (existing behavior, instant).
- Pressing Enter or clicking a "AI search" icon button sends a semantic query. Results come back as a ranked `jobId[]`; the table reorders to show those jobs first, de-emphasizing others. A "Clear AI filter" button resets to normal view.
- Shows a brief "Searching…" state while the request is in flight.

**Files:** new `web/app/api/jobs/search/route.ts`, `web/app/jobs/page.tsx`, `web/app/globals.css`.

---

## Step 10 — Scrape scheduler

**What it does:** Run scrapes automatically on a schedule (e.g., daily at 8 AM). Per-profile schedule stored in `scrape_config.json` as an optional `schedule` field (cron string, e.g. `"0 8 * * *"`, or `null`).

**Dependencies:** `pnpm add node-cron` in `web/`. Also `pnpm add -D @types/node-cron`.

**`lib/config.ts` update:** Add `schedule: string | null` to `ScrapeConfig`. Default: `null`.

**`web/instrumentation.ts`** (Next.js startup hook, runs once on server start):
- Reads all profiles via `listProfiles()`, for each reads `scrape_config.json`.
- If `schedule` is set, registers a `node-cron` job that POSTs internally to `/api/scrape/run` with the profile's cookie (or directly calls the same `spawn` logic via a shared helper extracted from `run/route.ts`).
- On `schedule` change (PUT to `/api/scrape/config`), the existing cron job for that profile is destroyed and re-registered.

**Cron management:** A module-level `Map<profile, CronJob>` in `web/lib/scheduler.ts` tracks active cron jobs. `registerSchedule(profile, cron)` / `unregisterSchedule(profile)` manage it. `run/route.ts` imports and calls these after config writes.

**UI:** On the Scrape page, add a "Schedule" row in the config form (below "Workers"). A `<select>` with options: Off / Daily at 8 AM / Daily at midnight / Weekly on Monday / Custom. Selecting "Custom" reveals a cron string `<input>`. Saves via the existing `updateConfig` + `flushConfig` path. Shows "Next run: …" timestamp computed from the cron string.

**Files:** `web/lib/config.ts`, new `web/lib/scheduler.ts`, new `web/instrumentation.ts`, `web/app/scrape/page.tsx`, `web/app/globals.css`.

---

## Verification (each step)

After every step:
1. `uv run pytest` — 65 tests must pass (steps touching Python: 1, 8 partially).
2. `cd web && pnpm build` — must be green.
3. Smoke-test the new feature against the `votrinhan88` profile via the running dev server (`pnpm dev`).

Steps 7–9 also require `ANTHROPIC_API_KEY` in `web/.env.local` and a live network call to verify the Claude responses.

---

## File change summary

| Step | New files | Modified files |
|------|-----------|----------------|
| 1 | — | `api/scrape/run/route.ts` |
| 2 | `api/resume/file/route.ts` | `resume/page.tsx` |
| 3 | — | `jobs/page.tsx`, `globals.css` |
| 4 | `api/jobs/export/route.ts` | `jobs/page.tsx` |
| 5 | `api/scrape/history/route.ts` | `lib/profile.ts`, `lib/scrape-status.ts`, `api/scrape/run/route.ts`, `scrape/page.tsx`, `globals.css` |
| 6 | `api/keywords/route.ts` | `scrape/page.tsx` |
| 7 | `api/analyze/gap/route.ts` | `jobs/page.tsx`, `globals.css` |
| 8 | `api/analyze/score/route.ts` | `lib/csv.ts`, `jobs/page.tsx`, `lib/statistics.ts`, `statistics/page.tsx`, `globals.css` |
| 9 | `api/jobs/search/route.ts` | `jobs/page.tsx`, `globals.css` |
| 10 | `lib/scheduler.ts`, `instrumentation.ts` | `lib/config.ts`, `scrape/page.tsx`, `globals.css` |
