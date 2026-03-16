# backend/tests/test_signal_critic.py
import pytest
from app.agents.signal_critic import SignalCriticAgent
from app.models.signal import Scenario, SignalAnalysis, compute_rr_score
from app.models.confidence import CRITICAL_FIELDS


def _make_valid_analysis():
    bull = Scenario(label="강세", price_target=95000, upside_pct=18.5, probability=0.35)
    base = Scenario(label="기본", price_target=84000, upside_pct=5.0, probability=0.45)
    bear = Scenario(label="약세", price_target=72000, upside_pct=-10.0, probability=0.20)
    rr = compute_rr_score(bull, base, bear)
    return SignalAnalysis(
        direction="BUY", bull=bull, base=base, bear=bear,
        rr_score=rr,
        variant_view="시장은 3Q 영업이익을 15% 과소평가 중 — DART 3Q보고서 기준",
        expert_stances={
            "기술적분석가": "bullish",
            "거시경제분석가": "neutral",
            "심리분석가": "bearish",
            "리스크분석가": "bullish",
            "기본적분석가": "bullish",
        },
        critic_result="pending",
    )


def _make_valid_grades():
    return {f: "A" for f in CRITICAL_FIELDS}


def test_programmatic_check_passes_valid_analysis():
    critic = SignalCriticAgent()
    analysis = _make_valid_analysis()
    grades = _make_valid_grades()
    passed, feedback = critic._check_programmatic(analysis, grades)
    assert passed is True
    assert feedback is None


def test_programmatic_check_fails_probability_sum():
    critic = SignalCriticAgent()
    # Pydantic v2 nested models are not directly mutable via attribute assignment.
    # Rebuild a new analysis with an invalid probability sum instead.
    bull = Scenario(label="강세", price_target=95000, upside_pct=18.5, probability=0.5)  # sum = 1.15
    base = Scenario(label="기본", price_target=84000, upside_pct=5.0, probability=0.45)
    bear = Scenario(label="약세", price_target=72000, upside_pct=-10.0, probability=0.20)
    rr = compute_rr_score(bull, base, bear)
    analysis = SignalAnalysis(
        direction="BUY", bull=bull, base=base, bear=bear, rr_score=rr,
        variant_view="test", expert_stances={}, critic_result="pending",
    )
    grades = _make_valid_grades()
    passed, feedback = critic._check_programmatic(analysis, grades)
    assert passed is False
    assert "probability" in feedback.lower()


def test_programmatic_check_fails_confidence_grade_d():
    critic = SignalCriticAgent()
    analysis = _make_valid_analysis()
    grades = _make_valid_grades()
    grades["dart_per"] = "D"
    passed, feedback = critic._check_programmatic(analysis, grades)
    assert passed is False
    assert "dart_per" in feedback


def test_programmatic_check_fails_rr_arithmetic_mismatch():
    critic = SignalCriticAgent()
    analysis = _make_valid_analysis()
    analysis.rr_score = 999.0   # wildly different from computed value
    grades = _make_valid_grades()
    passed, feedback = critic._check_programmatic(analysis, grades)
    assert passed is False
    assert "rr" in feedback.lower()


def test_probability_sum_tolerance():
    critic = SignalCriticAgent()
    # Rebuild with near-1.0 sum (within ±0.01 tolerance)
    bull = Scenario(label="강세", price_target=95000, upside_pct=18.5, probability=0.3501)
    base = Scenario(label="기본", price_target=84000, upside_pct=5.0, probability=0.4500)
    bear = Scenario(label="약세", price_target=72000, upside_pct=-10.0, probability=0.1999)
    rr = compute_rr_score(bull, base, bear)
    analysis = SignalAnalysis(
        direction="BUY", bull=bull, base=base, bear=bear, rr_score=rr,
        variant_view="test", expert_stances={}, critic_result="pending",
    )
    grades = _make_valid_grades()
    passed, _ = critic._check_programmatic(analysis, grades)
    assert passed is True  # within ±0.01 tolerance
