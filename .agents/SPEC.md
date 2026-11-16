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
| `keywords.txt` | Saved job titles for this profile, one per line. Written and read by the Job titles save and load icons. Optional |
| `cv.pdf` / `cv.md` | CV file uploaded by the user |
| `scrape_status.json` | Scrape run status, written by the web server |
| `scrape_run.json` | Structured result of the last scrape, written by the Python subprocess |
| `source_health.json` | Per-source failure count and cooldown, written by the Python subprocess |
| `scrape.log` | stdout/stderr of the most recent scrape subprocess; reset on each run |
| `status_log.jsonl` | History of status changes, one JSON object per line, forward steps only. A backward move rewrites the job's history instead of appending. Written by the web app. The engine does not read it. |

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
| `status` | string | `""` | One of: `shortlisted`, `applied`, `interview`, `offer`, `accepted`, `rejected`, `skipped`, `""`. Written by scraper (empty). Updated by web app. Preserved by upsert. |
| `status_updated_at` | string | `""` | ISO 8601 timestamp. Set by web app on status change. Preserved by upsert. |
| `region` | string | `""` | State or province of `location`, from the geocoder. Filled after the upsert, only where empty, for the location the row keeps. Old rows get it from `scripts/backfill_region.py --save_path <jobs.csv>`. Not in `_PRESERVE_ON_UPSERT`, because it is derived from `location`. |
| `first_seen_at` | string | run time | ISO 8601 timestamp of the first scrape that returned the job. Set once and never overwritten. Rows from before the lifecycle columns keep it empty, because the app cannot prove their first sighting. |
| `last_seen_at` | string | run time | ISO 8601 timestamp of the most recent scrape that returned the job. Updated on every match. |
| `closed_at` | string | `""` | ISO 8601 timestamp when a URL probe returned 404 or 410. A later sighting clears it. |
| `closed_reason` | string | `""` | `url_404` or `url_410`. Empty while the job is open. |
| `country` | string | derived | Last part of a location with a comma. A single part counts as a country only when it matches a known country name. Otherwise empty. Old rows get it from `scripts/backfill_facets.py --save_path <jobs.csv>`. |
| `city` | string | derived | First part of a location with a comma. A single metro-area name loses "Metropolitan Area", "Capital Region", "Area" or "Region". "Remote", "Anywhere" and "Worldwide" become empty. One metro area has one label: a lone Australian state name becomes empty, metro and suburb names roll up to the metro city, and the Vietnamese "Thành phố" or "TP." prefix is dropped. Unknown names stay as they are. |
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

A row from before the lifecycle columns gets `last_seen_at` when a later scrape returns it. Its `first_seen_at` stays empty, so the app never marks an old row as New by mistake.

A missing search result does not close a job. A keyword search is not a full catalog. The engine closes a row only when a URL probe returns 404 or 410. It probes `job_url_direct` first, then `job_url`. It probes only canonical rows that have no `closed_at` and no sighting for more than 14 days. A timeout, 403, 500 or other result leaves the row open.

Rows are never deleted. A row with no sighting and no first-seen time stays empty. A later run does not invent timestamps for it.

### Facets

The engine writes five facets. The rules are deterministic. There is no model and no network call.

- `country` and `city` come from `location`. `country` is the last comma part, and `city` is the first. A single part is a country only when it matches a known country name from `jobspy.model.Country` plus a few aliases. A single metro area such as "Greater Brisbane Area" becomes the city "Brisbane", not a country.
- The city value is one label per metro area, because the city facet is a filter. A location that only names an Australian state gives an empty city, so "NSW, Australia" keeps the country and the region. Metro and suburb names roll up: "Greater Brisbane" becomes "Brisbane", and "North Sydney", "Chatswood", "Parramatta", "Bella Vista" and "Belrose" become "Sydney". The Vietnamese prefix "Thành phố" or "TP." is dropped, so the labels are "Hồ Chí Minh", "Hà Nội", "Đà Nẵng" and "Hải Phòng". The English names "Ho Chi Minh City" and "Hanoi" map to the same labels. A name that is not in the table passes through unchanged.
- The table is `_CITY_ALIASES` in `facets.py`, with `_AUSTRALIAN_REGIONS`, `_CITY_PREFIX` and `_canonical_city`. It is a fixed list, not a gazetteer. No model and no network call.
- `work_mode` uses `is_remote` first. Then it reads clear phrases in the title and location, then the description. The order is hybrid, remote, onsite. A bare "remote" in a long description is not a match. "Remote Sensing" and "Hybrid Cloud" are not work modes.
- `seniority` uses `job_level` first. The title is the fallback. "Lead Generation" is not lead, and "Back End Cashier" is not a level. Principal and staff roles map to lead.
- `employment_type` uses `job_type` first. The title and description are the fallback. "Internal Auditor" is not an internship.
- The rules live in `facets.py` (`add_facets`, `infer_work_mode`, `infer_seniority`, `infer_employment_type`, `split_location`).
- Old rows get the facets from `scripts/backfill_facets.py --save_path <jobs.csv>`, or from the next upsert.

### Status pipeline

Pipeline order (used for sorting and display): `""` (untriaged), `shortlisted`, `applied`, `interview`, `offer`, `accepted`, `rejected`, `skipped`.

Statuses are free-flowing. Any status can move to any other status, including back to `""`. There is no transition table, no disabled move and no confirmation dialog. Undo is the safety net. The single source of truth is `web/lib/status.ts` (order, labels, `isActiveStatus`, `isArchivedStatus`, `isSkippedStatus`, `isTrackedStatus`, `isRemote`).

- Active: `shortlisted`, `applied`, `interview`, `offer`.
- Archived: `accepted`, `rejected`, `skipped`. Accepted and rejected rows stay in the Applications Archive section. Skipped rows move to the Archived page.
- Remote: `is_remote` is `true`, `yes` or `1` (any case).

Jobs enter the Applications page when `status` is tracked. A job set back to `""` leaves Applications and returns to Jobs as Untriaged. It gets the New badge only when `first_seen_at` is in the latest scrape run.

### `status_log.jsonl` structure

One line per successful status change, appended by `PATCH /api/jobs/[jobId]`. Undo also appends a line. Lines are never edited or removed.

```json
{"job_id": "acme-data-scientist-1a2b3c4d", "from": "shortlisted", "to": "applied", "at": "2026-09-12T08:30:00.000Z"}
```

`at` is the stored `status_updated_at`. When undo restores an empty timestamp, `at` is the time of the undo. Readers skip blank and corrupt lines. A backward move cuts the job's steps after the last arrival at the stage it returns to and writes no line; a job with no earlier arrival gets one step from Scrape. A missing file means no history. The status log is a side file so the CSV columns and the engine invariants do not change.

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
  "companies": [],
  "providers": ["greenhouse", "lever", "ashby", "workday"],
  "schedule": null,
  "fetch_linkedin_description": true
}
```

`fetch_linkedin_description` (default `true`, also for files without the field) adds `--fetch_description` to the scrape. LinkedIn gives no job text without it, and scrapes get slower. The scraper keeps the `description` column in `jobs.csv`. On upsert a known job gets the new description only when it is not empty, so a scrape without text never erases an old description. `description` is not in `_PRESERVE_ON_UPSERT`.

`companies` (default `[]`, also for files without the field) adds `--company` for each entry. An entry must look like `greenhouse:board[:Company Name]`; the other providers are `lever`, `ashby` and `workday`. A Workday entry needs its host cluster and site, as in `workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA`. The web app reports and drops an entry that does not match, so a bad value cannot build another URL. This field has its own syntax because a company board is not a job site.

`providers` (default every ATS provider) is the tick list on the Scrape page. The runner passes `--company` only for entries whose provider is ticked, so a board stays saved while its provider is off. An unknown provider is dropped with an error.

All fields except `schedule` and `fetch_linkedin_description` match existing CLI arguments. The web app reads this file as form defaults and writes it back on change.

`validateConfig` in `web/lib/config.ts` checks every field. A missing field takes the default. A bad field takes the default and adds an error. `readConfig` uses the repaired config, so one bad field never breaks the Scrape page. `writeConfig` rejects a config that has an error and writes nothing. The `PUT` route returns 400 with the first error. `results_wanted` must be a whole number from 1 to 100. `workers` must be a whole number from 1 to 16. `site_name` drops `google`, and falls back to `linkedin`, `indeed` and `glassdoor` when no site remains.

`schedule` is a cron expression (for example `0 8 * * *`) or `null` (off). A missing field reads as `null`. The server registers one `node-cron` task per profile that has a schedule. It registers all saved schedules at startup (`web/instrumentation.ts`) and re-registers a profile when `PUT /api/scrape/config` saves a change. A scheduled run uses the same `startScrape` function as `POST /api/scrape/run`, so it skips when a scrape is already running for that profile. Deleting a profile unregisters its task. Renaming a profile unregisters the old task and registers the saved schedule under the new name. Schedules use server local time and fire only while the server process runs. `PUT /api/scrape/config` rejects a schedule while `job` is empty. A scheduled run with no keywords skips and logs one line.

### `scrape_status.json` structure

Written by the web server (`lib/scrape-runner.ts`). Read by the web app via polling.

```json
{
  "status": "idle",
  "started_at": null,
  "finished_at": null,
  "new_jobs": null,
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

`scrape_run.json` records `started_at`, `finished_at`, `new_jobs`, `changed_jobs`, `total_jobs` and the per-source `sources` list. `changed_jobs` counts existing rows whose stored content changed in this run. The status, the lifecycle fields, the geocoded location and the facets do not count. The web server reads it after the child exits to fill `scrape_status.json`. It does not parse the log.

`source_health.json` stores the per-site `consecutive_failures`, `cooldown_until`, `last_error`, `last_error_at` and `last_success_at`. After three consecutive failed runs, a site gets a cooldown of 1 hour, doubling up to 24 hours. A run skips a site while its cooldown is live and records it as `skipped`. A successful run resets the count and clears the cooldown.

---

## Pages

### Scrape

**Function:** Trigger a scrape run, monitor its progress, view scrape history, confirm merge results.

- Config form pre-filled from `scrape_config.json`. All fields editable. Saved on change.
- The Job titles field has a save icon and a load icon. Save writes the current titles to the profile's `keywords.txt`. Load replaces the titles with that file's lines and saves the config. A profile with no file shows "No saved job titles".
- "Run scrape" button starts the Python subprocess. Disabled while a run is in progress.
- The engine calls each site separately. A failed site does not stop the other sites.
- Progress indicator polls `GET /api/scrape/status` every 5 seconds.
- On completion: diff summary shows new jobs added and total jobs.
- The counts include canonical rows only. A row with a non-empty `duplicate_of` stays in the CSV but is not counted.
- The source table shows the last run's sites, status, job count, duration and error.
- Scrape history: list of past runs with timestamp, duration, and job counts.

### Jobs

**Function:** View active rows in `jobs.csv`. Skipped rows live on the Archived page.

- Table of all scraped jobs. Default sort: Posted, newest first. The Title, Company, Location, Posted and Status headers are sort buttons with `aria-sort`. Empty values sort last. Status sorts in pipeline order.
- The Location sort orders by country (the last part of `location`), then region, then city. Empty values sort last in both directions. A "Group by location" toggle (`aria-pressed`, off by default) adds country and region header rows with job counts. Countries and regions are alphabetical, "Unknown location" and "No region" come last, and the current sort orders the rows inside each region. The logic is in `web/lib/jobs-view.ts` (`splitLocation`, `groupByLocation`). The region comes from `splitLocation`, which drops the Vietnamese rank prefix, so "Thành phố Hồ Chí Minh" shows as "Hồ Chí Minh". Statistics "Top locations" uses the same label. The region shows as a code where `web/lib/regions.ts` has one for the country: Australian states (VIC, NSW, QLD, SA, WA, TAS, NT, ACT), United States states and Canadian provinces. The country picks the table. Group headers and the label use the same function; the stored region keeps its full name.
- Status filter chips with counts: All, New, Untriaged, Shortlisted, Applied, Interview, Offer, Rejected (toggle buttons with `aria-pressed`; several can be on). A "Remote only" toggle. Counts follow the search and the remote filter, not the status filter. Skipped is not a chip because skipped rows are not in this list.
- New is not a status. A job is New when the latest crawl is the first one that returned it. `latestCrawlAt` in `web/lib/lifecycle.ts` takes the newest `last_seen_at` as the time of the latest crawl, and `isNew` is true when the job's `first_seen_at` equals it. The Jobs page computes the crawl time once and uses it for the NEW badge, the New chip filter and the New count. `date_posted` plays no part. The Jobs page has one New chip with a count. A badge labelled `NEW` in uppercase appears in the status cell of each New row. The scrape result "New" count (`new_jobs`) is the number of rows that run appended, which are the rows whose `first_seen_at` is that run's time, so it counts the same set.
- `status = ""` is Untriaged. It means no status has been chosen. An old job can be Untriaged. A New job can also be Untriaged.
- The table shows no status chip for an untriaged row. Most rows are untriaged, so the repeated chip is noise. The cell keeps the word Untriaged for screen readers only. A row with a real status keeps its chip, and the drawer still shows the Untriaged chip.
- Search (labelled) matches title, company and location. Every word must match. The counter reads "{n} of {total} jobs".
- Jobs is the triage inbox. The Untriaged chip is on when the page opens, so only untriaged jobs show; All shows every job. The table is `JobsTable` (`web/components/jobs-table.tsx`). An untriaged row has Shortlist and Skip. A tracked row has a button with the verb for the next stage (Apply, Interview, Offer) and the status menu (`web/components/job-row-actions.tsx`); an Offer row has Accept and Reject instead; Accepted and Rejected rows have the menu only. Each action button takes the colour of the status chip it moves to (`status-chip--<status>`), and the Action column has a fixed width so it does not move when a row changes.
- Untriaged rows have "Shortlist" and "Skip". A skipped job leaves this list and moves to Archived. Each change shows the undo toast.
- The table has a "Last seen" column. A job with no sighting for more than 14 days gets a "Stale" badge. A job with `closed_at` gets a "Closed" badge instead.
- The table has a "Salary" column between Last seen and Actions. It shows the currency and the range the board gave, for example `AUD 100,000 – 150,000 / yearly`, and a dash when the row has no salary. On mobile cards the cell keeps its "Salary:" label.
- "Last seen" and "Salary" are sortable. Both start with the largest or newest first. Last seen compares the stored timestamp. Salary compares the top of the range: `max_amount` when present, else `min_amount`. The raw numbers are compared with no currency conversion, so a mixed-currency list groups by amount, not by value. Rows with no sighting or no salary stay last in both directions. When two rows share a Last seen value, the newer posted date comes first in both directions.
- A facet bar has five checkbox filters: Country, City, Work mode, Seniority and Employment type. Several values in one filter combine with OR, and different filters combine with AND. "Clear facets" resets all five. The status counts respect the facet filters. The options come from the loaded rows.
- A filter with five options or fewer shows plain checkboxes. A filter with more than five options also shows All and Clear. The button shows "All", one label, or "{n} selected".
- The city options use the selected countries. When the user selects a country, the city menu contains only cities in that country. A selected city that no longer matches the countries is removed. The country menu does not use the selected cities, so a city filter never hides a country the user wants to add.
- The job dialog (`web/components/job-dialog.tsx`, shared by Jobs and Applications) is a centred modal dialog opened from a title click: `role="dialog"`, `aria-modal`, labelled by the job title. Focus moves into it and returns to the row on close. Tab stays inside. Escape, the close button and a backdrop click close it. It has Shortlist, Skip and the status menu. It shows First seen with the number of days since that sighting, Last seen, and Closed with the reason when the job is closed.
- Posting evidence stays factual. When the board date is more than one day later than the first sighting, the drawer adds "Board date: Later than the first sighting". The app shows the observation, not a verdict about the employer.
- The drawer has a short "Resume fit" summary (`web/app/jobs/_components/resume-fit.tsx`): the best resume tag, its keyword score and a link "Open resume review". A job without a description shows a note. A profile without resumes links to the Resume page.
- The review page `/jobs/[jobId]/review` shows one resume beside its fit report. A tag select picks the resume (default: the best keyword match). The left side shows the original file (a PDF in the browser viewer, other types as text). The right side is `web/app/jobs/_components/fit-report.tsx`: keyword score with matched and missing words, then the Claude analysis, then the "Submitted with this resume" checkbox.
- "Analyse fit" asks for a confirm step that shows the size, then calls `web/lib/analysis.ts`. Two providers are supported. With `ANTHROPIC_API_KEY` the app calls the Claude Messages API; the model is `claude-haiku-5-5` unless `ANTHROPIC_MODEL` is set. With `LLM_BASE_URL` set, the app calls an OpenAI-compatible `chat/completions` endpoint such as llama.cpp; the model is `LLM_MODEL`, the default is `local-model`, and `LLM_API_KEY` is optional. A local endpoint wins when both are set. The request sends the job text and the whole resume text, including contact details. The result has a score (an alignment hint, not a hiring prediction), a summary, strengths, a requirements table (requirement, evidence, verdict `strong`, `partial`, `weak` or `missing`, reasoning), gaps with fix ideas, and suggested wording (original line and better line, each with a Copy button). The app edits a resume only when you press Apply or Save.
- A saved result lives in `data/{profile}/analysis/{jobId}--{tag}.json` with the resume version, the resume text hash and the job description hash. When the resume text or the job text changes, the page marks the saved result "out of date". Re-run replaces it. Renaming a resume moves its results, and deleting a resume deletes them. Without a provider the page shows a notice and no button.
- The "Submitted with this resume" checkbox records the tag, the resume version and the text hash in `data/{profile}/submitted.json`. The page warns when the resume text changed after the submission.
- Pure view logic lives in `web/lib/jobs-view.ts` (`sortJobs`, `filterJobs`, `statusCounts`).

### Applications

**Function:** Monitor and manage jobs with a tracked status. Untriaged and skipped rows are not shown.

- Shows only rows where `status` is tracked (`isTrackedStatus`: not empty and not skipped). The header shows "{n} active applications, {m} rejected".
- Views: Kanban, Table and Gantt. The Table view reuses `JobsTable` with the Action column (next stage button and status menu). Applications holds the jobs the user has committed to: Shortlisted and later. Jobs is the triage inbox. The toggle buttons use `aria-pressed`. The last view is kept in `localStorage` key `applications_view`.
- While a Kanban card is dragged over another column, a dim empty box (`.kanban-slot`) shows at the bottom of that column, where the card lands. Each column lists cards by the time of the last status change, oldest first, with undated cards last; a moved card is the newest, so it lands at the bottom. The dragged card dims. The box is not shown in the card's own column.
- Kanban cards are dragged to another column to change status. The drop target highlights while a card is over it, the card stays in place until the PATCH returns, and the change shows the undo toast. Cards carry no buttons. A card is not draggable while its change is pending. Table rows keep the status menu with all statuses plus "Back to untriaged". No confirmation dialogs.
- Gantt: one row per job (title and company at the left), week ticks on the time axis, bars in the status colours. Each bar has a `title` and an accessible name such as "Applied, 12 Sep to 18 Sep". Rows sort by most recent activity. The chart scrolls inside its own container. Data comes from `GET /api/jobs/log` and `GET /api/jobs`, built by `buildGanttRows` in `web/lib/gantt.ts`. A log entry with an earlier time than the entries before it (an undo) removes the undone segments. A job with no log gets one segment from its `status_updated_at`.

### Archived

**Function:** Show skipped jobs and let the user restore one.

- Reads all rows in `jobs.csv` via `GET /api/jobs` and keeps rows where `status` is `skipped`.
- The table shows Title, Company, Location and Skipped date. Rows sort by the most recent skip first.
- The "Restore" button sets the status back to `""` (Untriaged). The job leaves Archived and returns to Jobs. Each change shows the undo toast.
- The page states that skipped jobs do not appear on Jobs or Applications.
- The status lives in `jobs.csv`. There is no separate archive file and no database.

### Statistics

**Function:** Show pipeline stats and a status-change timeline for the active profile.

- Reads all rows in `jobs.csv` for the active profile via `GET /api/jobs`. It also reads `GET /api/jobs/log`; a failed log read leaves the Flow card empty and does not fail the page.
- Summary cards: total jobs, not yet reviewed (jobs with no status), active (shortlisted + applied + interview + offer), remote (shared `isRemote`), archived (accepted + rejected + skipped). There are no pipeline bars; the Flow Sankey shows the per-stage counts.
- Timeline: status-change activity grouped by week (Monday-based) from `status_updated_at`, for rows with a non-empty status, scaled to the busiest week.
- Flow: a Sankey of status moves from `status_log.jsonl`. `buildSankey` in `web/lib/sankey.ts` takes the log entries and counts forward steps only (the log holds no backward steps). Columns: Scrape, Shortlisted, Applied, Interview and Offer, then one outcome column with Accepted, Rejected and Skipped stacked top to bottom. The Scrape count sits to the left of its bar. Each stage name is a header tag styled as the `status-chip` used elsewhere. `layoutSankey` in `web/lib/sankey-layout.ts` sizes bands by the square root of their count, capped at 28 px per unit. A band has a width at each end. The arriving end is sqrt(count). A stage is as tall as the sum of its arriving ends (a stage with no arrivals: the sum of its leaving ends). The leaving ends are sqrt(count) scaled by stage height over the sum of the leaving sqrt values, so the leaving bands always fill the stage and the band tapers between its two ends. Pending jobs have no separate space. Progress flows leave a stage from the top, sorted by destination `y0`; Rejected and Skipped leave from the bottom; incoming flows start at the top, sorted by source. `bandPath` draws each band as a filled shape. Progress stages stay in the top 35% of the canvas and drops in the bottom 35%. A stage that a band crosses is pushed down until clear; `findBandOverlaps` reports any remaining crossing and the tests fail on one.
- Breakdown: top companies and top locations by count.
- Facets: top countries, top cities, work modes, seniority and employment types by count. Work mode, seniority and employment type use display labels.
- Pure stats computation lives in `web/lib/statistics.ts` (`computeStatistics`) so it is testable without the UI.

### Resume

**Function:** Keep a library of resumes, one per tag, for the active profile. You can import a file, or edit the text of a resume in the page. The app does not build a PDF layout; the preview prints to PDF through the browser.

- A tag is a kebab-case label for one resume version (for example a role or a company). Each tag holds one resume. Importing under an existing tag replaces it and raises the version when the text differs.
- Import accepts `.pdf`, `.tex`, `.md` and `.txt` files up to 5 MB, or pasted text. The app keeps the original file and extracts plain text. PDF text comes from `pdfjs-dist`. `structurePdf` in `web/lib/resumes/pdf-structure.ts` reads font size and position: larger sizes become `#`, `##` and `###` headings, bullet glyphs become `-` items (wrapped lines join the item), the line under the title becomes a ` | ` contact line, and a date at the right edge becomes a `Left :: Right` row. A PDF with no heading and no bullet falls back to plain text. LaTeX commands are stripped from `.tex` text. The extracted text feeds the keyword match and the Claude analysis.
- The page has two columns from the first paint. The left column is a table of the resumes with the columns Name, Version and Last edited. A click on a header sorts by that column, and a second click reverses the order (Name starts ascending, the others newest first). The sort mark keeps its space in every header, so the labels do not move. The choice is kept in `localStorage` (`resume_sort`). Above the table, chips for the ten most common hyphen segments filter the list (all active chips must match). `editedAt` in `meta.json` records the last text save; the import date is used before the first edit. The right column shows the selected resume (the first one by default): file name, version, import date, Edit (primary) and a three-dot menu with Download, Replace (opens the import form with the tag filled), Rename and Delete (inline confirm). The import form opens with "Add resume", and opens by default when there are no resumes. Editing keeps the table on the left and the editor on the right, with a "Back" button. Selecting another resume while editing asks before it drops unsaved changes. The viewer shows a PDF in the browser and other types as text.
- Files: `data/{profile}/resume-library/{tag}/` with `original.<ext>`, `text.txt` and `meta.json` (`tag`, `fileName`, `ext`, `importedAt`, `version`, `textHash`, optional `edited`). Logic lives in `web/lib/resumes/` (`extract.ts`, `library.ts`).
- Edit: the Edit button opens a text editor beside a light page preview. Save writes `text.txt` through a temp file and a rename, raises the version when the text differs, and sets `edited: true` in `meta.json`. The original file is never changed. "Save as new tag" stores the text as a new resume and refuses an existing tag. "Export" calls the browser print. The preview is an A4 page (15.24 mm margins, Computer Modern from `web/public/fonts`, sizes measured from the reference PDF); print only repositions it, so preview and export match. The preview reads a small Markdown set (`#`, `##`, `###`, `-` and `*` bullets, paragraphs, `**bold**`, `*italic*`, `[text](https://...)` links, `Left :: Right` rows) in `web/lib/resumes/preview.ts`. "Insert template" in the paste form fills a starter resume (`web/lib/resumes/template.ts`).
- Fork graph: `meta.json` holds an optional `parent` tag. Fork from the menu, Fork from the New resume form and "Save as new tag" in the editor send `parent` to `POST /api/resumes`; the library keeps it only when that resume exists. A rename moves the children to the new tag name. A delete clears `parent` on the children, so they become roots. Older resumes have no `parent` and show as roots; the app does not guess. The List and Graph toggle above the table switches to `ResumeGraph`: a commit-log layout: one row for each tag, grouped by tree (the tree with the newest resume first, lanes restart in each tree), newest first inside a tree, with columns Graph, Resume, Imported and Version. Coloured lanes run on the left. A fork sits above its parent and continues the parent's lane when it is the first fork met from the top; later forks get their own lane and curve into the parent's lane at the parent's row, which frees the lane. Lanes are 15 px apart and the graph column is capped at 120 px, so the page never scrolls sideways; a lane has one colour. `buildForkGraph` in `web/lib/resumes/graph.ts` computes rows, lanes and edges. A click on a row opens that resume.
- Convert with model: when a model is set up (`ANTHROPIC_API_KEY` or `LLM_BASE_URL`), the editor bar shows "Convert with model". A click shows the size and asks before it sends. `POST /api/resume-convert` sends the current text to the model with a prompt that names the Markdown set above, and the reply replaces the editor text as an unsaved change. Nothing is saved until the user clicks Save. The reply never changes the stored file by itself. `GET /api/resume-convert` reports availability. The call uses `callModel` in `web/lib/analysis.ts`, shared with the fit analysis.
- Apply: each suggested line in the fit report has an Apply button. `POST /api/resumes/[tag]/apply` replaces the original line only when it appears once in the text. It answers 409 when the line is missing or repeated. The viewer shows the text instead of the PDF when a resume is edited.
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
| `POST` | `/api/jobs/[jobId]/analysis` | Body `{ tag }`. Runs and saves the gap analysis. 400 bad tag, 404 unknown job or tag, 422 no description, 503 with neither `ANTHROPIC_API_KEY` nor `LLM_BASE_URL`, 502 API failure. Returns `{ model, created_at, tag, resume_version, resume_hash, job_hash, analysis }` |
| `PATCH` | `/api/jobs/[jobId]` | Body `{ status, status_updated_at? }`. Any status to any status, including `""`. `status_updated_at` is optional: an ISO 8601 date and time, or `""` (undo of a new job); absent means now; invalid gives 422. Unknown status gives 422, unknown job 404, no profile 400. Keeps other columns and row order. Forward moves append one line to `status_log.jsonl`; backward moves rewrite that job's history instead (see the status log structure). Returns the updated row. |
| `GET` | `/api/jobs/log` | Read `status_log.jsonl` for the active profile; returns a list of `{ job_id, from, to, at }` |
| `GET` | `/api/scrape/status` | Read `scrape_status.json` |
| `POST` | `/api/scrape/run` | Spawn Python subprocess, reset `scrape.log`, write initial `scrape_status.json`. Returns 409 when a live scrape runs, 400 when `job` is empty |
| `GET` | `/api/scrape/log` | Read `scrape.log` for the active profile (plain text) |
| `GET` | `/api/keywords` | Read the active profile's `keywords.txt` as `{ keywords }`; 404 when the file does not exist |
| `PUT` | `/api/keywords` | Body `{ keywords: string[] }`; trims and drops blank lines, writes one title per line to the profile's `keywords.txt`; 400 on a body that is not a list of strings |
| `GET` | `/api/scrape/config` | Read `scrape_config.json` |
| `PUT` | `/api/scrape/config` | Validate every field (400 on a bad field or an invalid cron expression, nothing saved), write the cleaned `scrape_config.json`, re-register the profile schedule |
| `GET` | `/api/resumes` | Returns `{ resumes }` (details of each resume) |
| `POST` | `/api/resumes` | Multipart body: `tag` and `file`, or `tag` and `text`. 200 `{ tag, version }`, 400 bad tag or no input, 413 over 5 MB, 415 unsupported type, 422 empty or unreadable file |
| `GET` `PUT` `PATCH` `DELETE` | `/api/resumes/[tag]` | Read `{ meta, text }` (404 unknown), save text (`PUT` body `{ text }`; 200 `{ version }`, 400 empty, 404 unknown), rename (body `{ tag }`; 400 / 404 / 409; moves analyses and the submitted record), delete (404 unknown; deletes analyses) |
| `POST` | `/api/resumes/[tag]/apply` | Body `{ original, suggested }`. Replaces one exact line. 200 `{ version }`, 400 bad body, 404 unknown, 409 line missing or repeated |
| `GET` | `/api/resumes/[tag]/file` | The original file (the edited text as `.md` after an edit). Inline by default, `?download=1` for an attachment. 404 unknown |
| `GET` `PUT` | `/api/jobs/[jobId]/submitted` | Read `{ submitted, changed }`. Save body `{ tag }` records the tag with its current version and hash, `{ tag: null }` clears it. 400 / 404 |
| `GET` | `/api/profiles` | List all profile directories; returns `{ profiles, active }` |
| `POST` | `/api/profiles` | Create a new profile |
| `POST` | `/api/profiles/switch` | Set active profile cookie |
| `PATCH` | `/api/profiles/[name]` | Rename a profile. Body `{ name }`. 422 for an invalid old or new name, 404 if the old profile does not exist, 409 if the new name exists, 200 with no change for the same name. Uses `fs.rename`. Moves the cookie if the renamed profile was active. Returns `{ name, active }` |
| `DELETE` | `/api/profiles/[name]` | Delete profile directory; if it was active, auto-switches to next profile or clears cookie; returns `{ name, newActive }` |

---

## Scrape Trigger Flow

1. User clicks "Run scrape" on the Scrape page.
2. `POST /api/scrape/run` resets `scrape.log`, writes `scrape_status.json` with `status: running`, then spawns the scrape. On Windows, when `.venv/Scripts/pythonw.exe` exists, the runner starts that binary with `main.py`; otherwise it starts `uv run python main.py`. `pythonw` is a GUI subsystem binary, so Windows cannot open a console window for it. All multi-value args (`--job`, `--location`, `--site_name`, etc.) are passed as a single flag with space-separated values so argparse `nargs='+'` collects them all. `PYTHONUNBUFFERED=1` is set so Python flushes output line-by-line. stdout and stderr are redirected to `scrape.log` via a file descriptor (not piped through Node) so logging works with `detached: true`. The spawn keeps `windowsHide: true` as a second guard.
3. Python subprocess runs. The engine calls one site at a time, records each site's result, writes `scrape_run.json` and updates `source_health.json`. The web server reads `scrape_run.json` after the child exits and writes `status: done` (or `error` when every attempted site failed).
4. Frontend polls `GET /api/scrape/status` every 5 seconds. Updates progress indicator. A collapsible log panel polls `GET /api/scrape/log` every 3 seconds while running.
5. On `done`: frontend shows diff summary. Polling stops.

Concurrent runs against the same profile are blocked — "Run scrape" button is disabled while `scrape_status.json` reports `running`.

---

## Direct Company Boards

A company board is fetched straight from the employer's ATS, so the row has a source-native id and a live description, with no aggregator in between.

- CLI form: `--company provider:board[:Company Name]`. Providers are `greenhouse`, `lever` and `ashby`. The name defaults to the board slug with spaces and title case, so `acme-corp` becomes "Acme Corp".
- Greenhouse calls the public board API with `content=true`, then maps title, company, location, `absolute_url`, `first_published` (fallback `updated_at`, date part only), HTML-stripped content, id, site and the Employment Type metadata.
- Lever calls `https://api.lever.co/v0/postings/{board}?mode=json`, then maps `text`, `categories.location`, `hostedUrl`, `createdAt` (epoch milliseconds, UTC date), plain description (fallback HTML-stripped `description`), id, site, `workplaceType`, the commitment, and `salaryRange` (`min`, `max`, `currency`, interval). Lever intervals map `per-year-salary` to `yearly`, `per-month-salary` to `monthly` and `per-hour-wage` to `hourly`.
- Ashby calls `https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true`, then maps `title`, `location`, `jobUrl` (fallback `applyUrl`), `publishedAt` (date part), plain description (fallback HTML-stripped `descriptionHtml`), id, site, `isRemote` and `workplaceType`, `employmentType`, and the first Salary component in `compensation.compensationTiers`. The interval token `YEAR`, `MONTH`, `WEEK`, `DAY` or `HOUR` maps to the JobSpy interval. An entry with `isListed: false` is skipped.
- A board is fetched once per run, not once per search term, so it can return more jobs than the search would.
- A failed board is recorded in `scrape_run.json` under `provider:board` and does not stop the other sources.
- The Scrape page has a Company boards field. It writes the same entries to `scrape_config.json`, and the web runner passes them as `--company`. An ATS crawlers group ticks Greenhouse, Lever, Ashby and Workday; all are ticked by default and only ticked providers are crawled.

---

## Agent Surface

Two read-only entry points serve agents. Both read `jobs.csv` and never write.

- `jobs_query.py` filters the saved jobs. It takes text, status, city, country, site, work mode, seniority and employment type. Skipped rows are hidden unless `--include-archived` is set or the status filter asks for them. Rows sort by board date, newest first, with undated rows last. `--json` prints the rows; the default prints a table.
- `mcp_server.py` is a small MCP server over stdio with no new dependency. It exposes one tool, `search_jobs`, with the same filters, and returns the rows as JSON text. Start it with `--save_path <jobs.csv>`.

---

## UI Conventions

**Toast** — fixed pill, bottom-center, floats above layout. Spring in, fade+sink out over 1 s after 9 s. Persisted across reload via `sessionStorage` key `profile_notif`. (Profile page.)

**Toast with undo** — `web/components/toast.tsx` (`ToastProvider`, `useToast`). Message, optional action button, close button, auto-dismiss after 8 s, inside an `aria-live="polite"` region. A new toast replaces the current one. Status changes use `useChangeStatus` (`web/components/use-change-status.ts`): it saves the previous `status` and `status_updated_at`, sends the PATCH, shows "Moved {title} to {status}." with Undo. Undo sends the previous values back.

**Status menu** — `web/components/status-menu.tsx`. A three-dot menu button (accessible name "Status of <title>") with `role="menu"` and `menuitemradio` items: all statuses plus "Back to untriaged". Arrow keys, Home, End and Escape work. Focus returns to the button.

**Focus ring** — 2 px solid accent colour with a 2 px offset on `:focus-visible` (inset inside clipping containers).

**Mobile layout (768 px and below)** — the sidebar becomes a top bar with a "Menu" button (`aria-expanded`, `aria-controls`). The nav panel slides in and closes on Escape, link click and backdrop click; focus returns to the button. Jobs rows render as cards. Kanban columns are 260 px wide and scroll sideways with scroll snap. Tables and the Gantt chart scroll inside their own container. The job dialog is full screen. Statistics cards stack in one column. Every pressable control is at least 44 by 44 px.

**Content width** — all pages share one 1200 px container, so the left edge does not move between pages. Narrow pages keep their content at 796 px or less.

**Dialogs** — no `window.confirm`. Destructive actions use inline confirmation in the same row: click → "Label? / Yes / Cancel".

**Sidebar** — 180 px above 768 px width, sentence case. Nav order: Profile, Scrape, Jobs, Resume, Applications, Archived, Statistics. Active profile chip inline on the Profile row (right-aligned); no footer chip.

**Scrape config** — multi-line fields are `<textarea>` (10 rows, no resize). Auto-saved debounced 600 ms; flushed immediately on blur. Google Jobs appears last, disabled, and reads "Google Jobs (unavailable)" with no badge. Glassdoor starts ticked.

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

## Web code layout

- Styles: `web/app/globals.css` holds the Tailwind imports and one `@import` per file in `web/app/styles/` (theme, tokens, base, shell, controls, chip, jobs, resume, statistics, drawer, scrape, utilities, jobs-filters, mobile, applications, review). The import order is the cascade order. Font sizes use the `--text-2xs` to `--text-4xl` tokens in `tokens.css`; only the resume sheet keeps `pt` values, to match print.
- Pages keep state and layout. Parts live in `_components/` next to the page: Scrape (`use-scrape-config`, `use-scrape-run`, `suggested-boards`, `run-output`, `run-history`, `lines-input`), Resume (`resume-table`, `resume-detail-head`, `resume-new`, `resume-editor`, `resume-sheet`), Applications (`kanban-view`, `table-view`, `gantt-view`).
- Shared: `components/chip.tsx` (toggle chip), `components/use-dismiss.ts` (click-away and Escape), `lib/resumes/sort.ts` (resume sort).
- Tests: `pnpm test` runs all; `pnpm test:quick` runs only tests affected by changes. The dom project uses happy-dom. `tests/css.ts` reads all style files for CSS tests.
