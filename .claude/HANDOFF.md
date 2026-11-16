# Handoff - jobspy-cli (session 9 wrap-up)

**Date:** 2026-11-03
**Branch:** `main`, 40 commits ahead of `origin/main`. Not pushed. The user said not to push.

## State

- The LaTeX resume builder is gone. The user found it over-engineered. The Resume page is now a resume library: import `.pdf`, `.tex`, `.md`, `.txt` or pasted text, one resume per tag (kebab-case). See `.claude/SPEC.md` (Resume) and `.claude/DESIGN-DECISIONS.md` (Resume Library and Review).
  - Files: `data/{profile}/resume-library/{tag}/` (`original.<ext>`, `text.txt`, `meta.json`). Logic: `web/lib/resumes/`. API: `/api/resumes`, `/api/resumes/[tag]`, `/api/resumes/[tag]/file`.
  - PDF text comes from `pdfjs-dist` (`serverExternalPackages` in `next.config.ts`). Checked in the running dev server with a real PDF.
- New review page `/jobs/[jobId]/review`: the original resume beside the fit report (keyword score, requirements table with evidence and verdicts, gaps, suggested wording with Copy, "Submitted with this resume" checkbox). The job drawer keeps a short summary with a link.
- Saved analyses carry the resume version, the resume text hash and the job text hash. The page shows "out of date" when a hash differs. Rename and delete of a resume move and remove its analyses. The submitted record lives in `data/{profile}/submitted.json`.
- Contact bars in the old template are moot now (the builder is removed).
- JobSpy is updated to 1.4.1. `--fetch_description` replaces `--linkedin_fetch_description` (the old flag stays as an alias). The config field is still `fetch_linkedin_description`.
- Verified at the last commit: 349 Vitest tests (37 files), 70 Python tests, `tsc`, `pnpm lint`, `pnpm build` all clean. A live check on a throwaway profile: PDF import, text extraction, file route, keyword match (88%) and the submitted record.

- Location tiers: new `region` column (geocoder, `data/.regioncache.json`), Location sort by country, region, city, and a "Group by location" toggle on the Jobs page. Google Jobs is disabled (returns no data without a browser, JobSpy#284).
- On 2026-11-03 the user had all `jobs.csv` and `status_log.jsonl` files deleted in profiles `votrinhan88` and `sample` (dev phase), then a small scrape ran on `votrinhan88` (10 jobs, 2 regions). Resumes and configs are untouched.
- Requested, not built yet: a warning on the Scrape page only when the installed python-jobspy is older than the latest PyPI release.

## Open work

1. Push `main` to `origin` only when the user agrees.
2. Delete the tag `safety/pre-split` when the user has reviewed the history. It points at the pre-split tip `2d67c91`.
3. Not tested yet:
   - A real Claude call (no `ANTHROPIC_API_KEY` here). The reply parser and the new JSON shape (requirements, rewrites) have only unit tests. Run one analysis and check that the table and the wording read well.
   - The review page and the library page in a real browser (screenshots never painted in the embedded browser). Check the PDF in the viewer iframe, Copy, the checkbox, rename and delete.
4. The user's seeded resume (old JSON under `data/votrinhan88/resumes/`) is not read any more. The user imports their own file as a tag. Their old `cv.pdf` and `cv.md` stay on disk, unread.
5. Matching tuning: add filler words such as "need" to the stop-word list in `web/lib/matching.ts` (it showed up in a live check).
6. JobSpy 1.2.0 says Glassdoor works again. The project still lists it as disabled. Decide whether to turn it on. HelloWork (France) is a new board that is not wired in.
7. Optional: an OS-level scheduler (Windows Task Scheduler running the CLI) for runs while the server is off.
8. Delete leftovers outside the repo or ignored by git (the classifier denied deleting them from here):
   - `data/rrtest/` (throwaway profile from the live check: `jobs.csv` and `r.pdf`, plus `resume-library/` and `submitted.json`)
   - In `C:\Users\votri\AppData\Local\Temp`: `jobspy-smoke*`, about 12 folders named `jobspy-resume-*`, `smoke-resume*.png`, `seed*`, `vincent-1.png`, `jobspy-dev.log`

## Environment notes

- `uv run` fails in the shell on this machine (trampoline error). Use `./.venv/Scripts/python.exe -m pytest`. `uv lock` and `uv sync` work.
- `python3` hangs on this machine. Use `node` for scripts.
- Prefix pnpm commands with `CI=true`, for example `CI=true pnpm test`.
- Web tests must set `JOBSPY_DATA_DIR` to a temp folder. See `web/tests/helpers.ts`. `tinyPdf()` in the helpers builds a small PDF for tests.
- `vitest.config.ts` has two projects: `node` (`tests/**/*.test.ts`) and `dom` (`tests/**/*.test.tsx`).
- Never run `pnpm build` while `pnpm dev` runs in the same folder. The build rewrites `.next` and the dev server then returns 500 ("Jest worker encountered 2 child process exceptions"). `TaskStop` on a background `pnpm dev` does not kill the server process. Stop the Node process on port 3000, then build, then start `pnpm dev` again.
- A dev server runs on port 3000 (started this session). Stop it before you start another. `next dev` refuses a second server in the same folder.
- A hook sometimes blocks a `git commit` with a false "--no-verify" message when the command also holds other commands. Run `git add` and `git commit` as a command without a delete or `cd` chain. Never bypass hooks.
- In heredocs and `node -e` scripts, `\n` inside a JS string can turn into a real newline. Use the Write or Edit tools for files with escapes.
- The tests in `web/tests/api-jobs-patch.test.ts` (49 status pairs) have a 30 s timeout because the suite runs in parallel.

## Suggested skills

- `asd-ste100` - always on for all text output
- `test-driven-development` - for every change
