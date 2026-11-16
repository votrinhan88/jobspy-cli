# jobspy-cli — Web App Specification

**Status:** Living document. Update this file when a decision changes.
**Last updated:** 2026-10-02 (UX review fixes)

---

## Overview

A Next.js web app that serves as the user-facing interface for jobspy-cli. The Python scraping engine (`scraper.py`, `geocoder.py`, `main.py`) runs unchanged as a headless subprocess. The web app reads and writes a CSV file per profile. No database. No authentication.

---

## Repository Structure

```
jobspy-cli/
├── scraper.py
├── geocoder.py
├── main.py
├── data/
│   └── {profile}/
│       ├── jobs.csv
│       ├── scrape_config.json
│       ├── cv.pdf              # or .md
│       ├── scrape_status.json
│       └── status_log.jsonl    # written by the web app only
└── web/
    └── src/
        ├── app/
        │   ├── scrape/
        │   ├── jobs/
        │   ├── applications/
        │   ├── resume/
        │   ├── profile/
        │   └── api/
        ├── components/
        └── lib/
```

---

## Tech Stack

- **Framework:** Next.js, App Router, TypeScript
- **UI:** shadcn/ui, Tailwind CSS
- **Package manager:** pnpm
- **Data storage:** flat files under `data/{profile}/`
- **Python bridge:** Node.js `child_process.spawn` to call `main.py`

---

## Profiles

- Each profile is a named workspace. It maps to a directory at `data/{profile}/`.
- The active profile is stored in a session cookie (same pattern as certpal).
- A profile represents a job-search campaign — different target roles, locations, and CV.
- The user creates profiles from the Profile page. There is no default profile created automatically.
- Switching profile changes the active data directory for the entire session.
- Cookie fallback: `getActiveProfile()` uses the cookie value only if it is a valid profile name (`[a-zA-Z0-9_-]{1,64}`) and the folder exists. Otherwise it uses the first profile in alphabetical order. If no profile exists, it returns `null`. It does not write the cookie.
- Path safety: every path helper in `web/lib/profile.ts` throws for an invalid profile name and checks that the result is inside the data folder. `listProfiles()` lists only folders with a valid name.
- The data folder is `JOBSPY_DATA_DIR` if set, else `../data` from `web/`. Tests use this to work in a temp folder.

### Profile directory contents

| File | Purpose |
|------|---------|
| `jobs.csv` | All scraped jobs and application state for this profile |
| `scrape_config.json` | Default scrape parameters for this profile |
| `cv.pdf` / `cv.md` | CV file uploaded by the user |
| `scrape_status.json` | Scrape run status, written by the Python subprocess |
| `scrape.log` | stdout/stderr of the most recent scrape subprocess; reset on each run |
| `status_log.jsonl` | Append-only history of status changes, one JSON object per line. Written by the web app. The engine does not read it. |

`data/.geocache.json` lives at the `data/` root (shared across all profiles) and caches Nominatim geocoding results by raw location string. `data/.regioncache.json` caches the region (state or province) of a standardized location ("City, Country"). A failed lookup is not cached.

---

## Data Model

### `jobs.csv` columns

All existing scraper columns plus:

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `job_id` | string | computed | Kebab-case slug: `{company}-{title}-{8-char-md5(job_url)}`. Max 20 chars per segment before slugifying. Written at scrape time. Preserved by upsert. |
| `status` | string | `""` | One of: `shortlisted`, `applied`, `interview`, `offer`, `rejected`, `skipped`, `""`. Written by scraper (empty). Updated by web app. Preserved by upsert. |
| `status_updated_at` | string | `""` | ISO 8601 timestamp. Set by web app on status change. Preserved by upsert. |
| `region` | string | `""` | State or province of `location`, from the geocoder. Filled after the upsert, only where empty, for the location the row keeps. Old rows get it from `scripts/backfill_region.py --save_path <jobs.csv>`. Not in `_PRESERVE_ON_UPSERT`, because it is derived from `location`. |

### Status pipeline

Pipeline order (used for sorting and display): `""` (new), `shortlisted`, `applied`, `interview`, `offer`, `rejected`, `skipped`.

Statuses are free-flowing. Any status can move to any other status, including back to `""`. There is no transition table, no disabled move and no confirmation dialog. Undo is the safety net. The single source of truth is `web/lib/status.ts` (order, labels, `isActiveStatus`, `isArchivedStatus`, `isRemote`).

- Active: `shortlisted`, `applied`, `interview`, `offer`.
- Archived: `rejected`, `skipped`.
- Remote: `is_remote` is `true`, `yes` or `1` (any case).

Jobs enter the Applications page when `status` is non-empty. A job set back to `""` leaves Applications and shows as new on Jobs.

### `status_log.jsonl` structure

One line per successful status change, appended by `PATCH /api/jobs/[jobId]`. Undo also appends a line. Lines are never edited or removed.

```json
{"job_id": "acme-data-scientist-1a2b3c4d", "from": "shortlisted", "to": "applied", "at": "2026-09-12T08:30:00.000Z"}
```

`at` is the stored `status_updated_at`. When undo restores an empty timestamp, `at` is the time of the undo. Readers skip blank and corrupt lines. A missing file means no history. The status log is a side file so the CSV columns and the engine invariants do not change.

### CSV read and write

`web/lib/csv.ts` uses its own single-pass parser (RFC 4180 style): quoted fields with commas, newlines (LF and CRLF) and `""` escapes, CRLF row ends, a blank last line and a leading byte-order mark. Short rows are padded. `writeJobs` writes the union of all column names (order of first appearance), quotes fields that contain a comma, a quote, `\n` or `\r`, and writes atomically (temp file in the same folder, then rename). An empty job list leaves the file untouched.

### `scrape_config.json` structure

```json
{
  "job": ["AI Engineer", "ML Engineer"],
  "location": ["Australia", "Vietnam"],
  "results_wanted": 20,
  "site_name": ["linkedin", "indeed", "zip_recruiter"],
  "workers": 4,
  "title_exclude": [],
  "exclude_companies": [],
  "schedule": null,
  "fetch_linkedin_description": true
}
```

`fetch_linkedin_description` (default `true`, also for files without the field) adds `--fetch_description` to the scrape. LinkedIn gives no job text without it, and scrapes get slower. The scraper keeps the `description` column in `jobs.csv`. On upsert a known job gets the new description only when it is not empty, so a scrape without text never erases an old description. `description` is not in `_PRESERVE_ON_UPSERT`.

All fields except `schedule` and `fetch_linkedin_description` match existing CLI arguments. The web app reads this file as form defaults and writes it back on change.

`schedule` is a cron expression (for example `0 8 * * *`) or `null` (off). A missing field reads as `null`. The server registers one `node-cron` task per profile that has a schedule. It registers all saved schedules at startup (`web/instrumentation.ts`) and re-registers a profile when `PUT /api/scrape/config` saves a change. A scheduled run uses the same `startScrape` function as `POST /api/scrape/run`, so it skips when a scrape is already running for that profile. Deleting a profile unregisters its task. Renaming a profile unregisters the old task and registers the saved schedule under the new name. Schedules use server local time and fire only while the server process runs. `PUT /api/scrape/config` rejects a schedule while `job` is empty. A scheduled run with no keywords skips and logs one line.

### `scrape_status.json` structure

Written by the web server (`lib/scrape-runner.ts`). Read by the web app via polling.

```json
{
  "status": "idle",
  "started_at": null,
  "finished_at": null,
  "new_jobs": null,
  "updated_jobs": null,
  "total_jobs": null,
  "error": null,
  "pid": null
}
```

`status` values: `idle` | `running` | `done` | `error`

`pid` is the process id of the scrape child. A `running` status counts as live only when `pid` is set and the process still exists. Otherwise the status is stale (for example after a server crash) and a new run may start. This keeps one scrape per profile without a manual reset.

---

## Pages

### Scrape

**Function:** Trigger a scrape run, monitor its progress, view scrape history, confirm merge results.

- Config form pre-filled from `scrape_config.json`. All fields editable. Saved on change.
- "Run scrape" button starts the Python subprocess. Disabled while a run is in progress.
- Progress indicator polls `GET /api/scrape/status` every 5 seconds.
- On completion: diff summary shows new jobs added, existing jobs updated, total jobs.
- Scrape history: list of past runs with timestamp, duration, and job counts.

### Jobs

**Function:** View all rows in `jobs.csv`, regardless of status.

- Table of all scraped jobs. Default sort: Posted, newest first. The Title, Company, Location, Posted and Status headers are sort buttons with `aria-sort`. Empty values sort last. Status sorts in pipeline order.
- The Location sort orders by country (the last part of `location`), then region, then city. Empty values sort last in both directions. A "Group by location" toggle (`aria-pressed`, off by default) adds country and region header rows with job counts. Countries and regions are alphabetical, "Unknown location" and "No region" come last, and the current sort orders the rows inside each region. The logic is in `web/lib/jobs-view.ts` (`splitLocation`, `groupByLocation`).
- Status filter chips with counts: All, New, Shortlisted, Applied, Interview, Offer, Rejected, Skipped (toggle buttons with `aria-pressed`; several can be on). A "Remote only" toggle. Counts follow the search and the remote filter, not the status filter.
- Search (labelled) matches title, company and location. Every word must match. The counter reads "{n} of {total} jobs".
- New rows have "Shortlist" and "Skip". A skipped job stays in the list with its chip. Each change shows the undo toast.
- The detail drawer is a modal dialog: `role="dialog"`, `aria-modal`, labelled by the job title. Focus moves into it and returns to the row on close. Tab stays inside. Escape, the close button and a backdrop click close it. It has Shortlist, Skip and the status menu.
- The drawer has a short "Resume fit" summary (`web/app/jobs/_components/resume-fit.tsx`): the best resume tag, its keyword score and a link "Open resume review". A job without a description shows a note. A profile without resumes links to the Resume page.
- The review page `/jobs/[jobId]/review` shows one resume beside its fit report. A tag select picks the resume (default: the best keyword match). The left side shows the original file (a PDF in the browser viewer, other types as text). The right side is `web/app/jobs/_components/fit-report.tsx`: keyword score with matched and missing words, then the Claude analysis, then the "Submitted with this resume" checkbox.
- "Analyse fit" asks for a confirm step that shows the size, then calls the Claude API (`web/lib/analysis.ts`). The key is `ANTHROPIC_API_KEY` and the model is `claude-haiku-5-5` unless `ANTHROPIC_MODEL` is set. The request sends the job text and the whole resume text, including contact details. The result has a score (an alignment hint, not a hiring prediction), a summary, strengths, a requirements table (requirement, evidence, verdict `strong`, `partial`, `weak` or `missing`, reasoning), gaps with fix ideas, and suggested wording (original line and better line, each with a Copy button). The app never edits a resume.
- A saved result lives in `data/{profile}/analysis/{jobId}--{tag}.json` with the resume version, the resume text hash and the job description hash. When the resume text or the job text changes, the page marks the saved result "out of date". Re-run replaces it. Renaming a resume moves its results, and deleting a resume deletes them. Without the key the page shows a notice and no button.
- The "Submitted with this resume" checkbox records the tag, the resume version and the text hash in `data/{profile}/submitted.json`. The page warns when the resume text changed after the submission.
- Pure view logic lives in `web/lib/jobs-view.ts` (`sortJobs`, `filterJobs`, `statusCounts`).

### Applications

**Function:** Monitor and manage jobs with a non-empty status.

- Shows only rows where `status` is non-empty. The header shows "{n} active applications, {m} archived" (active and archived as defined in the status pipeline).
- Views: Kanban, Table, Gantt. The toggle buttons use `aria-pressed`. The last view is kept in `localStorage` key `applications_view`.
- Every card and table row has a status menu with all statuses plus "Back to new". The current status is marked. Cards also have one primary button for the usual next step (Mark applied, Move to interview, Got offer). No confirmation dialogs. Each change shows the undo toast.
- Gantt: one row per job (title and company at the left), week ticks on the time axis, bars in the status colours. Each bar has a `title` and an accessible name such as "Applied, 12 Sep to 18 Sep". Rows sort by most recent activity. The chart scrolls inside its own container. Data comes from `GET /api/jobs/log` and `GET /api/jobs`, built by `buildGanttRows` in `web/lib/gantt.ts`. A log entry with an earlier time than the entries before it (an undo) removes the undone segments. A job with no log gets one segment from its `status_updated_at`.

### Statistics

**Function:** Show pipeline stats and a status-change timeline for the active profile.

- Reads all rows in `jobs.csv` for the active profile via `GET /api/jobs`.
- Summary cards: total jobs, active (shortlisted + applied + interview + offer), remote (shared `isRemote`), archived (rejected + skipped).
- Pipeline funnel: count per status with a color bar scaled to the largest status count.
- Timeline: status-change activity grouped by week (Monday-based) from `status_updated_at`, for rows with a non-empty status, scaled to the busiest week.
- Breakdown: top companies and top locations by count.
- Pure stats computation lives in `web/lib/statistics.ts` (`computeStatistics`) so it is testable without the UI.

### Resume

**Function:** Keep a library of resumes, one per tag, for the active profile. The app does not edit or build resumes. You write them in your own tool and import the file.

- A tag is a kebab-case label for one resume version (for example a role or a company). Each tag holds one resume. Importing under an existing tag replaces it and raises the version when the text differs.
- Import accepts `.pdf`, `.tex`, `.md` and `.txt` files up to 5 MB, or pasted text. The app keeps the original file and extracts plain text. PDF text comes from `pdfjs-dist`. LaTeX commands are stripped from `.tex` text. The extracted text feeds the keyword match and the Claude analysis.
- The page lists the resumes (file name, version, import date) and has View, Download, Replace (fills the import form), Rename and Delete (inline confirm). The viewer shows a PDF in the browser and other types as text.
- Files: `data/{profile}/resume-library/{tag}/` with `original.<ext>`, `text.txt` and `meta.json` (`tag`, `fileName`, `ext`, `importedAt`, `version`, `textHash`). Logic lives in `web/lib/resumes/` (`extract.ts`, `library.ts`).
- The LaTeX builder, its template and `pdflatex` are gone. Old `data/{profile}/resumes/*.json` files and `cv.pdf` / `cv.md` stay on disk and nothing reads them.

### Profile

**Function:** Create and switch profiles.

- List all profiles (directories under `data/`).
- Create a new profile (creates directory + default `scrape_config.json`), then **immediately auto-switches** to it and reloads.
- Switch active profile by clicking the row (no separate button).
- Rename via pencil icon — calls `PATCH /api/profiles/[name]`, which renames the folder with `fs.rename` and keeps every file. Save and Cancel are disabled until the call ends. On error the old name stays and an error toast shows. If the renamed profile was active, the page reloads so the nav chip shows the new name.
- Delete via trash icon — shows an **inline confirmation** (no `window.confirm`): clicking trash reveals "Delete? / Yes / Cancel" in the row. On confirm, if the deleted profile was active, the server auto-switches to the next alphabetical profile or clears the cookie if none remain, and the client reloads.
- Active profile is highlighted with an "Active" tag.
- Active profile name is shown as a chip inline on the "Profile" nav row (right-aligned, pushed with `margin-left: auto`).

---

## API Routes

| Method | Path | Function |
|--------|------|---------|
| `GET` | `/api/jobs` | Read `jobs.csv` for active profile. Rows have no `description` key, to keep the list light |
| `GET` | `/api/jobs/[jobId]` | One row with its `description` (empty string when none). 404 unknown job |
| `GET` | `/api/jobs/[jobId]/match` | `{ hasDescription, ranking }`. Ranking is a list of `{ tag, score, matched, missing }`, best first. Empty when the job has no description or there are no tags |
| `GET` | `/api/jobs/[jobId]/analysis?tag=` | `{ available, sendChars, saved, stale }`. 400 bad tag, 404 unknown job or tag |
| `POST` | `/api/jobs/[jobId]/analysis` | Body `{ tag }`. Runs and saves the gap analysis. 400 bad tag, 404 unknown job or tag, 422 no description, 503 no `ANTHROPIC_API_KEY`, 502 API failure. Returns `{ model, created_at, tag, resume_version, resume_hash, job_hash, analysis }` |
| `PATCH` | `/api/jobs/[jobId]` | Body `{ status, status_updated_at? }`. Any status to any status, including `""`. `status_updated_at` is optional: an ISO 8601 date and time, or `""` (undo of a new job); absent means now; invalid gives 422. Unknown status gives 422, unknown job 404, no profile 400. Keeps other columns and row order. Appends one line to `status_log.jsonl`. Returns the updated row. |
| `GET` | `/api/jobs/log` | Read `status_log.jsonl` for the active profile; returns a list of `{ job_id, from, to, at }` |
| `GET` | `/api/scrape/status` | Read `scrape_status.json` |
| `POST` | `/api/scrape/run` | Spawn Python subprocess, reset `scrape.log`, write initial `scrape_status.json`. Returns 409 when a live scrape runs, 400 when `job` is empty |
| `GET` | `/api/scrape/log` | Read `scrape.log` for the active profile (plain text) |
| `GET` | `/api/scrape/config` | Read `scrape_config.json` |
| `PUT` | `/api/scrape/config` | Validate `schedule` (400 on an invalid cron expression, nothing saved), write `scrape_config.json`, re-register the profile schedule |
| `GET` | `/api/resumes` | Returns `{ resumes }` (details of each resume) |
| `POST` | `/api/resumes` | Multipart body: `tag` and `file`, or `tag` and `text`. 200 `{ tag, version }`, 400 bad tag or no input, 413 over 5 MB, 415 unsupported type, 422 empty or unreadable file |
| `GET` `PATCH` `DELETE` | `/api/resumes/[tag]` | Read `{ meta, text }` (404 unknown), rename (body `{ tag }`; 400 / 404 / 409; moves analyses and the submitted record), delete (404 unknown; deletes analyses) |
| `GET` | `/api/resumes/[tag]/file` | The original file. Inline by default, `?download=1` for an attachment. 404 unknown |
| `GET` `PUT` | `/api/jobs/[jobId]/submitted` | Read `{ submitted, changed }`. Save body `{ tag }` records the tag with its current version and hash, `{ tag: null }` clears it. 400 / 404 |
| `GET` | `/api/profiles` | List all profile directories; returns `{ profiles, active }` |
| `POST` | `/api/profiles` | Create a new profile |
| `POST` | `/api/profiles/switch` | Set active profile cookie |
| `PATCH` | `/api/profiles/[name]` | Rename a profile. Body `{ name }`. 422 for an invalid old or new name, 404 if the old profile does not exist, 409 if the new name exists, 200 with no change for the same name. Uses `fs.rename`. Moves the cookie if the renamed profile was active. Returns `{ name, active }` |
| `DELETE` | `/api/profiles/[name]` | Delete profile directory; if it was active, auto-switches to next profile or clears cookie; returns `{ name, newActive }` |

---

## Scrape Trigger Flow

1. User clicks "Run scrape" on the Scrape page.
2. `POST /api/scrape/run` resets `scrape.log`, writes `scrape_status.json` with `status: running`, then spawns `uv run python main.py` with args from `scrape_config.json` plus `--save_path data/{profile}/jobs.csv`. All multi-value args (`--job`, `--location`, `--site_name`, etc.) are passed as a single flag with space-separated values so argparse `nargs='+'` collects them all. `PYTHONUNBUFFERED=1` is set so Python flushes output line-by-line. stdout and stderr are redirected to `scrape.log` via a file descriptor (not piped through Node) so logging works with `detached: true`.
3. Python subprocess runs. On exit: API route writes `status: done` (or `error`).
4. Frontend polls `GET /api/scrape/status` every 5 seconds. Updates progress indicator. A collapsible log panel polls `GET /api/scrape/log` every 3 seconds while running.
5. On `done`: frontend shows diff summary. Polling stops.

Concurrent runs against the same profile are blocked — "Run scrape" button is disabled while `scrape_status.json` reports `running`.

---

## UI Conventions

**Toast** — fixed pill, bottom-center, floats above layout. Spring in, fade+sink out over 1 s after 9 s. Persisted across reload via `sessionStorage` key `profile_notif`. (Profile page.)

**Toast with undo** — `web/components/toast.tsx` (`ToastProvider`, `useToast`). Message, optional action button, close button, auto-dismiss after 8 s, inside an `aria-live="polite"` region. A new toast replaces the current one. Status changes use `useChangeStatus` (`web/components/use-change-status.ts`): it saves the previous `status` and `status_updated_at`, sends the PATCH, shows "Moved {title} to {status}." with Undo. Undo sends the previous values back.

**Status menu** — `web/components/status-menu.tsx`. A menu button with `role="menu"` and `menuitemradio` items: all statuses plus "Back to new". Arrow keys, Home, End and Escape work. Focus returns to the button.

**Focus ring** — 2 px solid accent colour with a 2 px offset on `:focus-visible` (inset inside clipping containers).

**Mobile layout (768 px and below)** — the sidebar becomes a top bar with a "Menu" button (`aria-expanded`, `aria-controls`). The nav panel slides in and closes on Escape, link click and backdrop click; focus returns to the button. Jobs rows render as cards. Kanban columns are 260 px wide and scroll sideways with scroll snap. Tables and the Gantt chart scroll inside their own container. The drawer is full screen. Statistics cards stack in one column. Every pressable control is at least 44 by 44 px.

**Content width** — all pages share one 1200 px container, so the left edge does not move between pages. Narrow pages keep their content at 796 px or less.

**Dialogs** — no `window.confirm`. Destructive actions use inline confirmation in the same row: click → "Label? / Yes / Cancel".

**Sidebar** — 180 px above 768 px width, sentence case. Nav order: Profile, Resume, Scrape, Jobs, Applications, Statistics. Active profile chip inline on the Profile row (right-aligned); no footer chip.

**Scrape config** — multi-line fields are `<textarea>` (10 rows, no resize). Auto-saved debounced 600 ms; flushed immediately on blur. Glassdoor shown but blocked with a tooltip badge.

**Scrape log** — collapsible `<details>` spoiler on the Scrape page, below the status banner. Loads last log on mount. Polls every 3 s while a run is active; does a final fetch on completion. Auto-scrolls to the bottom as lines arrive.

---

## Deferred

| Item | Deferred until |
|------|---------------|
| Job scoring (feature 4) | After semantic CV/JD matching (feature 6 or 9) |
| Gap analysis via Claude API (feature 6) | Done on 2026-11-02 (Jobs drawer, "Resume fit") |
| Semantic job search (feature 9) | Dropped on 2026-11-01. Reopen if text search misses wanted jobs |
| SQLite migration | When CSV flat-file access becomes a bottleneck |
| Authentication | If the app is ever exposed beyond localhost |

---

## Known Constraints

- Concurrent scrape runs against the same profile are not supported.
- The Python subprocess inherits the server's working directory. The `--save_path` arg must be an absolute path.
- CV preview in the browser requires the file to be served as a static asset or via an API route — the browser cannot read `data/{profile}/cv.pdf` directly from disk.
