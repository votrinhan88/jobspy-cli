# JobScrape

JobScrape is a Python wrapper for [JobSpy](https://github.com/speedyapply/JobSpy), designed to efficiently scrape job postings from multiple boards (LinkedIn, Glassdoor, etc.) with minimal post-processing and CLI support. Ideal for analyzing job trends or automating job searches.

## Features
- Scrapes job postings using [JobSpy](https://github.com/speedyapply/JobSpy)
- Supports multiple job titles and locations, merging results into a single CSV
- Post-processing: blacklist column removal, whitelist column ordering, location tidying
- Batch workloads can be run directly from the CLI

## Project Structure
- [`environment.yml`](environment.yml:1): Conda environment dependencies
- [`keywords.txt`](keywords.txt:1): Template for job keywords and roles
- [`main.py`](main.py:1): Main script for scraping jobs; configurable for titles, locations, and boards

## Setup
1. Install [Conda](https://docs.conda.io/en/latest/).
2. Create and activate the environment:

```bash
conda env create -f environment.yml
conda activate jobspy-cli
```

## Usage
```bash
# Show all arguments
python ./main.py --help
# Basic search
python ./main.py --job "Data Scientist" --location "Australia"
# Multiple jobs and locations
python ./main.py --job "Data Scientist" "ML Engineer" --location "Australia" "Vietnam" --results_wanted 10 --verbose 1
# Load job keywords from file
python ./main.py --job "./keywords.txt" --location "Australia" "Vietnam" --save_path ./jobs_by_keywords.csv --results_wanted 10 --verbose 1
```
Results are saved to `./jobs.csv` by default, including fields such as title, company, location, date posted, salary, job URL, and more.

## License
MIT License

## Acknowledgements
- Thanks to [JobSpy](https://github.com/speedyapply/JobSpy) for scraping functionality

---
If you have questions, suggestions, or just want to say hi, feel free to reach out or open an issue. Happy job hunting!