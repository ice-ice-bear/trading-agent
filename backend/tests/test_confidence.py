# backend/tests/test_confidence.py
import pytest
from app.models.confidence import (
    DataConfidence, CRITICAL_FIELDS, check_hard_gate
)


def test_all_critical_fields_pass_when_grade_a():
    grades = {f: "A" for f in CRITICAL_FIELDS}
    passed, failed = check_hard_gate(grades)
    assert passed is True
    assert failed == []


def test_gate_fails_when_any_critical_field_is_d():
    grades = {f: "A" for f in CRITICAL_FIELDS}
    grades["dart_per"] = "D"
    passed, failed = check_hard_gate(grades)
    assert passed is False
    assert "dart_per" in failed


def test_gate_fails_when_critical_field_missing():
    grades = {}  # no grades set at all
    passed, failed = check_hard_gate(grades)
    assert passed is False
    assert set(failed) == set(CRITICAL_FIELDS)


def test_grade_b_passes_gate():
    grades = {f: "B" for f in CRITICAL_FIELDS}
    passed, failed = check_hard_gate(grades)
    assert passed is True


def test_grade_c_does_not_fail_gate():
    # Grade C is allowed — only D triggers the gate
    grades = {f: "A" for f in CRITICAL_FIELDS}
    grades["dart_revenue"] = "C"
    passed, failed = check_hard_gate(grades)
    assert passed is True
