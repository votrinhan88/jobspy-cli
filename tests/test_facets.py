import pandas as pd

from facets import (
    add_facets,
    infer_employment_type,
    infer_seniority,
    infer_work_mode,
    split_location,
)


class TestSplitLocation:
    def test_splits_a_city_and_a_country(self):
        assert split_location("Sydney, Australia") == ("Australia", "Sydney")

    def test_uses_one_label_for_a_vietnamese_city(self):
        assert split_location("Hanoi, Vietnam") == ("Vietnam", "Hà Nội")
        assert split_location("Ho Chi Minh City, Vietnam") == ("Vietnam", "Hồ Chí Minh")

    def test_drops_the_vietnamese_city_prefix(self):
        assert split_location("Thành phố Hồ Chí Minh, Việt Nam") == ("Việt Nam", "Hồ Chí Minh")
        assert split_location("Thành phố Hà Nội, Việt Nam") == ("Việt Nam", "Hà Nội")
        assert split_location("Thành phố Đà Nẵng, Việt Nam") == ("Việt Nam", "Đà Nẵng")
        assert split_location("Thành phố Hải Phòng, Việt Nam") == ("Việt Nam", "Hải Phòng")
        assert split_location("TP. Hồ Chí Minh, Việt Nam") == ("Việt Nam", "Hồ Chí Minh")
        assert split_location("TP. Vũng Tàu, Việt Nam") == ("Việt Nam", "Vũng Tàu")

    def test_a_single_part_is_a_country(self):
        assert split_location("Australia") == ("Australia", "")

    def test_a_remote_prefix_is_not_a_city(self):
        assert split_location("Remote, Australia") == ("Australia", "")

    def test_a_metro_area_without_a_country_is_not_a_country(self):
        assert split_location("Greater Brisbane Area") == ("", "Brisbane")
        assert split_location("Ho Chi Minh City Metropolitan Area") == ("", "Hồ Chí Minh")
        assert split_location("Hanoi Capital Region") == ("", "Hà Nội")

    def test_a_state_name_is_not_a_city(self):
        assert split_location("NSW, Australia") == ("Australia", "")
        assert split_location("New South Wales, Australia") == ("Australia", "")
        assert split_location("SA, Australia") == ("Australia", "")
        assert split_location("South Australia, Australia") == ("Australia", "")
        assert split_location("VIC, Australia") == ("Australia", "")
        assert split_location("Queensland, Australia") == ("Australia", "")

    def test_a_city_named_after_a_state_in_another_country_stays(self):
        assert split_location("Victoria, Canada") == ("Canada", "Victoria")

    def test_merges_metro_and_suburb_names(self):
        assert split_location("North Sydney, Australia") == ("Australia", "Sydney")
        assert split_location("Chatswood, Australia") == ("Australia", "Sydney")
        assert split_location("Parramatta, Australia") == ("Australia", "Sydney")
        assert split_location("Bella Vista, Australia") == ("Australia", "Sydney")
        assert split_location("Belrose, Australia") == ("Australia", "Sydney")
        assert split_location("Melbourne Eastern Suburbs, Australia") == ("Australia", "Melbourne")
        assert split_location("Greater Brisbane, Australia") == ("Australia", "Brisbane")

    def test_keeps_an_unknown_city(self):
        assert split_location("Albury, Australia") == ("Australia", "Albury")
        assert split_location("Bangalore Falls, Australia") == ("Australia", "Bangalore Falls")

    def test_recognizes_a_country_with_diacritics(self):
        assert split_location("Việt Nam") == ("Việt Nam", "")

    def test_keeps_the_first_part_as_the_city(self):
        assert split_location("Surry Hills, Sydney, Australia") == ("Australia", "Surry Hills")

    def test_handles_empty_and_blank_values(self):
        assert split_location("") == ("", "")
        assert split_location(None) == ("", "")


class TestSeniority:
    def test_job_level_wins_over_the_title(self):
        assert infer_seniority(job_level="Entry level", title="Senior Data Engineer") == "junior"

    def test_maps_linkedin_job_levels(self):
        assert infer_seniority(job_level="Internship") == "intern"
        assert infer_seniority(job_level="Entry level") == "junior"
        assert infer_seniority(job_level="Associate") == "mid"
        assert infer_seniority(job_level="Mid-Senior level") == "mid"
        assert infer_seniority(job_level="Director") == "director"
        assert infer_seniority(job_level="Executive") == "executive"

    def test_reads_the_title_when_job_level_is_empty(self):
        assert infer_seniority(title="Senior Data Engineer") == "senior"
        assert infer_seniority(title="Junior Developer") == "junior"
        assert infer_seniority(title="Mid-Level Data Analyst") == "mid"
        assert infer_seniority(title="Engineering Team Lead") == "lead"
        assert infer_seniority(title="Principal Engineer") == "lead"
        assert infer_seniority(title="Staff Software Engineer") == "lead"
        assert infer_seniority(title="Product Manager") == "manager"
        assert infer_seniority(title="Head of Data") == "director"
        assert infer_seniority(title="VP of Engineering") == "executive"
        assert infer_seniority(title="Chief Technology Officer") == "executive"
        assert infer_seniority(title="Data Science Intern") == "intern"

    def test_does_not_match_role_words_inside_other_words(self):
        assert infer_seniority(title="Lead Generation Specialist") == ""
        assert infer_seniority(title="Back End Cashier") == ""
        assert infer_seniority(title="Product Owner") == ""
        assert infer_seniority(title="Assistant Principal") == ""


class TestEmploymentType:
    def test_maps_jobspy_values(self):
        assert infer_employment_type(job_type="fulltime") == "full_time"
        assert infer_employment_type(job_type="parttime") == "part_time"
        assert infer_employment_type(job_type="contract") == "contract"
        assert infer_employment_type(job_type="internship") == "internship"
        assert infer_employment_type(job_type="temporary") == "temporary"
        assert infer_employment_type(job_type="volunteer") == "volunteer"

    def test_job_type_wins_over_the_title(self):
        assert infer_employment_type(job_type="contract", title="Full-Time Data Engineer") == "contract"

    def test_falls_back_to_the_title(self):
        assert infer_employment_type(title="Full-Time Data Engineer") == "full_time"
        assert infer_employment_type(title="Part Time Analyst") == "part_time"
        assert infer_employment_type(title="Contractor Data Engineer") == "contract"
        assert infer_employment_type(title="Data Science Intern") == "internship"
        assert infer_employment_type(title="Temporary Data Entry") == "temporary"

    def test_does_not_match_words_inside_other_words(self):
        assert infer_employment_type(title="Internal Auditor") == ""
        assert infer_employment_type(title="Volunteer Coordinator") == ""

    def test_reads_a_clear_volunteer_phrase_in_the_description(self):
        assert infer_employment_type(description="This is an unpaid volunteer role.") == "volunteer"

    def test_reads_a_contract_role_in_the_description(self):
        assert infer_employment_type(description="This is a contract role.") == "contract"

    def test_does_not_read_contract_management_as_a_contract_job(self):
        assert infer_employment_type(description="Knowledge of contract management.") == ""


class TestWorkMode:
    def test_uses_the_is_remote_flag_first(self):
        assert infer_work_mode(is_remote="True") == "remote"
        assert infer_work_mode(is_remote="yes") == "remote"
        assert infer_work_mode(is_remote="1") == "remote"

    def test_reads_a_remote_location(self):
        assert infer_work_mode(location="Remote, Australia") == "remote"

    def test_reads_the_title(self):
        assert infer_work_mode(title="Hybrid Data Engineer") == "hybrid"
        assert infer_work_mode(title="On-site Technician") == "onsite"
        assert infer_work_mode(title="Remote Data Engineer") == "remote"

    def test_does_not_match_remote_sensing_or_hybrid_cloud(self):
        assert infer_work_mode(title="Remote Sensing Engineer") == ""
        assert infer_work_mode(title="Hybrid Cloud Architect") == ""

    def test_reads_clear_phrases_in_the_description(self):
        assert infer_work_mode(description="This is a fully remote role.") == "remote"
        assert infer_work_mode(description="Work from home.") == "remote"
        assert infer_work_mode(description="This is a hybrid role.") == "hybrid"
        assert infer_work_mode(description="Work in-office three days.") == "onsite"

    def test_ignores_a_bare_remote_word_in_a_long_description(self):
        assert infer_work_mode(description="Build remote monitoring systems.") == ""

    def test_the_title_wins_over_the_description(self):
        assert infer_work_mode(title="Hybrid Data Engineer", description="Fully remote.") == "hybrid"

    def test_a_remote_phrase_wins_over_a_later_onsite_mention(self):
        assert infer_work_mode(description="Remote role with occasional on-site visits.") == "remote"


class TestAddFacets:
    def test_adds_all_five_columns(self):
        frame = pd.DataFrame(
            [
                {
                    "title": "Senior Data Engineer",
                    "location": "Sydney, Australia",
                    "description": "This is a hybrid role.",
                    "is_remote": "False",
                    "job_level": "",
                    "job_type": "fulltime",
                }
            ]
        )
        out = add_facets(frame)
        assert out.loc[0, "country"] == "Australia"
        assert out.loc[0, "city"] == "Sydney"
        assert out.loc[0, "work_mode"] == "hybrid"
        assert out.loc[0, "seniority"] == "senior"
        assert out.loc[0, "employment_type"] == "full_time"

    def test_writes_one_label_per_city(self):
        frame = pd.DataFrame(
            [
                {"title": "A", "location": "NSW, Australia"},
                {"title": "B", "location": "Chatswood, Australia"},
                {"title": "C", "location": "Thành phố Hồ Chí Minh, Việt Nam"},
            ]
        )
        out = add_facets(frame)
        assert list(out["city"]) == ["", "Sydney", "Hồ Chí Minh"]
        assert list(out["country"]) == ["Australia", "Australia", "Việt Nam"]

    def test_does_not_change_the_input_frame(self):
        frame = pd.DataFrame([{"title": "Data Engineer", "location": "Hanoi, Vietnam"}])
        add_facets(frame)
        assert "country" not in frame.columns

    def test_handles_an_empty_frame(self):
        assert add_facets(pd.DataFrame()).empty
