"""Tests for JobScraper — covers existing behavior before refactor."""
import json
import os
import tempfile

import pandas as pd
import pytest

from scraper import JobScraper


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
        df = make_df(description=["long text"], company_logo=["http://logo.png"])
        result = scraper.clean_job_list(df)
        assert "description" not in result.columns
        assert "company_logo" not in result.columns

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
        geocode_spy = mocker.patch.object(scraper, "_geocode_one")

        df = make_df()
        scraper.get_location_map(df)

        geocode_spy.assert_not_called()

    def test_get_location_map_geocodes_unknown_locations(self, scraper, tmp_path, monkeypatch, mocker):
        cache_path = tmp_path / ".geocache.json"
        cache_path.write_text("{}")
        monkeypatch.setattr(scraper, "GEOCACHE_PATH", str(cache_path))
        mocker.patch.object(scraper, "_geocode_one", return_value=("Sydney, Australia", "Sydney, Australia"))

        df = make_df()
        result = scraper.get_location_map(df)

        assert result["Sydney, Australia"] == "Sydney, Australia"

    def test_get_location_map_saves_new_entries_to_cache(self, scraper, tmp_path, monkeypatch, mocker):
        cache_path = tmp_path / ".geocache.json"
        cache_path.write_text("{}")
        monkeypatch.setattr(scraper, "GEOCACHE_PATH", str(cache_path))
        mocker.patch.object(scraper, "_geocode_one", return_value=("Sydney, Australia", "Sydney, Australia"))

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
