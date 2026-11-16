# Handoff - jobspy-cli

**Date:** 2026-11-16
**Branch:** `main`. Work is committed except one test file (see Dirty state). Pushing needs the user's agreement.

## State

- All Definition of Done checks pass: Python 301 tests, web 800 tests in 88 files (799 committed, 1 new) (about 24 s), `tsc --noEmit`, eslint and `pnpm build`. The dev server was stopped for the build; start `pnpm dev` again if needed.
- Jobs is the triage inbox (Untriaged default, All chip). Applications holds Shortlisted and later, with Kanban, Table and Gantt views.
- Row actions: a verb button for the next stage (Apply, Interview, Offer; Accept and Reject at Offer), coloured like the target status chip, then a three-dot status menu. The Action column has a fixed width.
- Kanban: oldest first, the drop box is the last child of the column, column heights stay fixed during a drag.
- Location labels abbreviate states and provinces (`web/lib/regions.ts`). The stored region keeps its full name.
- Resume fork graph is a commit log: one row for each tag, grouped by tree (newest tree first), lanes restart in each tree, 15 px lane gap, graph column capped at 120 px, colour by lane. Layout is `buildForkGraph` in `web/lib/resumes/graph.ts`.
- Test suite: trimmed redundant tests, the drag fuzz runs 60 drops, and the dom project uses the `vmThreads` pool.
- Decisions are in SPEC.md and DESIGN-DECISIONS.md (2026-11-13 entries).

## Dirty state

- `web/tests/resumes-library.test.ts` has one uncommitted test: deleting a fork keeps the root's original file, text and fork link. Passes. Ask the user, then commit as `test:`.
- Dev server (`pnpm dev`, port 3000) is running. Do not run `pnpm build` until it is stopped.

## Base CV work (in progress, outside git)

- The user edits the `base` resume in the app. Data is `data/votrinhan88/resume-library/base/` (gitignored). Version counter was reset by hand to 1; now v5. Edit through `PUT /api/resumes/base` with `{text}`, cookie `active_profile=votrinhan88`.
- Decisions: keep the base generic, cut in tailored versions (not in base). Keep "Tri-Nhan Vo" in publications. No "Communication:" label on the writing line. Long venue names stay short. Thesis title is the link. No job subtitle lines. ACML paper is accepted, in the Causal project and the Casual RA mentoring bullet.
- Hiring-manager review left open: replace placeholder phone `+61 400 000 000`; support or cut LLM skills (deployment, agentic, MCP, guardrails, evaluation); define the metrics ("within 10% CI", "10% error", "1-8%" unit); drop project "Publication" bullets that repeat the list; add a production or engineering project if one exists; header name "Tri Nhan (Nathan) Vo" vs "Tri-Nhan Vo"; optional Blog link in header (user has not sent the URL); "Student representative" kept (offered "HDR Student Representative", no answer).
- Compare `base` with `ra-neurosymbolic` (read-only PDF text) when checking for lost content.

## Open work

1. **Unchecked in a browser:** table views, Action column width (240 px is a guess), three-dot button, abbreviated states, resume graph painting, Gantt, print output, mobile, light mode. The browser tab often fails to paint; use DOM checks if it does.
2. **Re-import Vincent's PDF** under the same tag to refresh the stored text.
3. **One real model call:** run Convert with model and an analysis once with either provider.
4. **Older items:** Kanban docs; board-discovery docs; text resumes stored as `.txt`; optionally let the Scrape page's New count share the Jobs page code path.
5. **Possible further test work:** the slow files are `resume-library-page`, `api-jobs-patch`, `api-job-analysis` and `api-resumes`; merging their setup would save time. Python tests were not reviewed for redundancy.

## Environment notes

- `uv run` fails in this shell. Use `./.venv/Scripts/python.exe -m pytest`.
- Web tests must set `JOBSPY_DATA_DIR` to a temp folder. See `web/tests/helpers.ts`.
- Never run `pnpm build` while `pnpm dev` runs in the same folder.
- A hook sometimes blocks a `git commit` when the command holds other commands. Run `git add` and `git commit` separately. Never bypass hooks.
- Many files use CRLF. Exact-match edits in scripts can miss.
- Happy-dom prints iframe load errors in resume tests. They are harmless.
