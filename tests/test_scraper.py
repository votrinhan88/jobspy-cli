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
