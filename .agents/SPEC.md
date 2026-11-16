# jobspy-cli — Web App Specification

**Status:** Living document. Update this file when a decision changes.
**Last updated:** 2026-11-04 (schema and CI)

---

## Overview

A Next.js web app that serves as the user-facing interface for jobspy-cli. The Python scraping engine (`scraper.py`, `geocoder.py`, `main.py`) runs unchanged as a headless subprocess. The web app reads and writes a CSV file per profile. No database. No authentication.

---

## Repository Structure

```
jobspy-cli/
├── scraper.py
├── geocoder.py
├── facets.py
├── jobs_schema.py
├── main.py
├── schema/
│   └── jobs.json
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
| `scrape_status.json` | Scrape run status, written by the web server |
| `scrape_run.json` | Structured result of the last scrape, written by the Python subprocess |
| `source_health.json` | Per-source failure count and cooldown, written by the Python subprocess |
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
| `role_key` | string | computed | 16-char hash of the normalized company and title. It does not include the description or location, so two cities stay two jobs. Written at scrape time and backfilled for old rows on the next upsert. |
| `duplicate_of` | string | `""` | The `job_id` of the canonical row when this row is a repost of the same role in the same location. Empty for the canonical row. |
| `status` | string | `""` | One of: `shortlisted`, `applied`, `interview`, `offer`, `rejected`, `skipped`, `""`. Written by scraper (empty). Updated by web app. Preserved by upsert. |
| `status_updated_at` | string | `""` | ISO 8601 timestamp. Set by web app on status change. Preserved by upsert. |
| `region` | string | `""` | State or province of `location`, from the geocoder. Filled after the upsert, only where empty, for the location the row keeps. Old rows get it from `scripts/backfill_region.py --save_path <jobs.csv>`. Not in `_PRESERVE_ON_UPSERT`, because it is derived from `location`. |
| `first_seen_at` | string | run time | ISO 8601 timestamp of the first scrape that returned the job. Set once and never overwritten. Old rows get it on the next upsert. |
| `last_seen_at` | string | run time | ISO 8601 timestamp of the most recent scrape that returned the job. Updated on every match. |
| `closed_at` | string | `""` | ISO 8601 timestamp when a URL probe returned 404 or 410. A later sighting clears it. |
| `closed_reason` | string | `""` | `url_404` or `url_410`. Empty while the job is open. |
| `country` | string | derived | Last part of a location with a comma. A single part counts as a country only when it matches a known country name. Otherwise empty. Old rows get it from `scripts/backfill_facets.py --save_path <jobs.csv>`. |
| `city` | string | derived | First part of a location with a comma. A single metro-area name loses "Metropolitan Area", "Capital Region", "Area" or "Region". "Remote", "Anywhere" and "Worldwide" become empty. |
| `work_mode` | string | derived | `remote`, `hybrid`, `onsite` or `""`. |
| `seniority` | string | derived | `intern`, `junior`, `mid`, `senior`, `lead`, `manager`, `director`, `executive` or `""`. |
| `employment_type` | string | derived | `full_time`, `part_time`, `contract`, `internship`, `temporary`, `volunteer`, `other` or `""`. |

### Identity and duplicates

A row matches an existing row in this order:

1. The same `site` and `id`.
2. The same normalized `job_url`. The key drops the scheme, `www.`, query string, fragment and trailing slash.
3. The same `role_key` and `location`, when the new row has a URL.
4. The same title, company, location and posted date. This is the fallback when the row has no site id and no URL.

A match by site and id, by URL, or by the fallback updates the existing row. A match only by `role_key` and `location` updates the canonical row and adds the new row with `duplicate_of` set to the canonical `job_id`. The CSV keeps both rows, but `GET /api/jobs` hides rows with a non-empty `duplicate_of`. The CSV export keeps every row.

`job_id`, `status`, `status_updated_at` and `location` are never overwritten on a match. A missing description never erases an old description.

### Job lifecycle

A new row gets `first_seen_at` and `last_seen_at` from the scrape run time. A matched row keeps `first_seen_at` and gets a new `last_seen_at`. A later sighting clears `closed_at` and `closed_reason`.

A missing search result does not close a job. A keyword search is not a full catalog. The engine closes a row only when a URL probe returns 404 or 410. It probes `job_url_direct` first, then `job_url`. It probes only canonical rows that have no `closed_at` and no sighting for more than 14 days. A timeout, 403, 500 or other result leaves the row open.

Rows are never deleted. Old rows get `first_seen_at` and `last_seen_at` on the next upsert.

### Facets

The engine writes five facets. The rules are deterministic. There is no model and no network call.

- `country` and `city` come from `location`. `country` is the last comma part, and `city` is the first. A single part is a country only when it matches a known country name from `jobspy.model.Country` plus a few aliases. A single metro area such as "Greater Brisbane Area" becomes the city "Greater Brisbane", not a country.
- `work_mode` uses `is_remote` first. Then it reads clear phrases in the title and location, then the description. The order is hybrid, remote, onsite. A bare "remote" in a long description is not a match. "Remote Sensing" and "Hybrid Cloud" are not work modes.
- `seniority` uses `job_level` first. The title is the fallback. "Lead Generation" is not lead, and "Back End Cashier" is not a level. Principal and staff roles map to lead.
- `employment_type` uses `job_type` first. The title and description are the fallback. "Internal Auditor" is not an internship.
- The rules live in `facets.py` (`add_facets`, `infer_work_mode`, `infer_seniority`, `infer_employment_type`, `split_location`).
- Old rows get the facets from `scripts/backfill_facets.py --save_path <jobs.csv>`, or from the next upsert.

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

`readJobs` rejects a file that does not have the required columns from `schema/jobs.json`. The required columns are `job_id`, `title`, `company` and `location`.

The Python writer (`JobScraper._write_jobs`) fills every missing column from `schema/jobs.json` with an empty string. It writes the schema columns first, in schema order, then any extra columns. A frame without a required column raises an error. This keeps the header stable and makes the writer and the reader share one contract.

`schema/jobs.json` is a JSON Schema object for one CSV row. The `required` list holds the four columns that every reader needs. The custom `x-columns` list holds the 39 columns that the engine writes, in order. `tests/test_jobs_schema.py` checks the Python side. `web/tests/jobs-schema.test.ts` checks the TypeScript side.

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

`validateConfig` in `web/lib/config.ts` checks every field. A missing field takes the default. A bad field takes the default and adds an error. `readConfig` uses the repaired config, so one bad field never breaks the Scrape page. `writeConfig` rejects a config that has an error and writes nothing. The `PUT` route returns 400 with the first error. `results_wanted` must be a whole number from 1 to 100. `workers` must be a whole number from 1 to 16. `site_name` drops `google` and `glassdoor`, and falls back to `linkedin` and `indeed` when no site remains.

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
  "pid": null,
  "source_runs": []
}
```

`status` values: `idle` | `running` | `done` | `error`

`source_runs` holds one entry per site that the engine attempted or skipped:

```json
{
  "site": "linkedin",
  "attempts": 2,
  "succeeded": 2,
  "failed": 0,
  "skipped": 0,
  "jobs": 20,
  "duration_ms": 1234,
  "error": null
}
```

`pid` is the process id of the scrape child. A `running` status counts as live only when `pid` is set and the process still exists. Otherwise the status is stale (for example after a server crash) and a new run may start. This keeps one scrape per profile without a manual reset.

### `scrape_run.json` and `source_health.json`

The Python engine writes both files next to `jobs.csv`.

`scrape_run.json` records `started_at`, `finished_at`, `new_jobs`, `total_jobs` and the per-source `sources` list. The web server reads it after the child exits to fill `scrape_status.json`. It does not parse the log.

`source_health.json` stores the per-site `consecutive_failures`, `cooldown_until`, `last_error`, `last_error_at` and `last_success_at`. After three consecutive failed runs, a site gets a cooldown of 1 hour, doubling up to 24 hours. A run skips a site while its cooldown is live and records it as `skipped`. A successful run resets the count and clears the cooldown.

---

## Pages

### Scrape

**Function:** Trigger a scrape run, monitor its progress, view scrape history, confirm merge results.

- Config form pre-filled from `scrape_config.json`. All fields editable. Saved on change.
- "Run scrape" button starts the Python subprocess. Disabled while a run is in progress.
- The engine calls each site separately. A failed site does not stop the other sites.
- Progress indicator polls `GET /api/scrape/status` every 5 seconds.
- On completion: diff summary shows new jobs added, existing jobs updated, total jobs.
- The counts include canonical rows only. A row with a non-empty `duplicate_of` stays in the CSV but is not counted.
- The source table shows the last run's sites, status, job count, duration and error.
- Scrape history: list of past runs with timestamp, duration, and job counts.

### Jobs

**Function:** View all rows in `jobs.csv`, regardless of status.

- Table of all scraped jobs. Default sort: Posted, newest first. The Title, Company, Location, Posted and Status headers are sort buttons with `aria-sort`. Empty values sort last. Status sorts in pipeline order.
- The Location sort orders by country (the last part of `location`), then region, then city. Empty values sort last in both directions. A "Group by location" toggle (`aria-pressed`, off by default) adds country and region header rows with job counts. Countries and regions are alphabetical, "Unknown location" and "No region" come last, and the current sort orders the rows inside each region. The logic is in `web/lib/jobs-view.ts` (`splitLocation`, `groupByLocation`).
- Status filter chips with counts: All, New, Shortlisted, Applied, Interview, Offer, Rejected, Skipped (toggle buttons with `aria-pressed`; several can be on). A "Remote only" toggle. Counts follow the search and the remote filter, not the status filter.
- Search (labelled) matches title, company and location. Every word must match. The counter reads "{n} of {total} jobs".
- New rows have "Shortlist" and "Skip". A skipped job stays in the list with its chip. Each change shows the undo toast.
- The table has a "Last seen" column. A job with no sighting for more than 14 days gets a "Stale" badge. A job with `closed_at` gets a "Closed" badge instead.
- A facet bar has five selects: Country, City, Work mode, Seniority and Employment type. "Clear facets" resets them. The status counts respect the facet filters. The options come from the loaded rows.
- The detail drawer is a modal dialog: `role="dialog"`, `aria-modal`, labelled by the job title. Focus moves into it and returns to the row on close. Tab stays inside. Escape, the close button and a backdrop click close it. It has Shortlist, Skip and the status menu. It shows Last seen, and Closed with the reason when the job is closed.
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
- Facets: top countries, top cities, work modes, seniority and employment types by count. Work mode, seniority and employment type use display labels.
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
| `GET` | `/api/jobs` | Read `jobs.csv` for active profile. Rows have no `description` key, to keep the list light. Rows with a non-empty `duplicate_of` are left out |
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
| `PUT` | `/api/scrape/config` | Validate every field (400 on a bad field or an invalid cron expression, nothing saved), write the cleaned `scrape_config.json`, re-register the profile schedule |
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
3. Python subprocess runs. The engine calls one site at a time, records each site's result, writes `scrape_run.json` and updates `source_health.json`. The web server reads `scrape_run.json` after the child exits and writes `status: done` (or `error` when every attempted site failed).
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

## Quality Gates

Every change must pass these checks before a commit:

- Python: `uv run pytest`
- Web: `cd web && pnpm test`
- Types: `cd web && pnpm exec tsc --noEmit`
- Lint: `cd web && pnpm lint` (advisory)
- Build: `cd web && pnpm build`
- Secrets: gitleaks on the full history

GitHub Actions runs the Python suite, the web suite, the type check, lint, the build and gitleaks on every push and pull request to `main` (`.github/workflows/ci.yml`). Dependabot checks `uv`, npm and GitHub Actions each week (`.github/dependabot.yml`).

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
