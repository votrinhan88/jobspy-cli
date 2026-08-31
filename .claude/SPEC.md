# jobspy-cli — Web App Specification

**Status:** Living document. Update this file when a decision changes.
**Last updated:** 2026-08-27 (session 2)

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
│       └── scrape_status.json
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

### Profile directory contents

| File | Purpose |
|------|---------|
| `jobs.csv` | All scraped jobs and application state for this profile |
| `scrape_config.json` | Default scrape parameters for this profile |
| `cv.pdf` / `cv.md` | CV file uploaded by the user |
| `scrape_status.json` | Scrape run status, written by the Python subprocess |

---

## Data Model

### `jobs.csv` columns

All existing scraper columns plus:

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `job_id` | string | computed | Kebab-case slug: `{company}-{title}-{8-char-md5(job_url)}`. Max 20 chars per segment before slugifying. Written at scrape time. Preserved by upsert. |
| `status` | string | `""` | One of: `shortlisted`, `applied`, `interview`, `offer`, `rejected`, `skipped`, `""`. Written by scraper (empty). Updated by web app. Preserved by upsert. |
| `status_updated_at` | string | `""` | ISO 8601 timestamp. Set by web app on status change. Preserved by upsert. |

### Status pipeline

```
(empty) → shortlisted → applied → interview → offer
                                            → rejected
                                            → skipped
```

Jobs enter the Applications page when `status` is non-empty.

### `scrape_config.json` structure

```json
{
  "job": ["AI Engineer", "ML Engineer"],
  "location": ["Australia", "Vietnam"],
  "results_wanted": 20,
  "site_name": ["linkedin", "indeed", "google", "zip_recruiter"],
  "workers": 4,
  "title_exclude": [],
  "exclude_companies": []
}
```

All fields match existing CLI arguments. The web app reads this file as form defaults and writes it back on change.

### `scrape_status.json` structure

Written by the Python subprocess. Read by the web app via polling.

```json
{
  "status": "idle",
  "started_at": null,
  "finished_at": null,
  "new_jobs": null,
  "updated_jobs": null,
  "total_jobs": null,
  "error": null
}
```

`status` values: `idle` | `running` | `done` | `error`

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

- Read-only table of all scraped jobs.
- "Shortlist" button on each row sets `status = "shortlisted"` and `status_updated_at = now`.
- Shortlisted jobs appear on the Applications page.

### Applications

**Function:** Monitor and manage jobs with a non-empty status.

- Shows only rows where `status` is non-empty.
- Multiple views: table, kanban (grouped by status), Gantt chart (status transitions over time), statistics.
- Status transitions are made from this page.

### Statistics

**Function:** Show pipeline stats and a status-change timeline for the active profile.

- Reads all rows in `jobs.csv` for the active profile via `GET /api/jobs`.
- Summary cards: total jobs, active (non-empty status), remote, archived (rejected + skipped).
- Pipeline funnel: count per status with a color bar scaled to the largest status count.
- Timeline: status-change activity grouped by week (Monday-based) from `status_updated_at`, for rows with a non-empty status, scaled to the busiest week.
- Breakdown: top companies and top locations by count.
- Pure stats computation lives in `web/lib/statistics.ts` (`computeStatistics`) so it is testable without the UI.

### Resume

**Function:** Manage the CV for the active profile.

- Upload CV (PDF or Markdown). Replaces existing file at `data/{profile}/cv.pdf`.
- Preview CV inline.

### Profile

**Function:** Create and switch profiles.

- List all profiles (directories under `data/`).
- Create a new profile (creates directory + default `scrape_config.json`), then **immediately auto-switches** to it and reloads.
- Switch active profile by clicking the row (no separate button).
- Rename via pencil icon — implemented as create-new + delete-old (no filesystem rename API needed).
- Delete via trash icon — shows an **inline confirmation** (no `window.confirm`): clicking trash reveals "Delete? / Yes / Cancel" in the row. On confirm, if the deleted profile was active, the server auto-switches to the next alphabetical profile or clears the cookie if none remain, and the client reloads.
- Active profile is highlighted with an "Active" tag.
- Active profile name is shown as a chip inline on the "Profile" nav row (right-aligned, pushed with `margin-left: auto`).

---

## API Routes

| Method | Path | Function |
|--------|------|---------|
| `GET` | `/api/jobs` | Read `jobs.csv` for active profile |
| `PATCH` | `/api/jobs/[jobId]` | Update `status` and `status_updated_at` for one row |
| `GET` | `/api/scrape/status` | Read `scrape_status.json` |
| `POST` | `/api/scrape/run` | Spawn Python subprocess, write initial `scrape_status.json` |
| `GET` | `/api/scrape/config` | Read `scrape_config.json` |
| `PUT` | `/api/scrape/config` | Write `scrape_config.json` |
| `GET` | `/api/resume` | Read CV file metadata |
| `POST` | `/api/resume` | Upload and save CV file |
| `GET` | `/api/profiles` | List all profile directories; returns `{ profiles, active }` |
| `POST` | `/api/profiles` | Create a new profile |
| `POST` | `/api/profiles/switch` | Set active profile cookie |
| `DELETE` | `/api/profiles/[name]` | Delete profile directory; if it was active, auto-switches to next profile or clears cookie; returns `{ name, newActive }` |

---

## Scrape Trigger Flow

1. User clicks "Run scrape" on the Scrape page.
2. `POST /api/scrape/run` writes `scrape_status.json` with `status: running`, then spawns `uv run python main.py` with args from `scrape_config.json` plus `--save_path data/{profile}/jobs.csv`.
3. Python subprocess runs. On exit: API route writes `status: done` (or `error`) with counts.
4. Frontend polls `GET /api/scrape/status` every 5 seconds. Updates progress indicator.
5. On `done`: frontend shows diff summary. Polling stops.

Concurrent runs against the same profile are blocked — "Run scrape" button is disabled while `scrape_status.json` reports `running`.

---

## UI Conventions

**Toast** — fixed pill, bottom-center, floats above layout. Spring in, fade+sink out over 1 s after 9 s. Persisted across reload via `sessionStorage` key `profile_notif`.

**Dialogs** — no `window.confirm`. Destructive actions use inline confirmation in the same row: click → "Label? / Yes / Cancel".

**Sidebar** — 180 px, sentence case. Nav order: Profile, Resume, Scrape, Jobs, Applications, Statistics. Active profile chip inline on the Profile row (right-aligned); no footer chip.

**Scrape config** — multi-line fields are `<textarea>` (10 rows, no resize). Auto-saved debounced 600 ms; flushed immediately on blur. Glassdoor shown but blocked with a tooltip badge.

---

## Deferred

| Item | Deferred until |
|------|---------------|
| Job scoring (feature 4) | After semantic CV/JD matching (feature 6 or 9) |
| Gap analysis via Claude API (feature 6) | After Resume page ships |
| Semantic job search (feature 9) | After gap analysis ships |
| SQLite migration | When CSV flat-file access becomes a bottleneck |
| Authentication | If the app is ever exposed beyond localhost |
| Scrape triggering via scheduler (feature 7) | After web scrape trigger is stable |

---

## Known Constraints

- Concurrent scrape runs against the same profile are not supported.
- The Python subprocess inherits the server's working directory. The `--save_path` arg must be an absolute path.
- CV preview in the browser requires the file to be served as a static asset or via an API route — the browser cannot read `data/{profile}/cv.pdf` directly from disk.
