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


class TestCompositeScore:
    def test_default_weights(self):
        score = compute_composite_score(
            rr_score=1.0,
            calibration_ceiling=2.0,
            expert_analyses=[
                {"view": "bullish", "confidence": 0.8},
                {"view": "bullish", "confidence": 0.7},
            ],
            dart_financials={"per": 10.0, "roe": 15.0, "debt_ratio": 80.0, "operating_margin": 12.0},
            technicals={"rsi": 55.0, "macd": {"histogram": 0.3}, "volume_trend_pct": 20.0},
            investor_trend={"foreign_net_buy": 500_000_000, "institution_net_buy": 300_000_000},
            confidence_grades={"current_price": "A", "volume": "A", "dart_revenue": "B"},
        )
        assert 0 < score <= 100

    def test_all_perfect_scores(self):
        score = compute_composite_score(
            rr_score=2.0,
            calibration_ceiling=2.0,
            expert_analyses=[{"view": "bullish", "confidence": 1.0}] * 6,
            dart_financials={"per": 5.0, "roe": 30.0, "debt_ratio": 10.0, "operating_margin": 25.0},
            technicals={"rsi": 65.0, "macd": {"histogram": 1.0}, "volume_trend_pct": 80.0},
            investor_trend={"foreign_net_buy": 5_000_000_000, "institution_net_buy": 5_000_000_000},
            confidence_grades={"f1": "A", "f2": "A"},
        )
        assert score > 90

    def test_all_worst_scores(self):
        score = compute_composite_score(
            rr_score=-1.0,
            calibration_ceiling=2.0,
            expert_analyses=[
                {"view": "bullish", "confidence": 0.1},
                {"view": "bearish", "confidence": 0.1},
                {"view": "neutral", "confidence": 0.1},
            ],
            dart_financials={"per": 60.0, "roe": 1.0, "debt_ratio": 300.0, "operating_margin": 0.5},
            technicals={"rsi": 85.0, "macd": {"histogram": -0.5}, "volume_trend_pct": -50.0},
            investor_trend={"foreign_net_buy": -5_000_000_000, "institution_net_buy": -5_000_000_000},
            confidence_grades={"f1": "D", "f2": "D"},
        )
        assert score < 15

    def test_custom_weights(self):
        weights = {
            "rr_ratio": 0.5,
            "expert_consensus": 0.1,
            "fundamental": 0.1,
            "technical": 0.1,
            "institutional": 0.2,
        }
        score = compute_composite_score(
            rr_score=2.0,
            calibration_ceiling=2.0,
            expert_analyses=[{"view": "neutral", "confidence": 0.3}],
            weights=weights,
        )
        assert score > 40

    def test_weights_auto_normalize(self):
        weights = {
            "rr_ratio": 1.0,
            "expert_consensus": 1.0,
            "fundamental": 1.0,
            "technical": 1.0,
            "institutional": 1.0,
        }
        score_equal = compute_composite_score(
            rr_score=1.0,
            calibration_ceiling=2.0,
            expert_analyses=[{"view": "bullish", "confidence": 0.8}] * 4,
            weights=weights,
        )
        score_default = compute_composite_score(
            rr_score=1.0,
            calibration_ceiling=2.0,
            expert_analyses=[{"view": "bullish", "confidence": 0.8}] * 4,
        )
        assert 0 < score_equal <= 100
        assert 0 < score_default <= 100

    def test_missing_optional_data(self):
        score = compute_composite_score(rr_score=0.5, calibration_ceiling=2.0)
        assert 0 <= score <= 100

    def test_empty_confidence_grades_no_penalty(self):
        score_with = compute_composite_score(
            rr_score=1.0,
            calibration_ceiling=2.0,
            confidence_grades={"f1": "A"},
        )
        score_without = compute_composite_score(
            rr_score=1.0,
            calibration_ceiling=2.0,
            confidence_grades={},
        )
        assert score_without >= score_with
