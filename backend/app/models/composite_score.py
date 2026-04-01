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


DEFAULT_WEIGHTS = {
    "rr_ratio": 0.25,
    "expert_consensus": 0.25,
    "fundamental": 0.20,
    "technical": 0.20,
    "institutional": 0.10,
}


def normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    """Normalize weights to sum to 1.0."""
    total = sum(weights.values())
    if total <= 0:
        return dict(DEFAULT_WEIGHTS)
    return {k: v / total for k, v in weights.items()}


def compute_composite_score(
    rr_score: float,
    calibration_ceiling: float = 2.0,
    expert_analyses: list[dict] | None = None,
    dart_financials: dict | None = None,
    technicals: dict | None = None,
    investor_trend: dict | None = None,
    confidence_grades: dict[str, str] | None = None,
    weights: dict[str, float] | None = None,
) -> float:
    """Compute multi-factor composite score (0–100).

    Aggregates 5 sub-scores with configurable weights, then applies
    a data quality multiplier.
    """
    w = normalize_weights(weights) if weights else dict(DEFAULT_WEIGHTS)

    # 1. R/R ratio sub-score
    rr_sub = score_rr_ratio(rr_score, ceiling=calibration_ceiling)

    # 2. Expert consensus sub-score
    expert_sub = score_expert_consensus(expert_analyses or [])

    # 3. Fundamental quality sub-score
    fins = dart_financials or {}
    fundamental_sub = score_fundamental(
        per=fins.get("per") or fins.get("dart_per"),
        roe=fins.get("roe") or fins.get("dart_roe"),
        debt_ratio=fins.get("debt_ratio") or fins.get("dart_debt_ratio"),
        operating_margin=fins.get("operating_margin") or fins.get("dart_operating_margin"),
    )

    # 4. Technical momentum sub-score
    tech = technicals or {}
    macd_data = tech.get("macd") or {}
    technical_sub = score_technical_momentum(
        rsi=tech.get("rsi"),
        macd_histogram=macd_data.get("histogram"),
        macd_histogram_prev=macd_data.get("histogram_prev"),
        volume_trend_pct=tech.get("volume_trend_pct"),
    )

    # 5. Institutional flow sub-score
    trend = investor_trend or {}
    institutional_sub = score_institutional_flow(
        foreign_net=float(trend.get("foreign_net_buy", 0) or 0),
        institution_net=float(trend.get("institution_net_buy", 0) or 0),
    )

    # Weighted sum
    raw = (
        w.get("rr_ratio", 0.25) * rr_sub
        + w.get("expert_consensus", 0.25) * expert_sub
        + w.get("fundamental", 0.20) * fundamental_sub
        + w.get("technical", 0.20) * technical_sub
        + w.get("institutional", 0.10) * institutional_sub
    )

    # Data quality multiplier
    quality = compute_data_quality_multiplier(confidence_grades or {})

    return min(max(raw * quality * 100, 0.0), 100.0)
