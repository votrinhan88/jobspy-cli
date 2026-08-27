# JobScrape

JobScrape is a Python wrapper for [JobSpy](https://github.com/speedyapply/JobSpy), designed to efficiently scrape job postings from multiple boards (LinkedIn, Indeed, ZipRecruiter, Google Jobs) with minimal post-processing and CLI support. Ideal for analyzing job trends or automating job searches.

> **Note:** Glassdoor is disabled — it returns HTTP 400 errors due to an unresolved upstream issue ([JobSpy#270](https://github.com/speedyapply/JobSpy/issues/270)).

## Features
- Scrapes job postings using [JobSpy](https://github.com/speedyapply/JobSpy)
- Supports multiple job titles and locations, merging results into a single CSV
- Post-processing: column filtering, whitelist ordering, deduplication across sites
- Geocoding with disk cache — standardizes raw location strings, fast on repeat runs
- Batch workloads via CLI, including loading job titles from a `.txt` file

## Project Structure
- [`pyproject.toml`](pyproject.toml:1): Project metadata and dependencies (managed with [uv](https://docs.astral.sh/uv/))
- [`keywords.txt`](keywords.txt:1): Template for job keywords and roles
- [`main.py`](main.py:1): Main script for scraping jobs; configurable for titles, locations, and boards

## Setup
1. Install [uv](https://docs.astral.sh/uv/getting-started/installation/).
2. Create the environment and install dependencies:

```bash
uv sync
```

`uv` reads [`pyproject.toml`](pyproject.toml:1), downloads Python 3.12 if needed, and creates a `.venv/` with the pinned dependencies from `uv.lock`.

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

## License
MIT License

## Acknowledgements
- Thanks to [JobSpy](https://github.com/speedyapply/JobSpy) for scraping functionality

---
If you have questions, suggestions, or just want to say hi, feel free to reach out or open an issue. Happy job hunting!