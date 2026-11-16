# jobspy-cli

jobspy-cli scrapes job postings from multiple boards (LinkedIn, Indeed, ZipRecruiter, Glassdoor) with [JobSpy](https://github.com/speedyapply/JobSpy). It has a Python command-line tool and a local web app. Use the web app to run scrapes, review jobs and track your applications. Ideal for analyzing job trends or automating job searches.

> **Note:** Google Jobs is unavailable — Google shows job results only to browsers that run JavaScript ([JobSpy#284](https://github.com/speedyapply/JobSpy/issues/284)). Glassdoor works, but Cloudflare can still block a run.

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
- [`facets.py`](facets.py:1): The deterministic job facets (country, city, work mode, seniority, employment type)
- [`schema/jobs.json`](schema/jobs.json:1): The shared CSV column schema for the Python writer and the web reader
- [`web/`](web/README.md): The Next.js web app
- `data/`: Your profile data (jobs, settings, CV). Git ignores this folder.
- [`scripts/seed_demo.py`](scripts/seed_demo.py:1): Makes a fictional `demo` profile in `data/demo/` so you can try the web app without a scrape. Run `uv run python scripts/seed_demo.py .` from the repo root.
- [`.agents/SPEC.md`](.agents/SPEC.md): The spec for the web app and the data model

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
# Also crawl company boards directly (Greenhouse, Lever)
uv run python ./main.py --job "AI Engineer" --location "Australia" --company greenhouse:gitlab:GitLab lever:acme:Acme Corporation ashby:ramp:Ramp
# Load job keywords from file
uv run python ./main.py --job "./keywords.txt" --location "Australia" "Vietnam" --save_path ./jobs_by_keywords.csv --results_wanted 10 --verbose 1
```
Results are saved to `./jobs.csv` by default, including fields such as title, company, location, date posted, salary, job URL, and more.

`--company` takes one or more entries in the form `provider:board[:Company Name]`. Greenhouse, Lever and Ashby are the current providers. A board is fetched once, so it can add jobs the search terms would not find; a failed board does not stop the other sources.

### Query and agent access

Read the saved jobs without another scrape:

```bash
# Text table, newest first
uv run python ./jobs_query.py --save_path data/myprofile/jobs.csv --query "engineer"
# JSON for a script or an agent
uv run python ./jobs_query.py --save_path data/myprofile/jobs.csv --status applied --json
```

The same filters are available as one MCP tool. Add this to your MCP host:

```json
{
  "mcpServers": {
    "jobspy-jobs": {
      "command": "uv",
      "args": ["run", "python", "mcp_server.py", "--save_path", "data/myprofile/jobs.csv"]
    }
  }
}
```

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

GitHub Actions runs the Python tests, the web tests, the type check, lint, the build and gitleaks on every push and pull request to `main` (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## License
MIT License

## Acknowledgements
- Thanks to [JobSpy](https://github.com/speedyapply/JobSpy) for scraping functionality

---
If you have questions, suggestions, or just want to say hi, feel free to reach out or open an issue. Happy job hunting!
