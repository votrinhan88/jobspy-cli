import csv
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

from jobspy import scrape_jobs
import pandas as pd

from geocoder import Geocoder


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

    _SCRAPE_WORKERS = 4

    def __init__(self, verbose: int = 0):
        self.verbose = verbose
        self._geocoder = Geocoder(verbose=verbose)

    def __call__(
        self,
        save_path: str,
        job: str | list[str],
        location: str | list[str],
        results_wanted: int = 10,
        site_name: list = ["linkedin", "zip_recruiter", "indeed", "google"],  # "glassdoor" returns 400; blocked upstream (speedyapply/JobSpy#270)
        workers: int | None = None,
        overwrite: bool = False,
        **kwargs,
    ) -> pd.DataFrame:
        """Scrape job postings from multiple job sites for given job titles and locations.

        Args:
        + `save_path`: Path to save the resulting CSV file.
        + `job`: Job title(s) to search for.
        + `location`: Location(s) to search in.
        + `results_wanted`: Number of job results to fetch per search. Defaults to 10.
        + `site_name`: List of job sites to scrape from. Defaults to ["linkedin", "zip_recruiter",
            "indeed", "google"].
        + **`kwargs`: Additional keyword arguments passed to `scrape_jobs` (see bottom).

        Returns: pd.DataFrame containing the scraped job postings.

        ---
        Keyword arguments for `scrape_jobs`:
        + `distance`: In miles (default: 50).
        + `job_type`: Options: 'fulltime', 'parttime', 'internship', 'contract'.
        + `proxies`: Format: ['user:pass@host:port', 'localhost']. Each job board scraper will round
            robin through the proxies.
        + `is_remote`
        + `easy_apply`: Filters for jobs hosted on the job board site (LinkedIn easy apply filter no
            longer works).
        + `user_agent`: Override the default user agent (may be outdated).
        + `description_format`: Options: 'markdown', 'html'. Format type of the job descriptions.
            Default: markdown.
        + `offset`: Starts the search from an offset (e.g. 25 will start from the 25th result).
        + `hours_old`: Filters jobs by the number of hours since posted (ZipRecruiter and Glassdoor
            round up to next day).
        + `verbose`: Options: 0 (errors only), 1 (errors + warnings), 2 (all logs, default).
        + `linkedin_fetch_description`: Fetches full description and direct job URL for LinkedIn
            (increases requests by O(n)).
        + `linkedin_company_ids`: Searches for LinkedIn jobs with specific company IDs.
        + `country_indeed`: Filters the country on Indeed & Glassdoor (see below for correct
            spelling).
        + `enforce_annual_salary`: Converts wages to annual salary.
        + `ca_cert`: Path to CA Certificate file for proxies.
        """
        if isinstance(job, str):
            job = [job]
        if isinstance(location, str):
            location = [location]

        pairs = [(j, l) for j in job for l in location]
        total = len(pairs)
        max_workers = workers if workers is not None else self._SCRAPE_WORKERS
        counter_lock = Lock()
        counter = [0]
        all_jobs = [None] * total

        def _run(idx, j, l):
            result = self._scrape_pair(j, l, site_name, results_wanted, **kwargs)
            with counter_lock:
                counter[0] += 1
                if self.verbose >= 1:
                    print(f"[{counter[0]}/{total}] Found: {len(result)} jobs for '{j}' @ '{l}'")
            return idx, result

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_run, i, j, l) for i, (j, l) in enumerate(pairs)]
            for future in as_completed(futures):
                idx, result = future.result()
                all_jobs[idx] = result

        df = self.merge(all_jobs)
        df = self._upsert(df, save_path, overwrite)
        df.to_csv(save_path, index=False, quoting=csv.QUOTE_ALL)
        return df

    # Fields preserved from the existing row on upsert (never overwritten by a new scrape).
    _PRESERVE_ON_UPSERT = {"status", "location"}

    def _upsert(self, df: pd.DataFrame, save_path: str, overwrite: bool) -> pd.DataFrame:
        if overwrite or not os.path.exists(save_path):
            return df
        existing = pd.read_csv(save_path)
        before = len(existing)

        if "job_url" in df.columns and "job_url" in existing.columns:
            existing_index = existing.set_index("job_url")
            new_rows = []
            for _, row in df.iterrows():
                url = row["job_url"]
                if url in existing_index.index:
                    # Update job data fields; preserve protected columns from existing row.
                    for col in existing_index.columns:
                        if col not in self._PRESERVE_ON_UPSERT and col in row.index:
                            existing_index.at[url, col] = row[col]
                else:
                    new_rows.append(row)
            combined = existing_index.reset_index()
            if new_rows:
                combined = pd.concat([combined, pd.DataFrame(new_rows)], ignore_index=True)
        else:
            dedup_cols = [c for c in ["title", "company", "location", "date_posted"] if c in df.columns and c in existing.columns]
            combined = pd.concat([existing, df], ignore_index=True)
            combined = combined.drop_duplicates(subset=dedup_cols, keep="first")

        combined = combined.reset_index(drop=True)
        if self.verbose >= 1:
            print(f"Appended: {len(combined) - before} new jobs ({len(combined)} total)")
        return combined

    def _scrape_pair(self, job: str, location: str, site_name: list, results_wanted: int, **kwargs) -> pd.DataFrame:
        df = scrape_jobs(
            site_name=site_name,
            search_term=job,
            google_search_term=f"{job} {location}",
            location=location,
            results_wanted=results_wanted,
            verbose=self.verbose,
            **kwargs,
        )
        return self.clean_job_list(df)

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

        if self.verbose > 0:
            print("Geocoding and standardizing locations... Might take a while")
        location_map = self.get_location_map(df)
        df["location"] = df["location"].map(location_map)
        return df

    # Delegate geocache attributes for test compatibility
    @property
    def GEOCACHE_PATH(self):
        return self._geocoder.GEOCACHE_PATH

    @GEOCACHE_PATH.setter
    def GEOCACHE_PATH(self, value):
        self._geocoder.GEOCACHE_PATH = value

    def _load_geocache(self) -> dict:
        return self._geocoder._load_geocache()

    def _save_geocache(self, cache: dict) -> None:
        self._geocoder._save_geocache(cache)

    def _geocode_one(self, *args, **kwargs):
        return self._geocoder._geocode_one(*args, **kwargs)

    def get_location_map(self, df: pd.DataFrame) -> dict:
        return self._geocoder.get_location_map(df)
