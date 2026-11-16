"""Tests for JobScraper — covers existing behavior before refactor."""
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError

import pandas as pd
import pytest

from scraper import (
    JobScraper,
    SourceRunRecorder,
    probe_job_url,
    source_in_cooldown,
    update_source_health,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def scraper():
    return JobScraper(verbose=0)


def make_df(**columns) -> pd.DataFrame:
    """Build a minimal jobs DataFrame with given columns."""
    base = {
        "title": ["AI Engineer"],
        "company": ["Acme"],
        "location": ["Sydney, Australia"],
        "date_posted": ["2026-08-27"],
        "job_url": ["https://example.com/job/1"],
        "interval": ["yearly"],
        "min_amount": [100000],
        "max_amount": [150000],
        "currency": ["AUD"],
        "is_remote": [False],
    }
    base.update(columns)
    return pd.DataFrame(base)


# ---------------------------------------------------------------------------
# clean_job_list
# ---------------------------------------------------------------------------

class TestCleanJobList:
    def test_empty_dataframe_returns_empty(self, scraper):
        df = pd.DataFrame()
        result = scraper.clean_job_list(df)
        assert result.empty

    def test_blacklisted_columns_are_dropped(self, scraper):
        df = make_df(company_logo=["http://logo.png"], skills=["python"])
        result = scraper.clean_job_list(df)
        assert "company_logo" not in result.columns
        assert "skills" not in result.columns

    def test_description_is_kept(self, scraper):
        df = make_df(description=["long text"], company_logo=["http://logo.png"])
        result = scraper.clean_job_list(df)
        assert result["description"].iloc[0] == "long text"

    def test_whitelisted_columns_move_to_front(self, scraper):
        df = make_df(extra_col=["x"])
        result = scraper.clean_job_list(df)
        whitelist_present = [c for c in scraper.WHITELIST if c in result.columns]
        assert list(result.columns[: len(whitelist_present)]) == whitelist_present

    def test_non_blacklisted_extra_columns_are_kept(self, scraper):
        df = make_df(custom_field=["value"])
        result = scraper.clean_job_list(df)
        assert "custom_field" in result.columns

    def test_missing_whitelist_columns_are_skipped(self, scraper):
        df = pd.DataFrame({"title": ["Engineer"], "extra": ["x"]})
        result = scraper.clean_job_list(df)
        assert list(result.columns[:1]) == ["title"]
        assert "extra" in result.columns


# ---------------------------------------------------------------------------
# merge
# ---------------------------------------------------------------------------

class TestMerge:
    def test_empty_list_returns_empty(self, scraper):
        result = scraper.merge([pd.DataFrame(), pd.DataFrame()])
        assert result.empty

    def test_all_na_columns_do_not_raise_a_future_warning(self, scraper, mocker):
        import warnings

        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        priced = make_df().assign(min_amount=10.0, emails="a@b.c")
        sparse = make_df(
            title=["ML Engineer"], company=["Beta"], job_url=["https://example.com/job/2"]
        ).assign(min_amount=None, emails=None)
        with warnings.catch_warnings():
            warnings.simplefilter("error", FutureWarning)
            result = scraper.merge([pd.DataFrame(), priced, sparse])
        assert len(result) == 2
        assert "min_amount" in result.columns

    def test_keeps_a_job_without_a_posted_date(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        df = pd.concat(
            [
                make_df(),
                make_df(title=["No date"], job_url=["https://example.com/job/2"], date_posted=[None]),
            ],
            ignore_index=True,
        )
        result = scraper.merge([df])
        assert sorted(result["title"]) == ["AI Engineer", "No date"]

    def test_keeps_the_order_in_which_the_boards_returned_the_jobs(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        titles = ["Zebra", "Mango", "Apple"]
        df = make_df(
            title=titles,
            company=["a", "b", "c"],
            location=["Sydney, Australia"] * 3,
            date_posted=["2026-08-27"] * 3,
            job_url=["u1", "u2", "u3"],
            interval=["yearly"] * 3,
            min_amount=[1] * 3,
            max_amount=[2] * 3,
            currency=["AUD"] * 3,
            is_remote=[False] * 3,
        )
        assert list(scraper.merge([df])["title"]) == titles

    def test_deduplicates_identical_rows(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        df = make_df()
        result = scraper.merge([df, df.copy()])
        assert len(result) == 1

    def test_keeps_distinct_rows(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={
            "Sydney, Australia": "Sydney, Australia",
            "Melbourne, Australia": "Melbourne, Australia",
        })
        df1 = make_df()
        df2 = make_df(
            title=["ML Engineer"],
            company=["Beta"],
            location=["Melbourne, Australia"],
            job_url=["https://example.com/job/2"],
        )
        result = scraper.merge([df1, df2])
        assert len(result) == 2

    def test_location_map_is_applied(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, NSW"})
        df = make_df()
        result = scraper.merge([df])
        assert result["location"].iloc[0] == "Sydney, NSW"


# ---------------------------------------------------------------------------
# geocache
# ---------------------------------------------------------------------------

class TestGeoCache:
    def test_load_returns_empty_dict_when_file_missing(self, scraper, tmp_path, monkeypatch):
        monkeypatch.setattr(scraper, "GEOCACHE_PATH", str(tmp_path / ".geocache.json"))
        assert scraper._load_geocache() == {}

    def test_load_returns_empty_dict_on_invalid_json(self, scraper, tmp_path, monkeypatch):
        cache_path = tmp_path / ".geocache.json"
        cache_path.write_text("not json")
        monkeypatch.setattr(scraper, "GEOCACHE_PATH", str(cache_path))
        assert scraper._load_geocache() == {}

    def test_save_and_load_round_trip(self, scraper, tmp_path, monkeypatch):
        cache_path = tmp_path / ".geocache.json"
        monkeypatch.setattr(scraper, "GEOCACHE_PATH", str(cache_path))
        data = {"Sydney, NSW": "Sydney, Australia"}
        scraper._save_geocache(data)
        assert scraper._load_geocache() == data

    def test_get_location_map_uses_cache_for_known_locations(self, scraper, tmp_path, monkeypatch, mocker):
        cache_path = tmp_path / ".geocache.json"
        cache_path.write_text(json.dumps({"Sydney, Australia": "Sydney, Australia"}))
        monkeypatch.setattr(scraper, "GEOCACHE_PATH", str(cache_path))
        geocode_spy = mocker.patch.object(scraper._geocoder, "_geocode_one")

        df = make_df()
        scraper.get_location_map(df)

        geocode_spy.assert_not_called()

    def test_get_location_map_geocodes_unknown_locations(self, scraper, tmp_path, monkeypatch, mocker):
        cache_path = tmp_path / ".geocache.json"
        cache_path.write_text("{}")
        monkeypatch.setattr(scraper, "GEOCACHE_PATH", str(cache_path))
        mocker.patch.object(scraper._geocoder, "_geocode_one", return_value=("Sydney, Australia", "Sydney, Australia"))

        df = make_df()
        result = scraper.get_location_map(df)

        assert result["Sydney, Australia"] == "Sydney, Australia"

    def test_get_location_map_saves_new_entries_to_cache(self, scraper, tmp_path, monkeypatch, mocker):
        cache_path = tmp_path / ".geocache.json"
        cache_path.write_text("{}")
        monkeypatch.setattr(scraper, "GEOCACHE_PATH", str(cache_path))
        mocker.patch.object(scraper._geocoder, "_geocode_one", return_value=("Sydney, Australia", "Sydney, Australia"))

        df = make_df()
        scraper.get_location_map(df)

        saved = json.loads(cache_path.read_text())
        assert saved["Sydney, Australia"] == "Sydney, Australia"


# ---------------------------------------------------------------------------
# Parallel scraping
# ---------------------------------------------------------------------------

class TestScrapePair:
    def test_scrape_pair_returns_dataframe(self, scraper, mocker):
        mocker.patch("scraper.scrape_jobs", return_value=make_df())
        mocker.patch.object(scraper, "clean_job_list", side_effect=lambda df: df)
        result = scraper._scrape_pair("AI Engineer", "Australia", ["linkedin"], 5)
        assert isinstance(result, pd.DataFrame)

    def test_scrape_pair_calls_clean_job_list(self, scraper, mocker):
        mocker.patch("scraper.scrape_jobs", return_value=make_df())
        clean_spy = mocker.patch.object(scraper, "clean_job_list", side_effect=lambda df: df)
        scraper._scrape_pair("AI Engineer", "Australia", ["linkedin"], 5)
        clean_spy.assert_called_once()

    def test_scrape_pair_passes_kwargs_to_scrape_jobs(self, scraper, mocker):
        spy = mocker.patch("scraper.scrape_jobs", return_value=make_df())
        scraper._scrape_pair("AI Engineer", "Australia", ["linkedin"], 5, hours_old=24)
        _, call_kwargs = spy.call_args
        assert call_kwargs.get("hours_old") == 24


class TestParallelScraping:
    def test_scraper_has_scrape_workers_constant(self, scraper):
        assert hasattr(scraper, "_SCRAPE_WORKERS")
        assert isinstance(scraper._SCRAPE_WORKERS, int)
        assert scraper._SCRAPE_WORKERS > 0

    def test_all_pairs_are_scraped(self, scraper, mocker, tmp_path):
        mocker.patch.object(scraper, "_scrape_pair", return_value=make_df())
        mocker.patch.object(scraper, "merge", return_value=make_df())
        save_path = str(tmp_path / "jobs.csv")
        scraper(save_path=save_path, job=["AI Engineer", "ML Engineer"], location=["Australia", "Vietnam"], results_wanted=5)
        assert scraper._scrape_pair.call_count == 4  # 2 jobs × 2 locations

    def test_workers_param_is_accepted(self, scraper, mocker, tmp_path):
        mocker.patch.object(scraper, "_scrape_pair", return_value=make_df())
        mocker.patch.object(scraper, "merge", return_value=make_df())
        save_path = str(tmp_path / "jobs.csv")
        scraper(save_path=save_path, job=["AI Engineer"], location=["Australia"], results_wanted=5, workers=2)


class TestWorkersCliArg:
    def test_workers_cli_arg_exists(self):
        from main import build_parser
        parser = build_parser()
        args = parser.parse_args(["--job", "AI Engineer", "--location", "Australia", "--workers", "8"])
        assert args.workers == 8

    def test_workers_cli_default_is_four(self):
        from main import build_parser
        parser = build_parser()
        args = parser.parse_args(["--job", "AI Engineer", "--location", "Australia"])
        assert args.workers == 4


# ---------------------------------------------------------------------------
# Upsert across runs
# ---------------------------------------------------------------------------

def make_df2(**overrides):
    """Second distinct job row for multi-row tests."""
    base = {
        "title": ["ML Engineer"],
        "company": ["Beta"],
        "location": ["Melbourne, Australia"],
        "date_posted": ["2026-08-27"],
        "job_url": ["https://example.com/job/2"],
        "interval": ["yearly"],
        "min_amount": [90000],
        "max_amount": [130000],
        "currency": ["AUD"],
        "is_remote": [True],
    }
    base.update(overrides)
    return pd.DataFrame(base)


class TestUpsert:
    def _call_upsert(self, scraper, existing_df, new_df, save_path, overwrite=False):
        existing_df.to_csv(save_path, index=False)
        return scraper._upsert(new_df, save_path, overwrite)

    def test_new_file_returns_new_df(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        df = make_df()
        result = scraper._upsert(df, save_path, overwrite=False)
        assert len(result) == 1

    def test_overwrite_ignores_existing(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df()
        new = make_df2()
        result = self._call_upsert(scraper, existing, new, save_path, overwrite=True)
        assert len(result) == 1
        assert result["title"].iloc[0] == "ML Engineer"

    def test_new_job_url_is_appended(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df()
        new = make_df2()
        result = self._call_upsert(scraper, existing, new, save_path)
        assert len(result) == 2

    def test_known_job_url_is_not_duplicated(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df()
        result = self._call_upsert(scraper, existing, make_df(), save_path)
        assert len(result) == 1

    def test_known_job_url_updates_salary(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df()
        updated = make_df(max_amount=[200000])
        result = self._call_upsert(scraper, existing, updated, save_path)
        assert result["max_amount"].iloc[0] == 200000

    def test_known_job_url_preserves_status(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df()
        existing["status"] = "applied"
        updated = make_df(max_amount=[200000])
        updated["status"] = ""
        result = self._call_upsert(scraper, existing, updated, save_path)
        assert result["status"].iloc[0] == "applied"

    def test_known_job_url_preserves_location(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df(location=["Sydney, Australia (geocoded)"])
        updated = make_df(location=["Sydney NSW"])
        result = self._call_upsert(scraper, existing, updated, save_path)
        assert result["location"].iloc[0] == "Sydney, Australia (geocoded)"

    def test_no_job_url_deduplicates_on_title_company_location_date(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df().drop(columns=["job_url"])
        new = make_df().drop(columns=["job_url"])
        result = self._call_upsert(scraper, existing, new, save_path)
        assert len(result) == 1

    def test_no_job_url_appends_different_location(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df().drop(columns=["job_url"])
        new = make_df(location=["Melbourne, Australia"]).drop(columns=["job_url"])
        result = self._call_upsert(scraper, existing, new, save_path)
        assert len(result) == 2

    def test_verbose_prints_new_count(self, scraper, tmp_path, capsys):
        scraper.verbose = 1
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df()
        result = self._call_upsert(scraper, existing, make_df2(), save_path)
        out = capsys.readouterr().out
        assert "1 new" in out


class TestUpsertCliArgs:
    def test_overwrite_flag_exists(self):
        from main import build_parser
        parser = build_parser()
        args = parser.parse_args(["--job", "AI Engineer", "--location", "Australia", "--overwrite"])
        assert args.overwrite is True

    def test_overwrite_default_is_false(self):
        from main import build_parser
        parser = build_parser()
        args = parser.parse_args(["--job", "AI Engineer", "--location", "Australia"])
        assert args.overwrite is False


# ---------------------------------------------------------------------------
# Output filtering
# ---------------------------------------------------------------------------

def make_multi_df() -> pd.DataFrame:
    return pd.DataFrame({
        "title": ["AI Engineer", "Senior ML Engineer", "Data Analyst"],
        "company": ["Acme", "Beta", "Gamma"],
        "location": ["Sydney, Australia", "Melbourne, Australia", "Brisbane, Australia"],
        "date_posted": ["2026-08-27", "2026-08-27", "2026-08-27"],
        "job_url": ["https://example.com/1", "https://example.com/2", "https://example.com/3"],
        "min_amount": [100000, 150000, 70000],
        "max_amount": [130000, 200000, 90000],
        "interval": ["yearly", "yearly", "yearly"],
        "currency": ["AUD", "AUD", "AUD"],
        "is_remote": [False, True, False],
    })


class TestFilterJobs:
    def test_no_filters_returns_all_rows(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df)
        assert len(result) == 3

    def test_title_include_keeps_matching_rows(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, title_include=["engineer"])
        assert len(result) == 2
        assert all("engineer" in t.lower() for t in result["title"])

    def test_title_include_is_case_insensitive(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, title_include=["ENGINEER"])
        assert len(result) == 2

    def test_title_include_multiple_terms_uses_or(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, title_include=["engineer", "analyst"])
        assert len(result) == 3

    def test_title_exclude_drops_matching_rows(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, title_exclude=["Senior"])
        assert len(result) == 2
        assert all("senior" not in t.lower() for t in result["title"])

    def test_title_exclude_is_case_insensitive(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, title_exclude=["senior"])
        assert len(result) == 2

    def test_title_exclude_multiple_terms_drops_any_match(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, title_exclude=["Senior", "Analyst"])
        assert len(result) == 1
        assert result["title"].iloc[0] == "AI Engineer"

    def test_exclude_companies_drops_exact_match(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, exclude_companies=["Beta"])
        assert len(result) == 2
        assert "Beta" not in result["company"].values

    def test_exclude_companies_is_case_insensitive(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, exclude_companies=["beta"])
        assert len(result) == 2

    def test_exclude_companies_exact_match_only(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, exclude_companies=["Bet"])
        assert len(result) == 3

    def test_combined_filters_apply_all(self, scraper):
        df = make_multi_df()
        result = scraper.filter_jobs(df, title_include=["engineer"], title_exclude=["Senior"])
        assert len(result) == 1
        assert result["title"].iloc[0] == "AI Engineer"

    def test_empty_dataframe_returns_empty(self, scraper):
        result = scraper.filter_jobs(pd.DataFrame())
        assert result.empty

    def test_verbose_prints_filter_summary_when_rows_dropped(self, scraper, capsys):
        scraper.verbose = 1
        df = make_multi_df()
        scraper.filter_jobs(df, title_exclude=["Senior"])
        out = capsys.readouterr().out
        assert "3" in out and "2" in out


class TestFilterCliArgs:
    def test_title_include_arg_exists(self):
        from main import build_parser
        parser = build_parser()
        args = parser.parse_args(["--job", "AI Engineer", "--location", "Australia", "--title_include", "engineer", "analyst"])
        assert args.title_include == ["engineer", "analyst"]

    def test_title_exclude_arg_exists(self):
        from main import build_parser
        parser = build_parser()
        args = parser.parse_args(["--job", "AI Engineer", "--location", "Australia", "--title_exclude", "Senior"])
        assert args.title_exclude == ["Senior"]

    def test_exclude_companies_inline_list(self):
        from main import build_parser
        parser = build_parser()
        args = parser.parse_args(["--job", "AI Engineer", "--location", "Australia", "--exclude_companies", "Acme", "Beta"])
        assert args.exclude_companies == ["Acme", "Beta"]

    def test_filter_args_default_to_none(self):
        from main import build_parser
        parser = build_parser()
        args = parser.parse_args(["--job", "AI Engineer", "--location", "Australia"])
        assert args.title_include is None
        assert args.title_exclude is None
        assert args.exclude_companies is None

    def test_exclude_companies_txt_file(self, tmp_path):
        from main import build_parser, load_txt_arg
        companies_file = tmp_path / "companies.txt"
        companies_file.write_text("Acme\nBeta\n")
        parser = build_parser()
        args = parser.parse_args(["--job", "AI Engineer", "--location", "Australia", "--exclude_companies", str(companies_file)])
        result = load_txt_arg(args.exclude_companies)
        assert result == ["Acme", "Beta"]


# ---------------------------------------------------------------------------
# Data model columns: job_id, status, status_updated_at
# ---------------------------------------------------------------------------

class TestJobId:
    def test_job_id_column_present_after_add_metadata(self, scraper):
        df = make_df()
        result = scraper._add_metadata(df)
        assert "job_id" in result.columns

    def test_job_id_is_kebab_slug_with_hash(self, scraper):
        df = make_df()
        result = scraper._add_metadata(df)
        job_id = result["job_id"].iloc[0]
        assert job_id.startswith("acme-ai-engineer-")
        assert len(job_id.split("-")[-1]) == 8

    def test_job_id_segments_truncated_to_20_chars(self, scraper):
        df = make_df(
            company=["A" * 30],
            title=["B" * 30],
        )
        result = scraper._add_metadata(df)
        job_id = result["job_id"].iloc[0]
        parts = job_id.split("-")
        # hash is last segment; company and title segments each <= 20 chars
        assert all(len(p) <= 20 for p in parts[:-1])

    def test_job_id_stable_across_calls(self, scraper):
        df = make_df()
        id1 = scraper._add_metadata(df)["job_id"].iloc[0]
        id2 = scraper._add_metadata(df)["job_id"].iloc[0]
        assert id1 == id2

    def test_job_id_uses_fallback_when_no_job_url(self, scraper):
        df = make_df().drop(columns=["job_url"])
        result = scraper._add_metadata(df)
        assert "job_id" in result.columns
        assert result["job_id"].iloc[0] != ""

    def test_job_id_differs_for_different_jobs(self, scraper):
        df1 = make_df()
        df2 = make_df(job_url=["https://example.com/job/999"])
        id1 = scraper._add_metadata(df1)["job_id"].iloc[0]
        id2 = scraper._add_metadata(df2)["job_id"].iloc[0]
        assert id1 != id2


class TestFacetsAfterAddMetadata:
    def test_add_metadata_adds_the_facet_columns(self, scraper):
        df = make_df(
            description=["This is a hybrid role."],
            job_level=["Senior"],
            job_type=["fulltime"],
        )
        result = scraper._add_metadata(df)
        assert result.loc[0, "country"] == "Australia"
        assert result.loc[0, "city"] == "Sydney"
        assert result.loc[0, "work_mode"] == "hybrid"
        assert result.loc[0, "seniority"] == "senior"
        assert result.loc[0, "employment_type"] == "full_time"


class TestBackfillFacets:
    def test_adds_the_facet_columns_and_values(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        df = make_df(
            description=["This is a hybrid role."],
            job_level=["Senior"],
            job_type=["fulltime"],
            job_id=["acme-ai-engineer-aabbccdd"],
        )
        df.to_csv(save_path, index=False)
        filled = scraper.backfill_facets(save_path)
        out = pd.read_csv(save_path, keep_default_na=False)
        assert filled == 1
        assert out.loc[0, "country"] == "Australia"
        assert out.loc[0, "city"] == "Sydney"
        assert out.loc[0, "work_mode"] == "hybrid"
        assert out.loc[0, "seniority"] == "senior"
        assert out.loc[0, "employment_type"] == "full_time"


class TestStatusColumns:
    def test_status_column_present(self, scraper):
        df = make_df()
        result = scraper._add_metadata(df)
        assert "status" in result.columns

    def test_status_defaults_to_empty_string(self, scraper):
        df = make_df()
        result = scraper._add_metadata(df)
        assert result["status"].iloc[0] == ""

    def test_status_updated_at_column_present(self, scraper):
        df = make_df()
        result = scraper._add_metadata(df)
        assert "status_updated_at" in result.columns

    def test_status_updated_at_defaults_to_empty_string(self, scraper):
        df = make_df()
        result = scraper._add_metadata(df)
        assert result["status_updated_at"].iloc[0] == ""


class TestUpsertDescription:
    def test_known_job_gets_the_new_description(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df(description=["old text"])
        existing.to_csv(save_path, index=False)
        updated = make_df(description=["new text"])
        result = scraper._upsert(updated, save_path, overwrite=False)
        assert result["description"].iloc[0] == "new text"

    def test_empty_new_description_keeps_the_old_one(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df(description=["old text"])
        existing.to_csv(save_path, index=False)
        updated = make_df(description=[None])
        result = scraper._upsert(updated, save_path, overwrite=False)
        assert result["description"].iloc[0] == "old text"

    def test_missing_description_column_keeps_the_old_one(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df(description=["old text"])
        existing.to_csv(save_path, index=False)
        result = scraper._upsert(make_df(max_amount=[200000]), save_path, overwrite=False)
        assert result["description"].iloc[0] == "old text"
        assert result["max_amount"].iloc[0] == 200000

    def test_description_update_still_preserves_status(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df(description=["old text"])
        existing["status"] = "applied"
        existing.to_csv(save_path, index=False)
        updated = make_df(description=["new text"])
        updated["status"] = ""
        result = scraper._upsert(updated, save_path, overwrite=False)
        assert result["status"].iloc[0] == "applied"
        assert result["description"].iloc[0] == "new text"


class TestUpsertPreservesMetadata:
    def test_upsert_preserves_job_id(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df()
        existing["job_id"] = "acme-ai-engineer-aabbccdd"
        existing["status"] = ""
        existing["status_updated_at"] = ""
        existing.to_csv(save_path, index=False)
        updated = make_df(max_amount=[200000])
        updated["job_id"] = "acme-ai-engineer-aabbccdd"
        updated["status"] = ""
        updated["status_updated_at"] = ""
        result = scraper._upsert(updated, save_path, overwrite=False)
        assert result["job_id"].iloc[0] == "acme-ai-engineer-aabbccdd"

    def test_upsert_preserves_status(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df()
        existing["job_id"] = "acme-ai-engineer-aabbccdd"
        existing["status"] = "applied"
        existing["status_updated_at"] = "2026-08-27T08:00:00"
        existing.to_csv(save_path, index=False)
        updated = make_df(max_amount=[200000])
        updated["job_id"] = "acme-ai-engineer-aabbccdd"
        updated["status"] = ""
        updated["status_updated_at"] = ""
        result = scraper._upsert(updated, save_path, overwrite=False)
        assert result["status"].iloc[0] == "applied"
        assert result["status_updated_at"].iloc[0] == "2026-08-27T08:00:00"


class TestDefaultSites:
    def test_google_is_not_in_the_default_sites(self):
        import inspect

        default = inspect.signature(JobScraper.__call__).parameters["site_name"].default
        assert "google" not in default
        assert {"linkedin", "indeed"} <= set(default)


class TestIndeedCountry:
    def country_passed(self, scraper, mocker, location, **kwargs):
        spy = mocker.patch("scraper.scrape_jobs", return_value=make_df())
        mocker.patch.object(scraper, "clean_job_list", side_effect=lambda df: df)
        scraper._scrape_pair("AI Engineer", location, ["indeed"], 5, **kwargs)
        return spy.call_args[1].get("country_indeed")

    def test_a_country_location_sets_the_indeed_country(self, scraper, mocker):
        assert self.country_passed(scraper, mocker, "Vietnam") == "vietnam"
        assert self.country_passed(scraper, mocker, "Australia") == "australia"

    def test_the_last_part_of_a_location_is_the_country(self, scraper, mocker):
        assert self.country_passed(scraper, mocker, "Sydney, Australia") == "australia"

    def test_country_aliases_work(self, scraper, mocker):
        assert self.country_passed(scraper, mocker, "United States") == "usa"
        assert self.country_passed(scraper, mocker, "United Kingdom") == "uk"

    def test_a_location_that_is_not_a_country_sets_nothing(self, scraper, mocker):
        assert self.country_passed(scraper, mocker, "Sydney") is None

    def test_an_explicit_country_wins(self, scraper, mocker):
        assert self.country_passed(scraper, mocker, "Vietnam", country_indeed="usa") == "usa"


class TestUpsertFutureWarning:
    def test_adding_a_row_with_all_na_columns_raises_no_future_warning(self, scraper, tmp_path):
        import warnings

        path = tmp_path / "jobs.csv"
        make_df(job_id=["a"], status=[""], status_updated_at=[""], emails=["x@y.z"]).to_csv(path, index=False)
        new = make_df(job_url=["https://example.com/job/2"], job_id=["b"], status=[""], status_updated_at=[""], emails=[None], min_amount=[None], max_amount=[None])
        with warnings.catch_warnings():
            warnings.simplefilter("error", FutureWarning)
            result = scraper._upsert(new, str(path), overwrite=False)
        assert len(result) == 2


# ---------------------------------------------------------------------------
# Source isolation, run report and source health
# ---------------------------------------------------------------------------

class TestSourceIsolation:
    def test_each_site_is_requested_separately(self, scraper, mocker):
        spy = mocker.patch("scraper.scrape_jobs", return_value=make_df())
        mocker.patch.object(scraper, "clean_job_list", side_effect=lambda df: df)

        scraper._scrape_pair(
            "AI Engineer", "Australia", ["linkedin", "indeed"], 5,
            recorder=SourceRunRecorder(),
        )

        requested = [call.kwargs["site_name"] for call in spy.call_args_list]
        assert requested == [["linkedin"], ["indeed"]]

    def test_one_site_failure_keeps_the_other_site(self, scraper, mocker):
        def fake_scrape(**kwargs):
            if kwargs["site_name"] == ["linkedin"]:
                raise RuntimeError("blocked")
            return make_df()

        mocker.patch("scraper.scrape_jobs", side_effect=fake_scrape)
        mocker.patch.object(scraper, "clean_job_list", side_effect=lambda df: df)
        recorder = SourceRunRecorder()

        result = scraper._scrape_pair(
            "AI Engineer", "Australia", ["linkedin", "indeed"], 5,
            recorder=recorder,
        )

        assert len(result) == 1
        runs = {run["site"]: run for run in recorder.snapshot()}
        assert runs["linkedin"]["failed"] == 1
        assert runs["linkedin"]["succeeded"] == 0
        assert runs["indeed"]["failed"] == 0
        assert runs["indeed"]["succeeded"] == 1
        assert runs["indeed"]["jobs"] == 1

    def test_all_sites_failing_returns_an_empty_frame(self, scraper, mocker):
        mocker.patch("scraper.scrape_jobs", side_effect=RuntimeError("blocked"))
        mocker.patch.object(scraper, "clean_job_list", side_effect=lambda df: df)

        result = scraper._scrape_pair(
            "AI Engineer", "Australia", ["linkedin", "indeed"], 5,
            recorder=SourceRunRecorder(),
        )

        assert result.empty


class TestSourceRunReport:
    def _run(self, scraper, mocker, save_path, site_side_effect, existing=None):
        if existing is not None:
            existing.to_csv(save_path, index=False)
        mocker.patch("scraper.scrape_jobs", side_effect=site_side_effect)
        mocker.patch.object(scraper, "get_location_map", return_value={
            "Sydney, Australia": "Sydney, Australia",
        })
        mocker.patch.object(scraper, "fill_regions", side_effect=lambda df: df)
        return scraper(
            save_path=str(save_path),
            job="AI Engineer",
            location="Australia",
            site_name=["linkedin", "indeed"],
            results_wanted=5,
        )

    def test_run_writes_a_source_report(self, scraper, mocker, tmp_path):
        def fake_scrape(**kwargs):
            if kwargs["site_name"] == ["linkedin"]:
                raise RuntimeError("blocked")
            return make_df()

        self._run(scraper, mocker, tmp_path / "jobs.csv", fake_scrape)

        report = json.loads((tmp_path / "scrape_run.json").read_text())
        runs = {run["site"]: run for run in report["sources"]}
        assert runs["linkedin"]["failed"] == 1
        assert runs["linkedin"]["error"] == "blocked"
        assert runs["indeed"]["succeeded"] == 1
        assert runs["indeed"]["jobs"] == 1
        assert report["new_jobs"] == 1
        assert report["total_jobs"] == 1

    def test_report_counts_new_jobs_against_the_existing_csv(self, scraper, mocker, tmp_path):
        existing = make_df()
        new_rows = pd.concat(
            [make_df(), make_df(title=["ML Engineer"], job_url=["https://example.com/job/2"])],
            ignore_index=True,
        )

        self._run(
            scraper, mocker, tmp_path / "jobs.csv",
            lambda **kwargs: new_rows,
            existing=existing,
        )

        report = json.loads((tmp_path / "scrape_run.json").read_text())
        assert report["new_jobs"] == 1
        assert report["total_jobs"] == 2

    def test_report_counts_only_canonical_rows(self, scraper, mocker, tmp_path):
        rows = pd.concat([
            make_df(site=["linkedin"], id=["li-1"]),
            make_df(
                site=["indeed"],
                id=["in-1"],
                job_url=["https://example.com/job/2"],
            ),
        ], ignore_index=True)

        self._run(scraper, mocker, tmp_path / "jobs.csv", lambda **kwargs: rows)

        report = json.loads((tmp_path / "scrape_run.json").read_text())
        assert report["new_jobs"] == 1
        assert report["total_jobs"] == 1

    def test_report_counts_changed_rows(self, scraper, mocker, tmp_path):
        existing = make_df()
        changed = make_df(title=["AI Engineer II"])

        self._run(scraper, mocker, tmp_path / "jobs.csv", lambda **kwargs: changed, existing=existing)

        report = json.loads((tmp_path / "scrape_run.json").read_text())
        assert report["changed_jobs"] == 1
        assert report["new_jobs"] == 0

    def test_cooled_source_is_skipped(self, scraper, mocker, tmp_path):
        save_path = tmp_path / "jobs.csv"
        now = datetime.now(timezone.utc)
        (tmp_path / "source_health.json").write_text(json.dumps({
            "linkedin": {
                "consecutive_failures": 3,
                "cooldown_until": (now + timedelta(hours=1)).isoformat(),
            },
        }))
        spy = mocker.patch("scraper.scrape_jobs", return_value=make_df())
        mocker.patch.object(scraper, "fill_regions", side_effect=lambda df: df)

        scraper(
            save_path=str(save_path),
            job="AI Engineer",
            location="Australia",
            site_name=["linkedin"],
            results_wanted=5,
        )

        spy.assert_not_called()
        report = json.loads((tmp_path / "scrape_run.json").read_text())
        assert report["sources"][0]["site"] == "linkedin"
        assert report["sources"][0]["skipped"] == 1
        assert report["sources"][0]["attempts"] == 0


class TestChangedJobCount:
    def test_an_unchanged_row_is_not_counted(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        make_df().to_csv(save_path, index=False)
        stats = {}

        scraper._upsert(make_df(), save_path, False, stats=stats)

        assert stats["changed"] == 0

    def test_a_changed_title_is_counted(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        make_df().to_csv(save_path, index=False)
        stats = {}

        scraper._upsert(make_df(title=["AI Engineer II"]), save_path, False, stats=stats)

        assert stats["changed"] == 1

    def test_a_changed_description_is_counted(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        make_df(description=["Old text"]).to_csv(save_path, index=False)
        stats = {}

        scraper._upsert(make_df(description=["New text"]), save_path, False, stats=stats)

        assert stats["changed"] == 1

    def test_a_saved_status_is_not_counted(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df()
        existing["status"] = "applied"
        existing.to_csv(save_path, index=False)
        stats = {}

        scraper._upsert(make_df(), save_path, False, stats=stats)

        assert stats["changed"] == 0

    def test_a_location_change_is_not_counted(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        make_df(location=["Sydney, Australia (geocoded)"]).to_csv(save_path, index=False)
        stats = {}

        scraper._upsert(make_df(location=["Sydney NSW"]), save_path, False, stats=stats)

        assert stats["changed"] == 0

    def test_a_new_row_is_not_counted(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        make_df().to_csv(save_path, index=False)
        stats = {}

        scraper._upsert(
            make_df(title=["ML Engineer"], job_url=["https://example.com/job/2"]),
            save_path,
            False,
            stats=stats,
        )

        assert stats["changed"] == 0


class TestCompanyBoards:
    def _company_frame(self):
        return pd.DataFrame([{
            "title": "ML Engineer",
            "company": "Acme Corporation",
            "location": "Sydney, Australia",
            "date_posted": "2026-09-01",
            "job_url": "https://boards.greenhouse.io/acme/jobs/123",
            "site": "greenhouse",
            "id": "123",
            "description": "Build models.",
        }])

    def test_run_adds_rows_from_a_company_board(self, scraper, mocker, tmp_path):
        mocker.patch("scraper.scrape_jobs", return_value=make_df())
        mocker.patch("scraper.fetch_company", return_value=self._company_frame())
        mocker.patch.object(scraper, "get_location_map", return_value={
            "Sydney, Australia": "Sydney, Australia",
        })
        mocker.patch.object(scraper, "fill_regions", side_effect=lambda df: df)

        scraper(
            save_path=str(tmp_path / "jobs.csv"),
            job="AI Engineer",
            location="Australia",
            site_name=["linkedin"],
            companies=["greenhouse:acme:Acme Corporation"],
        )

        df = pd.read_csv(tmp_path / "jobs.csv", keep_default_na=False)
        assert "greenhouse" in set(df["site"])
        assert "Acme Corporation" in set(df["company"])
        report = json.loads((tmp_path / "scrape_run.json").read_text())
        entry = next(run for run in report["sources"] if run["site"] == "greenhouse:acme")
        assert entry["succeeded"] == 1
        assert entry["jobs"] == 1

    def test_a_failed_company_board_does_not_stop_the_run(self, scraper, mocker, tmp_path):
        mocker.patch("scraper.scrape_jobs", return_value=make_df())
        mocker.patch("scraper.fetch_company", side_effect=RuntimeError("board not found"))
        mocker.patch.object(scraper, "get_location_map", return_value={
            "Sydney, Australia": "Sydney, Australia",
        })
        mocker.patch.object(scraper, "fill_regions", side_effect=lambda df: df)

        scraper(
            save_path=str(tmp_path / "jobs.csv"),
            job="AI Engineer",
            location="Australia",
            site_name=["linkedin"],
            companies=["greenhouse:ghost:Acme"],
        )

        df = pd.read_csv(tmp_path / "jobs.csv", keep_default_na=False)
        assert len(df) == 1
        report = json.loads((tmp_path / "scrape_run.json").read_text())
        entry = next(run for run in report["sources"] if run["site"] == "greenhouse:ghost")
        assert entry["failed"] == 1
        assert "board not found" in entry["error"]


class TestSourceHealth:
    def _failure(self):
        return {
            "site": "linkedin",
            "attempts": 1,
            "succeeded": 0,
            "failed": 1,
            "skipped": 0,
            "jobs": 0,
            "duration_ms": 10,
            "error": "blocked",
        }

    def test_three_failed_runs_set_a_cooldown(self):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        health = {}
        for _ in range(3):
            health = update_source_health(health, [self._failure()], now)

        entry = health["linkedin"]
        assert entry["consecutive_failures"] == 3
        assert entry["last_error"] == "blocked"
        assert source_in_cooldown(entry, now) is True

    def test_a_success_resets_the_failure_count_and_cooldown(self):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        health = {}
        for _ in range(3):
            health = update_source_health(health, [self._failure()], now)

        health = update_source_health(health, [{
            "site": "linkedin",
            "attempts": 1,
            "succeeded": 1,
            "failed": 0,
            "skipped": 0,
            "jobs": 4,
            "duration_ms": 10,
            "error": None,
        }], now)

        entry = health["linkedin"]
        assert entry["consecutive_failures"] == 0
        assert entry["cooldown_until"] is None
        assert source_in_cooldown(entry, now) is False

    def test_a_skipped_source_keeps_its_health(self):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        health = {"linkedin": {"consecutive_failures": 2, "cooldown_until": None}}

        updated = update_source_health(health, [{
            "site": "linkedin",
            "attempts": 0,
            "succeeded": 0,
            "failed": 0,
            "skipped": 1,
            "jobs": 0,
            "duration_ms": 0,
            "error": None,
        }], now)

        assert updated["linkedin"]["consecutive_failures"] == 2


# ---------------------------------------------------------------------------
# Identity, role keys and deduplication
# ---------------------------------------------------------------------------

class TestNormalizeUrl:
    def test_strips_scheme_query_fragment_and_trailing_slash(self, scraper):
        assert scraper._normalize_url("https://www.Example.com/job/1/?utm=1#apply") == "example.com/job/1"

    def test_treats_http_and_https_as_the_same_url(self, scraper):
        assert scraper._normalize_url("http://example.com/job/1") == scraper._normalize_url(
            "https://example.com/job/1"
        )

    def test_empty_value_has_no_url_key(self, scraper):
        assert scraper._normalize_url(None) == ""
        assert scraper._normalize_url("   ") == ""


class TestRoleKey:
    def test_add_metadata_adds_role_key_and_duplicate_marker(self, scraper):
        result = scraper._add_metadata(make_df())
        assert result["role_key"].iloc[0] != ""
        assert result["duplicate_of"].iloc[0] == ""

    def test_role_key_ignores_case_and_punctuation(self, scraper):
        first = scraper._add_metadata(make_df(title=["AI Engineer"], company=["Acme"]))
        second = scraper._add_metadata(make_df(title=["ai-engineer"], company=["ACME."]))
        assert first["role_key"].iloc[0] == second["role_key"].iloc[0]

    def test_role_key_does_not_depend_on_the_description(self, scraper):
        first = scraper._add_metadata(make_df(description=["Build models."]))
        second = scraper._add_metadata(make_df(description=["A different description."]))
        assert first["role_key"].iloc[0] == second["role_key"].iloc[0]

    def test_role_key_differs_for_different_titles(self, scraper):
        first = scraper._add_metadata(make_df(title=["AI Engineer"]))
        second = scraper._add_metadata(make_df(title=["ML Engineer"]))
        assert first["role_key"].iloc[0] != second["role_key"].iloc[0]

    def test_role_key_differs_for_different_companies(self, scraper):
        first = scraper._add_metadata(make_df(company=["Acme"]))
        second = scraper._add_metadata(make_df(company=["Beta"]))
        assert first["role_key"].iloc[0] != second["role_key"].iloc[0]


class TestMergeIdentity:
    def test_same_site_and_id_merges_when_the_url_changes(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        first = make_df(site=["linkedin"], id=["li-1"])
        second = make_df(
            site=["linkedin"],
            id=["li-1"],
            job_url=["https://example.com/job/1?ref=feed"],
            description=["New description"],
            max_amount=[200000],
        )

        result = scraper.merge([first, second])

        assert len(result) == 1
        assert result["job_url"].iloc[0] == "https://example.com/job/1"
        assert result["description"].iloc[0] == "New description"
        assert result["max_amount"].iloc[0] == 200000

    def test_normalized_url_merges_query_and_trailing_slash_variants(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        first = make_df(job_url=["https://www.example.com/job/1/?utm_source=feed"])
        second = make_df(job_url=["http://example.com/job/1"])
        second["max_amount"] = 200000

        result = scraper.merge([first, second])

        assert len(result) == 1
        assert result["max_amount"].iloc[0] == 200000

    def test_same_role_and_location_marks_a_duplicate_and_merges_fields(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        first = make_df(
            site=["linkedin"],
            id=["li-1"],
            description=["Short."],
            max_amount=[None],
            date_posted=["2026-08-28"],
        )
        second = make_df(
            site=["indeed"],
            id=["in-1"],
            job_url=["https://example.com/job/2"],
            description=["A much longer description."],
            max_amount=[200000],
            date_posted=["2026-08-27"],
        )

        result = scraper.merge([first, second])

        assert len(result) == 2
        canonical = result[result["duplicate_of"] == ""].iloc[0]
        duplicate = result[result["duplicate_of"] != ""].iloc[0]
        assert canonical["description"] == "A much longer description."
        assert canonical["max_amount"] == 200000
        assert canonical["date_posted"] == "2026-08-27"
        assert duplicate["duplicate_of"] == canonical["job_id"]
        assert duplicate["job_id"] != canonical["job_id"]

    def test_different_locations_are_not_marked_as_duplicates(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={
            "Sydney, Australia": "Sydney, Australia",
            "Melbourne, Australia": "Melbourne, Australia",
        })
        first = make_df(site=["linkedin"], id=["li-1"])
        second = make_df(
            site=["linkedin"],
            id=["li-2"],
            location=["Melbourne, Australia"],
            job_url=["https://example.com/job/2"],
        )

        result = scraper.merge([first, second])

        assert len(result) == 2
        assert list(result["duplicate_of"]) == ["", ""]

    def test_exact_duplicates_are_dropped_not_marked(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        result = scraper.merge([make_df(), make_df()])
        assert len(result) == 1
        assert result["duplicate_of"].iloc[0] == ""


class TestUpsertIdentity:
    def _call(self, scraper, existing, new, save_path):
        existing.to_csv(save_path, index=False)
        return scraper._upsert(new, save_path, overwrite=False)

    def test_site_and_id_match_when_the_url_changes(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df(site=["linkedin"], id=["li-1"], job_url=["https://example.com/job/1"])
        existing["job_id"] = "acme-ai-engineer-aabbccdd"
        new = make_df(
            site=["linkedin"],
            id=["li-1"],
            job_url=["https://example.com/job/1?ref=feed"],
            max_amount=[200000],
        )
        new["job_id"] = "acme-ai-engineer-ffffffff"

        result = self._call(scraper, existing, new, save_path)

        assert len(result) == 1
        assert result["job_url"].iloc[0] == "https://example.com/job/1"
        assert result["job_id"].iloc[0] == "acme-ai-engineer-aabbccdd"
        assert result["max_amount"].iloc[0] == 200000

    def test_normalized_url_match_when_the_query_changes(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df(job_url=["https://www.example.com/job/1/?utm_source=feed"])
        new = make_df(job_url=["http://example.com/job/1"], max_amount=[200000])

        result = self._call(scraper, existing, new, save_path)

        assert len(result) == 1
        assert result["max_amount"].iloc[0] == 200000

    def test_same_role_and_location_adds_a_marked_repost(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = scraper._add_metadata(make_df(site=["linkedin"], id=["li-1"]))
        existing["job_id"] = "acme-ai-engineer-aabbccdd"
        new = scraper._add_metadata(make_df(
            site=["indeed"],
            id=["in-1"],
            job_url=["https://example.com/job/2"],
            max_amount=[200000],
        ))

        result = self._call(scraper, existing, new, save_path)

        assert len(result) == 2
        canonical = result[result["duplicate_of"] == ""].iloc[0]
        duplicate = result[result["duplicate_of"] != ""].iloc[0]
        assert canonical["job_id"] == "acme-ai-engineer-aabbccdd"
        assert canonical["max_amount"] == 200000
        assert duplicate["duplicate_of"] == "acme-ai-engineer-aabbccdd"

    def test_existing_rows_get_a_role_key_during_upsert(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = make_df(site=["linkedin"], id=["li-1"])
        new = scraper._add_metadata(make_df(
            site=["indeed"],
            id=["in-1"],
            job_url=["https://example.com/job/2"],
        ))

        result = self._call(scraper, existing, new, save_path)

        assert len(result) == 2
        assert result["role_key"].str.len().gt(0).all()
        assert result["role_key"].nunique() == 1
        assert result[result["duplicate_of"] != ""].shape[0] == 1

    def test_same_role_in_another_location_is_not_a_repost(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = scraper._add_metadata(make_df(site=["linkedin"], id=["li-1"]))
        new = scraper._add_metadata(make_df(
            site=["linkedin"],
            id=["li-2"],
            location=["Melbourne, Australia"],
            job_url=["https://example.com/job/2"],
        ))

        result = self._call(scraper, existing, new, save_path)

        assert len(result) == 2
        assert list(result["duplicate_of"]) == ["", ""]

    def test_a_role_match_preserves_status_and_location_on_the_canonical_row(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = scraper._add_metadata(make_df(site=["linkedin"], id=["li-1"]))
        existing["job_id"] = "acme-ai-engineer-aabbccdd"
        existing["status"] = "applied"
        existing["location"] = "Sydney, NSW"
        new = scraper._add_metadata(make_df(
            site=["indeed"],
            id=["in-1"],
            job_url=["https://example.com/job/2"],
            location=["Sydney NSW"],
        ))

        result = self._call(scraper, existing, new, save_path)

        canonical = result[result["duplicate_of"] == ""].iloc[0]
        assert canonical["status"] == "applied"
        assert canonical["location"] == "Sydney, NSW"


class TestCanonicalCount:
    def test_count_canonical_rows_ignores_marked_duplicates(self, scraper, tmp_path):
        path = tmp_path / "jobs.csv"
        df = pd.concat([
            make_df(site=["linkedin"], id=["li-1"], job_url=["https://example.com/job/1"]),
            make_df(site=["indeed"], id=["in-1"], job_url=["https://example.com/job/2"]),
        ], ignore_index=True)
        df["duplicate_of"] = ["", "acme-ai-engineer-aabbccdd"]
        df.to_csv(path, index=False)

        assert scraper._count_canonical_rows(str(path)) == 1


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

class TestLifecycle:
    NOW = datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)
    OLD = "2026-08-01T00:00:00Z"

    def _existing(self, **overrides):
        df = make_df()
        df["first_seen_at"] = [self.OLD]
        df["last_seen_at"] = [self.OLD]
        df["closed_at"] = [""]
        df["closed_reason"] = [""]
        for key, value in overrides.items():
            df[key] = value
        return df

    def test_new_rows_get_first_and_last_seen(self, scraper, tmp_path):
        result = scraper._upsert(make_df(), str(tmp_path / "jobs.csv"), overwrite=False, now=self.NOW)

        assert result["first_seen_at"].iloc[0] == "2026-09-15T12:00:00Z"
        assert result["last_seen_at"].iloc[0] == "2026-09-15T12:00:00Z"

    def test_seen_row_keeps_first_seen_and_updates_last_seen(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = self._existing(
            closed_at=["2026-08-10T00:00:00Z"],
            closed_reason=["url_404"],
        )
        existing.to_csv(save_path, index=False)

        result = scraper._upsert(make_df(max_amount=[200000]), save_path, overwrite=False, now=self.NOW)

        assert result["first_seen_at"].iloc[0] == self.OLD
        assert result["last_seen_at"].iloc[0] == "2026-09-15T12:00:00Z"
        assert result["closed_at"].iloc[0] == ""
        assert result["closed_reason"].iloc[0] == ""

    def test_unseen_job_is_not_closed_by_upsert(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        existing = self._existing()
        existing.to_csv(save_path, index=False)

        result = scraper._upsert(make_df2(), save_path, overwrite=False, now=self.NOW)

        old_row = result[result["job_url"] == "https://example.com/job/1"].iloc[0]
        assert old_row["closed_at"] == ""

    def test_matched_legacy_row_gets_last_seen_but_not_first_seen(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        make_df().to_csv(save_path, index=False)

        result = scraper._upsert(make_df(max_amount=[200000]), save_path, overwrite=False, now=self.NOW)

        assert result["first_seen_at"].iloc[0] == ""
        assert result["last_seen_at"].iloc[0] == "2026-09-15T12:00:00Z"

    def test_unseen_legacy_row_keeps_empty_lifecycle(self, scraper, tmp_path):
        save_path = str(tmp_path / "jobs.csv")
        make_df().to_csv(save_path, index=False)

        result = scraper._upsert(make_df2(), save_path, overwrite=False, now=self.NOW)

        old_row = result[result["job_url"] == "https://example.com/job/1"].iloc[0]
        assert old_row["first_seen_at"] == ""
        assert old_row["last_seen_at"] == ""

    def test_close_gone_jobs_does_not_stamp_a_legacy_row(self, scraper):
        calls = []

        result = scraper._close_gone_jobs(
            make_df(), now=self.NOW, probe=lambda url: calls.append(url) or 404
        )

        assert calls == []
        assert result["first_seen_at"].iloc[0] == ""
        assert result["last_seen_at"].iloc[0] == ""

    def test_a_scrape_closes_a_gone_job(self, scraper, mocker, tmp_path):
        save_path = tmp_path / "jobs.csv"
        self._existing().to_csv(save_path, index=False)
        mocker.patch("scraper.scrape_jobs", return_value=make_df2())
        mocker.patch.object(scraper, "get_location_map", return_value={
            "Sydney, Australia": "Sydney, Australia",
        })
        mocker.patch.object(scraper, "fill_regions", side_effect=lambda df: df)
        probe = mocker.patch("scraper.probe_job_url", return_value=404)

        result = scraper(
            save_path=str(save_path),
            job="AI Engineer",
            location="Australia",
            site_name=["linkedin"],
            results_wanted=5,
        )

        probe.assert_called_once_with("https://example.com/job/1")
        old_row = result[result["job_url"] == "https://example.com/job/1"].iloc[0]
        assert old_row["closed_reason"] == "url_404"
        assert old_row["closed_at"] != ""

    def test_probes_an_old_open_row_and_closes_it(self, scraper):
        calls = []

        result = scraper._close_gone_jobs(
            self._existing(), now=self.NOW, probe=lambda url: calls.append(url) or 404
        )

        assert calls == ["https://example.com/job/1"]
        assert result["closed_at"].iloc[0] == "2026-09-15T12:00:00Z"
        assert result["closed_reason"].iloc[0] == "url_404"

    def test_recent_rows_are_not_probed(self, scraper):
        calls = []
        recent = self._existing(last_seen_at=[_iso_for(self.NOW - timedelta(days=1))])

        result = scraper._close_gone_jobs(
            recent, now=self.NOW, probe=lambda url: calls.append(url) or 404
        )

        assert calls == []
        assert result["closed_at"].iloc[0] == ""

    def test_closed_rows_are_not_probed(self, scraper):
        calls = []
        closed = self._existing(closed_at=["2026-08-10T00:00:00Z"], closed_reason=["url_404"])

        scraper._close_gone_jobs(closed, now=self.NOW, probe=lambda url: calls.append(url) or 404)

        assert calls == []

    def test_duplicate_rows_are_not_probed(self, scraper):
        df = pd.concat([
            make_df(site=["linkedin"], id=["li-1"]),
            make_df(site=["indeed"], id=["in-1"], job_url=["https://example.com/job/2"]),
        ], ignore_index=True)
        df = scraper._add_metadata(df)
        df["first_seen_at"] = [self.OLD, self.OLD]
        df["last_seen_at"] = [self.OLD, self.OLD]
        df["closed_at"] = ["", ""]
        df["closed_reason"] = ["", ""]
        df.loc[1, "duplicate_of"] = df.loc[0, "job_id"]
        calls = []

        scraper._close_gone_jobs(df, now=self.NOW, probe=lambda url: calls.append(url) or 404)

        assert calls == ["https://example.com/job/1"]

    @pytest.mark.parametrize("status,reason", [(404, "url_404"), (410, "url_410")])
    def test_404_and_410_close_the_row(self, scraper, status, reason):
        result = scraper._close_gone_jobs(
            self._existing(), now=self.NOW, probe=lambda url: status
        )

        assert result["closed_reason"].iloc[0] == reason

    @pytest.mark.parametrize("status", [403, 500, None])
    def test_other_probe_results_do_not_close_the_row(self, scraper, status):
        result = scraper._close_gone_jobs(
            self._existing(), now=self.NOW, probe=lambda url: status
        )

        assert result["closed_at"].iloc[0] == ""
        assert result["closed_reason"].iloc[0] == ""


def _iso_for(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class TestProbeJobUrl:
    def test_returns_the_response_status(self, mocker):
        response = mocker.MagicMock()
        response.status = 200
        response.__enter__.return_value = response
        mocker.patch("scraper.urlopen", return_value=response)

        assert probe_job_url("https://example.com/job/1") == 200

    def test_returns_a_404_status_from_an_http_error(self, mocker):
        error = HTTPError("https://example.com/job/1", 404, "Not Found", None, None)
        mocker.patch("scraper.urlopen", side_effect=error)

        assert probe_job_url("https://example.com/job/1") == 404

    def test_returns_none_on_a_network_error(self, mocker):
        mocker.patch("scraper.urlopen", side_effect=URLError("timed out"))

        assert probe_job_url("https://example.com/job/1") is None

    def test_empty_url_returns_none(self):
        assert probe_job_url("") is None

    def test_invalid_url_returns_none(self):
        assert probe_job_url("http://[bad") is None
