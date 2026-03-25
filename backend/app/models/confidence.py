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
    dart_per_required: bool = True,
) -> tuple[bool, list[str]]:
    """
    Returns (passed, list_of_failed_fields).
    Fails if any critical field is grade D or missing.
    When dart_per_required=False, dart_per is excluded from the gate.
    """
    fields = CRITICAL_FIELDS if dart_per_required else [f for f in CRITICAL_FIELDS if f != "dart_per"]
    failed = [
        f for f in fields
        if confidence_grades.get(f, "D") == "D"
    ]
    return len(failed) == 0, failed
