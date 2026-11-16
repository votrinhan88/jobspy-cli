# jobspy-cli

A Python CLI wrapper around [JobSpy](https://github.com/speedyapply/JobSpy) that scrapes job postings from LinkedIn, Indeed, ZipRecruiter, and Glassdoor, merges results, deduplicates, geocodes locations, and saves to a single CSV. Google Jobs is disabled upstream (speedyapply/JobSpy#284).

## Always-on Skills

Always follow the instructions in `.agents/skills/asd-ste100/skill.md` for all text output — error messages, docstrings, CLI help strings, and comments.

Always follow the instructions in `.agents/skills/test-driven-development/skill.md` when implementing any feature or bugfix.

## UI/UX Skills (invoke when doing web app work)

- `.agents/skills/design/SKILL.md` — visual design, layouts, component design
- `.agents/skills/design-system/SKILL.md` — design tokens, component specs, Tailwind integration
- `.agents/skills/brand/SKILL.md` — brand voice, visual identity, consistency

## Critical Rules

- No hardcoded secrets or credentials
- No comments that explain *what* the code does — only *why* when non-obvious
- No emojis in code, comments, or output
- No explanatory prose in the UI. No hints, helper text, or descriptions that restate what a control does or what a choice means. Allow only labels, values, and messages that report an error or a state the user must act on.

## Where Things Live

- **Agent files:** everything for agents lives in `.agents/` (docs and `skills/`). Claude Code reads only `.claude/skills`, so after a clone run `scripts/link-skills.ps1` once. It makes `.claude/skills` a junction to `.agents/skills`. `CLAUDE.md` only imports this file.
- **Spec of record:** `.agents/SPEC.md` — single source of truth for architecture, data model, pages, and API routes. Update it when a decision changes; on conflict it overrides this prompt.
- **Durable design decisions:** `.agents/DESIGN-DECISIONS.md` — append-only record of choices and their rationale.
- **Session handoffs:** rotate `.agents/HANDOFF.md` each session — next-session context only. Never put durable decisions here (handoffs get overwritten).

## Non-negotiables

Engine invariants — do not break:

- `_PRESERVE_ON_UPSERT` = `{status, status_updated_at, location, job_id}`. A new scrape must never overwrite these columns on an existing row.
- `job_id` is immutable identity (md5 of `job_url`, slugified `company-title`). Changing it breaks application tracking. Preserved by upsert.
- Upsert is incremental. `--overwrite` is the only wipe path.
- No concurrent scrape runs against the same profile.
- Flat files are the storage contract — no database, no authentication.

## Definition of Done

Before committing, all of:

- Python suite green: `uv run pytest`
- Web unit tests green: `cd web && pnpm test`
- Web production build green: `cd web && pnpm build`
- `cd web && pnpm lint` clean (advisory, not a hard gate)
- Tests must not depend on live job boards, network calls, or the real `.geocache.json` — use inline synthetic inputs and temp paths (geocoder/scraper tests are pure functions over provided frames).
- Web tests must not touch the real `data/` folder. Set `JOBSPY_DATA_DIR` to a temp folder (see `web/tests/helpers.ts`).

## Command Quick-ref

Python:

- dev env: `uv sync`
- tests: `uv run pytest`
- CLI help: `uv run python ./main.py --help`
- scrape: `uv run python ./main.py --job "..." --location "..." [--save_path ...]`

Web:

- dev: `cd web && pnpm dev`
- build: `cd web && pnpm build`
- lint: `cd web && pnpm lint`
- tests: `cd web && pnpm test` (Vitest; tests use a temp data folder through `JOBSPY_DATA_DIR`)

## Stack

**Python engine** (scraping)

- Python 3.12, managed with `uv`
- Key deps: `python-jobspy`, `geopy`, `pandas`
- Dev deps: `pytest`, `pytest-mock`
- Modules: `scraper.py` (JobScraper), `geocoder.py` (Geocoder), `main.py` (CLI)
- Agent surface: `jobs_query.py` (filters and `--json` over `jobs.csv`), `mcp_server.py` (MCP stdio, one `search_jobs` tool)
- Direct company boards: `ats.py` (Greenhouse, Lever and Ashby adapters), `main.py --company provider:board[:Name]`

**Web app** (`web/`)

- Next.js, TypeScript, App Router
- shadcn/ui, Tailwind CSS
- Vitest (unit tests in `web/tests/`)
- pnpm
- Data: flat files under `data/{profile}/`

## Git Workflow

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`
- Commit to `main` directly; keep each commit focused and green.
