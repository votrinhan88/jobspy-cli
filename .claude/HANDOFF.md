# Handoff - jobspy-cli (session 7 wrap-up)

**Date:** 2026-11-01
**Branch:** `main`, 8 commits ahead of `origin/main`. Not pushed. The user said not to push.

## State

- The remote work (free-flowing statuses, triage tools, Gantt view, mobile layout, CSV and profile fixes) and the scrape scheduler are combined on `main`.
- The scheduler is a per-profile `node-cron` task in the Next.js server process. Delete and rename keep it in sync. Preset labels say "server time".
- A live smoke test on the dev server passed 7 of 8 checks: startup, config round trip, tick, skip while running, rename, delete, and restart persistence. Hot reload was not tested.
- Run hardening is done: process id in the status, spawn error handling, no late writes to deleted profiles, keywords required, scrape output path follows `JOBSPY_DATA_DIR`.
- Step 9 (semantic search) is dropped.
- Verified: 65 Python tests, 153 Vitest tests, `tsc`, `pnpm build`. `pnpm lint` has 0 errors and 1 warning.

## Open work

1. Push `main` to `origin` when the user agrees.
2. Delete the tag `safety/pre-split` when the user has reviewed the history. It points at the pre-split tip `2d67c91`.
3. Lint warning: `app/layout.tsx` loads fonts with a link tag (`@next/next/no-page-custom-font`). A fix with `next/font` changes `--app-font` and `--app-mono` in `globals.css`. Decide before you change it.
4. Optional: add an OS-level scheduler (Windows Task Scheduler running the CLI) for runs while the server is off.
5. Optional: investigate why `uv run` fails on this machine. The scheduler spawns `uv`.
6. Delete the smoke test leftovers outside the repo: `C:\Users\votri\AppData\Local\Temp\jobspy-smoke.a9HnAD`, `/tmp/jobspy-smoke-dir.txt`, `/tmp/jobspy-smoke-server{1,2,3}.log`.

## Environment notes

- `uv run` fails on this machine (trampoline error). Use `./.venv/Scripts/python.exe -m pytest` for Python tests.
- Prefix pnpm commands with `CI=true`, for example `CI=true pnpm test`.
- Web tests must set `JOBSPY_DATA_DIR` to a temp folder. See `web/tests/helpers.ts`.
- `vitest.config.ts` has two projects: `node` (`tests/**/*.test.ts`) and `dom` (`tests/**/*.test.tsx`).
- The old local backup branch is deleted. Its tip was `48e5bbe` (reflog only).

## Suggested skills

- `asd-ste100` - always on for all text output
- `test-driven-development` - for every change
