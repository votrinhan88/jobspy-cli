import csv

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
