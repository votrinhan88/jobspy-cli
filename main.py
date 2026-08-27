import argparse
import sys

from scraper import JobScraper


def build_parser() -> argparse.ArgumentParser:
    # fmt: off
    parser = argparse.ArgumentParser(description="Scrape job postings from multiple job sites.")
    required_group = parser.add_argument_group('Required arguments')
    required_group.add_argument("--job", type=str, nargs='+', required=True, help="Job title(s) to search for, or a text file with one job per line.")
    required_group.add_argument("--location", type=str, nargs='+', required=True, help="Location(s) to search in.")

    optional_group = parser.add_argument_group('Optional arguments')
    optional_group.add_argument("--save_path", type=str, default="./jobs.csv", help="Path to save the resulting CSV file.")
    optional_group.add_argument("--results_wanted", type=int, default=10, help="Number of job results to fetch per (job, location) pair.")
    optional_group.add_argument("--site_name", type=str, nargs='+', default=["linkedin", "zip_recruiter", "indeed", "google"], help="List of job sites to scrape from.")
    optional_group.add_argument("--verbose", type=int, default=1, help="Verbosity level: 0 (errors only), 1 (errors + warnings), 2 (all logs)")
    optional_group.add_argument("--workers", type=int, default=4, help="Number of parallel scraping workers (default: 4)")

    auxiliary_group = parser.add_argument_group('Auxiliary arguments')
    auxiliary_group.add_argument("--distance", type=int, default=50, help="Distance in miles (default: 50)")
    auxiliary_group.add_argument("--job_type", type=str, choices=["fulltime", "parttime", "internship", "contract"], help="Job type")
    auxiliary_group.add_argument("--proxies", type=str, nargs='+', help="Proxy list, e.g. user:pass@host:port")
    auxiliary_group.add_argument("--is_remote", action="store_true", help="Filter for remote jobs")
    auxiliary_group.add_argument("--easy_apply", action="store_true", help="Filter for jobs hosted on the job board site")
    auxiliary_group.add_argument("--user_agent", type=str, help="Override the default user agent")
    auxiliary_group.add_argument("--description_format", type=str, choices=["markdown", "html"], default="markdown", help="Format type of the job descriptions")
    auxiliary_group.add_argument("--offset", type=int, help="Start search from an offset")
    auxiliary_group.add_argument("--hours_old", type=int, help="Filter jobs by hours since posted")
    auxiliary_group.add_argument("--linkedin_fetch_description", action="store_true", help="Fetch full description and direct job URL for LinkedIn")
    auxiliary_group.add_argument("--linkedin_company_ids", type=int, nargs='+', help="LinkedIn company IDs")
    auxiliary_group.add_argument("--country_indeed", type=str, help="Country filter for Indeed & Glassdoor")
    auxiliary_group.add_argument("--enforce_annual_salary", action="store_true", help="Convert wages to annual salary")
    auxiliary_group.add_argument("--ca_cert", type=str, help="Path to CA Certificate file for proxies")
    # fmt: on
    return parser


def main() -> None:
    parser = build_parser()

    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(0)

    args = parser.parse_args()

    job_arg = args.job
    if len(job_arg) == 1 and job_arg[0].endswith('.txt'):
        with open(job_arg[0], 'r', encoding='utf-8') as f:
            jobs = [line.strip() for line in f if line.strip()]
        if args.verbose > 0:
            print(f"Loaded {len(jobs)} keywords from {job_arg[0]}: {jobs}")
    else:
        jobs = job_arg

    scraper_kwargs = {
        "distance": args.distance,
        "job_type": args.job_type,
        "proxies": args.proxies,
        "is_remote": args.is_remote,
        "easy_apply": args.easy_apply,
        "user_agent": args.user_agent,
        "description_format": args.description_format,
        "offset": args.offset,
        "hours_old": args.hours_old,
        "linkedin_fetch_description": args.linkedin_fetch_description,
        "linkedin_company_ids": args.linkedin_company_ids,
        "country_indeed": args.country_indeed,
        "enforce_annual_salary": args.enforce_annual_salary,
        "ca_cert": args.ca_cert,
    }
    scraper_kwargs = {k: v for k, v in scraper_kwargs.items() if v is not None}

    scraper = JobScraper(verbose=args.verbose)
    scraper(
        save_path=args.save_path,
        job=jobs,
        location=args.location,
        results_wanted=args.results_wanted,
        site_name=args.site_name,
        workers=args.workers,
        **scraper_kwargs,
    )


if __name__ == "__main__":
    main()
