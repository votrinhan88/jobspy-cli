import csv
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

from geopy.geocoders import Nominatim
from jobspy import scrape_jobs
import pandas as pd


class JobScraper:
    BLACKLIST = [
        "description",
        "company_logo",
        "company_url_direct",
        "company_addresses",
        "company_description",
        "skills",
        "experience_range",
        "company_rating",
        "company_reviews_count",
        "vacancy_count",
        "work_from_home_type",
    ]
    WHITELIST = [
        "title",
        "company",
        "location",
        "interval",
        "min_amount",
        "max_amount",
        "currency",
        "is_remote",
        "date_posted",
        "job_url",
    ]

    def __init__(self, verbose: int = 0):
        self.verbose = verbose

    def __call__(
        self,
        save_path: str,
        job: str|list[str],
        location: str|list[str],
        results_wanted: int = 10,
        site_name: list = ["linkedin", "zip_recruiter", "indeed", "google"],  # "glassdoor" returns 400; blocked upstream (speedyapply/JobSpy#270)
        **kwargs,
    ) -> pd.DataFrame:
        """Scrape job postings from multiple job sites for given job titles and locations.

        Args:
        + `save_path`: Path to save the resulting CSV file.
        + `job`: Job title(s) to search for.
        + `location`: Location(s) to search in.
        + `results_wanted`: Number of job results to fetch per search. Defaults to 10.
        + `site_name`: List of job sites to scrape from. Defaults to ["linkedin",  "zip_recruiter", \
            "indeed", "glassdoor", "google"].
        + **`kwargs`: Additional keyword arguments passed to the `scrape_jobs` (see bottom).

        Returns: pd.DataFrame containing the scraped job postings.

        ---
        Keyword arguments for `scrape_jobs`:
        + `distance`: In miles (default: 50).
        + `job_type`: Options: 'fulltime', 'parttime', 'internship', 'contract'.
        + `proxies`: Format: ['user:pass@host:port', 'localhost']. Each job board scraper will round \
            robin through the proxies.
        + `is_remote`
        + `easy_apply`: Filters for jobs hosted on the job board site (LinkedIn easy apply filter no \
            longer works).
        + `user_agent`: Override the default user agent (may be outdated).
        + `description_format`: Options: 'markdown', 'html'. Format type of the job descriptions. \
            Default: markdown.
        + `offset`: Starts the search from an offset (e.g. 25 will start from the 25th result).
        + `hours_old`: Filters jobs by the number of hours since posted (ZipRecruiter and Glassdoor \
            round up to next day).
        + `verbose`: Options: 0 (errors only), 1 (errors + warnings), 2 (all logs, default).
        + `linkedin_fetch_description`: Fetches full description and direct job URL for LinkedIn \
            (increases requests by O(n)).
        + `linkedin_company_ids`: Searches for LinkedIn jobs with specific company IDs.
        + `country_indeed`: Filters the country on Indeed & Glassdoor (see below for correct \
            spelling).
        + `enforce_annual_salary`: Converts wages to annual salary.
        + `ca_cert`: Path to CA Certificate file for proxies.
        """
        if isinstance(job, str):
            job = [job]
        if isinstance(location, str):
            location = [location]
        
        all_jobs = []
        counter = 1
        total = len(job) * len(location)
        for j in job:
            for l in location:
                df = scrape_jobs(
                    site_name=site_name,
                    search_term=j,
                    google_search_term=f"{j} {l}",
                    location=l,
                    results_wanted=results_wanted,
                    verbose=self.verbose,
                    **kwargs,
                )
                df = self.clean_job_list(df)
                all_jobs.append(df)

                if self.verbose >= 1:
                    print(f"[{counter}/{total}] Found: {len(df)} jobs for '{j}' @ '{l}'")
                counter += 1
        
        df = self.merge(all_jobs)
        df.to_csv(save_path, index=False, quoting=csv.QUOTE_ALL)
        return df

    def clean_job_list(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        df = df.drop(columns=self.BLACKLIST, errors="ignore")
        present = [col for col in self.WHITELIST if col in df.columns]
        df = df[present + [col for col in df.columns if col not in present]]
        return df
    
    def merge(self, all_jobs: list[pd.DataFrame]) -> pd.DataFrame:
        df = pd.concat(all_jobs, ignore_index=True)
        if df.empty:
            return df
        prev_len = len(df)
        groupby_cols = [c for c in ["title", "company", "location", "date_posted"] if c in df.columns]
        df = df.groupby(groupby_cols, as_index=False).first()
        if self.verbose > 0:
            print(f"Remove duplicates: {prev_len} --> {len(df)} unique jobs")
        
        # Geocode and standardize locations
        if self.verbose > 0:
            print("Geocoding and standardizing locations... Might take a while")
        location_map = self.get_location_map(df)
        df["location"] = df["location"].map(location_map)
        return df
    
    GEOCACHE_PATH = os.path.join(os.path.dirname(__file__), ".geocache.json")
    _RATE_LIMIT = 1.0  # seconds between Nominatim requests (ToS: 1 req/sec)
    _MAX_WORKERS = 4

    def _load_geocache(self) -> dict:
        try:
            with open(self.GEOCACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _save_geocache(self, cache: dict) -> None:
        with open(self.GEOCACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)

    def _geocode_one(self, loc: str, geolocator: Nominatim, rate_lock: Lock) -> tuple[str, str]:
        try:
            with rate_lock:
                geocoded = geolocator.geocode(loc)
                time.sleep(self._RATE_LIMIT)
            if geocoded and geocoded.address:
                parts = [p.strip() for p in geocoded.address.split(",")]
                address = f"{parts[0]}, {parts[-1]}" if len(parts) >= 2 else geocoded.address
                return loc, address
        except Exception:
            pass
        return loc, loc

    def get_location_map(self, df: pd.DataFrame) -> dict:
        cache = self._load_geocache()
        geolocator = Nominatim(user_agent="jobscrape")
        rate_lock = Lock()

        unique_locations = [loc for loc in df["location"].dropna().unique() if loc != ""]
        location_map = {"": ""}

        misses = [loc for loc in unique_locations if loc not in cache]
        hits = [loc for loc in unique_locations if loc in cache]

        for loc in hits:
            location_map[loc] = cache[loc]

        if misses:
            if self.verbose > 0:
                print(f"Geocoding {len(misses)} new locations ({len(hits)} cached)...")
            with ThreadPoolExecutor(max_workers=self._MAX_WORKERS) as executor:
                futures = {executor.submit(self._geocode_one, loc, geolocator, rate_lock): loc for loc in misses}
                for future in as_completed(futures):
                    loc, result = future.result()
                    location_map[loc] = result
                    cache[loc] = result
            self._save_geocache(cache)
        elif self.verbose > 0:
            print(f"Geocoding: all {len(hits)} locations resolved from cache.")

        return location_map


if __name__ == "__main__":
    import argparse
    import sys

    # fmt: off
    parser = argparse.ArgumentParser(description="Scrape job postings from multiple job sites.")
    required_group = parser.add_argument_group('Required arguments')
    required_group.add_argument("--job", type=str, nargs='+', required=True, help="Job title(s) to search for, or a text file with one job per line.")
    required_group.add_argument("--location", type=str, nargs='+', required=True, help="Location(s) to search in.")
    
    optional_group = parser.add_argument_group('Optional arguments')
    required_group.add_argument("--save_path", type=str, default="./jobs.csv", help="Path to save the resulting CSV file.")
    optional_group.add_argument("--results_wanted", type=int, default=10, help="Number of job results to fetch per (job, location) pair.")
    optional_group.add_argument("--site_name", type=str, nargs='+', default=["linkedin", "zip_recruiter", "indeed", "google"], help="List of job sites to scrape from.")
    optional_group.add_argument("--verbose", type=int, default=1, help="Verbosity level: 0 (errors only), 1 (errors + warnings), 2 (all logs)")

    auxiliary_group = parser.add_argument_group('Auxiliary arguments')
    auxiliary_group.add_argument("--distance", type=int, default=50, help="Distance in miles (default: 50)")
    auxiliary_group.add_argument("--job_type", type=str, choices=["fulltime", "parttime", "internship", "contract"], help="Job type")
    auxiliary_group.add_argument("--proxies", type=str, nargs='+', help="Proxy list, e.g. user:pass@host:port")
    auxiliary_group.add_argument("--is_remote", action="store_true", help="Filter for remote jobs")
    auxiliary_group.add_argument("--easy_apply", action="store_true", help="Filter for jobs hosted on the job board site")
    auxiliary_group.add_argument("--user_agent", type=str, help="Override the default user agent")
    auxiliary_group.add_argument("--description_format", type=str, choices=["markdown", "html"], default="markdown", help="Format type of the job descriptions")
    auxiliary_group.add_argument("--offset", type=int, help="Start search from an offset")
    auxiliary_group.add_argument("--hours_old", type=int, help="Filter jobs by hours since posted")
    auxiliary_group.add_argument("--linkedin_fetch_description", action="store_true", help="Fetch full description and direct job URL for LinkedIn")
    auxiliary_group.add_argument("--linkedin_company_ids", type=int, nargs='+', help="LinkedIn company IDs")
    auxiliary_group.add_argument("--country_indeed", type=str, help="Country filter for Indeed & Glassdoor")
    auxiliary_group.add_argument("--enforce_annual_salary", action="store_true", help="Convert wages to annual salary")
    auxiliary_group.add_argument("--ca_cert", type=str, help="Path to CA Certificate file for proxies")
    # fmt: on
    
    # # Print help if no arguments are provided
    if len(sys.argv) == 0:
        parser.print_help()
        sys.exit(0)

    args = parser.parse_args()

    # Support --job as a text file
    job_arg = args.job
    if len(job_arg) == 1 and job_arg[0].endswith('.txt'):
        with open(job_arg[0], 'r', encoding='utf-8') as f:
            jobs = [line.strip() for line in f if line.strip()]
        if args.verbose > 0:
            print(f"Loaded {len(jobs)} keywords from {job_arg[0]}: {jobs}")
    else:
        jobs = job_arg

    # Prepare kwargs for JobScraper
    scraper_kwargs = {
        "distance": args.distance,
        "job_type": args.job_type,
        "proxies": args.proxies,
        "is_remote": args.is_remote,
        "easy_apply": args.easy_apply,
        "user_agent": args.user_agent,
        "description_format": args.description_format,
        "offset": args.offset,
        "hours_old": args.hours_old,
        "linkedin_fetch_description": args.linkedin_fetch_description,
        "linkedin_company_ids": args.linkedin_company_ids,
        "country_indeed": args.country_indeed,
        "enforce_annual_salary": args.enforce_annual_salary,
        "ca_cert": args.ca_cert,
    }
    # Remove None values
    scraper_kwargs = {k: v for k, v in scraper_kwargs.items() if v is not None}

    scraper = JobScraper(verbose=args.verbose)
    scraper(
        save_path=args.save_path,
        job=jobs,
        location=args.location,
        results_wanted=args.results_wanted,
        site_name=args.site_name,
        **scraper_kwargs,
    )
