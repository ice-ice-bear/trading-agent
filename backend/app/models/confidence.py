# backend/app/models/confidence.py
from enum import Enum


class DataConfidence(Enum):
    A = "A"  # filing-sourced, arithmetic verified
    B = "B"  # 2+ sources, ≤5% variance
    C = "C"  # single source, unverified
    D = "D"  # unavailable — hard gate triggers


CRITICAL_FIELDS = [
    "current_price",
    "volume",
    "dart_revenue",
    "dart_operating_profit",
    "dart_per",
]


def check_hard_gate(
    confidence_grades: dict[str, str],
) -> tuple[bool, list[str]]:
    """
    Returns (passed, list_of_failed_fields).
    Fails if any critical field is grade D or missing.
    """
    failed = [
        f for f in CRITICAL_FIELDS
        if confidence_grades.get(f, "D") == "D"
    ]
    return len(failed) == 0, failed
