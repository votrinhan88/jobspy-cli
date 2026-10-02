"""Seed a fully synthetic 'demo' profile. All companies and URLs are fictional."""
import csv, hashlib, json, random, re, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

root = Path(sys.argv[1]) / "data" / "demo"
root.mkdir(parents=True, exist_ok=True)
rng = random.Random(42)
now = datetime(2026, 9, 30, 9, 0, tzinfo=timezone.utc)

companies = ["Northwind Labs", "Lumen Analytics", "Blue Harbor AI", "Kestrel Data", "Orchid Systems",
    "Vantage Robotics", "Quokka Cloud", "Mangrove Health", "Fable Works", "Cobalt Retail",
    "Summit Genomics", "Tidewater Energy", "Pixel Forge", "Aurora Fintech", "Banyan Logistics",
    "Zephyr Mobility", "Nimbus Security", "Redwood Learning", "Sable Media", "Helix Bio"]
titles = ["Data Scientist", "Machine Learning Engineer", "AI Engineer", "Senior Data Scientist",
    "Research Scientist", "MLOps Engineer", "Applied Scientist", "Data Analyst", "NLP Engineer",
    "Computer Vision Engineer", "Analytics Engineer", "Staff Machine Learning Engineer"]
locs = [("Sydney, NSW, Australia", "False"), ("Melbourne, VIC, Australia", "False"), ("Brisbane, QLD, Australia", "False"),
    ("Ho Chi Minh City, Vietnam", "False"), ("Hanoi, Vietnam", "False"), ("Remote, Australia", "True"),
    ("Canberra, ACT, Australia", "False"), ("Perth, WA, Australia", "False")]
sites = ["linkedin", "indeed", "google"]

def slug(s, n=20):
    return re.sub(r"[^a-z0-9]+", "-", s.lower())[:n].strip("-")

statuses = (["shortlisted"] * 9 + ["applied"] * 8 + ["interview"] * 4 + ["offer"] * 1 +
    ["rejected"] * 5 + ["skipped"] * 4 + [""] * 34)
rng.shuffle(statuses)

rows, seen = [], set()
for status in statuses:
    while True:
        c, t, (loc, remote) = rng.choice(companies), rng.choice(titles), rng.choice(locs)
        if (c, t, loc) not in seen:
            seen.add((c, t, loc)); break
    url = f"https://jobs.example.test/{rng.choice(sites)}/{slug(c)}/{rng.randint(10000, 99999)}"
    posted = (now - timedelta(days=rng.randint(0, 45))).date().isoformat()
    lo = rng.choice([90, 100, 110, 120, 130, 140]) * 1000
    has_pay = rng.random() < 0.7
    upd = ""
    if status:
        upd = (now - timedelta(days=rng.randint(0, 35), hours=rng.randint(0, 20))).isoformat().replace("+00:00", "Z")
    rows.append({
        "job_id": f"{slug(c)}-{slug(t)}-{hashlib.md5(url.encode()).hexdigest()[:8]}",
        "title": t, "company": c, "location": loc, "interval": "yearly" if has_pay else "",
        "min_amount": str(lo) if has_pay else "", "max_amount": str(lo + rng.choice([20, 30, 40]) * 1000) if has_pay else "",
        "currency": "AUD" if has_pay else "", "is_remote": remote, "date_posted": posted,
        "job_url": url, "status": status, "status_updated_at": upd,
    })

cols = list(rows[0].keys())
with open(root / "jobs.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n")
    w.writeheader(); w.writerows(rows)

(root / "scrape_config.json").write_text(json.dumps({
    "job": ["Data Scientist", "Machine Learning Engineer", "AI Engineer"],
    "location": ["Australia", "Vietnam"], "results_wanted": 20,
    "site_name": ["linkedin", "indeed", "google"], "workers": 4,
    "title_exclude": ["Intern"], "exclude_companies": [],
}, indent=2), encoding="utf-8")

hist = []
for i, (new, upd_, tot) in enumerate([(18, 4, 65), (22, 9, 47), (25, 0, 25)]):
    start = now - timedelta(days=3 + i * 7)
    hist.append({"status": "done", "started_at": start.isoformat().replace("+00:00", "Z"),
        "finished_at": (start + timedelta(minutes=6 + i)).isoformat().replace("+00:00", "Z"),
        "new_jobs": new, "updated_jobs": upd_, "total_jobs": tot, "error": None})
hist.insert(2, {"status": "error", "started_at": (now - timedelta(days=12)).isoformat().replace("+00:00", "Z"),
    "finished_at": (now - timedelta(days=12) + timedelta(minutes=1)).isoformat().replace("+00:00", "Z"),
    "new_jobs": None, "updated_jobs": None, "total_jobs": None, "error": "LinkedIn returned HTTP 429"})
(root / "scrape_history.json").write_text(json.dumps(hist, indent=2), encoding="utf-8")
(root / "scrape_status.json").write_text(json.dumps(hist[0], indent=2), encoding="utf-8")
(root / "scrape.log").write_text("Scraping 'Data Scientist' in Australia (linkedin, indeed, google)\n"
    "Found 18 new jobs, updated 4\nSaved 88 jobs to jobs.csv\n", encoding="utf-8")

(root / "cv.md").write_text("# Alex Example\n\nData scientist with 5 years of experience in applied machine learning.\n\n"
    "## Experience\n- Fictional Corp, Senior Data Scientist, 2023-2026\n- Placeholder Labs, Data Scientist, 2021-2023\n\n"
    "## Skills\nPython, PyTorch, SQL, MLOps\n", encoding="utf-8")

from collections import Counter
print(len(rows), "jobs;", dict(Counter(r["status"] or "(none)" for r in rows)))
