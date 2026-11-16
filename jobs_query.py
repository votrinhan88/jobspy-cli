"""Read a jobs.csv file and answer a filtered query. JSON or a text table."""
import argparse
import csv
import json
import sys

STATUS_ALIASES = {"untriaged": ""}

TABLE_COLUMNS = ("job_id", "title", "company", "city", "status", "date_posted")
WIDE_COLUMNS = {"title", "company"}
MAX_WIDTH = 40


def read_jobs(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def _same(value: str, wanted: str) -> bool:
    return (value or "").strip().casefold() == wanted.strip().casefold()


def query_jobs(
    rows: list[dict],
    *,
    query: str = "",
    status: str | None = None,
    city: str | None = None,
    country: str | None = None,
    site: str | None = None,
    work_mode: str | None = None,
    seniority: str | None = None,
    employment_type: str | None = None,
    include_archived: bool = False,
    limit: int | None = None,
) -> list[dict]:
    text = query.strip().casefold()
    selected_status = None
    if status is not None:
        selected_status = STATUS_ALIASES.get(status.strip().casefold(), status.strip())

    filters = {
        "city": city,
        "country": country,
        "site": site,
        "work_mode": work_mode,
        "seniority": seniority,
        "employment_type": employment_type,
    }

    found = []
    for job in rows:
        stored_status = (job.get("status") or "").strip()
        if selected_status is None:
            if not include_archived and stored_status == "skipped":
                continue
        elif stored_status != selected_status:
            continue

        haystack = " ".join(
            job.get(column, "") or "" for column in ("title", "company", "location", "description")
        ).casefold()
        if text and text not in haystack:
            continue

        if any(not _same(job.get(column, ""), wanted) for column, wanted in filters.items() if wanted is not None):
            continue

        found.append(job)

    found.sort(
        key=lambda job: (job.get("date_posted", "") or "", job.get("last_seen_at", "") or ""),
        reverse=True,
    )
    if limit is not None:
        found = found[:limit]
    return found


def _cell(value: str, width: int) -> str:
    text = " ".join((value or "").split())
    if len(text) > width:
        text = text[: width - 1] + "…"
    return text.ljust(width)


def format_table(rows: list[dict]) -> str:
    if not rows:
        return "No jobs matched."
    widths = {}
    for column in TABLE_COLUMNS:
        longest = max([len(column)] + [len(" ".join((row.get(column, "") or "").split())) for row in rows])
        widths[column] = min(longest, MAX_WIDTH) if column in WIDE_COLUMNS else longest
    lines = ["  ".join(column.ljust(widths[column]) for column in TABLE_COLUMNS)]
    for row in rows:
        lines.append("  ".join(_cell(row.get(column, ""), widths[column]) for column in TABLE_COLUMNS))
    return "\n".join(lines)


def _positive_int(text: str) -> int:
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError("limit must be 1 or more")
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save_path", required=True, help="Path to the jobs.csv file.")
    parser.add_argument("--query", default="", help="Text to find in the title, company, location or description.")
    parser.add_argument("--status", help='Stored status, for example "applied". Use "untriaged" for an empty status.')
    parser.add_argument("--city")
    parser.add_argument("--country")
    parser.add_argument("--site")
    parser.add_argument("--work_mode")
    parser.add_argument("--seniority")
    parser.add_argument("--employment_type")
    parser.add_argument("--include-archived", action="store_true", help="Include skipped rows.")
    parser.add_argument("--limit", type=_positive_int, help="Stop after this many rows.")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of a text table.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        rows = read_jobs(args.save_path)
    except FileNotFoundError:
        print(f"File not found: {args.save_path}", file=sys.stderr)
        return 2

    rows = query_jobs(
        rows,
        query=args.query,
        status=args.status,
        city=args.city,
        country=args.country,
        site=args.site,
        work_mode=args.work_mode,
        seniority=args.seniority,
        employment_type=args.employment_type,
        include_archived=args.include_archived,
        limit=args.limit,
    )
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print(format_table(rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
