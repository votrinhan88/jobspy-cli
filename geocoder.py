import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

from geopy.geocoders import Nominatim


class Geocoder:
    GEOCACHE_PATH = os.path.join(os.path.dirname(__file__), "data", ".geocache.json")
    REGION_CACHE_PATH = os.path.join(os.path.dirname(__file__), "data", ".regioncache.json")
    _REGION_KEYS = ("state", "province", "region", "state_district", "county")
    # Most specific place first. A suburb is the last resort, because a city name gives a better group.
    _PLACE_KEYS = ("city", "town", "village", "municipality", "suburb", "hamlet")
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

    def _load_region_cache(self) -> dict:
        try:
            with open(self.REGION_CACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _save_region_cache(self, cache: dict) -> None:
        with open(self.REGION_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)

    def _geocode_one(self, loc: str, geolocator: Nominatim, rate_lock: Lock) -> tuple[str, str]:
        # Boards write "Remote, Vietnam". Nominatim would look for a place called "Remote".
        query = re.sub(r"^\s*remote\b[\s,\-]*", "", loc, flags=re.IGNORECASE).strip()
        if not query:
            return loc, loc
        try:
            with rate_lock:
                geocoded = geolocator.geocode(query, addressdetails=True)
                time.sleep(self._RATE_LIMIT)
            if geocoded and geocoded.address:
                details = (getattr(geocoded, "raw", None) or {}).get("address", {})
                place = next((details[key] for key in self._PLACE_KEYS if details.get(key)), None)
                if place and details.get("country"):
                    return loc, f"{place}, {details['country']}"
                parts = [p.strip() for p in geocoded.address.split(",")]
                address = f"{parts[0]}, {parts[-1]}" if len(parts) >= 2 else geocoded.address
                return loc, address
        except Exception:
            pass
        return loc, loc

    def _region_one(self, loc: str, geolocator: Nominatim, rate_lock: Lock) -> tuple[str, str | None]:
        # None means the lookup failed, so the caller must not cache it. "" means the place has no region.
        try:
            with rate_lock:
                geocoded = geolocator.geocode(loc, addressdetails=True)
                time.sleep(self._RATE_LIMIT)
        except Exception:
            return loc, None
        address = (getattr(geocoded, "raw", None) or {}).get("address", {}) if geocoded else {}
        for key in self._REGION_KEYS:
            if address.get(key):
                return loc, address[key]
        # Vietnam and a few other countries file province-level cities such as Hanoi under "city", not "state".
        if address.get("city") and address.get("ISO3166-2-lvl4"):
            return loc, address["city"]
        return loc, ""

    def get_region_map(self, locations) -> dict:
        cache = self._load_region_cache()
        region_map = {"": ""}
        wanted = [loc for loc in dict.fromkeys(locations) if loc]
        misses = [loc for loc in wanted if loc not in cache]
        for loc in wanted:
            if loc in cache:
                region_map[loc] = cache[loc]

        if misses:
            if self.verbose > 0:
                print(f"Looking up the region of {len(misses)} locations ({len(wanted) - len(misses)} cached)...")
            geolocator = Nominatim(user_agent="jobscrape")
            rate_lock = Lock()
            with ThreadPoolExecutor(max_workers=self._MAX_WORKERS) as executor:
                futures = [executor.submit(self._region_one, loc, geolocator, rate_lock) for loc in misses]
                for future in as_completed(futures):
                    loc, region = future.result()
                    region_map[loc] = region or ""
                    if region is not None:
                        cache[loc] = region
            self._save_region_cache(cache)
        return region_map

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
