# jobspy-cli

jobspy-cli scrapes job postings from multiple boards (LinkedIn, Indeed, ZipRecruiter, Google Jobs) with [JobSpy](https://github.com/speedyapply/JobSpy). It has a Python command-line tool and a local web app. Use the web app to run scrapes, review jobs and track your applications. Ideal for analyzing job trends or automating job searches.

> **Note:** Glassdoor is disabled — it returns HTTP 400 errors due to an unresolved upstream issue ([JobSpy#270](https://github.com/speedyapply/JobSpy/issues/270)).

## Features
- Scrapes job postings using [JobSpy](https://github.com/speedyapply/JobSpy)
- Supports multiple job titles and locations, merging results into a single CSV
- Post-processing: column filtering, whitelist ordering, deduplication across sites
- Geocoding with disk cache — standardizes raw location strings, fast on repeat runs
- Batch workloads via CLI, including loading job titles from a `.txt` file
- Web app: profiles, scrape settings and history, a sortable and filterable job list, and an application tracker with Kanban, Table and Gantt views
- Free-flowing application statuses: move a job to any status, and undo a mistake

## Project Structure
- [`pyproject.toml`](pyproject.toml:1): Project metadata and dependencies (managed with [uv](https://docs.astral.sh/uv/))
- [`keywords.txt`](keywords.txt:1): Template for job keywords and roles
- [`main.py`](main.py:1): Main script for scraping jobs; configurable for titles, locations, and boards
- [`scraper.py`](scraper.py:1) and [`geocoder.py`](geocoder.py:1): The scraping and location code that `main.py` uses
- [`web/`](web/README.md): The Next.js web app
- `data/`: Your profile data (jobs, settings, CV). Git ignores this folder.
- [`scripts/seed_demo.py`](scripts/seed_demo.py:1): Makes a fictional `demo` profile in `data/demo/` so you can try the web app without a scrape. Run `uv run python scripts/seed_demo.py .` from the repo root.
- [`.claude/SPEC.md`](.claude/SPEC.md): The spec for the web app and the data model

## Setup
1. Install [uv](https://docs.astral.sh/uv/getting-started/installation/).
2. Create the environment and install dependencies:

```bash
uv sync
```

`uv` reads [`pyproject.toml`](pyproject.toml:1), downloads Python 3.12 if needed, and creates a `.venv/` with the pinned dependencies from `uv.lock`.

For the web app, also install Node.js and [pnpm](https://pnpm.io/installation) (the pnpm version is pinned in [`web/package.json`](web/package.json)), then:

```bash
cd web
pnpm install
```

## Usage
Prefix commands with `uv run` to use the project environment (no manual activation needed):

```bash
# Show all arguments
uv run python ./main.py --help
# Basic search
uv run python ./main.py --job "Data Scientist" --location "Australia"
# Multiple jobs and locations
uv run python ./main.py --job "Data Scientist" "ML Engineer" --location "Australia" "Vietnam" --results_wanted 10 --verbose 1
# Load job keywords from file
uv run python ./main.py --job "./keywords.txt" --location "Australia" "Vietnam" --save_path ./jobs_by_keywords.csv --results_wanted 10 --verbose 1
```
Results are saved to `./jobs.csv` by default, including fields such as title, company, location, date posted, salary, job URL, and more.

### Web app
Start the app from the `web/` folder:

```bash
cd web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Create a profile first. Each profile keeps its own jobs, scrape settings and CV in `data/<profile>/`.

The app has no login and no database. It reads and writes flat files on your machine, and it can start scrapes and save uploads. Run it on your own computer only. Do not expose it to the internet.

## Tests
```bash
# Python
uv run pytest
# Web app
cd web
pnpm test
pnpm build
pnpm lint
```

The tests do not use the network or your real `data/` folder.

## License
MIT License

## Acknowledgements
- Thanks to [JobSpy](https://github.com/speedyapply/JobSpy) for scraping functionality

---
If you have questions, suggestions, or just want to say hi, feel free to reach out or open an issue. Happy job hunting!
