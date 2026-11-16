import csv
import hashlib
import json
import os
import re
import tempfile
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from jobspy import scrape_jobs
from jobspy.model import Country
import pandas as pd

from ats import fetch_company
from facets import FACET_COLUMNS, add_facets
from geocoder import Geocoder
from jobs_schema import schema_columns, validate_jobs_frame


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_time(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_time(value) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _read_json(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_json(path: str, data: dict) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".tmp-", suffix=".json", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _run_report_path(save_path: str) -> str:
    return os.path.join(os.path.dirname(os.path.abspath(save_path)), "scrape_run.json")


def _source_health_path(save_path: str) -> str:
    return os.path.join(os.path.dirname(os.path.abspath(save_path)), "source_health.json")


_PROBE_TIMEOUT_SECONDS = 8.0
_PROBE_USER_AGENT = "Mozilla/5.0 (compatible; jobspy-cli/0.1; +https://github.com/speedyapply/JobSpy)"


def probe_job_url(url: str, timeout: float = _PROBE_TIMEOUT_SECONDS) -> int | None:
    text = str(url or "").strip()
    if not text:
        return None
    try:
        request = Request(text, method="GET", headers={"User-Agent": _PROBE_USER_AGENT})
        with urlopen(request, timeout=timeout) as response:
            return int(getattr(response, "status", 200) or 200)
    except HTTPError as exc:
        return int(exc.code)
    except (URLError, TimeoutError, OSError, ValueError):
        return None


def source_in_cooldown(entry: dict, now: datetime) -> bool:
    cooldown = _parse_time(entry.get("cooldown_until"))
    return bool(cooldown and cooldown > now)


def update_source_health(health: dict, source_runs: list[dict], now: datetime) -> dict:
    updated = {site: dict(entry) for site, entry in health.items() if isinstance(entry, dict)}
    for run in source_runs:
        site = run.get("site")
        if not site:
            continue
        entry = updated.setdefault(site, {})
        entry.setdefault("consecutive_failures", 0)
        entry.setdefault("cooldown_until", None)
        entry.setdefault("last_error", None)
        entry.setdefault("last_error_at", None)
        entry.setdefault("last_success_at", None)
        if run.get("skipped") and not run.get("attempts"):
            continue
        if run.get("failed", 0) > 0:
            entry["last_error"] = run.get("error")
            entry["last_error_at"] = _iso_time(now)
        if run.get("succeeded", 0) > 0:
            entry["consecutive_failures"] = 0
            entry["cooldown_until"] = None
            entry["last_success_at"] = _iso_time(now)
        elif run.get("failed", 0) > 0:
            failures = int(entry.get("consecutive_failures") or 0) + 1
            entry["consecutive_failures"] = failures
            if failures >= 3:
                hours = min(24, 2 ** (failures - 3))
                entry["cooldown_until"] = _iso_time(now + timedelta(hours=hours))
        updated[site] = entry
    return updated


class SourceRunRecorder:
    def __init__(self):
        self._lock = Lock()
        self._runs: dict[str, dict] = {}

    def _entry(self, site: str) -> dict:
        return self._runs.setdefault(site, {
            "site": site,
            "attempts": 0,
            "succeeded": 0,
            "failed": 0,
            "skipped": 0,
            "jobs": 0,
            "duration_ms": 0,
            "error": None,
        })

    def record_attempt(self, site: str, jobs: int, duration_ms: float, error=None) -> None:
        with self._lock:
            entry = self._entry(site)
            entry["attempts"] += 1
            entry["duration_ms"] += max(0, int(duration_ms))
            if error:
                entry["failed"] += 1
                entry["error"] = str(error)[:500]
            else:
                entry["succeeded"] += 1
                entry["jobs"] += int(jobs)

    def record_skipped(self, site: str) -> None:
        with self._lock:
            self._entry(site)["skipped"] += 1

    def snapshot(self) -> list[dict]:
        with self._lock:
            return [dict(entry) for entry in self._runs.values()]


class JobScraper:
    BLACKLIST = [
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
        self._cooled_sites: set[str] = set()

    def __call__(
        self,
        save_path: str,
        job: str | list[str],
        location: str | list[str],
        results_wanted: int = 10,
        site_name: list = ["linkedin", "zip_recruiter", "indeed"],  # "google" returns no data (speedyapply/JobSpy#284)
        workers: int | None = None,
        overwrite: bool = False,
        title_include: list[str] | None = None,
        title_exclude: list[str] | None = None,
        exclude_companies: list[str] | None = None,
        companies: list[str] | None = None,
        **kwargs,
    ) -> pd.DataFrame:
        """Scrape job postings from multiple job sites for given job titles and locations.

        Args:
        + `save_path`: Path to save the resulting CSV file.
        + `job`: Job title(s) to search for.
        + `location`: Location(s) to search in.
        + `results_wanted`: Number of job results to fetch per search. Defaults to 10.
        + `site_name`: List of job sites to scrape from. Defaults to ["linkedin", "zip_recruiter",
            "indeed"].
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
        + `fetch_description`: Fetches the full description for boards that leave it out of search results
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

        run_started = _utc_now()
        recorder = SourceRunRecorder()
        health_path = _source_health_path(save_path)
        health = _read_json(health_path)
        self._cooled_sites = {
            site for site, entry in health.items()
            if isinstance(entry, dict) and source_in_cooldown(entry, run_started)
        }

        pairs = [(j, l) for j in job for l in location]
        total = len(pairs)
        max_workers = workers if workers is not None else self._SCRAPE_WORKERS
        counter_lock = Lock()
        counter = [0]
        all_jobs = [None] * total

        def _run(idx, j, l):
            result = self._scrape_pair(
                j, l, site_name, results_wanted, recorder=recorder, **kwargs
            )
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

        company_frames = self._fetch_company_boards(companies or [], recorder)

        df = self.merge(
            [frame for frame in all_jobs if frame is not None] + company_frames,
            country_hint=self._search_country(location),
        )
        df = self.filter_jobs(df, title_include=title_include, title_exclude=title_exclude, exclude_companies=exclude_companies)
        df = self._add_metadata(df)
        before_count = 0 if overwrite else self._count_canonical_rows(save_path)
        stats: dict = {}
        df = self._upsert(df, save_path, overwrite, now=run_started, stats=stats)
        canonical_total = self._count_canonical_rows_in_frame(df)
        new_jobs = canonical_total if overwrite else max(0, canonical_total - before_count)
        df = self._close_gone_jobs(df, now=_utc_now())
        df = self.fill_regions(df)
        df = self._write_jobs(df, save_path)

        report = {
            "started_at": _iso_time(run_started),
            "finished_at": _iso_time(_utc_now()),
            "new_jobs": int(new_jobs),
            "changed_jobs": int(stats.get("changed", 0)),
            "total_jobs": int(canonical_total),
            "sources": recorder.snapshot(),
        }
        try:
            _write_json(_run_report_path(save_path), report)
            health = update_source_health(health, report["sources"], _utc_now())
            _write_json(health_path, health)
        except OSError as exc:
            if self.verbose >= 1:
                print(f"Could not write the scrape report: {exc}")
        return df

    def _fetch_company_boards(self, companies: list[str], recorder: SourceRunRecorder) -> list[pd.DataFrame]:
        frames = []
        for entry in companies:
            label = ":".join(str(entry).split(":")[:2])
            started = time.monotonic()
            try:
                frame = self.clean_job_list(fetch_company(entry))
            except Exception as exc:
                recorder.record_attempt(label, 0, (time.monotonic() - started) * 1000, error=str(exc))
                if self.verbose >= 1:
                    print(f"[{label}] Failed: {exc}")
                continue
            recorder.record_attempt(label, len(frame), (time.monotonic() - started) * 1000)
            frames.append(frame)
        return frames

    def fill_regions(self, df: pd.DataFrame) -> pd.DataFrame:
        # The region follows the stored location, which upsert never overwrites, so it is filled
        # after the merge and only where it is empty.
        if df.empty or "location" not in df.columns:
            return df
        df = df.copy()
        if "region" not in df.columns:
            df["region"] = ""
        df["region"] = df["region"].fillna("").astype(str)
        needs = df["region"] == ""
        locations = df.loc[needs, "location"].fillna("").astype(str)
        wanted = [loc for loc in dict.fromkeys(locations) if loc]
        if not wanted:
            return df
        region_map = self._geocoder.get_region_map(wanted)
        df.loc[needs, "region"] = locations.map(lambda loc: region_map.get(loc, ""))
        return df

    def backfill_regions(self, save_path: str) -> int:
        try:
            df = pd.read_csv(save_path, keep_default_na=False)
        except (FileNotFoundError, pd.errors.EmptyDataError):
            return 0
        before = (df["region"] != "").sum() if "region" in df.columns else 0
        filled = self.fill_regions(df)
        after = (filled["region"] != "").sum() if "region" in filled.columns else 0
        if after > before:
            self._write_jobs(filled, save_path)
        return int(after - before)

    def _write_jobs(self, df: pd.DataFrame, save_path: str) -> pd.DataFrame:
        validate_jobs_frame(df)
        columns = list(schema_columns())
        complete = df.copy()
        for column in columns:
            if column not in complete.columns:
                complete[column] = ""
        ordered = columns + [column for column in complete.columns if column not in columns]
        complete = complete[ordered]
        complete.to_csv(save_path, index=False, quoting=csv.QUOTE_ALL)
        return complete

    def backfill_facets(self, save_path: str) -> int:
        try:
            df = pd.read_csv(save_path, keep_default_na=False)
        except (FileNotFoundError, pd.errors.EmptyDataError):
            return 0
        filled = add_facets(df)
        if list(filled.columns) != list(df.columns) or not filled.equals(df):
            self._write_jobs(filled, save_path)
        present = filled[list(FACET_COLUMNS)].apply(lambda column: column.astype(str).str.strip() != "")
        return int(present.any(axis=1).sum())

    # Fields preserved from the existing row on upsert (never overwritten by a new scrape).
    _PRESERVE_ON_UPSERT = {"status", "status_updated_at", "location", "job_id"}
    _LIFECYCLE_COLUMNS = ("first_seen_at", "last_seen_at", "closed_at", "closed_reason")
    _STALE_DAYS = 14
    _JOB_ID_SEGMENT_MAX = 20

    # Fields a new scrape does not change, so a difference in them is not a content change.
    _CONTENT_EXCLUDED = {
        "job_id", "status", "status_updated_at", "location",
        "region", "country", "city", "work_mode", "seniority", "employment_type",
        "first_seen_at", "last_seen_at", "closed_at", "closed_reason",
        "duplicate_of", "role_key",
    }

    @classmethod
    def _content_hash(cls, row: dict, columns) -> str:
        parts = []
        for column in sorted(columns):
            if column in cls._CONTENT_EXCLUDED:
                continue
            value = row.get(column, "")
            text = "" if cls._is_empty(value) else str(value)
            parts.append(f"{column}\x1f{text}")
        return hashlib.md5("\x1e".join(parts).encode("utf-8")).hexdigest()

    @staticmethod
    def _slugify(text: str, max_len: int) -> str:
        text = text.lower().strip()[:max_len]
        text = re.sub(r"[^a-z0-9]+", "-", text)
        return text.strip("-")

    def _make_job_id(self, row: "pd.Series") -> str:
        if "job_url" in row.index and pd.notna(row["job_url"]) and row["job_url"]:
            seed = str(row["job_url"])
        else:
            seed = "|".join(str(row.get(c, "")) for c in ["title", "company", "location", "date_posted"])
        hash8 = hashlib.md5(seed.encode()).hexdigest()[:8]
        company = self._slugify(str(row.get("company", "")), self._JOB_ID_SEGMENT_MAX)
        title = self._slugify(str(row.get("title", "")), self._JOB_ID_SEGMENT_MAX)
        return f"{company}-{title}-{hash8}"

    def _add_metadata(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        df = df.copy()
        if "job_id" not in df.columns:
            df["job_id"] = df.apply(self._make_job_id, axis=1)
        else:
            missing_id = df["job_id"].fillna("").astype(str).str.strip() == ""
            if missing_id.any():
                df.loc[missing_id, "job_id"] = df[missing_id].apply(self._make_job_id, axis=1)
        if "role_key" not in df.columns:
            df["role_key"] = ""
        df["role_key"] = df["role_key"].fillna("").astype(str)
        missing_role = df["role_key"].str.strip() == ""
        if missing_role.any():
            df.loc[missing_role, "role_key"] = df[missing_role].apply(self._role_key, axis=1)
        if "duplicate_of" not in df.columns:
            df["duplicate_of"] = ""
        df["duplicate_of"] = df["duplicate_of"].fillna("").astype(str)
        if "status" not in df.columns:
            df["status"] = ""
        if "status_updated_at" not in df.columns:
            df["status_updated_at"] = ""
        return add_facets(df)

    def _add_lifecycle(
        self,
        df: pd.DataFrame,
        now: datetime | None = None,
        fill_missing: bool = True,
    ) -> pd.DataFrame:
        if df.empty:
            return df
        df = df.copy()
        now_iso = _iso_time(now or _utc_now())
        for col in self._LIFECYCLE_COLUMNS:
            if col not in df.columns:
                df[col] = ""
            df[col] = df[col].fillna("").astype(str)
        if not fill_missing:
            return df
        missing_first = df["first_seen_at"].str.strip() == ""
        if missing_first.any():
            has_last = df["last_seen_at"].str.strip() != ""
            df.loc[missing_first & has_last, "first_seen_at"] = df.loc[
                missing_first & has_last, "last_seen_at"
            ]
            df.loc[missing_first & ~has_last, "first_seen_at"] = now_iso
        missing_last = df["last_seen_at"].str.strip() == ""
        df.loc[missing_last, "last_seen_at"] = df.loc[missing_last, "first_seen_at"]
        return df

    def _upsert(
        self,
        df: pd.DataFrame,
        save_path: str,
        overwrite: bool,
        now: datetime | None = None,
        stats: dict | None = None,
    ) -> pd.DataFrame:
        now = now or _utc_now()
        stats = stats if stats is not None else {}
        stats.setdefault("changed", 0)
        df = self._add_lifecycle(df, now)
        if overwrite or not os.path.exists(save_path):
            return df
        try:
            existing = pd.read_csv(save_path, keep_default_na=False)
        except (pd.errors.EmptyDataError, pd.errors.ParserError):
            return df
        if existing.empty:
            return df
        existing = self._add_metadata(existing)
        existing = self._add_lifecycle(existing, now, fill_missing=False)
        if df.empty:
            return existing
        before = self._count_canonical_rows_in_frame(existing)

        existing_rows = existing.to_dict("records")
        all_columns = list(existing.columns)
        for col in df.columns:
            if col not in all_columns:
                all_columns.append(col)
                for row in existing_rows:
                    row[col] = ""
        content_columns = list(all_columns)

        by_site_id: dict[str, int] = {}
        by_url: dict[str, int] = {}
        by_role: dict[tuple[str, str], int] = {}
        by_fallback: dict[str, int] = {}
        for index, row in enumerate(existing_rows):
            self._index_identity(row, index, by_site_id, by_url, by_role, by_fallback)

        for _, new_row in df.iterrows():
            row = {col: new_row[col] for col in df.columns}
            site_id = self._site_id_key(row)
            url_key = self._normalize_url(row.get("job_url", ""))
            role_key = str(row.get("role_key", "") or "").strip()
            location = str(row.get("location", "") or "").strip()

            match = by_site_id.get(site_id) if site_id else None
            if match is None and url_key:
                match = by_url.get(url_key)
            if match is not None:
                before_hash = self._content_hash(existing_rows[match], content_columns)
                self._update_row(existing_rows[match], row)
                if self._content_hash(existing_rows[match], content_columns) != before_hash:
                    stats["changed"] += 1
                self._index_identity(existing_rows[match], match, by_site_id, by_url, by_role, by_fallback)
                continue

            role_match = (
                by_role.get((role_key, location)) if role_key and location and url_key else None
            )
            if role_match is not None:
                canonical = existing_rows[role_match]
                canonical_id = str(canonical.get("job_id", "") or "").strip()
                before_hash = self._content_hash(canonical, content_columns)
                self._update_row(canonical, row)
                if self._content_hash(canonical, content_columns) != before_hash:
                    stats["changed"] += 1
                if not self._has_text(row.get("duplicate_of")):
                    row["duplicate_of"] = canonical_id
                existing_rows.append(row)
                self._index_identity(row, len(existing_rows) - 1, by_site_id, by_url, by_role, by_fallback)
                continue

            if not site_id and not url_key:
                fallback_match = by_fallback.get(self._fallback_key(row))
                if fallback_match is not None:
                    before_hash = self._content_hash(existing_rows[fallback_match], content_columns)
                    self._update_row(existing_rows[fallback_match], row)
                    if self._content_hash(existing_rows[fallback_match], content_columns) != before_hash:
                        stats["changed"] += 1
                    self._index_identity(
                        existing_rows[fallback_match], fallback_match, by_site_id, by_url, by_role, by_fallback
                    )
                    continue

            existing_rows.append(row)
            self._index_identity(row, len(existing_rows) - 1, by_site_id, by_url, by_role, by_fallback)

        combined = pd.DataFrame(existing_rows, columns=all_columns).reset_index(drop=True)
        after = self._count_canonical_rows_in_frame(combined)
        if self.verbose >= 1:
            print(f"Appended: {max(0, after - before)} new jobs ({after} total)")
        return combined

    @staticmethod
    def _normalize_text(value) -> str:
        if value is None:
            return ""
        try:
            if pd.isna(value):
                return ""
        except (TypeError, ValueError):
            pass
        text = str(value).lower()
        text = re.sub(r"[\W_]+", " ", text, flags=re.UNICODE)
        return re.sub(r"\s+", " ", text).strip()

    @classmethod
    def _role_key(cls, row) -> str:
        # Boards rewrite the description, so it is not part of the key. Location stays separate
        # so the same role in two cities remains two jobs.
        company = cls._normalize_text(row.get("company", ""))
        title = cls._normalize_text(row.get("title", ""))
        if not company and not title:
            return ""
        seed = f"{company}\x1f{title}"
        return hashlib.md5(seed.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _normalize_url(value) -> str:
        if value is None:
            return ""
        try:
            if pd.isna(value):
                return ""
        except (TypeError, ValueError):
            pass
        text = str(value).strip()
        if not text:
            return ""
        if "://" not in text:
            text = "https://" + text
        try:
            parts = urlsplit(text)
        except ValueError:
            return text.lower()
        host = parts.netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        return f"{host}{parts.path.rstrip('/')}".lower()

    @classmethod
    def _site_id_key(cls, row) -> str:
        site = str(row.get("site", "") or "").strip().lower()
        ident = str(row.get("id", "") or "").strip()
        return f"{site}\x1f{ident}" if site and ident else ""

    @classmethod
    def _fallback_key(cls, row) -> str:
        return "\x1f".join(
            cls._normalize_text(row.get(col, "")) for col in ("title", "company", "location", "date_posted")
        )

    def _identity_key(self, row) -> str:
        site_id = self._site_id_key(row)
        if site_id:
            return "site:" + site_id
        url_key = self._normalize_url(row.get("job_url", ""))
        if url_key:
            return "url:" + url_key
        return "fallback:" + self._fallback_key(row)

    @staticmethod
    def _is_empty(value) -> bool:
        if value is None:
            return True
        try:
            if pd.isna(value):
                return True
        except (TypeError, ValueError):
            pass
        return isinstance(value, str) and value.strip() == ""

    @staticmethod
    def _is_true(value) -> bool:
        if JobScraper._is_empty(value):
            return False
        return str(value).strip().lower() in {"true", "1", "yes"}

    def _merge_run_row(self, target: pd.Series, source: pd.Series) -> pd.Series:
        merged = target.copy()
        protected = {"job_id", "job_url", "site", "id", "role_key", "duplicate_of"}
        for col in source.index:
            value = source[col]
            if col not in merged.index:
                merged[col] = value
                continue
            if col in protected or self._is_empty(value):
                continue
            if col == "description":
                current = str(merged[col] or "")
                if len(str(value)) > len(current):
                    merged[col] = value
            elif col == "date_posted":
                if self._is_empty(merged[col]) or str(value) < str(merged[col]):
                    merged[col] = value
            elif col == "is_remote":
                if self._is_true(value):
                    merged[col] = value
            elif col == "first_seen_at":
                if self._is_empty(merged[col]) or str(value) < str(merged[col]):
                    merged[col] = value
            elif col == "last_seen_at":
                if self._is_empty(merged[col]) or str(value) > str(merged[col]):
                    merged[col] = value
            elif col in {"closed_at", "closed_reason"}:
                continue
            elif col in {"min_amount", "max_amount"}:
                merged[col] = value
            elif self._is_empty(merged[col]):
                merged[col] = value
        return merged

    def _dedupe_exact(self, df: pd.DataFrame) -> pd.DataFrame:
        rows: list[pd.Series] = []
        first_index: dict[str, int] = {}
        for _, row in df.iterrows():
            key = self._identity_key(row)
            if key in first_index:
                index = first_index[key]
                rows[index] = self._merge_run_row(rows[index], row)
            else:
                first_index[key] = len(rows)
                rows.append(row.copy())
        return pd.DataFrame(rows, columns=df.columns).reset_index(drop=True)

    def _mark_role_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty or "role_key" not in df.columns:
            return df
        rows = [row.copy() for _, row in df.iterrows()]
        canonical_by_role: dict[tuple[str, str], int] = {}
        marked = 0
        for index, row in enumerate(rows):
            role_key = str(row.get("role_key", "") or "").strip()
            location = str(row.get("location", "") or "").strip()
            if not role_key or not location:
                continue
            key = (role_key, location)
            if key not in canonical_by_role:
                canonical_by_role[key] = index
                continue
            canonical_index = canonical_by_role[key]
            rows[canonical_index] = self._merge_run_row(rows[canonical_index], row)
            if not self._has_text(rows[index].get("duplicate_of")):
                rows[index]["duplicate_of"] = rows[canonical_index].get("job_id", "")
            marked += 1
        if self.verbose >= 1 and marked:
            print(f"Marked {marked} duplicate jobs")
        return pd.DataFrame(rows, columns=df.columns).reset_index(drop=True)

    def _index_identity(
        self,
        row: dict,
        index: int,
        by_site_id: dict[str, int],
        by_url: dict[str, int],
        by_role: dict[tuple[str, str], int],
        by_fallback: dict[str, int],
    ) -> None:
        site_id = self._site_id_key(row)
        if site_id:
            by_site_id.setdefault(site_id, index)
        url_key = self._normalize_url(row.get("job_url", ""))
        if url_key:
            by_url.setdefault(url_key, index)
        by_fallback.setdefault(self._fallback_key(row), index)
        if self._has_text(row.get("duplicate_of")):
            return
        role_key = str(row.get("role_key", "") or "").strip()
        location = str(row.get("location", "") or "").strip()
        if role_key and location:
            by_role.setdefault((role_key, location), index)

    def _update_row(self, target: dict, source: dict) -> None:
        for col, value in source.items():
            if col in {"duplicate_of", "closed_at", "closed_reason"}:
                continue
            if col == "first_seen_at":
                # Old rows from before the lifecycle columns cannot prove their first sighting.
                continue
            if col in self._PRESERVE_ON_UPSERT and self._has_text(target.get(col)):
                continue
            if col in {"job_url", "role_key"} and self._has_text(target.get(col)):
                continue
            if self._is_empty(value):
                continue
            target[col] = value
        if self._has_text(source.get("last_seen_at")):
            target["last_seen_at"] = source["last_seen_at"]
            target["closed_at"] = ""
            target["closed_reason"] = ""

    def _close_gone_jobs(
        self,
        df: pd.DataFrame,
        now: datetime | None = None,
        probe=None,
        stale_days: int | None = None,
    ) -> pd.DataFrame:
        if df.empty:
            return df
        now = now or _utc_now()
        probe = probe or probe_job_url
        stale_days = self._STALE_DAYS if stale_days is None else stale_days
        cutoff = now - timedelta(days=stale_days)
        df = self._add_lifecycle(df, now, fill_missing=False)
        closed = 0
        for index, row in df.iterrows():
            if self._has_text(row.get("closed_at")):
                continue
            if self._has_text(row.get("duplicate_of")):
                continue
            last_seen = _parse_time(row.get("last_seen_at"))
            if not last_seen or last_seen >= cutoff:
                continue
            url = ""
            for col in ("job_url_direct", "job_url"):
                value = row.get(col, "")
                if self._has_text(value):
                    url = str(value).strip()
                    break
            if not url:
                continue
            try:
                status = probe(url)
            except Exception:
                status = None
            if status not in (404, 410):
                continue
            df.at[index, "closed_at"] = _iso_time(now)
            df.at[index, "closed_reason"] = f"url_{status}"
            closed += 1
        if self.verbose >= 1 and closed:
            print(f"Closed {closed} gone jobs")
        return df

    @staticmethod
    def _concat(frames: list) -> pd.DataFrame:
        # Boards without salary or email data give all-NA columns. Pandas warns about the dtype change that
        # will come, but those columns only go to CSV, so the old behaviour is fine.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", FutureWarning)
            return pd.concat(frames, ignore_index=True)

    @classmethod
    def _search_country(cls, locations: list[str]) -> str | None:
        # One hint can only be right when every search shares a country. A mixed search gets no hint.
        countries = {location.split(",")[-1].strip() for location in locations if location.strip()}
        if len(countries) != 1:
            return None
        country = next(iter(countries))
        return country if cls._country_of(country) else None

    @staticmethod
    def _country_of(location: str) -> str | None:
        # Indeed searches the USA unless it gets a country, so a search for "Vietnam" returned Puerto Rico.
        last = location.split(",")[-1].strip()
        try:
            return Country(last).value
        except ValueError:
            return None

    @staticmethod
    def _has_text(value) -> bool:
        return pd.notna(value) and str(value).strip() != ""

    def _count_rows(path: str) -> int:
        if not os.path.exists(path):
            return 0
        try:
            return int(len(pd.read_csv(path, keep_default_na=False)))
        except (pd.errors.EmptyDataError, pd.errors.ParserError, OSError):
            return 0

    @staticmethod
    def _count_canonical_rows_in_frame(df: pd.DataFrame) -> int:
        if df.empty:
            return 0
        if "duplicate_of" not in df.columns:
            return int(len(df))
        markers = df["duplicate_of"].fillna("").astype(str).str.strip()
        return int((markers == "").sum())

    def _count_canonical_rows(self, path: str) -> int:
        if not os.path.exists(path):
            return 0
        try:
            return self._count_canonical_rows_in_frame(pd.read_csv(path, keep_default_na=False))
        except (pd.errors.EmptyDataError, pd.errors.ParserError, OSError):
            return 0

    def _scrape_pair(
        self,
        job: str,
        location: str,
        site_name: list,
        results_wanted: int,
        recorder: SourceRunRecorder | None = None,
        **kwargs,
    ) -> pd.DataFrame:
        if isinstance(site_name, str):
            site_name = [site_name]
        if "country_indeed" not in kwargs:
            country = self._country_of(location)
            if country:
                kwargs["country_indeed"] = country

        frames = []
        for site in site_name:
            if site in self._cooled_sites:
                if recorder:
                    recorder.record_skipped(site)
                continue
            started = time.monotonic()
            try:
                df = scrape_jobs(
                    site_name=[site],
                    search_term=job,
                    google_search_term=f"{job} {location}",
                    location=location,
                    results_wanted=results_wanted,
                    verbose=self.verbose,
                    **kwargs,
                )
                df = self.clean_job_list(df)
            except Exception as exc:
                if recorder:
                    recorder.record_attempt(
                        site, 0, (time.monotonic() - started) * 1000, error=str(exc)
                    )
                if self.verbose >= 1:
                    print(f"[{site}] Failed: {exc}")
                continue
            if recorder:
                recorder.record_attempt(site, len(df), (time.monotonic() - started) * 1000)
            frames.append(df)

        if not frames:
            return pd.DataFrame()
        return self._concat(frames)

    def clean_job_list(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        df = df.drop(columns=self.BLACKLIST, errors="ignore")
        present = [col for col in self.WHITELIST if col in df.columns]
        df = df[present + [col for col in df.columns if col not in present]]
        return df

    def filter_jobs(
        self,
        df: pd.DataFrame,
        title_include: list[str] | None = None,
        title_exclude: list[str] | None = None,
        exclude_companies: list[str] | None = None,
    ) -> pd.DataFrame:
        if df.empty:
            return df
        before = len(df)
        if title_include and "title" in df.columns:
            pattern = "|".join(title_include)
            df = df[df["title"].str.contains(pattern, case=False, na=False)]
        if title_exclude and "title" in df.columns:
            pattern = "|".join(title_exclude)
            df = df[~df["title"].str.contains(pattern, case=False, na=False)]
        if exclude_companies and "company" in df.columns:
            lower_set = {c.lower() for c in exclude_companies}
            df = df[~df["company"].str.lower().isin(lower_set)]
        df = df.reset_index(drop=True)
        if self.verbose >= 1 and len(df) < before:
            print(f"Filtered: {before} --> {len(df)} jobs")
        return df

    def merge(self, all_jobs: list[pd.DataFrame], country_hint: str | None = None) -> pd.DataFrame:
        df = self._concat(all_jobs)
        if df.empty:
            return df
        prev_len = len(df)
        df = self._add_metadata(df)
        df = self._dedupe_exact(df)
        if self.verbose > 0:
            print(f"Remove duplicates: {prev_len} --> {len(df)} unique jobs")

        if self.verbose > 0:
            print("Geocoding and standardizing locations... Might take a while")
        location_map = (
            self.get_location_map(df, country_hint=country_hint)
            if country_hint
            else self.get_location_map(df)
        )
        df["location"] = df["location"].map(location_map)
        return self._mark_role_duplicates(df)

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

    def get_location_map(self, df: pd.DataFrame, country_hint: str | None = None) -> dict:
        return self._geocoder.get_location_map(df, country_hint=country_hint)
