import math
import pytest

from app.models.composite_score import (
    compute_composite_score,
    compute_data_quality_multiplier,
    score_expert_consensus,
    score_fundamental,
    score_institutional_flow,
    score_rr_ratio,
    score_technical_momentum,
)


class TestScoreRrRatio:
    def test_perfect_rr(self):
        assert score_rr_ratio(2.0, ceiling=2.0) == 1.0

    def test_half_rr(self):
        assert score_rr_ratio(1.0, ceiling=2.0) == 0.5

    def test_zero_rr(self):
        assert score_rr_ratio(0.0, ceiling=2.0) == 0.0

    def test_negative_rr(self):
        assert score_rr_ratio(-0.5, ceiling=2.0) == 0.0

    def test_exceeds_ceiling(self):
        assert score_rr_ratio(5.0, ceiling=2.0) == 1.0

    def test_custom_ceiling(self):
        assert score_rr_ratio(1.5, ceiling=3.0) == 0.5


class TestScoreExpertConsensus:
    def test_unanimous_high_confidence(self):
        experts = [
            {"view": "bullish", "confidence": 0.9},
            {"view": "bullish", "confidence": 0.8},
            {"view": "bullish", "confidence": 0.85},
        ]
        score = score_expert_consensus(experts)
        assert abs(score - 0.94) < 0.01

    def test_split_opinions(self):
        experts = [
            {"view": "bullish", "confidence": 0.6},
            {"view": "bearish", "confidence": 0.5},
            {"view": "neutral", "confidence": 0.4},
        ]
        score = score_expert_consensus(experts)
        assert abs(score - 0.4) < 0.01

    def test_empty_experts(self):
        assert score_expert_consensus([]) == 0.5


class TestScoreFundamental:
    def test_excellent_fundamentals(self):
        score = score_fundamental(per=10.0, roe=20.0, debt_ratio=50.0, operating_margin=20.0)
        expected = (0.75 + 20/30 + 0.75 + 0.8) / 4
        assert abs(score - expected) < 0.01

    def test_poor_fundamentals(self):
        score = score_fundamental(per=50.0, roe=2.0, debt_ratio=250.0, operating_margin=1.0)
        assert score < 0.2

    def test_missing_all(self):
        assert score_fundamental() == 0.5

    def test_partial_data(self):
        score = score_fundamental(per=15.0)
        assert abs(score - 0.625) < 0.01

    def test_negative_per_ignored(self):
        score = score_fundamental(per=-5.0, roe=10.0)
        assert abs(score - 10/30) < 0.01


class TestScoreTechnicalMomentum:
    def test_bullish_technicals(self):
        score = score_technical_momentum(rsi=60.0, macd_histogram=0.5, macd_histogram_prev=0.3, volume_trend_pct=60.0)
        assert score > 0.8

    def test_bearish_technicals(self):
        score = score_technical_momentum(rsi=25.0, macd_histogram=-0.3, macd_histogram_prev=-0.1, volume_trend_pct=-40.0)
        assert score < 0.3

    def test_overbought(self):
        score = score_technical_momentum(rsi=85.0)
        assert abs(score - 0.3) < 0.01

    def test_no_data(self):
        assert score_technical_momentum() == 0.5


class TestScoreInstitutionalFlow:
    def test_strong_buying(self):
        score = score_institutional_flow(foreign_net=2_000_000_000, institution_net=1_000_000_000)
        assert score > 0.9

    def test_strong_selling(self):
        score = score_institutional_flow(foreign_net=-2_000_000_000, institution_net=-1_000_000_000)
        assert score < 0.1

    def test_neutral(self):
        score = score_institutional_flow(foreign_net=0, institution_net=0)
        assert abs(score - 0.5) < 0.01

    def test_zero_defaults(self):
        assert abs(score_institutional_flow() - 0.5) < 0.01


class TestDataQualityMultiplier:
    def test_all_a(self):
        grades = {"current_price": "A", "volume": "A", "dart_revenue": "A"}
        assert compute_data_quality_multiplier(grades) == 1.0

    def test_all_d(self):
        grades = {"current_price": "D", "volume": "D"}
        assert abs(compute_data_quality_multiplier(grades) - 0.3) < 0.01

    def test_mixed(self):
        grades = {"f1": "A", "f2": "B", "f3": "C", "f4": "D"}
        expected = (1.0 + 0.85 + 0.6 + 0.3) / 4
        assert abs(compute_data_quality_multiplier(grades) - expected) < 0.01

    def test_empty(self):
        assert compute_data_quality_multiplier({}) == 1.0
