# Handoff — onboarding, UX review, review fixes (session 6)

**Date:** 2026-10-02
**Branch:** `main`. The fixes are committed in four commits after `fe6ede9` (see `git log`) and pushed to `origin/main`.
**For the next session:** pick the next feature (see "Still open from before").

---

## What happened

1. Set up a new Windows machine: Python env, web deps, tests, dev server.
2. An Opus subagent reviewed the running app as a critical frontend developer: `.claude/report.md` (screenshots in `.claude/report-assets/`).
3. The owner agreed on six findings. A plan with declared tests was written: `.claude/plans/review-fixes.md`.
4. An Opus subagent implemented all phases test-first. Per-phase detail is in the plan, SPEC and DESIGN-DECISIONS. Do not repeat it here.

## Verified by me (rerun on 2026-10-02)

- `cd web && pnpm test`: 90 pass. `uv run pytest`: 65 pass. `cd web && pnpm build`: passes.
- `pnpm lint`: 2 errors and 4 warnings, all in files this work did not change (`app/resume/page.tsx`, `app/statistics/page.tsx` errors; `app/scrape/page.tsx`, `app/api/scrape/run/route.ts` x2, `app/layout.tsx` warnings).
- Spot-checked in code: rename uses `fs.rename`; `getActiveProfile()` validates the cookie and falls back; no status transition table; no confirm dialogs.

## NOT verified by me

- Browser acceptance checks A1 to A6 (plan, last section). The developer reports they pass; screenshots are in `.claude/report-assets/fixes/`. I did not rerun them or look at the screenshots.
- Real PDF upload, a real scrape, mobile on a real phone.

## Open decisions for the owner

- Temporary files that were left out of the commits on purpose: `.claude/report.md`, `.claude/report-assets/`, `.claude/plans/review-fixes.md`. Delete them when you no longer need them.
- Known gaps the developer left (also in the earlier handoff text): the Gantt view cannot show a stage before the first logged change; `POST /api/scrape/run` ignores `JOBSPY_DATA_DIR`; the undo toast is not reachable by keyboard while the drawer is open; rows change height when their buttons change.

## Still open from before

- **Step 10, scrape scheduler** (blocked on `pnpm add node-cron` and `pnpm add -D @types/node-cron` in `web/`). The checklist and file list are in the previous handoff: `git show fe6ede9:.claude/HANDOFF.md`.
- Semantic search with local `sentence-transformers` (same old handoff). It needs job descriptions, which the CSV and the scraper do not keep yet. The new CSV parser removes the main blocker.
- Not built from the review: job description in the drawer, keyboard triage (J/K/S/X), filters in the URL, notes and follow-up dates, read-only demo mode, CSRF checks, upload size cap, the Statistics "Timeline" meaning. Details: `.claude/report.md`, sections 7 and 8.

## Owner preferences learned

- Solo use now; a public demo later. A polished demo must also serve daily use.
- No lock-in to one model or API provider.
- Statuses must flow freely in any direction, with undo instead of blocking or confirming.
- Wants subagents (Opus) for review and implementation work, and a plan with declared tests first.

## Environment (this machine, Windows 10)

- Installed this session: `uv` 0.12.20 (winget, `--source winget` because the msstore source fails with a certificate error), `pnpm` 11.24.0 (global, via npm), Node 22.23.3 (was there), `vitest` in `web/`.
- Next.js telemetry is off.
- No dev server is running. Start it with `cd web && pnpm dev` (http://localhost:3000).
- The `demo` profile (65 fictional jobs: 34 new, 9 shortlisted, 8 applied, 4 interview, 1 offer, 5 rejected, 4 skipped) is in `data/demo/` (gitignored). Reset it with `uv run python scripts/seed_demo.py .` from the repo root. Then delete `data/demo/status_log.jsonl`. The expected counts are 22 active and 9 archived.
- Browser checks used Playwright with Chromium. Chromium is in `%LOCALAPPDATA%\ms-playwright`. The `playwright` npm package sits in the old session's temp folder and is gone in a new session. Install it again outside the repo.
- Sessions ran from `C:\Windows\system32` with admin rights. Start the next one from the repo folder instead.
- Other repos cloned to the Desktop, not set up: `certpal`, `manuscripts`.

## Suggested skills

- `asd-ste100` — always-on for all text output
- `test-driven-development` — for every change
- `grill-me` — before scoping the next feature
