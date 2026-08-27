# jobspy-cli — Handoff Document

**Next session goal:** Commit Phase 1 work, then build Phase 2 — the Jobs table page (read + shortlist) and the Scrape page (config form + run trigger + status polling).

---

## Repo state

- **Location:** `c:\Users\votrinhan88\Desktop\jobspy-cli`
- **Branch:** `main` — 17 commits ahead of origin, all local only
- **Python stack:** Python 3.12, uv, python-jobspy, geopy, pandas, pytest (65 tests, all green)
- **Web stack:** Next.js 16.3.3, React 19, TypeScript, Tailwind 4, shadcn/ui, pnpm

---

## What was done last session

Phase 1 of the web app is complete but **not yet committed**. All new files are untracked or modified in-place.

1. Lib layer (`web/lib/`) — `csv.ts`, `profile.ts`, `config.ts`, `scrape-status.ts`
2. All API routes (`web/app/api/`) — jobs, scrape/status, scrape/config, scrape/run, resume, profiles, profiles/switch
3. Root layout with fixed sidebar nav, Inter + JetBrains Mono, dual-theme CSS token system
4. Profile page — list, switch (cookie), create
5. Stub pages for Jobs, Applications, Scrape, Resume (nav links work)
6. Home → redirects to `/jobs`

TypeScript passes clean. Dev server starts on port 3000, all routes return 200.

---

## Architecture

```
jobspy-cli/
├── scraper.py          # JobScraper — scraping, filtering, upsert, metadata
├── geocoder.py         # Geocoder — nominatim, disk cache
├── main.py             # CLI — argparse, main()
├── tests/
│   └── test_scraper.py # 65 tests, all green
├── data/               # gitignored — profile data
│   └── {profile}/
│       ├── jobs.csv
│       ├── scrape_config.json
│       ├── cv.pdf / cv.md
│       └── scrape_status.json
└── web/
    ├── app/
    │   ├── layout.tsx             # root layout with Nav (server component)
    │   ├── page.tsx               # → redirect /jobs
    │   ├── profile/page.tsx       # full profile management
    │   ├── jobs/page.tsx          # stub — build next
    │   ├── applications/page.tsx  # stub
    │   ├── scrape/page.tsx        # stub — build next
    │   ├── resume/page.tsx        # stub
    │   └── api/                   # all routes built
    ├── components/
    │   └── nav.tsx                # sidebar nav (client component)
    └── lib/
        ├── csv.ts                 # readJobs, writeJobs, patchJob
        ├── profile.ts             # listProfiles, getActiveProfile, createProfile, path helpers
        ├── config.ts              # readConfig, writeConfig
        └── scrape-status.ts       # readScrapeStatus, writeScrapeStatus
```

---

## CSV schema

All original jobspy columns plus:

| Column | Default | Notes |
|--------|---------|-------|
| `job_id` | computed | `{company}-{title}-{8-char-md5}`, 20-char truncation per segment |
| `status` | `""` | `shortlisted|applied|interview|offer|rejected|skipped|""` |
| `status_updated_at` | `""` | ISO 8601, set by web app |

---

## What's next: Phase 2

### Step 0 — Commit Phase 1 first

```
git add web/app/globals.css web/app/layout.tsx web/app/page.tsx \
  web/app/api/ web/app/applications/ web/app/jobs/ \
  web/app/profile/ web/app/resume/ web/app/scrape/ \
  web/components/nav.tsx web/lib/
git commit -m "feat: build web app Phase 1 — lib layer, API routes, navbar, profile page"
```

### Step 1 — Jobs page (`web/app/jobs/page.tsx`)

Replace the stub with a real table:
- Fetch `GET /api/jobs` on load
- Columns: title, company, location, date_posted, status, job_url (link)
- "Shortlist" button on rows where `status === ""` → `PATCH /api/jobs/{jobId}` with `{ status: "shortlisted" }`
- Client-side filter by title
- Empty state when no active profile (link to `/profile`)

### Step 2 — Scrape page (`web/app/scrape/page.tsx`)

Replace the stub:
- Load `GET /api/scrape/config`, render form
- Fields: job (multi-value tags), location (multi-value tags), results_wanted, site_name (checkboxes), workers, title_exclude, exclude_companies
- Auto-save on change → `PUT /api/scrape/config`
- "Run scrape" button → `POST /api/scrape/run` (disable while `status === "running"`)
- Poll `GET /api/scrape/status` every 5s while running
- Status strip: idle / running (spinner) / done (new_jobs, updated_jobs, total_jobs counts) / error

---

## API route contract notes

- All routes read active profile from `active_profile` cookie via `getActiveProfile()` in `lib/profile.ts`
- `PATCH /api/jobs/[jobId]` — body: `{ status: JobStatus }` — validates against allowed values, sets `status_updated_at`
- `POST /api/scrape/run` — returns 202 if started, 409 if already running
- `POST /api/profiles/switch` — sets httpOnly `active_profile` cookie, triggers page reload on client

## CSS design system

All app styles live in `web/app/globals.css` under the `/* App tokens */` block appended after shadcn defaults. Token names: `--app-ink`, `--app-ink-muted`, `--app-surface`, `--app-panel`, `--app-border`, `--app-accent`, `--app-accent-hover`, `--app-success-*`, `--app-error-*`. Utility classes: `.page-content`, `.page-header`, `.page-title`, `.section`, `.section-title`, `.btn`, `.btn-primary`, `.btn-secondary`, `.input`, `.alert`, `.alert-error`, `.alert-success`, `.profile-list`, `.profile-item`, `.empty-state`, `.hint`.

## Key files

- `.claude/SPEC.md` — full web app architecture, page specs, API contracts, data model
- `.claude/PLAN.md` — feature status and build order
- `scraper.py` — Python engine (JobScraper class)
- `tests/test_scraper.py` — 65 tests
- `web/lib/` — all lib modules
- `web/app/api/` — all API routes

## Skills

- `test-driven-development` — always-on for Python; apply to web API routes too
- `asd-ste100` — always-on for all text output
- `design` — invoke for visual design decisions
- `design-system` — invoke for design tokens
- `artifact-design` — load before writing any artifact
- `handoff` — run before ending a session

## Known issues / constraints

- Glassdoor blocked upstream (HTTP 400, speedyapply/JobSpy#270)
- ZipRecruiter returns 403 from this IP — geo-block
- Concurrent scrape runs against the same profile are not supported
- `scrape_status.json` writer not yet added to Python scraper — API route writes status on subprocess exit for now
- `RouteContext<'...'>` global is only generated after `next dev` runs — use inline `{ params: Promise<{ slug: string }> }` typing in route handlers
