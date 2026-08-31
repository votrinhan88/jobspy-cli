import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

from geopy.geocoders import Nominatim


class Geocoder:
    GEOCACHE_PATH = os.path.join(os.path.dirname(__file__), "data", ".geocache.json")
    _RATE_LIMIT = 1.0  # seconds between Nominatim requests (ToS: 1 req/sec)
    _MAX_WORKERS = 4

    def __init__(self, verbose: int = 0):
        self.verbose = verbose

    def _load_geocache(self) -> dict:
        try:
            with open(self.GEOCACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _save_geocache(self, cache: dict) -> None:
        with open(self.GEOCACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)

    def _geocode_one(self, loc: str, geolocator: Nominatim, rate_lock: Lock) -> tuple[str, str]:
        try:
            with rate_lock:
                geocoded = geolocator.geocode(loc)
                time.sleep(self._RATE_LIMIT)
            if geocoded and geocoded.address:
                parts = [p.strip() for p in geocoded.address.split(",")]
                address = f"{parts[0]}, {parts[-1]}" if len(parts) >= 2 else geocoded.address
                return loc, address
        except Exception:
            pass
        return loc, loc

    def get_location_map(self, df) -> dict:
        cache = self._load_geocache()
        geolocator = Nominatim(user_agent="jobscrape")
        rate_lock = Lock()

        unique_locations = [loc for loc in df["location"].dropna().unique() if loc != ""]
        location_map = {"": ""}

        misses = [loc for loc in unique_locations if loc not in cache]
        hits = [loc for loc in unique_locations if loc in cache]

        for loc in hits:
            location_map[loc] = cache[loc]

        if misses:
            if self.verbose > 0:
                print(f"Geocoding {len(misses)} new locations ({len(hits)} cached)...")
            with ThreadPoolExecutor(max_workers=self._MAX_WORKERS) as executor:
                futures = {executor.submit(self._geocode_one, loc, geolocator, rate_lock): loc for loc in misses}
                for future in as_completed(futures):
                    loc, result = future.result()
                    location_map[loc] = result
                    cache[loc] = result
            self._save_geocache(cache)
        elif self.verbose > 0:
            print(f"Geocoding: all {len(hits)} locations resolved from cache.")

        return location_map
