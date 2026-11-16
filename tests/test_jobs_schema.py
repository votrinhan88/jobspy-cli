"""Tests for the jobs.csv schema and the CSV writer."""
import json
from datetime import datetime, timezone

import pandas as pd
import pytest

from jobs_schema import load_jobs_schema, required_columns, schema_columns
from scraper import JobScraper


def make_df(**columns) -> pd.DataFrame:
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


@pytest.fixture
def scraper():
    return JobScraper(verbose=0)


class TestJobsSchema:
    def test_columns_match_the_properties_in_order(self):
        schema = load_jobs_schema()
        assert list(schema["properties"]) == list(schema["x-columns"])

    def test_columns_are_unique(self):
        columns = schema_columns()
        assert len(columns) == len(set(columns))

    def test_required_columns_are_part_of_the_schema(self):
        columns = set(schema_columns())
        assert set(required_columns()) <= columns

    def test_required_columns_are_the_job_identity(self):
        assert required_columns() == ("job_id", "title", "company", "location")


class TestJobsWriter:
    def test_writer_adds_missing_columns(self, scraper, tmp_path):
        path = tmp_path / "jobs.csv"
        df = scraper._add_metadata(make_df())
        scraper._write_jobs(df, str(path))
        assert pd.read_csv(path, nrows=0).columns.tolist() == list(schema_columns())

    def test_writer_puts_schema_columns_first(self, scraper, tmp_path):
        path = tmp_path / "jobs.csv"
        df = scraper._add_metadata(make_df(custom_field=["kept"]))
        scraper._write_jobs(df, str(path))
        headers = pd.read_csv(path, nrows=0).columns.tolist()
        assert headers[: len(schema_columns())] == list(schema_columns())
        assert headers[-1] == "custom_field"

    def test_writer_rejects_a_frame_without_job_id(self, scraper, tmp_path):
        df = pd.DataFrame({"title": ["AI Engineer"], "company": ["Acme"], "location": ["Sydney"]})
        with pytest.raises(ValueError, match="job_id"):
            scraper._write_jobs(df, str(tmp_path / "jobs.csv"))

    def test_writer_writes_a_header_for_an_empty_frame(self, scraper, tmp_path):
        path = tmp_path / "jobs.csv"
        scraper._write_jobs(pd.DataFrame(), str(path))
        assert pd.read_csv(path, nrows=0).columns.tolist() == list(schema_columns())

    def test_run_writes_every_schema_column(self, scraper, mocker, tmp_path):
        path = tmp_path / "jobs.csv"
        mocker.patch("scraper.scrape_jobs", return_value=make_df())
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        mocker.patch.object(scraper, "fill_regions", side_effect=lambda df: df)
        scraper(
            save_path=str(path),
            job="AI Engineer",
            location="Australia",
            site_name=["indeed"],
            results_wanted=5,
        )
        assert pd.read_csv(path, nrows=0).columns.tolist() == list(schema_columns())
