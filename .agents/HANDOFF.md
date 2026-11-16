# Handoff - jobspy-cli

**Date:** 2026-11-13
**Branch:** `main`. Work is committed. Pushing needs the user's agreement.

## State

- Wave done and committed, one area for each commit: Kanban newest-first, Sankey variable-width bands, PDF layout import, model conversion ("Convert with model" with a confirm step), resume fork graph.
- UI prose cleanup, Workday worktree removal, status log backup deletion and the Template tab gap are done.
- Also done: Sankey endpoint widths, vertical fork graph, PDF icon, hyphen and page-number fixes, Kanban drop box, single New rule (first seen in the latest crawl), shared `JobsTable`, Jobs as triage inbox (Untriaged default) and Applications as pipeline (Kanban and Gantt only).
- Last checks: vitest 800 tests pass, `tsc --noEmit` and lint clean. `pnpm build` not run since the Kanban commit: the dev server holds port 3000 (PID 23964).
- Decisions are in SPEC.md (resume section) and DESIGN-DECISIONS.md (2026-11-13 entries).

## Open work

0. **Run `pnpm build`** after the dev server stops.
1. **Unchecked in a browser:** Sankey bands, fork graph, print output, hover and focus states, mobile, light mode, resume tag chips. Browser screenshots failed in the last session; use DOM checks if they fail again.
1b. **Re-import Vincent's PDF** under the same tag to refresh the stored text.
2. **One real model call:** run Convert with model and an analysis once with either provider.
3. **Older items:** Kanban docs; board-discovery docs; text resumes stored as `.txt`.

## Environment notes

- `uv run` fails in this shell. Use `./.venv/Scripts/python.exe -m pytest`.
- Web tests must set `JOBSPY_DATA_DIR` to a temp folder. See `web/tests/helpers.ts`.
- Never run `pnpm build` while `pnpm dev` runs in the same folder.
- A hook sometimes blocks a `git commit` when the command holds other commands. Run `git add` and `git commit` separately. Never bypass hooks.
- Many files use CRLF. Exact-match edits in scripts can miss.
- Happy-dom prints iframe load errors in resume tests. They are harmless.
