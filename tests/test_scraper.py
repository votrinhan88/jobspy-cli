"""Tests for JobScraper — covers existing behavior before refactor."""
import json
import os
import tempfile

import pandas as pd
import pytest

from main import JobScraper


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
