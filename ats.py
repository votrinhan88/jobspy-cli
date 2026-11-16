"""Direct company boards. Greenhouse, Lever, Ashby and Workday are the supported providers."""
import html
import json
import re
from datetime import datetime, timezone
from urllib.request import Request, urlopen

import pandas as pd

PROVIDERS = ("greenhouse", "lever", "ashby", "workday")
BOARD_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")
WORKDAY_BOARD_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+\.[a-z0-9]+/[a-zA-Z0-9_-]+$")
TAG_PATTERN = re.compile(r"<[^>]*>")
BLOCK_TAG_PATTERN = re.compile(
    r"</?(?:p|div|li|ul|ol|br|h[1-6]|tr|td|th|table|section|article|blockquote)[^>]*>",
    re.IGNORECASE,
)
USER_AGENT = "jobspy-cli/1.0"
JOB_TYPES = ("fulltime", "parttime", "contract", "internship")
LEVER_INTERVALS = {
    "per-year-salary": "yearly",
    "per-month-salary": "monthly",
    "per-hour-wage": "hourly",
}
WORKDAY_PAGE_SIZE = 20
WORKDAY_MAX_JOBS = 100
ASHBY_INTERVALS = (
    ("YEAR", "yearly"),
    ("MONTH", "monthly"),
    ("WEEK", "weekly"),
    ("DAY", "daily"),
    ("HOUR", "hourly"),
)


def _name_from_slug(board: str) -> str:
    return re.sub(r"[-_]+", " ", board).strip().title()


def parse_company(value: str) -> tuple[str, str, str]:
    parts = (value or "").split(":", 2)
    if len(parts) < 2:
        raise ValueError("A company board must look like provider:board[:company].")
    provider = parts[0].strip().lower()
    board = parts[1].strip()
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider {provider!r}. Supported providers: {', '.join(PROVIDERS)}.")
    if provider == "workday":
        if not WORKDAY_BOARD_PATTERN.match(board):
            raise ValueError("A Workday board must look like tenant.cluster/site.")
        tenant = board.split("/")[0].split(".")[0]
        company = parts[2].strip() if len(parts) == 3 else ""
        return provider, board, company or _name_from_slug(tenant)
    if not BOARD_PATTERN.match(board):
        raise ValueError("The board name may only contain letters, numbers, hyphens and underscores.")
    company = parts[2].strip() if len(parts) == 3 else ""
    return provider, board, company or _name_from_slug(board)


def strip_html(text: str) -> str:
    unescaped = html.unescape(text or "")
    with_spaces = BLOCK_TAG_PATTERN.sub(" ", unescaped)
    without_tags = TAG_PATTERN.sub("", with_spaces)
    return re.sub(r"\s+", " ", without_tags).strip()


def _clean_job_type(value) -> str:
    compact = re.sub(r"[\s_-]+", "", str(value or "").strip().lower())
    return compact if compact in JOB_TYPES else ""


def _job_type(metadata) -> str:
    if not isinstance(metadata, list):
        return ""
    for item in metadata:
        if isinstance(item, dict) and item.get("name") == "Employment Type":
            return _clean_job_type(item.get("value"))
    return ""


def _epoch_date(value) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        return ""
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc).date().isoformat()


def _amount(value) -> str:
    if isinstance(value, bool) or value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(int(value)) if float(value).is_integer() else str(value)
    return str(value).strip()


def _get_json(url: str):
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def _post_json(url: str, payload: dict):
    request = Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def fetch_greenhouse(board: str, company: str, fetch=None) -> pd.DataFrame:
    url = f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true"
    payload = fetch(url) if fetch else _get_json(url)
    jobs = payload.get("jobs") if isinstance(payload, dict) else None
    if not isinstance(jobs, list):
        raise ValueError("The Greenhouse reply has no jobs list.")

    rows = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        title = str(job.get("title") or "").strip()
        job_url = str(job.get("absolute_url") or "").strip()
        if not title or not job_url:
            continue
        location = job.get("location") if isinstance(job.get("location"), dict) else {}
        location_name = str(location.get("name") or "").strip()
        published = str(job.get("first_published") or job.get("updated_at") or "")
        rows.append(
            {
                "title": title,
                "company": company,
                "location": location_name,
                "date_posted": published[:10],
                "job_url": job_url,
                "job_url_direct": job_url,
                "description": strip_html(job.get("content") or ""),
                "site": "greenhouse",
                "id": str(job.get("id") or ""),
                "is_remote": "True" if "remote" in location_name.lower() else "False",
                "job_type": _job_type(job.get("metadata")),
            }
        )
    return pd.DataFrame(rows)


def fetch_lever(board: str, company: str, fetch=None) -> pd.DataFrame:
    url = f"https://api.lever.co/v0/postings/{board}?mode=json"
    payload = fetch(url) if fetch else _get_json(url)
    if not isinstance(payload, list):
        raise ValueError("The Lever reply is not a list of postings.")

    rows = []
    for job in payload:
        if not isinstance(job, dict):
            continue
        title = str(job.get("text") or "").strip()
        job_url = str(job.get("hostedUrl") or "").strip()
        if not title or not job_url:
            continue
        categories = job.get("categories") if isinstance(job.get("categories"), dict) else {}
        location = str(categories.get("location") or "").strip()
        plain = job.get("descriptionPlain")
        if isinstance(plain, str) and plain.strip():
            description = re.sub(r"\s+", " ", plain).strip()
        else:
            description = strip_html(job.get("description") or "")
        salary = job.get("salaryRange") if isinstance(job.get("salaryRange"), dict) else {}
        remote = str(job.get("workplaceType") or "").strip().lower() == "remote"
        rows.append(
            {
                "title": title,
                "company": company,
                "location": location,
                "date_posted": _epoch_date(job.get("createdAt")),
                "job_url": job_url,
                "job_url_direct": job_url,
                "description": description,
                "site": "lever",
                "id": str(job.get("id") or ""),
                "is_remote": "True" if remote or "remote" in location.lower() else "False",
                "job_type": _clean_job_type(categories.get("commitment")),
                "min_amount": _amount(salary.get("min")),
                "max_amount": _amount(salary.get("max")),
                "currency": str(salary.get("currency") or ""),
                "interval": LEVER_INTERVALS.get(str(salary.get("interval") or ""), ""),
            }
        )
    return pd.DataFrame(rows)


def _ashby_interval(value) -> str:
    text = str(value or "").strip().upper()
    for token, interval in ASHBY_INTERVALS:
        if token in text:
            return interval
    return ""


def _ashby_salary(job: dict) -> dict:
    compensation = job.get("compensation")
    if not isinstance(compensation, dict):
        return {}
    tiers = compensation.get("compensationTiers")
    if not isinstance(tiers, list):
        return {}
    for tier in tiers:
        components = tier.get("components") if isinstance(tier, dict) else None
        if not isinstance(components, list):
            continue
        for component in components:
            if isinstance(component, dict) and component.get("compensationType") == "Salary":
                return component
    return {}


def fetch_ashby(board: str, company: str, fetch=None) -> pd.DataFrame:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true"
    payload = fetch(url) if fetch else _get_json(url)
    jobs = payload.get("jobs") if isinstance(payload, dict) else None
    if not isinstance(jobs, list):
        raise ValueError("The Ashby reply has no jobs list.")

    rows = []
    for job in jobs:
        if not isinstance(job, dict) or job.get("isListed") is False:
            continue
        title = str(job.get("title") or "").strip()
        job_url = str(job.get("jobUrl") or job.get("applyUrl") or "").strip()
        if not title or not job_url:
            continue
        location = str(job.get("location") or "").strip()
        plain = job.get("descriptionPlain")
        if isinstance(plain, str) and plain.strip():
            description = re.sub(r"\s+", " ", plain).strip()
        else:
            description = strip_html(job.get("descriptionHtml") or "")
        salary = _ashby_salary(job)
        remote = job.get("isRemote") is True or str(job.get("workplaceType") or "").lower() == "remote"
        rows.append(
            {
                "title": title,
                "company": company,
                "location": location,
                "date_posted": str(job.get("publishedAt") or "")[:10],
                "job_url": job_url,
                "job_url_direct": job_url,
                "description": description,
                "site": "ashby",
                "id": str(job.get("id") or ""),
                "is_remote": "True" if remote or "remote" in location.lower() else "False",
                "job_type": _clean_job_type(job.get("employmentType")),
                "min_amount": _amount(salary.get("minValue")),
                "max_amount": _amount(salary.get("maxValue")),
                "currency": str(salary.get("currencyCode") or ""),
                "interval": _ashby_interval(salary.get("interval")),
            }
        )
    return pd.DataFrame(rows)


def fetch_workday(board: str, company: str, fetch=None) -> pd.DataFrame:
    host, site = board.split("/", 1)
    tenant = host.split(".")[0]
    base = f"https://{host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}"

    def call(url, payload=None):
        if fetch:
            return fetch(url, payload)
        if payload is None:
            return _get_json(url)
        return _post_json(url, payload)

    postings = []
    offset = 0
    while len(postings) < WORKDAY_MAX_JOBS:
        reply = call(
            f"{base}/jobs",
            {"appliedFacets": {}, "limit": WORKDAY_PAGE_SIZE, "offset": offset, "searchText": ""},
        )
        page = reply.get("jobPostings") if isinstance(reply, dict) else None
        if not isinstance(page, list):
            raise ValueError("The Workday reply has no jobPostings list.")
        postings.extend(item for item in page if isinstance(item, dict))
        total = reply.get("total")
        if len(page) < WORKDAY_PAGE_SIZE:
            break
        if isinstance(total, int) and offset + WORKDAY_PAGE_SIZE >= total:
            break
        offset += WORKDAY_PAGE_SIZE

    rows = []
    for posting in postings[:WORKDAY_MAX_JOBS]:
        title = str(posting.get("title") or "").strip()
        path = str(posting.get("externalPath") or "").strip()
        if not title or not path:
            continue
        detail = call(f"{base}{path}")
        info = detail.get("jobPostingInfo") if isinstance(detail, dict) else None
        if not isinstance(info, dict):
            info = {}
        location = str(info.get("location") or posting.get("locationsText") or "").strip()
        extra = info.get("additionalLocations")
        places = [location] + [str(item) for item in extra] if isinstance(extra, list) else [location]
        job_url = str(info.get("externalUrl") or "").strip() or f"https://{host}.myworkdayjobs.com/{site}{path}"
        bullet = posting.get("bulletFields")
        job_id = str(bullet[0]) if isinstance(bullet, list) and bullet else str(info.get("id") or "")
        rows.append(
            {
                "title": title,
                "company": company,
                "location": location,
                "date_posted": str(info.get("startDate") or "")[:10],
                "job_url": job_url,
                "job_url_direct": job_url,
                "description": strip_html(info.get("jobDescription") or ""),
                "site": "workday",
                "id": job_id,
                "is_remote": "True" if "remote" in " ".join(places).lower() else "False",
                "job_type": _clean_job_type(info.get("timeType")),
                "min_amount": "",
                "max_amount": "",
                "currency": "",
                "interval": "",
            }
        )
    return pd.DataFrame(rows)


def fetch_company(value: str, fetch=None) -> pd.DataFrame:
    provider, board, company = parse_company(value)
    if provider == "lever":
        return fetch_lever(board, company, fetch=fetch)
    if provider == "ashby":
        return fetch_ashby(board, company, fetch=fetch)
    if provider == "workday":
        return fetch_workday(board, company, fetch=fetch)
    return fetch_greenhouse(board, company, fetch=fetch)
