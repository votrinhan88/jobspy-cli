# Handoff - jobspy-cli (New marker)

**Date:** 2026-11-04
**Branch:** `main`. 128 commits ahead of `origin/main`. Not pushed. The user said not to push.

## State

- Slice 1 is committed: per-site scraping, source health and `scrape_run.json`.
- Slice 2 is committed: stable identity and duplicate markers.
- Slice 3 is committed: job lifecycle.
- Slice 4 is committed: deterministic facets.
- Slice 5 is committed: CSV schema, config validation and CI.
- The facet UI and Archived page are committed.
- `New` is no longer `status = ""`. `status = ""` is now `Untriaged`.
- A job is New when `first_seen_at` is at or after `started_at` of the latest scrape run.
- The Jobs page reads the run start from `GET /api/scrape/status`.
- Nav order is Profile, Scrape, Jobs, Resume, Applications, Archived, Statistics.
- `scrape_run.json` now carries `changed_jobs`, the count of matched rows whose content changed. It is a diagnostic and is not shown in the banner.
- The Jobs table has a Salary column between Last seen and Actions, and both of those columns are sortable. Salary sorts on the raw top of the range with no currency conversion; empty values stay last.
- `--company provider:board[:Name]` fetches a Greenhouse, Lever, Ashby or Workday board once per run and merges its jobs. A Workday board is `tenant.cluster/site`, is paged 20 at a time, stops at 100 postings, and costs one detail call per job. A failed board is recorded and does not stop the run. The Scrape page writes the entries to `scrape_config.json` and the runner passes them on.
- `jobs_query.py` filters jobs.csv and prints a table or JSON. `mcp_server.py` exposes the same filters as one MCP `search_jobs` tool over stdio.
- Glassdoor is ticked by default. The Scrape page ticks Greenhouse, Lever, Ashby and Workday; an unticked provider keeps its saved boards but the runner drops them. Google Jobs is last, disabled, and reads "Google Jobs (unavailable)" with no badge.
- The job drawer shows First seen in days, and a Board date note when the board date is more than one day after the first sighting. Both are observations, not a verdict.
- Fit analysis accepts two providers. `LLM_BASE_URL` (with `LLM_MODEL`, optional `LLM_API_KEY`) selects a local OpenAI-compatible endpoint and wins over `ANTHROPIC_API_KEY`.
- The scrape done banner shows new and total only. The updated count was removed; the field was always null.
- The Jobs page has a New filter chip. A row first seen in the latest run shows an uppercase NEW badge in the status cell. An untriaged row shows no status chip; the word stays for screen readers only.
- The browser check passed for the New chip and badge, the five facet menus, Archived restore and undo, and the Applications Rejected section. The menus are capped at 320 px and scroll, so they keep one column.
- The city facet now has one label per metro area. A lone Australian state name gives an empty city. Metro and suburb names roll up, and the Vietnamese "Thành phố" or "TP." prefix is dropped. The table is `_CITY_ALIASES` in `facets.py`.
- `data/votrinhan88/jobs.csv` is backfilled. The city count fell from 31 to 22, and only the `city` column changed. The SA and NSW rows now have an empty city.
- A legacy row with no lifecycle columns keeps `first_seen_at` empty. A later matched scrape sets `last_seen_at` only.
- The upsert no longer fills lifecycle timestamps on existing rows. `_close_gone_jobs` does not fill them either.
- Skip moves a job to Archived. Restore sets the status back to Untriaged.
- Applications shows rejected jobs in the Rejected section.
- The first real scrape after the lifecycle change ran on 2026-11-04. `jobs.csv` now has the lifecycle columns and 262 rows: 4 rows added, one of them a duplicate, so `new_jobs` is 3. The 132 matched old rows got `last_seen_at` only; no old row got `first_seen_at`. The New chip shows 3.
- Statistics has a Flow Sankey of forward status moves from `status_log.jsonl`, with a count on every flow and stage labels in a header row. Bands use a fixed 28 px per move and the chart height follows the counts. Backward moves and skipped are not drawn.
- Kanban cards drag between columns to change status; the card buttons are gone. The table view keeps the status menu, which is the keyboard and touch path.
- The scrape spawn uses `.venv/Scripts/pythonw.exe` on Windows, a GUI subsystem binary, so no console window opens. `windowsHide: true` stays as a second guard. The Jobs body cells now follow the header order: Status before Last seen.

Recent commits:

- `fix: keep sankey labels clear of the flows`
- `docs: record the sankey bands`
- `chore: drop the unused d3-sankey dependency`
- `feat: show the count on every flow`
- `fix: size sankey bands to the counts`
- `docs: record the sankey handoff`
- `docs: record the application flow sankey`
- `feat: show the application flow on statistics`
- `feat: draw the application flow sankey`
- `feat: lay out the application flow with d3-sankey`
- `feat: count application moves for a sankey`
- `docs: plan the application flow sankey`
- `docs: record the kanban drag handoff`
- `docs: record the kanban drag and drop`
- `feat: drag kanban cards between application stages`
- `docs: record the tie-break handoff`
- `docs: record the last-seen tie-break`
- `fix: break last-seen ties by posted date`
- `docs: record the scrape source ticks`
- `feat: choose scrape sources on the scrape page`
- `docs: record the Workday board`
- `feat: set Workday boards on the scrape page`
- `fix: align the jobs table cells with the header`
- `fix: start scrapes without a console window`
- `feat: crawl Workday boards`
- `docs: record the Ashby adapter`
- `feat: add an Ashby adapter`
- `docs: record the Lever adapter`
- `feat: add a Lever adapter`
- `docs: record the sortable columns`
- `feat: set company boards on the scrape page`
- `feat: sort jobs by last seen and salary`
- `feat: show salary on the jobs table`
- `feat: crawl company boards directly`

Gate used for this change:

- `./.venv/Scripts/python.exe -m pytest -q` -> 301 passed
- `cd web && CI=true pnpm test` -> 557 passed
- `cd web && pnpm exec tsc --noEmit` -> clean
- `cd web && CI=true pnpm lint` -> clean
- `cd web && CI=true pnpm build` -> clean

## Open work

1. Test one real analysis call with either provider: `ANTHROPIC_API_KEY`, or `LLM_BASE_URL` plus `LLM_MODEL` for a local OpenAI-compatible endpoint such as llama.cpp.
2. Google Jobs stays disabled. The long-term fix is direct ATS sources, not a browser fallback. Greenhouse, Lever and Ashby now cover the common startup boards. Workday is the next large adapter and needs a different approach.
3. Push `main` only when the user agrees.

## Environment notes

- `uv run` fails in this shell. Use `./.venv/Scripts/python.exe -m pytest`.
- Prefix pnpm commands with `CI=true`, for example `CI=true pnpm test`.
- Web tests must set `JOBSPY_DATA_DIR` to a temp folder. See `web/tests/helpers.ts`.
- Never run `pnpm build` while `pnpm dev` runs in the same folder.
- A hook sometimes blocks a `git commit` when the command holds other commands. Run `git add` and `git commit` separately. Never bypass hooks.
- Many files use CRLF. Exact-match edits in scripts can miss.
- Use `PYTHONIOENCODING=utf-8` for probes that print Vietnamese text.
