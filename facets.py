import re
import unicodedata

import pandas as pd
from jobspy.model import Country

FACET_COLUMNS = ("country", "city", "work_mode", "seniority", "employment_type")

_LEVEL_MAP = {
    "intern": "intern",
    "internship": "intern",
    "entry": "junior",
    "entry level": "junior",
    "junior": "junior",
    "graduate": "junior",
    "associate": "mid",
    "mid": "mid",
    "mid level": "mid",
    "mid senior level": "mid",
    "intermediate": "mid",
    "senior": "senior",
    "senior level": "senior",
    "lead": "lead",
    "team lead": "lead",
    "principal": "lead",
    "staff": "lead",
    "manager": "manager",
    "director": "director",
    "executive": "executive",
    "vp": "executive",
    "vice president": "executive",
    "chief": "executive",
    "c level": "executive",
}

_JOB_TYPE_MAP = {
    "fulltime": "full_time",
    "full time": "full_time",
    "permanent": "full_time",
    "parttime": "part_time",
    "part time": "part_time",
    "contract": "contract",
    "contractor": "contract",
    "freelance": "contract",
    "fixed term": "contract",
    "intern": "internship",
    "internship": "internship",
    "temporary": "temporary",
    "temp": "temporary",
    "seasonal": "temporary",
    "per diem": "temporary",
    "volunteer": "volunteer",
    "other": "other",
}

_EXECUTIVE_TITLE = re.compile(
    r"\b(chief|ceo|cto|cfo|coo|cpo|vp|vice president|president|founder)\b", re.I
)
_DIRECTOR_TITLE = re.compile(r"\bhead of\b|\bdirector\b", re.I)
_MANAGER_TITLE = re.compile(r"\bmanager\b", re.I)
_LEAD_TITLE = re.compile(
    r"\b(team|tech|technical|engineering|project|product|design|data|marketing|sales|operations)\s+lead\b"
    r"|\blead\s+(engineer|developer|designer|scientist|analyst|architect|manager)\b"
    r"|\blead\s+of\b|\blead$",
    re.I,
)
_PRINCIPAL_TITLE = re.compile(
    r"(?<!assistant )\bprincipal\b|\bstaff\b[^,;|]{0,30}\b(engineer|scientist|designer|developer|architect|analyst|writer)\b",
    re.I,
)
_SENIOR_TITLE = re.compile(r"\b(senior|sr|snr)\b", re.I)
_JUNIOR_TITLE = re.compile(r"\b(junior|jr|entry level|graduate)\b", re.I)
_INTERN_TITLE = re.compile(r"\bintern(ship)?\b", re.I)
_MID_TITLE = re.compile(r"\b(mid[\s-]?level|intermediate)\b", re.I)

_HYBRID_TITLE = re.compile(
    r"\bhybrid\b(?!\s+(cloud|infrastructure|network|vehicle|systems|storage|app|application|mobile|sensing))",
    re.I,
)
_REMOTE_TITLE = re.compile(
    r"\b(fully remote|remote first|remote work|remote role|remote position|remote job|remote opportunity|"
    r"work from home|wfh|telecommute)\b"
    r"|^\s*remote\b(?!\s+(sensing|monitoring|control|access|support|desktop|server|network|infrastructure|diagnostics))"
    r"|\bremote\s*$",
    re.I,
)
_ONSITE_TITLE = re.compile(
    r"\bon[\s-]?site\b|\bin[\s-]?office\b|\boffice[\s-]?based\b|\bwork from office\b", re.I
)
_HYBRID_DESCRIPTION = re.compile(
    r"\bhybrid (work|role|position|job|schedule|model|arrangement|working|remote)\b", re.I
)
_REMOTE_DESCRIPTION = re.compile(
    r"\b(fully remote|remote first|remote work|remote role|remote position|remote job|remote opportunity|"
    r"work from home|wfh|telecommute|100% remote)\b",
    re.I,
)
_ONSITE_DESCRIPTION = re.compile(
    r"\bon[\s-]?site\b|\bin[\s-]?office\b|\boffice[\s-]?based\b|\bwork from office\b|\bfully onsite\b",
    re.I,
)

_INTERNSHIP_TYPE = re.compile(r"\bintern(ship)?\b", re.I)
_PART_TIME_TYPE = re.compile(r"\bpart[\s-]?time\b", re.I)
_TEMPORARY_TYPE = re.compile(r"\btemporary\b|\bseasonal\b|\bper diem\b", re.I)
_CONTRACT_TITLE = re.compile(r"\bcontract(or)?\b|\bfreelance\b|\bfixed[\s-]?term\b", re.I)
_CONTRACT_DESCRIPTION = re.compile(
    r"\bcontract (role|position|basis|assignment|opportunity|term|job)\b"
    r"|\bfixed[\s-]?term contract\b|\bcontractor (role|position|assignment)\b"
    r"|\b\d+[\s-]?(month|year)s?[\s-]contract\b",
    re.I,
)
_VOLUNTEER_TYPE = re.compile(
    r"\bunpaid volunteer\b|\bvolunteer (role|position|opportunity|work)\b|^\s*volunteer\s*$", re.I
)
_FULL_TIME_TYPE = re.compile(r"\bfull[\s-]?time\b|\bpermanent\b", re.I)
_METRO_SUFFIX = re.compile(r"\s+(metropolitan\s+area|capital\s+region|area|region)$", re.I)


def _text(value) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _ascii(value) -> str:
    return unicodedata.normalize("NFKD", _text(value)).encode("ascii", "ignore").decode()


def _normalize(value) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _text(value).lower()).strip()


def _country_key(value) -> str:
    return re.sub(r"[^a-z0-9]+", "", _ascii(value).lower())


_COUNTRY_KEYS = {_country_key(country.value) for country in Country} | {
    "unitedstates",
    "unitedstatesofamerica",
    "unitedkingdom",
    "greatbritain",
    "czechia",
    "uae",
    "russia",
}


def _is_country(value) -> bool:
    return _country_key(value) in _COUNTRY_KEYS


def _is_true(value) -> bool:
    return _text(value).lower() in {"true", "yes", "1"}


def split_location(location) -> tuple[str, str]:
    parts = [part.strip() for part in _text(location).split(",") if part.strip()]
    if not parts:
        return "", ""
    if len(parts) == 1:
        text = parts[0]
        if _is_country(text):
            return text, ""
        city = _METRO_SUFFIX.sub("", text).strip(" ,")
        if city.lower() in {"remote", "anywhere", "worldwide"}:
            city = ""
        return "", city
    country = parts[-1]
    city = parts[0]
    if city.lower() in {"remote", "anywhere", "worldwide"}:
        city = ""
    return country, city


def infer_seniority(job_level="", title="") -> str:
    mapped = _LEVEL_MAP.get(_normalize(job_level))
    if mapped:
        return mapped
    text = _text(title)
    if not text:
        return ""
    if _EXECUTIVE_TITLE.search(text):
        return "executive"
    if _DIRECTOR_TITLE.search(text):
        return "director"
    if _MANAGER_TITLE.search(text):
        return "manager"
    if _LEAD_TITLE.search(text):
        return "lead"
    if _PRINCIPAL_TITLE.search(text):
        return "lead"
    if _SENIOR_TITLE.search(text):
        return "senior"
    if _JUNIOR_TITLE.search(text):
        return "junior"
    if _INTERN_TITLE.search(text):
        return "intern"
    if _MID_TITLE.search(text):
        return "mid"
    return ""


def infer_employment_type(job_type="", title="", description="") -> str:
    mapped = _JOB_TYPE_MAP.get(_normalize(job_type))
    if mapped and mapped != "other":
        return mapped
    title_text = _text(title)
    description_text = _text(description)
    for text, contract_pattern in (
        (title_text, _CONTRACT_TITLE),
        (description_text, _CONTRACT_DESCRIPTION),
    ):
        if not text:
            continue
        if _INTERNSHIP_TYPE.search(text):
            return "internship"
        if _PART_TIME_TYPE.search(text):
            return "part_time"
        if _TEMPORARY_TYPE.search(text):
            return "temporary"
        if contract_pattern.search(text):
            return "contract"
        if _VOLUNTEER_TYPE.search(text):
            return "volunteer"
        if _FULL_TIME_TYPE.search(text):
            return "full_time"
    return ""


def infer_work_mode(title="", location="", description="", is_remote="") -> str:
    if _is_true(is_remote):
        return "remote"
    for text in (_text(title), _text(location)):
        if not text:
            continue
        if _HYBRID_TITLE.search(text):
            return "hybrid"
        if _REMOTE_TITLE.search(text):
            return "remote"
        if _ONSITE_TITLE.search(text):
            return "onsite"
    text = _text(description)
    if _HYBRID_DESCRIPTION.search(text):
        return "hybrid"
    if _REMOTE_DESCRIPTION.search(text):
        return "remote"
    if _ONSITE_DESCRIPTION.search(text):
        return "onsite"
    return ""


def add_facets(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    for column in FACET_COLUMNS:
        if column not in out.columns:
            out[column] = ""
    for index, row in out.iterrows():
        country, city = split_location(row.get("location"))
        out.at[index, "country"] = country
        out.at[index, "city"] = city
        out.at[index, "work_mode"] = infer_work_mode(
            title=row.get("title"),
            location=row.get("location"),
            description=row.get("description"),
            is_remote=row.get("is_remote"),
        )
        out.at[index, "seniority"] = infer_seniority(
            job_level=row.get("job_level"),
            title=row.get("title"),
        )
        out.at[index, "employment_type"] = infer_employment_type(
            job_type=row.get("job_type"),
            title=row.get("title"),
            description=row.get("description"),
        )
    return out
