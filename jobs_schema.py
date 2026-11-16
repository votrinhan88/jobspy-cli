import json
from pathlib import Path

import pandas as pd

SCHEMA_PATH = Path(__file__).resolve().parent / "schema" / "jobs.json"


def load_jobs_schema(path: str | Path | None = None) -> dict:
    with open(path or SCHEMA_PATH, "r", encoding="utf-8") as file:
        return json.load(file)


def _string_list(schema: dict, key: str) -> tuple[str, ...]:
    value = schema.get(key)
    if not isinstance(value, list) or not value:
        raise ValueError(f"schema/jobs.json has no {key} list.")
    if not all(isinstance(item, str) and item for item in value):
        raise ValueError(f"schema/jobs.json has an invalid {key} list.")
    return tuple(value)


def schema_columns(path: str | Path | None = None) -> tuple[str, ...]:
    return _string_list(load_jobs_schema(path), "x-columns")


def required_columns(path: str | Path | None = None) -> tuple[str, ...]:
    return _string_list(load_jobs_schema(path), "required")


def validate_jobs_frame(df: pd.DataFrame, path: str | Path | None = None) -> None:
    if df.empty and len(df.columns) == 0:
        return
    missing = [column for column in required_columns(path) if column not in df.columns]
    if missing:
        raise ValueError("jobs.csv is missing required columns: " + ", ".join(missing))
