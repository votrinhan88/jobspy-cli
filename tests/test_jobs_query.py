import json

import pytest

from jobs_query import format_table, main, query_jobs


def row(**overrides):
    base = {
        "job_id": "acme-ai-1",
        "title": "AI Engineer",
        "company": "Acme",
        "location": "Sydney, Australia",
        "city": "Sydney",
        "country": "Australia",
        "site": "linkedin",
        "status": "",
        "work_mode": "hybrid",
        "seniority": "mid",
        "employment_type": "fulltime",
        "date_posted": "2026-09-01",
        "last_seen_at": "2026-11-01T00:00:00Z",
        "description": "Build models.",
    }
    base.update(overrides)
    return base


ROWS = [
    row(),
    row(
        job_id="beta-ml-2",
        title="ML Engineer",
        company="Beta",
        city="Melbourne",
        country="Australia",
        site="indeed",
        status="applied",
        work_mode="remote",
        seniority="senior",
        employment_type="contract",
        date_posted="2026-10-01",
        last_seen_at="2026-11-02T00:00:00Z",
    ),
    row(
        job_id="gamma-dev-3",
        title="Developer",
        company="Gamma",
        city="Hanoi",
        country="Vietnam",
        site="linkedin",
        status="skipped",
        date_posted="",
        last_seen_at="2026-10-20T00:00:00Z",
    ),
]


def ids(rows):
    return [job["job_id"] for job in rows]


class TestQueryJobs:
    def test_matches_the_text_in_title_or_company(self):
        assert ids(query_jobs(ROWS, query="engineer")) == ["beta-ml-2", "acme-ai-1"]
        assert ids(query_jobs(ROWS, query="beta")) == ["beta-ml-2"]
        assert ids(query_jobs(ROWS, query="gamma", include_archived=True)) == ["gamma-dev-3"]

    def test_filters_by_status(self):
        assert ids(query_jobs(ROWS, status="applied")) == ["beta-ml-2"]

    def test_filters_untriaged_with_the_word(self):
        assert ids(query_jobs(ROWS, status="untriaged")) == ["acme-ai-1"]

    def test_filters_by_facets_and_site(self):
        assert ids(query_jobs(ROWS, city="Melbourne")) == ["beta-ml-2"]
        assert ids(query_jobs(ROWS, country="Vietnam", include_archived=True)) == ["gamma-dev-3"]
        assert ids(query_jobs(ROWS, site="indeed")) == ["beta-ml-2"]
        assert ids(query_jobs(ROWS, work_mode="remote")) == ["beta-ml-2"]
        assert ids(query_jobs(ROWS, seniority="mid")) == ["acme-ai-1"]
        assert ids(query_jobs(ROWS, employment_type="contract")) == ["beta-ml-2"]

    def test_facet_values_are_case_insensitive(self):
        assert ids(query_jobs(ROWS, city="melbourne")) == ["beta-ml-2"]

    def test_hides_archived_rows_by_default(self):
        assert "gamma-dev-3" not in ids(query_jobs(ROWS))

    def test_includes_archived_rows_when_asked(self):
        assert "gamma-dev-3" in ids(query_jobs(ROWS, include_archived=True))

    def test_a_status_filter_reaches_the_archive(self):
        assert ids(query_jobs(ROWS, status="skipped")) == ["gamma-dev-3"]

    def test_sorts_newest_first_with_undated_rows_last(self):
        assert ids(query_jobs(ROWS, include_archived=True)) == [
            "beta-ml-2",
            "acme-ai-1",
            "gamma-dev-3",
        ]

    def test_limits_after_the_sort(self):
        assert ids(query_jobs(ROWS, include_archived=True, limit=2)) == ["beta-ml-2", "acme-ai-1"]

    def test_an_unknown_status_returns_nothing(self):
        assert query_jobs(ROWS, status="ghost") == []


class TestFormatTable:
    def test_writes_a_header_and_one_line_per_job(self):
        text = format_table(ROWS[:1])
        assert "job_id" in text
        assert "acme-ai-1" in text
        assert len(text.splitlines()) == 2

    def test_says_so_when_nothing_matches(self):
        assert "No jobs" in format_table([])


class TestMain:
    def _write(self, tmp_path, rows):
        import csv

        path = tmp_path / "jobs.csv"
        with open(path, "w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        return str(path)

    def test_json_output_is_a_list_of_rows(self, tmp_path, capsys):
        path = self._write(tmp_path, ROWS)
        assert main(["--save_path", path, "--json", "--include-archived"]) == 0
        out = json.loads(capsys.readouterr().out)
        assert [job["job_id"] for job in out] == ["beta-ml-2", "acme-ai-1", "gamma-dev-3"]

    def test_default_output_is_a_table(self, tmp_path, capsys):
        path = self._write(tmp_path, ROWS)
        assert main(["--save_path", path]) == 0
        out = capsys.readouterr().out
        assert "job_id" in out
        assert "beta-ml-2" in out

    def test_a_missing_file_returns_2(self, tmp_path, capsys):
        assert main(["--save_path", str(tmp_path / "missing.csv")]) == 2
        assert "not found" in capsys.readouterr().err.lower()

    def test_rejects_a_limit_below_one(self, tmp_path):
        with pytest.raises(SystemExit):
            main(["--save_path", str(tmp_path / "jobs.csv"), "--limit", "0"])
