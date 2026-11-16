# Handoff - jobspy-cli (slice 5 gate)

**Date:** 2026-11-04
**Branch:** `main`. Not pushed. The user said not to push.

## State

- Slice 1 is committed: per-site scraping, source health and `scrape_run.json`.
- Slice 2 is committed: stable identity and duplicate markers.
- Slice 3 is committed: job lifecycle.
- Slice 4 is committed: deterministic facets.
- Slice 5 is committed: CSV schema, config validation and CI.
- `schema/jobs.json` is the shared contract for `jobs.csv`. The `required` list has `job_id`, `title`, `company` and `location`. The `x-columns` list has the 39 columns that the engine writes.
- The Python writer fills missing schema columns with an empty string and writes the schema columns first, in schema order.
- The Python writer rejects a frame that has no required column.
- The web reader rejects a file that has no required column.
- `readConfig` repairs bad fields with defaults. `writeConfig` rejects a bad config. `PUT /api/scrape/config` returns 400 on a bad field.
- `google` and `glassdoor` are filtered from a saved site list. If no site remains, the defaults apply.
- GitHub Actions runs the Python suite, the web suite, the type check, lint, the build and gitleaks.
- Dependabot checks `uv`, npm and GitHub Actions each week.

Gate used for slice 5:

- `./.venv/Scripts/python.exe -m pytest -q` -> 215 passed
- `cd web && CI=true pnpm test` -> 454 passed
- `cd web && pnpm exec tsc --noEmit` -> clean
- `cd web && CI=true pnpm lint` -> clean
- `cd web && CI=true pnpm build` -> clean

## Open work

1. Browser-check the Jobs page, the facet bar, the Statistics facets and the Scrape source table.
2. Test a real Claude analysis call when `ANTHROPIC_API_KEY` is set.
3. Google Jobs stays disabled. The long-term fix is direct ATS sources, not a browser fallback.
4. Push `main` only when the user agrees.

## Environment notes

- `uv run` fails in this shell. Use `./.venv/Scripts/python.exe -m pytest`.
- Prefix pnpm commands with `CI=true`, for example `CI=true pnpm test`.
- Web tests must set `JOBSPY_DATA_DIR` to a temp folder. See `web/tests/helpers.ts`.
- Never run `pnpm build` while `pnpm dev` runs in the same folder.
- A hook sometimes blocks a `git commit` when the command holds other commands. Run `git add` and `git commit` separately. Never bypass hooks.
- Many files use CRLF. Exact-match edits in scripts can miss.
- Use `PYTHONIOENCODING=utf-8` for probes that print Vietnamese text.
