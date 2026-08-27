# jobspy-cli — Feature Roadmap

## Summary Table

| # | Feature | Gain | Effort | Priority |
|---|---------|------|--------|----------|
| 1 | Parallel scraping | High — cuts 42-pair runs from ~10 min to ~2 min | Low | Ship first |
| 2 | Incremental append + dedup across runs | High — run daily, accumulate a growing dataset without managing files manually | Low | Ship first |
| 3 | Output filtering | Medium — removes noise before you read results | Low | Ship first |
| 4 | Job scoring + sort | Medium — surfaces best-fit jobs at the top | Medium | Ship second |
| 5 | Application tracker | High — closes the loop from search to offer | Medium | Ship second |
| 6 | Cover letter / gap analysis via Claude API | High — cuts application time per job | Medium | Ship second |
| 7 | Daily scheduled run + digest | Medium — automates discovery entirely | Medium | Ship second |
| 8 | Streamlit web UI | Low-Medium — nicer browsing, but CSV + filters covers most needs | High | Ship third |
| 9 | Semantic job search | Medium — "find jobs like this one" or "match my resume" | High | Ship third |

---

## Feature Plans

---

### 1. Parallel scraping

**What:** Run the `(job, location)` scraping pairs concurrently instead of sequentially.

**Why:** At 21 keywords × 2 locations = 42 pairs, each `scrape_jobs` call takes 1–5 seconds. Sequential runtime is 2–10 minutes. Parallel cuts this to roughly `total_time / workers`.

**Caveats:** `scrape_jobs` is not thread-safe if it writes shared state. Test with a low worker count (4) first. Rate limits per site may cap the benefit.

**Plan:**
1. In `JobScraper.__call__`, replace the nested `for j in job / for l in location` loop with a `ThreadPoolExecutor`.
2. Submit one task per `(j, l)` pair: `executor.submit(self._scrape_pair, j, l, site_name, results_wanted, **kwargs)`.
3. Extract the loop body into a new private method `_scrape_pair(self, job, location, site_name, results_wanted, **kwargs) -> pd.DataFrame` that calls `scrape_jobs` and `clean_job_list` and returns the result.
4. Add a class constant `_SCRAPE_WORKERS = 4`.
5. Collect results with `as_completed`; preserve verbose progress printing with a thread-safe counter using `threading.Lock`.
6. Pass the collected list of DataFrames to `self.merge` as before.
7. Add `--workers` CLI argument (optional int, default 4) and pass it through to `JobScraper`.
8. Test: `uv run python ./main.py --job "AI Engineer" "ML Engineer" --location "Australia" "Vietnam" --results_wanted 5 --verbose 1` — confirm 4 pairs complete faster than sequential and results are correct.

---

### 2. Incremental append + dedup across runs

**What:** Instead of overwriting the output CSV on each run, load any existing file, append new results, and dedup on `job_url` before saving.

**Why:** Lets you run daily and build a growing dataset. Today's run only adds jobs not seen before.

**Plan:**
1. In `JobScraper.__call__`, after `df = self.merge(all_jobs)`, check if `save_path` exists: `if os.path.exists(save_path): existing = pd.read_csv(save_path)`.
2. Concat `existing` and `df`, then dedup on `job_url` keeping the first occurrence (preserves original `date_posted`): `df = pd.concat([existing, df]).drop_duplicates(subset=["job_url"], keep="first").reset_index(drop=True)`.
3. Print the count of new jobs added when `verbose >= 1`: `new_count = len(df) - len(existing)`.
4. Save as before.
5. Add `--overwrite` CLI flag (default: False). When passed, skip the load-and-merge step and write fresh.
6. Guard: if `job_url` column is absent (scraper returned no URL), fall back to dedup on `(title, company, location, date_posted)` as today.
7. Test: run twice with the same query, confirm second run adds 0 new rows. Run with a new keyword, confirm only new rows are appended.

---

### 3. Output filtering

**What:** CLI flags to filter results before saving: minimum salary, title keyword require/exclude, company blacklist.

**Why:** Raw results include many irrelevant listings. Filtering at save time means the CSV only contains actionable rows.

**Plan:**
1. Add a `filter_jobs(self, df, **filter_kwargs) -> pd.DataFrame` method to `JobScraper`, called after `merge` and before `to_csv`.
2. Implement these filters inside `filter_jobs`:
   - `min_salary: int | None` — drop rows where `max_amount < min_salary` (use `max_amount` so jobs with no upper bound are not dropped unfairly; skip rows where both amounts are NaN).
   - `title_include: list[str] | None` — keep rows where `title` contains any of the strings (case-insensitive).
   - `title_exclude: list[str] | None` — drop rows where `title` contains any of the strings (case-insensitive).
   - `exclude_companies: list[str] | None` — drop rows where `company` matches any entry (case-insensitive, exact match).
3. Add CLI arguments to `argparse`:
   - `--min_salary` (int)
   - `--title_include` (nargs='+')
   - `--title_exclude` (nargs='+')
   - `--exclude_companies` (nargs='+'): path to a `.txt` file or inline list, same pattern as `--job`.
4. Pass filter args through to `scraper()` and into `filter_jobs`.
5. Print a summary when `verbose >= 1`: `Filtered: {before} → {after} jobs`.
6. Test: run with `--title_exclude "Senior" --min_salary 80000` and confirm excluded rows are absent from the CSV.

---

### 4. Job scoring + sort

**What:** Add a `score` column computed from title seniority signals, salary, recency, and remote status. Sort the output CSV by score descending.

**Why:** A 500-row CSV is hard to triage. A score column lets you open the file and read the top 20 rows.

**Plan:**
1. Add `score_jobs(self, df: pd.DataFrame) -> pd.DataFrame` to `JobScraper`.
2. Compute a score as a sum of weighted signals (all weights tunable as class constants):
   - **Recency** (40 pts max): `(today - date_posted).days` mapped to 0–40 linearly, capped at 30 days old = 0.
   - **Salary** (30 pts max): `max_amount` normalized to 0–30 within the result set (percentile rank × 30). Rows with no salary get the median score (15).
   - **Seniority match** (20 pts): title contains "Senior" or "Lead" or "Principal" → +20; contains "Junior" or "Graduate" or "Intern" → −10; else 0. Make the keyword lists class constants so they are easy to edit.
   - **Remote** (10 pts): `is_remote == True` → +10.
3. Add the `score` column (rounded int) and sort `df` by `score` descending before saving.
4. No new CLI flags needed — scoring is always on. Add `--no_score` flag to skip if wanted.
5. Test: verify `score` column is present, values are integers 0–100, and the CSV is sorted descending.

---

### 5. Application tracker

**What:** A separate `track` subcommand that reads the jobs CSV, lets you update the `status` of a row by `job_url`, and saves back.

**Why:** Closes the loop from discovery to offer. One file holds both the job data and your application state.

**Plan:**
1. Add a `status` column (default value `""`) to the output CSV in `JobScraper.__call__` before saving. When appending (feature 2), preserve existing status values for known `job_url`s.
2. Add a `track` subcommand to the argparse CLI:
   ```
   uv run python ./main.py track --url <job_url> --status <applied|interview|offer|rejected|skipped>
   ```
3. Implement `cmd_track(url, status, save_path)`:
   - Load the CSV.
   - Find the row where `job_url == url`. If not found, print an error and exit 1.
   - Set `status` for that row.
   - Save back.
   - Print confirmation: `Updated: <title> @ <company> → <status>`.
4. Add `--list_status` flag to `track` subcommand: print all rows grouped by status (applied, interview, offer, etc.) as a plain-text summary.
5. Test: scrape, then `track --url <url> --status applied`, then `track --list_status` — confirm row updates correctly and list is accurate.

---

### 6. Cover letter / gap analysis via Claude API

**What:** A `tailor` subcommand that takes a `job_url` from the CSV (which must have `description` fetched) and a resume file, calls the Claude API, and writes a tailored cover letter and gap analysis to a markdown file.

**Why:** The most time-consuming part of job applications is tailoring materials per role. This automates the first draft.

**Dependencies:** Requires `--linkedin_fetch_description` (or equivalent) to populate the `description` column. Add `anthropic` to `pyproject.toml`.

**Plan:**
1. Add `anthropic` to dependencies: `uv add anthropic`.
2. Remove `"description"` from `JobScraper.BLACKLIST` when `--fetch_description` is passed (description is needed for tailoring). Add a `--fetch_description` flag that sets `linkedin_fetch_description=True` and removes description from the blacklist.
3. Add a `tailor` subcommand:
   ```
   uv run python ./main.py tailor --url <job_url> --resume ./resume.md --out ./cover_letter.md
   ```
4. Implement `cmd_tailor(url, resume_path, out_path, save_path)`:
   - Load the CSV; find the row by `job_url`.
   - Read `description` field. If blank, print error: "Run with --fetch_description to populate job descriptions."
   - Read resume from `resume_path`.
   - Call Claude API (`claude-sonnet-5` model) with a prompt that produces two sections: **Cover Letter** (3–4 paragraphs, formal tone) and **Gap Analysis** (bulleted list of requirements in the JD not evidenced in the resume).
   - Write response to `out_path` as markdown.
   - Print: `Written to {out_path}`.
5. Store `ANTHROPIC_API_KEY` as an environment variable; read with `os.environ["ANTHROPIC_API_KEY"]`. Print a clear error if absent.
6. Test: fetch one job with description, run `tailor`, confirm output file is written and contains both sections.

---

### 7. Daily scheduled run + digest

**What:** A wrapper script that runs the scrape, compares against the previous CSV, and prints (or emails) a digest of new jobs since last run.

**Why:** Removes the need to remember to run the scraper. New jobs surface in your inbox or terminal each morning.

**Plan:**
1. Implement feature 2 (incremental append) first — the digest is just reporting what was appended.
2. Add a `digest` subcommand:
   ```
   uv run python ./main.py digest --save_path ./jobs.csv --since 24h
   ```
3. Implement `cmd_digest(save_path, since_hours)`:
   - Load the CSV.
   - Filter rows where `date_posted >= today - since_hours`.
   - Print a plain-text summary grouped by location: job title, company, location, salary range, URL.
4. For scheduling on Windows, provide a Task Scheduler command in the README:
   ```
   schtasks /create /tn "JobSpy Daily" /tr "uv run python C:\path\main.py --job ./keywords.txt --location Australia Vietnam --results_wanted 20" /sc daily /st 08:00
   ```
5. Optional email: add `--email_to` flag; use Python `smtplib` with SMTP credentials from environment variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`).
6. Test: run twice in quick succession; confirm digest shows only rows from the second run.

---

### 8. Streamlit web UI

**What:** A `ui.py` that serves the jobs CSV as a filterable, sortable table in a browser.

**Why:** Easier to browse 500 rows with dropdowns and column sorts than in Excel or a text editor.

**Dependencies:** `uv add streamlit`.

**Plan:**
1. Create `ui.py` at the repo root.
2. Load the CSV with `pd.read_csv`.
3. Add sidebar filters mirroring feature 3: location multiselect, title keyword text input, min salary slider, status multiselect, is_remote checkbox, date range picker.
4. Apply filters to the DataFrame and render with `st.dataframe` (use `column_config` to make `job_url` a clickable link).
5. Add a "Mark as applied" button per row that calls the tracker logic from feature 5.
6. Launch with: `uv run streamlit run ui.py`.
7. Add to README under Usage.
8. Test: open in browser, apply filters, confirm table updates correctly.

---

### 9. Semantic job search

**What:** Embed job descriptions and a query (or your resume) using a sentence-transformer model, then rank jobs by cosine similarity.

**Why:** Keyword search misses roles with different titles but matching responsibilities. Semantic search finds "Staff ML Platform Engineer" when you search for "MLOps".

**Dependencies:** `uv add sentence-transformers numpy`. Requires `--fetch_description` to populate descriptions.

**Plan:**
1. Add `embed` subcommand:
   ```
   uv run python ./main.py embed --save_path ./jobs.csv --model all-MiniLM-L6-v2
   ```
2. Implement `cmd_embed(save_path, model_name)`:
   - Load CSV; filter rows where `description` is not blank.
   - Load model with `SentenceTransformer(model_name)`.
   - Encode all descriptions; save embeddings as a `.npy` file alongside the CSV (same stem, `.npy` extension).
   - Print: `Embedded {n} job descriptions → {path}.npy`.
3. Add `search` subcommand:
   ```
   uv run python ./main.py search --query "MLOps platform engineer" --top 20
   # or
   uv run python ./main.py search --resume ./resume.md --top 20
   ```
4. Implement `cmd_search(save_path, query, resume_path, top_k)`:
   - Load CSV and embeddings.
   - Encode the query (or full resume text).
   - Compute cosine similarity against all embeddings.
   - Print top-k rows sorted by similarity: rank, title, company, location, score, URL.
5. Test: embed 50 jobs, search for a role description, confirm top results are semantically relevant.
