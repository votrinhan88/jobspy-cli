"""Fill or refresh the five facet columns of a jobs.csv file. Run it again at any time."""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scraper import JobScraper  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save_path", required=True, help="Path to the jobs.csv file, for example data/myprofile/jobs.csv")
    args = parser.parse_args()
    filled = JobScraper(verbose=1).backfill_facets(args.save_path)
    print(f"Filled facets for {filled} jobs.")


if __name__ == "__main__":
    main()
