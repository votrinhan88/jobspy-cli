# jobspy-cli — Handoff Document

**Next session goal:** Build Phase 1 of the web app — lib layer, profile page, and navbar.

---

## Repo state

- **Location:** `c:\Users\votrinhan88\Desktop\jobspy-cli`
- **Branch:** `main` — 17 commits ahead of origin, all local only
- **Python stack:** Python 3.12, uv, python-jobspy, geopy, pandas, pytest
- **Web stack:** Next.js 16, React 19, TypeScript, Tailwind 4, shadcn/ui, pnpm

---

## What was done this session

1. Refactored `main.py` into `scraper.py`, `geocoder.py`, `main.py` (CLI only)
2. Feature 1 — parallel scraping with `ThreadPoolExecutor` and `--workers` flag
3. Feature 2 — cross-run upsert: preserves `status` and `location` for known `job_url`; field-level merge for job data; append-only fallback when `job_url` absent
4. Feature 3 — output filtering: `--title_include`, `--title_exclude`, `--exclude_companies` (inline or `.txt` file)
5. Data model — added `job_id` (kebab slug), `status`, `status_updated_at` columns to scraper output
6. Grilled and decided the full web app architecture — see `.claude/SPEC.md`
7. Scaffolded `web/` — Next.js 16, shadcn/ui initialized, `data/` directory created
8. Installed UI/UX skills: `design`, `design-system`, `brand` under `.claude/skills/`
9. Updated `PLAN.md` with current feature status and web app build order
10. Tests: 65 passing

---

## Architecture

```
jobspy-cli/
├── scraper.py          # JobScraper class — scraping, filtering, upsert, metadata
├── geocoder.py         # Geocoder class — nominatim, disk cache
├── main.py             # CLI only — argparse, load_txt_arg, main()
├── tests/
│   └── test_scraper.py # 65 tests, all green
├── data/               # gitignored — profile data lives here
│   └── {profile}/
│       ├── jobs.csv
│       ├── scrape_config.json
│       ├── cv.pdf
│       └── scrape_status.json
└── web/                # Next.js app — scaffolded, not yet built
    ├── app/
    ├── components/ui/
    └── lib/
```

---

## CSV schema (current)

All original jobspy columns plus:

| Column | Default | Notes |
|--------|---------|-------|
| `job_id` | computed | Kebab slug: `{company}-{title}-{8-char-md5}`. 20-char truncation per segment. |
| `status` | `""` | `shortlisted\|applied\|interview\|offer\|rejected\|skipped\|""` |
| `status_updated_at` | `""` | ISO 8601. Set by web app on status change. |

---

## What's next: web app Phase 1

Build in this order — each step is a prerequisite for the next.

### 1. Lib layer (`web/lib/`)

- `csv.ts` — read/write `data/{profile}/jobs.csv` as typed `Job[]`
- `profile.ts` — list profiles, resolve active profile from cookie, create profile directory
- `config.ts` — read/write `data/{profile}/scrape_config.json`
- `scrape-status.ts` — read/write `data/{profile}/scrape_status.json`

### 2. API routes (`web/app/api/`)

| Method | Path | Function |
|--------|------|---------|
| `GET` | `/api/jobs` | Read jobs.csv |
| `PATCH` | `/api/jobs/[jobId]` | Update status + status_updated_at |
| `GET` | `/api/scrape/status` | Read scrape_status.json |
| `POST` | `/api/scrape/run` | Spawn Python subprocess |
| `GET/PUT` | `/api/scrape/config` | Read/write scrape_config.json |
| `GET/POST` | `/api/resume` | Read/upload CV |
| `GET/POST` | `/api/profiles` | List/create profiles |
| `POST` | `/api/profiles/switch` | Set active profile cookie |

### 3. Profile page + cookie

- List profiles, create new, switch active (cookie)
- On first visit with no profiles: prompt to create one

### 4. Navbar + layout

- Links: Scrape / Jobs / Applications / Resume / Profile
- Active profile name displayed as a chip

---

## Key files

- `.claude/SPEC.md` — full web app architecture, page functions, API routes, data model
- `.claude/PLAN.md` — feature status and web app build order
- `scraper.py` — Python engine (JobScraper class)
- `geocoder.py` — geocoding (Geocoder class)
- `tests/test_scraper.py` — 65 tests, all green
- `web/` — Next.js scaffold (empty pages, no routes yet)
- `data/.gitkeep` — marks the data directory; contents gitignored

## Skills

- `test-driven-development` — always-on for Python; apply to web API routes too
- `asd-ste100` — always-on for all text output
- `design` — invoke for visual design decisions in the web app
- `design-system` — invoke for design tokens and component specs
- `handoff` — run before ending a session

## Known issues / constraints

- Glassdoor blocked upstream (HTTP 400, speedyapply/JobSpy#270)
- ZipRecruiter returns 403 from this IP — geo-block, not a code issue
- Concurrent scrape runs against the same profile are not supported
- Job scoring deferred until semantic CV/JD matching (features 6/9) is done
- `scrape_status.json` writer not yet added to Python scraper — needed before Scrape page works
