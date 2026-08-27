# jobspy-cli

A Python CLI wrapper around [JobSpy](https://github.com/speedyapply/JobSpy) that scrapes job postings from LinkedIn, Indeed, ZipRecruiter, Glassdoor, and Google Jobs, merges results, deduplicates, and geocodes locations into a single CSV.

## Always-on Skills

Always follow the instructions in `.claude/skills/asd-ste100/skill.md` for all text output — error messages, docstrings, CLI help strings, and comments.

Always follow the instructions in `.claude/skills/test-driven-development/skill.md` when implementing any feature or bugfix.

## Critical Rules

- No hardcoded secrets or credentials
- No comments that explain *what* the code does — only *why* when non-obvious
- No emojis in code, comments, or output

## Stack

- Python 3.12, managed with `uv`
- Key deps: `python-jobspy`, `geopy`, `pandas`
- Entry point: `main.py` (`JobScraper` class + argparse CLI)

## Available Commands

- `uv run python ./main.py --help` — show all CLI arguments
- `uv sync` — install/update dependencies

## Git Workflow

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`
- Branch off `main` for changes; do not push directly to `main`
