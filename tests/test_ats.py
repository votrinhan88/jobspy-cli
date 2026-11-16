import pytest

from ats import fetch_company, parse_company, strip_html

PAYLOAD = {
    "jobs": [
        {
            "id": 123,
            "title": "Machine Learning Engineer",
            "updated_at": "2026-09-10T08:00:00-04:00",
            "first_published": "2026-09-01T08:00:00-04:00",
            "absolute_url": "https://boards.greenhouse.io/acme/jobs/123",
            "location": {"name": "Sydney, Australia"},
            "content": "<p>Build &amp; ship <b>models</b>.</p>",
            "metadata": [{"name": "Employment Type", "value": "Full-time"}],
        },
        {
            "id": 456,
            "title": "Remote Data Engineer",
            "updated_at": "2026-09-12T08:00:00-04:00",
            "absolute_url": "https://boards.greenhouse.io/acme/jobs/456",
            "location": {"name": "Remote - Australia"},
            "content": "<p>Pipelines.</p>",
        },
    ]
}


def fetch(url):
    fetch.calls.append(url)
    return PAYLOAD


fetch.calls = []


class TestParseCompany:
    def test_reads_the_provider_the_board_and_the_name(self):
        assert parse_company("greenhouse:acme:Acme Corporation") == (
            "greenhouse",
            "acme",
            "Acme Corporation",
        )

    def test_derives_a_name_from_the_board_slug(self):
        assert parse_company("greenhouse:acme-corp") == ("greenhouse", "acme-corp", "Acme Corp")
        assert parse_company("greenhouse:acme_labs") == ("greenhouse", "acme_labs", "Acme Labs")

    def test_rejects_an_unknown_provider(self):
        with pytest.raises(ValueError, match="provider"):
            parse_company("smartrecruiters:acme:Acme")

    def test_reads_a_lever_board(self):
        assert parse_company("lever:acme:Acme Corporation") == (
            "lever",
            "acme",
            "Acme Corporation",
        )
        assert parse_company("lever:acme-labs") == ("lever", "acme-labs", "Acme Labs")

    def test_reads_an_ashby_board(self):
        assert parse_company("ashby:acme:Acme Corporation") == (
            "ashby",
            "acme",
            "Acme Corporation",
        )
        assert parse_company("ashby:acme-labs") == ("ashby", "acme-labs", "Acme Labs")

    def test_reads_a_workday_board(self):
        assert parse_company("workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA") == (
            "workday",
            "nvidia.wd5/NVIDIAExternalCareerSite",
            "NVIDIA",
        )
        assert parse_company("workday:nvidia.wd5/NVIDIAExternalCareerSite") == (
            "workday",
            "nvidia.wd5/NVIDIAExternalCareerSite",
            "Nvidia",
        )

    def test_rejects_a_workday_board_without_a_site(self):
        with pytest.raises(ValueError):
            parse_company("workday:nvidia.wd5")

    def test_rejects_a_missing_or_bad_board(self):
        with pytest.raises(ValueError):
            parse_company("greenhouse")
        with pytest.raises(ValueError):
            parse_company("greenhouse:acme/../x:Acme")


class TestFetchCompany:
    def setup_method(self):
        fetch.calls = []

    def test_requests_the_board_with_content(self):
        fetch_company("greenhouse:acme:Acme Corporation", fetch=fetch)
        assert fetch.calls == ["https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true"]

    def test_maps_the_payload_to_job_columns(self):
        df = fetch_company("greenhouse:acme:Acme Corporation", fetch=fetch)
        assert len(df) == 2
        first = df.iloc[0]
        assert first["title"] == "Machine Learning Engineer"
        assert first["company"] == "Acme Corporation"
        assert first["location"] == "Sydney, Australia"
        assert first["job_url"] == "https://boards.greenhouse.io/acme/jobs/123"
        assert first["site"] == "greenhouse"
        assert first["id"] == "123"
        assert first["date_posted"] == "2026-09-01"
        assert first["description"] == "Build & ship models."
        assert first["job_type"] == "fulltime"
        assert first["is_remote"] == "False"

    def test_marks_a_remote_location(self):
        df = fetch_company("greenhouse:acme:Acme Corporation", fetch=fetch)
        assert df.iloc[1]["is_remote"] == "True"

    def test_falls_back_to_the_update_time(self):
        df = fetch_company("greenhouse:acme:Acme Corporation", fetch=fetch)
        assert df.iloc[1]["date_posted"] == "2026-09-12"

    def test_an_empty_board_gives_an_empty_frame(self):
        df = fetch_company("greenhouse:acme:Acme", fetch=lambda url: {"jobs": []})
        assert df.empty

    def test_a_bad_payload_raises(self):
        with pytest.raises(ValueError):
            fetch_company("greenhouse:acme:Acme", fetch=lambda url: {"jobs": "nope"})

    def test_skips_a_job_without_a_title_or_url(self):
        payload = {"jobs": [{"id": 1, "title": "", "absolute_url": ""}]}
        df = fetch_company("greenhouse:acme:Acme", fetch=lambda url: payload)
        assert df.empty

    def test_strips_tags_and_entities(self):
        assert strip_html("<p>Build &amp; ship <b>models</b>.</p>") == "Build & ship models."
        assert strip_html("") == ""

LEVER_PAYLOAD = [
    {
        "id": "abc-123",
        "text": "Staff Data Engineer",
        "categories": {"location": "Sydney, Australia", "commitment": "Full-time"},
        "createdAt": 1788220800000,
        "hostedUrl": "https://jobs.lever.co/acme/abc-123",
        "descriptionPlain": "Build data pipes." + chr(10) + chr(10) + "Own quality.",
        "salaryRange": {"min": 150000, "max": 190000, "currency": "AUD", "interval": "per-year-salary"},
    },
    {
        "id": "def-456",
        "text": "Remote Support Engineer",
        "categories": {"location": "Remote, APAC", "commitment": "Contract"},
        "createdAt": 1788998400000,
        "hostedUrl": "https://jobs.lever.co/acme/def-456",
        "description": "<p>Help &amp; fix.</p>",
        "workplaceType": "remote",
        "salaryRange": {"min": 50, "max": 70, "currency": "USD", "interval": "per-hour-wage"},
    },
]


class TestFetchLever:
    def test_requests_the_board_in_json(self):
        calls = []
        fetch_company("lever:acme:Acme", fetch=lambda url: calls.append(url) or [])
        assert calls == ["https://api.lever.co/v0/postings/acme?mode=json"]

    def test_maps_the_payload_to_job_columns(self):
        df = fetch_company("lever:acme:Acme Corporation", fetch=lambda url: LEVER_PAYLOAD)
        assert len(df) == 2
        first = df.iloc[0]
        assert first["title"] == "Staff Data Engineer"
        assert first["company"] == "Acme Corporation"
        assert first["location"] == "Sydney, Australia"
        assert first["job_url"] == "https://jobs.lever.co/acme/abc-123"
        assert first["site"] == "lever"
        assert first["id"] == "abc-123"
        assert first["date_posted"] == "2026-09-01"
        assert first["description"] == "Build data pipes. Own quality."
        assert first["job_type"] == "fulltime"
        assert first["is_remote"] == "False"

    def test_maps_the_salary_range(self):
        df = fetch_company("lever:acme:Acme", fetch=lambda url: LEVER_PAYLOAD)
        first = df.iloc[0]
        assert first["min_amount"] == "150000"
        assert first["max_amount"] == "190000"
        assert first["currency"] == "AUD"
        assert first["interval"] == "yearly"
        assert df.iloc[1]["interval"] == "hourly"

    def test_marks_a_remote_workplace_type(self):
        df = fetch_company("lever:acme:Acme", fetch=lambda url: LEVER_PAYLOAD)
        assert df.iloc[1]["is_remote"] == "True"

    def test_strips_html_when_there_is_no_plain_text(self):
        df = fetch_company("lever:acme:Acme", fetch=lambda url: LEVER_PAYLOAD)
        assert df.iloc[1]["description"] == "Help & fix."

    def test_a_job_without_a_salary_gets_empty_amounts(self):
        payload = [{"id": "1", "text": "Engineer", "hostedUrl": "https://jobs.lever.co/acme/1"}]
        df = fetch_company("lever:acme:Acme", fetch=lambda url: payload)
        assert df.iloc[0]["min_amount"] == ""
        assert df.iloc[0]["interval"] == ""

    def test_an_empty_board_gives_an_empty_frame(self):
        df = fetch_company("lever:acme:Acme", fetch=lambda url: [])
        assert df.empty

    def test_a_bad_payload_raises(self):
        with pytest.raises(ValueError):
            fetch_company("lever:acme:Acme", fetch=lambda url: {"postings": []})

    def test_skips_a_job_without_a_title_or_url(self):
        payload = [{"id": "1", "text": "", "hostedUrl": ""}]
        df = fetch_company("lever:acme:Acme", fetch=lambda url: payload)
        assert df.empty

ASHBY_PAYLOAD = {
    "jobs": [
        {
            "id": "ash-1",
            "title": "Senior Security Engineer",
            "location": "New York, NY (HQ)",
            "secondaryLocations": [{"location": "Remote (US)"}],
            "publishedAt": "2026-09-01T20:13:45.158+00:00",
            "employmentType": "FullTime",
            "workplaceType": "Hybrid",
            "isRemote": False,
            "isListed": True,
            "jobUrl": "https://jobs.ashbyhq.com/acme/ash-1",
            "descriptionPlain": "Own cloud security." + chr(10) + chr(10) + "Review designs.",
            "compensation": {
                "compensationTiers": [
                    {
                        "components": [
                            {
                                "compensationType": "EquityPercentage",
                                "interval": "NONE",
                                "currencyCode": None,
                                "minValue": None,
                                "maxValue": None,
                            },
                            {
                                "compensationType": "Salary",
                                "interval": "1 YEAR",
                                "currencyCode": "USD",
                                "minValue": 211400,
                                "maxValue": 290600,
                            },
                        ]
                    }
                ]
            },
        },
        {
            "id": "ash-2",
            "title": "Remote Support Contractor",
            "location": "Europe",
            "publishedAt": "2026-09-10T08:00:00+00:00",
            "employmentType": "Contract",
            "workplaceType": "Remote",
            "isRemote": True,
            "isListed": True,
            "jobUrl": "https://jobs.ashbyhq.com/acme/ash-2",
            "descriptionHtml": "<p>Help &amp; fix.</p>",
            "compensation": {
                "compensationTiers": [
                    {
                        "components": [
                            {
                                "compensationType": "Salary",
                                "interval": "1 HOUR",
                                "currencyCode": "EUR",
                                "minValue": 40,
                                "maxValue": 60,
                            }
                        ]
                    }
                ]
            },
        },
        {
            "id": "ash-hidden",
            "title": "Hidden Job",
            "location": "Sydney",
            "isListed": False,
            "jobUrl": "https://jobs.ashbyhq.com/acme/ash-hidden",
        },
    ]
}


class TestFetchAshby:
    def test_requests_the_board_with_compensation(self):
        calls = []
        fetch_company("ashby:acme:Acme", fetch=lambda url: calls.append(url) or {"jobs": []})
        assert calls == [
            "https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true"
        ]

    def test_maps_the_payload_to_job_columns(self):
        df = fetch_company("ashby:acme:Acme Corporation", fetch=lambda url: ASHBY_PAYLOAD)
        assert len(df) == 2
        first = df.iloc[0]
        assert first["title"] == "Senior Security Engineer"
        assert first["company"] == "Acme Corporation"
        assert first["location"] == "New York, NY (HQ)"
        assert first["job_url"] == "https://jobs.ashbyhq.com/acme/ash-1"
        assert first["site"] == "ashby"
        assert first["id"] == "ash-1"
        assert first["date_posted"] == "2026-09-01"
        assert first["description"] == "Own cloud security. Review designs."
        assert first["job_type"] == "fulltime"
        assert first["is_remote"] == "False"

    def test_maps_the_salary_component(self):
        df = fetch_company("ashby:acme:Acme", fetch=lambda url: ASHBY_PAYLOAD)
        first = df.iloc[0]
        assert first["min_amount"] == "211400"
        assert first["max_amount"] == "290600"
        assert first["currency"] == "USD"
        assert first["interval"] == "yearly"
        assert df.iloc[1]["interval"] == "hourly"
        assert df.iloc[1]["currency"] == "EUR"

    def test_marks_a_remote_workplace_type(self):
        df = fetch_company("ashby:acme:Acme", fetch=lambda url: ASHBY_PAYLOAD)
        assert df.iloc[1]["is_remote"] == "True"

    def test_strips_html_when_there_is_no_plain_text(self):
        df = fetch_company("ashby:acme:Acme", fetch=lambda url: ASHBY_PAYLOAD)
        assert df.iloc[1]["description"] == "Help & fix."

    def test_skips_an_unlisted_job(self):
        df = fetch_company("ashby:acme:Acme", fetch=lambda url: ASHBY_PAYLOAD)
        assert "Hidden Job" not in set(df["title"])

    def test_a_job_without_a_salary_gets_empty_amounts(self):
        payload = {
            "jobs": [
                {
                    "id": "1",
                    "title": "Engineer",
                    "jobUrl": "https://jobs.ashbyhq.com/acme/1",
                }
            ]
        }
        df = fetch_company("ashby:acme:Acme", fetch=lambda url: payload)
        assert df.iloc[0]["min_amount"] == ""
        assert df.iloc[0]["interval"] == ""

    def test_an_empty_board_gives_an_empty_frame(self):
        df = fetch_company("ashby:acme:Acme", fetch=lambda url: {"jobs": []})
        assert df.empty

    def test_a_bad_payload_raises(self):
        with pytest.raises(ValueError):
            fetch_company("ashby:acme:Acme", fetch=lambda url: [])

WORKDAY_LIST = {
    "total": 2,
    "jobPostings": [
        {
            "title": "Solutions Architect",
            "externalPath": "/job/France/Solutions-Architect_JR1",
            "locationsText": "2 Locations",
            "bulletFields": ["JR1"],
        },
        {
            "title": "Support Engineer",
            "externalPath": "/job/Remote/Support-Engineer_JR2",
            "locationsText": "Remote",
            "bulletFields": ["JR2"],
        },
    ],
}

WORKDAY_DETAILS = {
    "/job/France/Solutions-Architect_JR1": {
        "jobPostingInfo": {
            "title": "Solutions Architect",
            "location": "France, Courbevoie",
            "additionalLocations": ["France, Remote"],
            "jobDescription": "<div><p>Design cloud systems.</p><p>Travel.</p></div>",
            "startDate": "2026-11-04",
            "timeType": "Full time",
            "externalUrl": "https://nvidia.wd5.myworkdayjobs.com/Site/job/France/Solutions-Architect_JR1",
        }
    },
    "/job/Remote/Support-Engineer_JR2": {
        "jobPostingInfo": {
            "title": "Support Engineer",
            "location": "Canada, Remote",
            "additionalLocations": [],
            "jobDescription": "<li>Help customers.</li>",
            "startDate": "2026-10-01",
            "timeType": "Contract",
            "externalUrl": "https://nvidia.wd5.myworkdayjobs.com/Site/job/Remote/Support-Engineer_JR2",
        }
    },
}


class TestFetchWorkday:
    def fetch(self, calls):
        def fake(url, payload=None):
            calls.append((url, payload))
            if url.endswith("/jobs"):
                assert payload["offset"] == 0
                return WORKDAY_LIST
            for suffix, reply in WORKDAY_DETAILS.items():
                if url.endswith(suffix):
                    return reply
            raise AssertionError(url)

        return fake

    def test_posts_to_the_cxs_board(self):
        calls = []
        fetch_company("workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA", fetch=self.fetch(calls))
        first_url, payload = calls[0]
        assert first_url == "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs"
        assert payload == {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""}

    def test_fetches_each_job_detail(self):
        calls = []
        fetch_company("workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA", fetch=self.fetch(calls))
        detail_urls = [url for url, payload in calls[1:] if payload is None]
        assert detail_urls == [
            "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/France/Solutions-Architect_JR1",
            "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/Remote/Support-Engineer_JR2",
        ]

    def test_maps_the_payload_to_job_columns(self):
        df = fetch_company("workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA", fetch=self.fetch([]))
        assert len(df) == 2
        first = df.iloc[0]
        assert first["title"] == "Solutions Architect"
        assert first["company"] == "NVIDIA"
        assert first["location"] == "France, Courbevoie"
        assert first["job_url"] == "https://nvidia.wd5.myworkdayjobs.com/Site/job/France/Solutions-Architect_JR1"
        assert first["site"] == "workday"
        assert first["id"] == "JR1"
        assert first["date_posted"] == "2026-11-04"
        assert first["description"] == "Design cloud systems. Travel."
        assert first["job_type"] == "fulltime"
        assert first["is_remote"] == "True"

    def test_marks_a_location_with_remote_in_the_name(self):
        df = fetch_company("workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA", fetch=self.fetch([]))
        assert df.iloc[1]["is_remote"] == "True"
        assert df.iloc[1]["job_type"] == "contract"

    def test_an_empty_board_gives_an_empty_frame(self):
        df = fetch_company(
            "workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA",
            fetch=lambda url, payload=None: {"total": 0, "jobPostings": []},
        )
        assert df.empty

    def test_a_bad_payload_raises(self):
        with pytest.raises(ValueError):
            fetch_company(
                "workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA",
                fetch=lambda url, payload=None: [],
            )

    def test_stops_at_the_cap(self):
        calls = []

        def fake(url, payload=None):
            calls.append(url)
            if url.endswith("/jobs"):
                offset = payload["offset"]
                postings = [
                    {
                        "title": f"Job {offset + i}",
                        "externalPath": f"/job/Job_{offset + i}",
                        "bulletFields": [f"JR{offset + i}"],
                    }
                    for i in range(20)
                ]
                return {"total": 500, "jobPostings": postings}
            return {"jobPostingInfo": {"jobDescription": "<p>Work.</p>"}}

        df = fetch_company("workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA", fetch=fake)
        assert len(df) == 100
        assert len([url for url in calls if url.endswith("/jobs")]) == 5
