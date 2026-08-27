# jobspy-cli — Handoff Document

**Next session goal:** Refactor `main.py` into modules (`scraper.py`, `geocoder.py`, `main.py` CLI-only), then ship features in priority order.

---

## Repo state

- **Location:** `c:\Users\votrinhan88\Desktop\jobspy-cli`
- **Branch:** `main` — 6 commits ahead of origin, all local only (not pushed yet)
- **Stack:** Python 3.12, uv, python-jobspy 1.1.82, geopy, pandas, pytest

---

## What was done this session

1. Onboarded the project — single-file CLI wrapper around JobSpy
2. Migrated from conda to uv (`pyproject.toml` + `uv.lock`, `environment.yml` deleted)
3. Fixed crash when scrapers return empty DataFrames (`clean_job_list`, `merge`)
4. Disabled Glassdoor from defaults — returns HTTP 400 upstream (speedyapply/JobSpy#270); noted in README
5. Added geocoding disk cache (`.geocache.json`) and concurrent Nominatim requests with rate limiting
6. Added skills: `asd-ste100` (always-on), `grill-me`, `test-driven-development` (always-on), `handoff`
7. Added `.claude/CLAUDE.md` with project context and always-on skill wiring
8. Added `.claude/PLAN.md` — full feature roadmap with gain/effort table and actionable plans
9. Added pytest infrastructure (`pyproject.toml` `[tool.pytest.ini_options]`) and 15 baseline tests — all green

---

## What's next: refactor first, then features

### Refactor (do this before any feature work)

Split `main.py` (280 lines, single file) into:

```
jobspy-cli/
├── main.py        # CLI entry point only — argparse + subcommand dispatch
├── scraper.py     # JobScraper class (__call__, clean_job_list, merge)
├── geocoder.py    # _load_geocache, _save_geocache, _geocode_one, get_location_map
└── tests/
    └── test_scraper.py  # update imports from main → scraper/geocoder
```

Steps:
1. Run `uv run pytest` — confirm 15 green before touching anything
2. Create `geocoder.py` — move `GEOCACHE_PATH`, `_RATE_LIMIT`, `_MAX_WORKERS`, `_load_geocache`, `_save_geocache`, `_geocode_one`, `get_location_map` out of `JobScraper` into a standalone `Geocoder` class
3. Create `scraper.py` — move `JobScraper` class, import `Geocoder` from `geocoder`
4. Slim `main.py` to argparse + `from scraper import JobScraper` + CLI dispatch
5. Update `tests/test_scraper.py` imports: `from scraper import JobScraper`
6. Run `uv run pytest` — confirm still 15 green
7. Commit: `refactor: split main.py into scraper, geocoder, and cli modules`

### Feature priority (from `.claude/PLAN.md`)

| Priority | Feature | Plan location |
|----------|---------|---------------|
| 1 | Parallel scraping | `.claude/PLAN.md` §1 |
| 2 | Incremental append + dedup across runs | `.claude/PLAN.md` §2 |
| 3 | Application tracker | `.claude/PLAN.md` §5 |
| 4 | Job scoring + sort | `.claude/PLAN.md` §4 |
| 5 | Cover letter / gap analysis via Claude API | `.claude/PLAN.md` §6 |

Each plan section is self-contained and actionable. Follow TDD: write failing test first, watch it fail, then implement.

---

## Key files

- `main.py` — current single-file implementation (all logic here until refactor)
- `tests/test_scraper.py` — 15 baseline tests, all green
- `.claude/PLAN.md` — full roadmap with actionable plans per feature
- `.claude/CLAUDE.md` — always-on skills and project rules
- `.geocache.json` — gitignored geocoding cache (persists between runs)
- `keywords.txt` — 21 AI/ML job titles used as `--job` input

## Known issues

- Glassdoor blocked upstream (HTTP 400, speedyapply/JobSpy#270) — commented out of defaults
- ZipRecruiter returns 403 from this IP (geo-block) — expected, not a code issue
- `--save_path` is registered under `required_group` instead of `optional_group` in argparse (cosmetic only, has a default)
- Docstring at `main.py:60` still mentions Glassdoor — stale, fix during refactor

## Suggested skills

- `test-driven-development` — required for every feature and the refactor
- `asd-ste100` — apply to any new CLI help strings, error messages, docstrings
- `handoff` — use again if forking a side task (e.g. the Streamlit UI) mid-session
