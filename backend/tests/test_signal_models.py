# backend/tests/test_signal_models.py
import pytest
from app.models.signal import Scenario, SignalAnalysis, compute_rr_score, compute_confidence


def _make_scenarios():
    bull = Scenario(label="강세", price_target=95000, upside_pct=18.5, probability=0.35)
    base = Scenario(label="기본", price_target=84000, upside_pct=5.0, probability=0.45)
    bear = Scenario(label="약세", price_target=72000, upside_pct=-10.0, probability=0.20)
    return bull, base, bear


def test_compute_rr_score_basic():
    bull, base, bear = _make_scenarios()
    rr = compute_rr_score(bull, base, bear)
    # numerator = 18.5*0.35 + 5.0*0.45 = 6.475 + 2.25 = 8.725
    # denominator = abs(-10.0 * 0.20) = 2.0
    # rr = 8.725 / 2.0 = 4.3625
    assert abs(rr - 4.3625) < 0.001


def test_compute_rr_score_zero_bear_probability():
    bull = Scenario(label="강세", price_target=95000, upside_pct=18.5, probability=0.5)
    base = Scenario(label="기본", price_target=84000, upside_pct=5.0, probability=0.5)
    bear = Scenario(label="약세", price_target=72000, upside_pct=0.0, probability=0.0)
    rr = compute_rr_score(bull, base, bear)
    # denominator floors to 0.01 to avoid divide-by-zero
    assert rr > 0


def test_signal_analysis_creation():
    bull, base, bear = _make_scenarios()
    analysis = SignalAnalysis(
        direction="BUY",
        bull=bull,
        base=base,
        bear=bear,
        rr_score=4.36,
        variant_view="시장은 HBM 경쟁 심화를 과대평가 중 — DART 3Q 매출 기준",
        expert_stances={"기술적분석가": "bullish", "거시경제분석가": "neutral"},
        critic_result="pending",
    )
    assert analysis.direction == "BUY"
    assert analysis.critic_feedback is None


def test_signal_analysis_probability_validation():
    # Pydantic should accept any floats — validation is done by critic, not model
    bull = Scenario(label="강세", price_target=95000, upside_pct=18.5, probability=0.6)
    base = Scenario(label="기본", price_target=84000, upside_pct=5.0, probability=0.6)
    bear = Scenario(label="약세", price_target=72000, upside_pct=-10.0, probability=0.6)
    # Model accepts them; critic checks the sum
    analysis = SignalAnalysis(
        direction="BUY", bull=bull, base=base, bear=bear,
        rr_score=1.0, variant_view="test", expert_stances={}, critic_result="pending",
    )
    assert analysis.bull.probability == 0.6


def test_compute_confidence_linear_mapping():
    """Linear mapping: confidence = rr_score / ceiling * 100, clamped 0-100."""
    assert compute_confidence(0.0, ceiling=2.0) == 0.0
    assert compute_confidence(1.0, ceiling=2.0) == 50.0
    assert compute_confidence(2.0, ceiling=2.0) == 100.0


def test_compute_confidence_clamps_to_100():
    assert compute_confidence(5.0, ceiling=2.0) == 100.0


def test_compute_confidence_clamps_to_0():
    assert compute_confidence(-1.0, ceiling=2.0) == 0.0


def test_compute_confidence_custom_ceiling():
    assert compute_confidence(1.0, ceiling=4.0) == 25.0
    assert compute_confidence(4.0, ceiling=4.0) == 100.0
