"""Multi-factor composite scoring — 5 sub-scores + data quality multiplier."""
from __future__ import annotations

import math
from collections import Counter


def score_rr_ratio(rr_score: float, ceiling: float = 2.0) -> float:
    """Normalize R/R score to 0–1 using calibration ceiling."""
    if ceiling <= 0:
        return 0.0
    return min(max(rr_score / ceiling, 0.0), 1.0)


def score_expert_consensus(expert_analyses: list[dict]) -> float:
    """Score expert panel agreement and confidence.

    Formula: agreement_ratio * 0.6 + avg_confidence * 0.4
    """
    if not expert_analyses:
        return 0.5

    views = [e.get("view", "neutral") for e in expert_analyses]
    counts = Counter(views)
    majority_count = counts.most_common(1)[0][1]
    agreement_ratio = majority_count / len(views)

    confidences = [float(e.get("confidence", 0.0)) for e in expert_analyses]
    avg_confidence = sum(confidences) / len(confidences)

    return agreement_ratio * 0.6 + avg_confidence * 0.4


def score_fundamental(
    per: float | None = None,
    roe: float | None = None,
    debt_ratio: float | None = None,
    operating_margin: float | None = None,
) -> float:
    """Score fundamental quality from DART financials.

    Each metric is independently normalized to 0–1. Missing metrics are excluded.
    """
    components: list[float] = []

    if per is not None and per > 0:
        components.append(min(max(1.0 - per / 40.0, 0.0), 1.0))
    if roe is not None:
        components.append(min(max(roe / 30.0, 0.0), 1.0))
    if debt_ratio is not None:
        components.append(min(max(1.0 - debt_ratio / 200.0, 0.0), 1.0))
    if operating_margin is not None:
        components.append(min(max(operating_margin / 25.0, 0.0), 1.0))

    return sum(components) / len(components) if components else 0.5


def score_technical_momentum(
    rsi: float | None = None,
    macd_histogram: float | None = None,
    macd_histogram_prev: float | None = None,
    volume_trend_pct: float | None = None,
) -> float:
    """Score technical momentum from indicators.

    RSI, MACD histogram direction, and volume trend each produce a 0–1 score.
    """
    scores: list[float] = []

    if rsi is not None:
        if rsi > 80:
            scores.append(0.3)
        elif rsi >= 50:
            scores.append(0.5 + (rsi - 50) / 20.0 * 0.5)
        elif rsi >= 40:
            scores.append(0.3 + (rsi - 40) / 10.0 * 0.2)
        elif rsi >= 30:
            scores.append(0.2 + (rsi - 30) / 10.0 * 0.1)
        else:
            scores.append(0.4)

    if macd_histogram is not None:
        rising = macd_histogram_prev is not None and macd_histogram > macd_histogram_prev
        if macd_histogram > 0:
            scores.append(1.0 if rising else 0.6)
        else:
            scores.append(0.4 if rising else 0.2)

    if volume_trend_pct is not None:
        if volume_trend_pct >= 50:
            scores.append(1.0)
        elif volume_trend_pct >= 0:
            scores.append(0.5 + volume_trend_pct / 50.0 * 0.5)
        elif volume_trend_pct >= -30:
            scores.append(0.2 + (volume_trend_pct + 30) / 30.0 * 0.3)
        else:
            scores.append(0.2)

    return sum(scores) / len(scores) if scores else 0.5


def score_institutional_flow(
    foreign_net: float = 0,
    institution_net: float = 0,
    scale: float = 1_000_000_000,
) -> float:
    """Score institutional/foreign investor flow via sigmoid normalization.

    scale: KRW amount that maps to ~0.73 (one sigmoid unit). Default 10억원.
    """
    combined = foreign_net + institution_net
    return 1.0 / (1.0 + math.exp(-combined / scale))


def compute_data_quality_multiplier(confidence_grades: dict[str, str]) -> float:
    """Compute data quality multiplier from confidence grades.

    A=1.0, B=0.85, C=0.6, D=0.3. Returns mean of all grades, or 1.0 if empty.
    """
    if not confidence_grades:
        return 1.0
    grade_values = {"A": 1.0, "B": 0.85, "C": 0.6, "D": 0.3}
    values = [grade_values.get(g, 0.6) for g in confidence_grades.values()]
    return sum(values) / len(values)


def compute_composite_score(*args, **kwargs):
    """Composite score aggregating all sub-scores. Added in Task 2."""
    raise NotImplementedError("Added in Task 2")
