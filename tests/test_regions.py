"""Tests for region lookup (state or province) and the region column."""
import json
from types import SimpleNamespace

import pandas as pd
import pytest

import geocoder as geocoder_module
from geocoder import Geocoder
from scraper import JobScraper


def found(address: dict, display: str = "x"):
    return SimpleNamespace(address=display, raw={"address": address})


class FakeNominatim:
    """Stands in for geopy's Nominatim; answers from a dict keyed by the query."""

    def __init__(self, answers: dict, calls: list | None = None):
        self.answers = answers
        self.calls = calls if calls is not None else []

    def geocode(self, query, **kwargs):
        self.calls.append((query, kwargs))
        answer = self.answers[query]
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture
def geo(tmp_path, monkeypatch):
    g = Geocoder(verbose=0)
    monkeypatch.setattr(g, "GEOCACHE_PATH", str(tmp_path / "geocache.json"))
    monkeypatch.setattr(g, "REGION_CACHE_PATH", str(tmp_path / "regioncache.json"))
    monkeypatch.setattr(g, "_RATE_LIMIT", 0)
    return g


class TestGeocodeOne:
    def lookup(self, geo, answer, query="raw place"):
        from threading import Lock

        fake = FakeNominatim({query: answer})
        return geo._geocode_one(query, fake, Lock()), fake

    def test_asks_for_address_details(self, geo):
        _, fake = self.lookup(geo, found({"city": "Sydney", "country": "Australia"}))
        assert fake.calls[0][1].get("addressdetails") is True

    def test_uses_the_city_and_the_country(self, geo):
        (loc, address), _ = self.lookup(geo, found({"city": "Sydney", "country": "Australia"}))
        assert (loc, address) == ("raw place", "Sydney, Australia")

    def test_prefers_the_city_over_a_suburb_or_a_town(self, geo):
        suburb = {"suburb": "Richmond", "city": "Melbourne", "state": "Victoria", "country": "Australia"}
        assert self.lookup(geo, found(suburb))[0][1] == "Melbourne, Australia"
        town = {"town": "Ấp Củ Chi", "city": "Thành phố Hồ Chí Minh", "country": "Việt Nam"}
        assert self.lookup(geo, found(town))[0][1] == "Thành phố Hồ Chí Minh, Việt Nam"

    def test_ignores_a_street_or_a_museum_name(self, geo):
        address = {"tourism": "War Remnants Museum", "road": "Võ Văn Tần", "city": "Thành phố Hồ Chí Minh", "country": "Việt Nam"}
        assert self.lookup(geo, found(address, "War Remnants Museum, Võ Văn Tần, Việt Nam"))[0][1] == "Thành phố Hồ Chí Minh, Việt Nam"

    def test_falls_back_to_town_village_then_suburb_when_there_is_no_city(self, geo):
        assert self.lookup(geo, found({"town": "Cooma", "country": "Australia"}))[0][1] == "Cooma, Australia"
        assert self.lookup(geo, found({"village": "Tiny", "country": "Australia"}))[0][1] == "Tiny, Australia"
        assert self.lookup(geo, found({"suburb": "Surry Hills", "country": "Australia"}))[0][1] == "Surry Hills, Australia"

    def test_falls_back_to_the_display_address_when_the_details_have_no_place(self, geo):
        answer = found({"country": "Australia"}, "Somewhere, Some Shire, Australia")
        assert self.lookup(geo, answer)[0][1] == "Somewhere, Australia"

    def test_falls_back_to_the_display_address_without_details(self, geo):
        answer = SimpleNamespace(address="A, B, C", raw={})
        assert self.lookup(geo, answer)[0][1] == "A, C"

    def test_drops_a_leading_remote_word_from_the_query(self, geo):
        from threading import Lock

        fake = FakeNominatim({"Vietnam": SimpleNamespace(address="Việt Nam", raw={"address": {"country": "Việt Nam"}})})
        loc, address = geo._geocode_one("Remote, Vietnam", fake, Lock())
        assert fake.calls[0][0] == "Vietnam"
        assert (loc, address) == ("Remote, Vietnam", "Việt Nam")

    def test_keeps_a_location_that_is_only_the_word_remote(self, geo):
        from threading import Lock

        fake = FakeNominatim({})
        assert geo._geocode_one("Remote", fake, Lock()) == ("Remote", "Remote")
        assert fake.calls == []

    def test_returns_the_raw_text_when_nothing_is_found_or_the_lookup_fails(self, geo):
        assert self.lookup(geo, None)[0] == ("raw place", "raw place")
        assert self.lookup(geo, RuntimeError("timeout"))[0] == ("raw place", "raw place")

    def test_strips_metropolitan_area_before_the_lookup(self, geo):
        from threading import Lock

        fake = FakeNominatim({"Ho Chi Minh City, Vietnam": None})
        geo._geocode_one("Ho Chi Minh City Metropolitan Area", fake, Lock(), country_hint="Vietnam")
        assert fake.calls[0][0] == "Ho Chi Minh City, Vietnam"

    def test_strips_capital_region_before_the_lookup(self, geo):
        from threading import Lock

        fake = FakeNominatim({"Hanoi, Vietnam": None})
        geo._geocode_one("Hanoi Capital Region", fake, Lock(), country_hint="Vietnam")
        assert fake.calls[0][0] == "Hanoi, Vietnam"

    def test_adds_the_country_hint_to_a_location_without_a_country(self, geo):
        from threading import Lock

        fake = FakeNominatim({"Hanoi, Vietnam": None})
        geo._geocode_one("Hanoi", fake, Lock(), country_hint="Vietnam")
        assert fake.calls[0][0] == "Hanoi, Vietnam"

    def test_does_not_repeat_a_country_hint_already_in_the_location(self, geo):
        from threading import Lock

        fake = FakeNominatim({"Sydney, Australia": None})
        geo._geocode_one("Sydney, Australia", fake, Lock(), country_hint="Australia")
        assert fake.calls[0][0] == "Sydney, Australia"


class TestRegionOne:
    def lookup(self, geo, answer):
        from threading import Lock

        fake = FakeNominatim({"Sydney, Australia": answer})
        return geo._region_one("Sydney, Australia", fake, Lock()), fake

    def test_asks_for_address_details(self, geo):
        (_, _), fake = self.lookup(geo, found({"state": "New South Wales"}))
        assert fake.calls[0][1].get("addressdetails") is True

    def test_returns_the_state(self, geo):
        (loc, region), _ = self.lookup(geo, found({"state": "New South Wales", "country": "Australia"}))
        assert (loc, region) == ("Sydney, Australia", "New South Wales")

    def test_falls_back_to_province_then_region(self, geo):
        assert self.lookup(geo, found({"province": "Ontario"}))[0][1] == "Ontario"
        assert self.lookup(geo, found({"region": "Occitanie"}))[0][1] == "Occitanie"

    def test_uses_the_city_for_a_province_level_city(self, geo):
        address = {"city": "Thành phố Hà Nội", "ISO3166-2-lvl4": "VN-HN", "country": "Việt Nam"}
        assert self.lookup(geo, found(address))[0][1] == "Thành phố Hà Nội"

    def test_uses_the_city_of_a_town_inside_a_province_level_city(self, geo):
        address = {"town": "Ấp Củ Chi", "city": "Thành phố Hồ Chí Minh", "ISO3166-2-lvl4": "VN-SG"}
        assert self.lookup(geo, found(address))[0][1] == "Thành phố Hồ Chí Minh"

    def test_ignores_a_city_without_a_province_code(self, geo):
        assert self.lookup(geo, found({"city": "Somewhere", "country": "X"}))[0][1] == ""

    def test_prefers_state_over_city(self, geo):
        address = {"city": "Sydney", "state": "New South Wales", "ISO3166-2-lvl4": "AU-NSW"}
        assert self.lookup(geo, found(address))[0][1] == "New South Wales"

    def test_prefers_state_over_county(self, geo):
        assert self.lookup(geo, found({"county": "Kings", "state": "New York"}))[0][1] == "New York"

    def test_returns_empty_text_when_the_place_has_no_region(self, geo):
        assert self.lookup(geo, found({"country": "Singapore"}))[0][1] == ""

    def test_returns_empty_text_when_nothing_is_found(self, geo):
        assert self.lookup(geo, None)[0][1] == ""

    def test_returns_none_when_the_lookup_fails(self, geo):
        assert self.lookup(geo, RuntimeError("timeout"))[0][1] is None

    def test_strips_a_suffix_from_the_region_query(self, geo):
        from threading import Lock

        fake = FakeNominatim({"Ho Chi Minh City": found({"state": "Ho Chi Minh"})})
        loc, region = geo._region_one("Ho Chi Minh City Metropolitan Area", fake, Lock())
        assert fake.calls[0][0] == "Ho Chi Minh City"
        assert (loc, region) == ("Ho Chi Minh City Metropolitan Area", "Ho Chi Minh")


class TestRegionMap:
    def patch_nominatim(self, monkeypatch, answers, calls=None):
        fake = FakeNominatim(answers, calls)
        monkeypatch.setattr(geocoder_module, "Nominatim", lambda **kwargs: fake)
        return fake

    def test_maps_each_location_and_keeps_empty_as_empty(self, geo, monkeypatch):
        self.patch_nominatim(monkeypatch, {"Sydney, Australia": found({"state": "New South Wales"})})
        assert geo.get_region_map(["Sydney, Australia", ""]) == {"Sydney, Australia": "New South Wales", "": ""}

    def test_saves_to_the_region_cache_and_reads_it_next_time(self, geo, monkeypatch, tmp_path):
        calls = []
        self.patch_nominatim(monkeypatch, {"Sydney, Australia": found({"state": "New South Wales"})}, calls)
        geo.get_region_map(["Sydney, Australia"])
        assert json.loads((tmp_path / "regioncache.json").read_text("utf-8")) == {"Sydney, Australia": "New South Wales"}
        geo.get_region_map(["Sydney, Australia"])
        assert len(calls) == 1

    def test_caches_a_place_without_a_region_so_it_is_not_asked_again(self, geo, monkeypatch):
        calls = []
        self.patch_nominatim(monkeypatch, {"Singapore, Singapore": found({"country": "Singapore"})}, calls)
        geo.get_region_map(["Singapore, Singapore"])
        geo.get_region_map(["Singapore, Singapore"])
        assert len(calls) == 1

    def test_does_not_cache_a_failed_lookup_and_returns_empty_text(self, geo, monkeypatch, tmp_path):
        calls = []
        self.patch_nominatim(monkeypatch, {"Sydney, Australia": RuntimeError("timeout")}, calls)
        assert geo.get_region_map(["Sydney, Australia"]) == {"": "", "Sydney, Australia": ""}
        assert not (tmp_path / "regioncache.json").exists() or "Sydney, Australia" not in json.loads(
            (tmp_path / "regioncache.json").read_text("utf-8")
        )
        geo.get_region_map(["Sydney, Australia"])
        assert len(calls) == 2


def make_location_frame(locations):
    return pd.DataFrame({"location": locations})


class TestLocationMapCountryHint:
    def patch_nominatim(self, monkeypatch, answers, calls=None):
        fake = FakeNominatim(answers, calls)
        monkeypatch.setattr(geocoder_module, "Nominatim", lambda **kwargs: fake)
        return fake

    def test_uses_the_country_hint_for_a_location_without_a_country(self, geo, monkeypatch):
        answer = found({"city": "Hà Nội", "country": "Việt Nam"})
        self.patch_nominatim(monkeypatch, {"Hanoi, Vietnam": answer})
        result = geo.get_location_map(make_location_frame(["Hanoi Capital Region"]), country_hint="Vietnam")
        assert result["Hanoi Capital Region"] == "Hà Nội, Việt Nam"


def jobs(**columns):
    base = {
        "title": ["AI Engineer", "ML Engineer", "Analyst"],
        "company": ["Acme", "Beta", "Gamma"],
        "location": ["Sydney, Australia", "Melbourne, Australia", ""],
        "job_url": ["u1", "u2", "u3"],
        "job_id": ["job-1", "job-2", "job-3"],
    }
    base.update(columns)
    return pd.DataFrame(base)


@pytest.fixture
def scraper(mocker):
    s = JobScraper(verbose=0)
    mocker.patch.object(
        s._geocoder,
        "get_region_map",
        side_effect=lambda locs: {loc: {"Sydney, Australia": "New South Wales", "Melbourne, Australia": "Victoria"}.get(loc, "") for loc in locs},
    )
    return s


class TestFillRegions:
    def test_adds_the_region_column_and_fills_it(self, scraper):
        out = scraper.fill_regions(jobs())
        assert list(out["region"]) == ["New South Wales", "Victoria", ""]

    def test_keeps_a_region_that_is_already_set(self, scraper):
        out = scraper.fill_regions(jobs(region=["Custom", None, ""]))
        assert list(out["region"]) == ["Custom", "Victoria", ""]

    def test_asks_only_for_locations_that_need_a_region(self, scraper):
        scraper.fill_regions(jobs(region=["Custom", "", ""]))
        asked = scraper._geocoder.get_region_map.call_args[0][0]
        assert sorted(asked) == ["Melbourne, Australia"]

    def test_makes_no_lookup_when_every_row_has_a_region(self, scraper):
        scraper.fill_regions(jobs(region=["a", "b", ""]))
        scraper._geocoder.get_region_map.assert_not_called()

    def test_leaves_an_empty_frame_alone(self, scraper):
        assert scraper.fill_regions(pd.DataFrame()).empty

    def test_never_changes_the_location_column(self, scraper):
        before = jobs()
        out = scraper.fill_regions(before.copy())
        assert list(out["location"]) == list(before["location"])


class TestBackfillRegions:
    def test_fills_the_file_and_keeps_other_columns_and_quoting(self, scraper, tmp_path):
        path = tmp_path / "jobs.csv"
        jobs(status=["", "applied", ""]).to_csv(path, index=False)
        filled = scraper.backfill_regions(str(path))
        assert filled == 2
        out = pd.read_csv(path, keep_default_na=False)
        assert list(out["region"]) == ["New South Wales", "Victoria", ""]
        assert list(out["status"]) == ["", "applied", ""]
        assert list(out["location"]) == ["Sydney, Australia", "Melbourne, Australia", ""]
        assert '"AI Engineer"' in path.read_text("utf-8").splitlines()[1]

    def test_returns_zero_for_a_missing_or_empty_file(self, scraper, tmp_path):
        assert scraper.backfill_regions(str(tmp_path / "missing.csv")) == 0
        empty = tmp_path / "empty.csv"
        empty.write_text("")
        assert scraper.backfill_regions(str(empty)) == 0

    def test_a_second_run_changes_nothing(self, scraper, tmp_path):
        path = tmp_path / "jobs.csv"
        jobs().to_csv(path, index=False)
        scraper.backfill_regions(str(path))
        assert scraper.backfill_regions(str(path)) == 0


class TestSearchCountryHint:
    def run_scrape(self, scraper, mocker, tmp_path, location):
        mocker.patch.object(scraper, "_scrape_pair", return_value=jobs().iloc[:2])
        merge = mocker.patch.object(scraper, "merge", return_value=jobs().iloc[:2])
        scraper(save_path=str(tmp_path / "jobs.csv"), job="x", location=location, site_name=["linkedin"])
        return merge

    def test_a_single_search_country_is_passed_as_a_hint(self, scraper, mocker, tmp_path):
        merge = self.run_scrape(scraper, mocker, tmp_path, "Vietnam")
        assert merge.call_args.kwargs["country_hint"] == "Vietnam"

    def test_the_country_is_the_last_part_of_a_city_search(self, scraper, mocker, tmp_path):
        merge = self.run_scrape(scraper, mocker, tmp_path, "Ho Chi Minh City, Vietnam")
        assert merge.call_args.kwargs["country_hint"] == "Vietnam"

    def test_two_locations_in_one_country_still_give_the_hint(self, scraper, mocker, tmp_path):
        merge = self.run_scrape(scraper, mocker, tmp_path, ["Sydney, Australia", "Melbourne, Australia"])
        assert merge.call_args.kwargs["country_hint"] == "Australia"

    def test_two_search_countries_give_no_hint(self, scraper, mocker, tmp_path):
        merge = self.run_scrape(scraper, mocker, tmp_path, ["Australia", "Vietnam"])
        assert merge.call_args.kwargs["country_hint"] is None

    def test_merge_passes_the_hint_to_the_location_map(self, scraper, mocker):
        mocker.patch.object(scraper, "get_location_map", return_value={"Sydney, Australia": "Sydney, Australia"})
        scraper.merge([jobs()], country_hint="Vietnam")
        assert scraper.get_location_map.call_args.kwargs == {"country_hint": "Vietnam"}


class TestScrapeFillsRegions:
    def test_a_scrape_writes_the_region_column(self, scraper, mocker, tmp_path):
        mocker.patch.object(scraper, "_scrape_pair", return_value=jobs().iloc[:2])
        mocker.patch.object(scraper, "get_location_map", side_effect=lambda df: {loc: loc for loc in df["location"].unique()})
        path = tmp_path / "jobs.csv"
        scraper(save_path=str(path), job="x", location="y", site_name=["linkedin"])
        out = pd.read_csv(path, keep_default_na=False)
        assert dict(zip(out["title"], out["region"])) == {"AI Engineer": "New South Wales", "ML Engineer": "Victoria"}

    def test_a_rescrape_fills_the_region_of_the_kept_location_for_old_rows(self, scraper, mocker, tmp_path):
        path = tmp_path / "jobs.csv"
        old = jobs().iloc[:1].assign(status="applied", job_id="old-1")
        old.to_csv(path, index=False)
        mocker.patch.object(scraper, "_scrape_pair", return_value=jobs().iloc[:1])
        mocker.patch.object(scraper, "get_location_map", side_effect=lambda df: {loc: loc for loc in df["location"].unique()})
        scraper(save_path=str(path), job="x", location="y", site_name=["linkedin"])
        out = pd.read_csv(path, keep_default_na=False)
        assert out.loc[0, "status"] == "applied"
        assert out.loc[0, "region"] == "New South Wales"
