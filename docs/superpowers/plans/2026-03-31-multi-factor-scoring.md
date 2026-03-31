# Multi-Factor Composite Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-formula confidence scoring with a configurable 5-factor composite score, with factor weights adjustable via the Settings UI.

**Architecture:** A new pure-function module (`composite_score.py`) computes weighted sub-scores from data already in the pipeline. The composite score replaces `compute_confidence()` as the `confidence` value. Factor weights are stored in `risk_config` (SQLite key-value) and exposed via 5 sliders in SettingsView.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, React 19, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-31-multi-factor-scoring-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `backend/app/models/composite_score.py` | **NEW** — 5 sub-score functions + `compute_composite_score()` + weight normalization. Pure functions, no I/O. |
| `backend/tests/test_composite_score.py` | **NEW** — Unit tests for all sub-scores and composite function |
| `backend/app/models/signal.py` | Remove `compute_confidence()` |
| `backend/app/agents/market_scanner.py` | Import composite scorer, call at Stage 4.5, replace `compute_confidence()` usage |
| `backend/app/agents/risk_manager.py` | Rename `min_rr_score` gate → `min_composite_score`, gate on confidence |
| `backend/app/routers/agents.py` | Add 5 weight fields + rename `min_rr_score` → `min_composite_score` in `RiskConfigUpdate` and `_format_risk_config` |
| `frontend/src/types.ts` | Add 5 weight fields + rename `min_rr_score` → `min_composite_score` in `RiskConfig` |
| `frontend/src/components/SettingsView.tsx` | Add "Multi-Factor Weights" section, replace `min_rr_score` slider |

---

### Task 1: Core composite scoring module — sub-score functions

**Files:**
- Create: `backend/app/models/composite_score.py`
- Create: `backend/tests/test_composite_score.py`

- [ ] **Step 1: Write failing tests for all 5 sub-scores and data quality multiplier**

```python
# backend/tests/test_composite_score.py
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
        # agreement=1.0*0.6 + avg_conf=0.85*0.4 = 0.6 + 0.34 = 0.94
        assert abs(score - 0.94) < 0.01

    def test_split_opinions(self):
        experts = [
            {"view": "bullish", "confidence": 0.6},
            {"view": "bearish", "confidence": 0.5},
            {"view": "neutral", "confidence": 0.4},
        ]
        score = score_expert_consensus(experts)
        # agreement=1/3*0.6 + avg_conf=0.5*0.4 = 0.2 + 0.2 = 0.4
        assert abs(score - 0.4) < 0.01

    def test_empty_experts(self):
        assert score_expert_consensus([]) == 0.5


class TestScoreFundamental:
    def test_excellent_fundamentals(self):
        # PER=10 → 1-10/40=0.75, ROE=20 → 20/30=0.67, debt=50 → 1-50/200=0.75, margin=20 → 20/25=0.8
        score = score_fundamental(per=10.0, roe=20.0, debt_ratio=50.0, operating_margin=20.0)
        expected = (0.75 + 20/30 + 0.75 + 0.8) / 4
        assert abs(score - expected) < 0.01

    def test_poor_fundamentals(self):
        score = score_fundamental(per=50.0, roe=2.0, debt_ratio=250.0, operating_margin=1.0)
        assert score < 0.2

    def test_missing_all(self):
        assert score_fundamental() == 0.5

    def test_partial_data(self):
        # Only PER=15 → 1-15/40=0.625
        score = score_fundamental(per=15.0)
        assert abs(score - 0.625) < 0.01

    def test_negative_per_ignored(self):
        # Negative PER (loss-making) is excluded
        score = score_fundamental(per=-5.0, roe=10.0)
        # Only ROE counts: 10/30 = 0.333
        assert abs(score - 10/30) < 0.01


class TestScoreTechnicalMomentum:
    def test_bullish_technicals(self):
        score = score_technical_momentum(rsi=60.0, macd_histogram=0.5, macd_histogram_prev=0.3, volume_trend_pct=60.0)
        # rsi=60 → 0.5+(60-50)/20*0.5=0.75, macd>0 rising→1.0, volume=60>50→1.0
        # mean(0.75, 1.0, 1.0) ≈ 0.917
        assert score > 0.8

    def test_bearish_technicals(self):
        score = score_technical_momentum(rsi=25.0, macd_histogram=-0.3, macd_histogram_prev=-0.1, volume_trend_pct=-40.0)
        assert score < 0.3

    def test_overbought(self):
        score = score_technical_momentum(rsi=85.0)
        # RSI>80 → 0.3
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_composite_score.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.composite_score'`

- [ ] **Step 3: Implement all sub-score functions**

```python
# backend/app/models/composite_score.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_composite_score.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/composite_score.py backend/tests/test_composite_score.py
git commit -m "feat(scoring): add 5 sub-score functions and data quality multiplier"
```

---

### Task 2: Composite score aggregation function

**Files:**
- Modify: `backend/app/models/composite_score.py`
- Modify: `backend/tests/test_composite_score.py`

- [ ] **Step 1: Write failing tests for `compute_composite_score` and weight normalization**

Append to `backend/tests/test_composite_score.py`:

```python
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
        # R/R sub-score is 1.0, weighted at 50% → dominates
        assert score > 40

    def test_weights_auto_normalize(self):
        # Weights don't sum to 1.0 — should auto-normalize
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
        # Equal weights (5x1.0 normalized = 0.2 each) ≠ default weights (0.25/0.25/0.20/0.20/0.10)
        # But both should be valid scores in 0–100 range
        assert 0 < score_equal <= 100
        assert 0 < score_default <= 100

    def test_missing_optional_data(self):
        # Minimal call — only rr_score is truly required
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
        # Empty grades → multiplier 1.0, so no penalty
        assert score_without >= score_with
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd backend && python -m pytest tests/test_composite_score.py::TestCompositeScore -v`
Expected: FAIL — `compute_composite_score` doesn't accept these arguments yet

- [ ] **Step 3: Implement `compute_composite_score`**

Append to `backend/app/models/composite_score.py`:

```python
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
```

- [ ] **Step 4: Run all composite score tests**

Run: `cd backend && python -m pytest tests/test_composite_score.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/composite_score.py backend/tests/test_composite_score.py
git commit -m "feat(scoring): add compute_composite_score with weight normalization"
```

---

### Task 3: Wire composite score into market scanner

**Files:**
- Modify: `backend/app/agents/market_scanner.py:1-14` (imports)
- Modify: `backend/app/agents/market_scanner.py:288-392` (Stage 4.5 + signal persist + event emit)
- Modify: `backend/app/models/signal.py:76-85` (remove `compute_confidence`)

- [ ] **Step 1: Update imports in market_scanner.py**

Replace:
```python
from app.models.signal import compute_rr_score, compute_confidence
```
With:
```python
from app.models.signal import compute_rr_score
from app.models.composite_score import compute_composite_score
```

- [ ] **Step 2: Add composite score computation at Stage 4.5**

After the existing `signal_analysis.rr_score = compute_rr_score(...)` line (around line 288-290), add:

```python
        # --- Stage 4.5: Multi-factor composite score ---
        factor_weights = {
            "rr_ratio": float(self._risk_config.get("weight_rr_ratio", "0.25")),
            "expert_consensus": float(self._risk_config.get("weight_expert_consensus", "0.25")),
            "fundamental": float(self._risk_config.get("weight_fundamental", "0.20")),
            "technical": float(self._risk_config.get("weight_technical", "0.20")),
            "institutional": float(self._risk_config.get("weight_institutional", "0.10")),
        }
        composite_score = compute_composite_score(
            rr_score=signal_analysis.rr_score,
            calibration_ceiling=float(self._risk_config.get("calibration_ceiling", "2.0")),
            expert_analyses=expert_analyses,
            dart_financials=dart_financials,
            technicals=indicators,
            investor_trend=investor_trend,
            confidence_grades=confidence_grades,
            weights=factor_weights,
        )
```

- [ ] **Step 3: Replace `compute_confidence()` calls with composite score**

In the signal INSERT query (around line 356), replace:
```python
round(compute_confidence(signal_analysis.rr_score, ceiling=float(self._risk_config.get("calibration_ceiling", "2.0"))) / 100, 4),
```
With:
```python
round(composite_score / 100, 4),
```

In the `emit_event("signal.generated", ...)` call (around line 389), replace:
```python
"confidence": round(compute_confidence(signal_analysis.rr_score, ceiling=float(self._risk_config.get("calibration_ceiling", "2.0"))) / 100, 4),
```
With:
```python
"confidence": round(composite_score / 100, 4),
```

- [ ] **Step 4: Remove `compute_confidence` from signal.py**

Delete the entire `compute_confidence` function from `backend/app/models/signal.py` (lines 76–85):

```python
def compute_confidence(rr_score: float, ceiling: float = 2.0) -> float:
    """
    Linear mapping from rr_score to 0–100% confidence.

    ceiling defines what rr_score maps to 100%.
    Scores below 0 clamp to 0%, above ceiling clamp to 100%.
    """
    if ceiling <= 0:
        return 0.0
    return min(max(rr_score / ceiling * 100, 0.0), 100.0)
```

- [ ] **Step 5: Remove old compute_confidence tests**

In `backend/tests/test_signal_models.py`, remove the `TestComputeConfidence` class (the 4 tests for `compute_confidence`). This function is replaced by the composite scorer.

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && python -m pytest -v`
Expected: All tests PASS (no remaining references to `compute_confidence`)

- [ ] **Step 7: Commit**

```bash
git add backend/app/agents/market_scanner.py backend/app/models/signal.py backend/app/models/composite_score.py backend/tests/test_signal_models.py
git commit -m "feat(scanner): wire composite score into pipeline, remove compute_confidence"
```

---

### Task 4: Rename min_rr_score → min_composite_score in risk manager

**Files:**
- Modify: `backend/app/agents/risk_manager.py:189-194` (gate logic)
- Modify: `backend/app/agents/risk_manager.py:278-293` (default config)

- [ ] **Step 1: Update the R/R score gate in `_validate_signal`**

In `backend/app/agents/risk_manager.py`, replace the existing rr_score gate (around lines 189–194):

```python
        # --- NEW: R/R score gate ---
        rr_score = signal.get("rr_score")
        if rr_score is not None:
            min_rr = float(risk_config.get("min_rr_score", "2.0"))
            if rr_score < min_rr:
                return f"R/R 점수 미달 ({rr_score:.2f} < {min_rr:.1f})"
```

With:

```python
        # --- Composite score gate ---
        confidence = signal.get("confidence")
        if confidence is not None:
            min_composite = float(risk_config.get("min_composite_score", "15"))
            composite_pct = confidence * 100  # confidence is 0–1, threshold is 0–100
            if composite_pct < min_composite:
                return f"복합 점수 미달 ({composite_pct:.1f}% < {min_composite:.0f}%)"
```

- [ ] **Step 2: Update default config fallback**

In `_load_risk_config` (around line 293), replace:
```python
                "min_rr_score": "0.3",
```
With:
```python
                "min_composite_score": "15",
```

- [ ] **Step 3: Update risk validation tests**

In `backend/tests/test_risk_validation.py`, update the test that checks rr_score rejection. Find the test named `test_rr_score_rejection` and replace it:

```python
@pytest.mark.asyncio
async def test_composite_score_rejection(risk_agent, mock_portfolio):
    """Signals with low composite score should be rejected."""
    signal = {
        "stock_code": "005930",
        "direction": "buy",
        "confidence": 0.05,  # 5% composite score
    }
    risk_config = {"min_composite_score": "15"}
    reason = await risk_agent._validate_signal(signal, risk_config, mock_portfolio)
    assert reason is not None
    assert "복합 점수 미달" in reason
```

Also update the test `test_sell_rejected_when_rr_too_low` (if it exists) to use `confidence` instead of `rr_score`:

```python
@pytest.mark.asyncio
async def test_sell_rejected_when_composite_too_low(risk_agent, mock_portfolio_with_position):
    """SELL signals should also be rejected if composite score is too low."""
    signal = {
        "stock_code": "005930",
        "direction": "sell",
        "confidence": 0.05,  # 5% composite score
    }
    risk_config = {"min_composite_score": "15"}
    reason = await risk_agent._validate_signal(signal, risk_config, mock_portfolio_with_position)
    assert reason is not None
    assert "복합 점수 미달" in reason
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_risk_validation.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/risk_manager.py backend/tests/test_risk_validation.py
git commit -m "feat(risk): rename min_rr_score gate to min_composite_score, threshold 15%"
```

---

### Task 5: Update backend API (routers/agents.py)

**Files:**
- Modify: `backend/app/routers/agents.py:21-42` (`RiskConfigUpdate`)
- Modify: `backend/app/routers/agents.py:85-109` (`_format_risk_config`)

- [ ] **Step 1: Update `RiskConfigUpdate` model**

In `backend/app/routers/agents.py`, replace `min_rr_score` and add weight fields. Change:

```python
    min_rr_score: float | None = None
    calibration_ceiling: float | None = None
```

To:

```python
    min_composite_score: float | None = None
    calibration_ceiling: float | None = None
    # Multi-factor weights
    weight_rr_ratio: float | None = None
    weight_expert_consensus: float | None = None
    weight_fundamental: float | None = None
    weight_technical: float | None = None
    weight_institutional: float | None = None
```

- [ ] **Step 2: Update `_format_risk_config`**

Replace:
```python
        "min_rr_score": float(config.get("min_rr_score", 0.3)),
```

With:
```python
        "min_composite_score": float(config.get("min_composite_score", 15)),
```

And add the weight fields after the `"min_hold_minutes"` line:

```python
        # Multi-factor weights
        "weight_rr_ratio": float(config.get("weight_rr_ratio", 0.25)),
        "weight_expert_consensus": float(config.get("weight_expert_consensus", 0.25)),
        "weight_fundamental": float(config.get("weight_fundamental", 0.20)),
        "weight_technical": float(config.get("weight_technical", 0.20)),
        "weight_institutional": float(config.get("weight_institutional", 0.10)),
```

- [ ] **Step 3: Run backend tests**

Run: `cd backend && python -m pytest -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/agents.py
git commit -m "feat(api): add multi-factor weight fields, rename min_rr_score to min_composite_score"
```

---

### Task 6: Update frontend types

**Files:**
- Modify: `frontend/src/types.ts:38-53` (`RiskConfig` interface)

- [ ] **Step 1: Update RiskConfig interface**

In `frontend/src/types.ts`, replace:
```typescript
  min_rr_score?: number;
```

With:
```typescript
  min_composite_score?: number;
```

And add after `min_hold_minutes`:
```typescript
  // Multi-factor weights
  weight_rr_ratio?: number;
  weight_expert_consensus?: number;
  weight_fundamental?: number;
  weight_technical?: number;
  weight_institutional?: number;
```

- [ ] **Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: Lint errors in `SettingsView.tsx` referencing `min_rr_score` (expected — Task 7 fixes this)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(types): add multi-factor weight fields, rename min_rr_score to min_composite_score"
```

---

### Task 7: Update SettingsView UI — replace min_rr_score, add weight sliders

**Files:**
- Modify: `frontend/src/components/SettingsView.tsx`

- [ ] **Step 1: Update DEFAULT_RISK**

Replace:
```typescript
  min_rr_score: 0.3,
```

With:
```typescript
  min_composite_score: 15,
```

And add after `min_hold_minutes: 0`:
```typescript
  weight_rr_ratio: 0.25,
  weight_expert_consensus: 0.25,
  weight_fundamental: 0.20,
  weight_technical: 0.20,
  weight_institutional: 0.10,
```

- [ ] **Step 2: Update riskDirty comparison**

Replace:
```typescript
    riskForm.min_rr_score !== riskBase.min_rr_score ||
```

With:
```typescript
    riskForm.min_composite_score !== riskBase.min_composite_score ||
```

And add after the `min_hold_minutes` comparison line:
```typescript
    riskForm.weight_rr_ratio !== riskBase.weight_rr_ratio ||
    riskForm.weight_expert_consensus !== riskBase.weight_expert_consensus ||
    riskForm.weight_fundamental !== riskBase.weight_fundamental ||
    riskForm.weight_technical !== riskBase.weight_technical ||
    riskForm.weight_institutional !== riskBase.weight_institutional;
```

- [ ] **Step 3: Replace min_rr_score slider with min_composite_score**

Replace the entire `{/* Min R/R score */}` block (lines ~458–476):

```typescript
              {/* Min composite score */}
              <div className="setting-field">
                <label className="setting-label">
                  최소 복합 점수
                  <span className="setting-hint">복합 점수가 이 값 미만이면 자동 거부됩니다 (0–100)</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={1}
                    value={riskForm.min_composite_score ?? 15}
                    onChange={(e) => setRiskForm({ ...riskForm, min_composite_score: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{riskForm.min_composite_score ?? 15}%</span>
                </div>
              </div>
```

- [ ] **Step 4: Update calibration ceiling hint text**

Replace the hint for calibration ceiling:
```typescript
                  <span className="setting-hint">이 R/R 스코어를 신뢰도 100%로 매핑합니다 (높을수록 보수적)</span>
```
With:
```typescript
                  <span className="setting-hint">R/R 서브스코어 정규화 기준값 (이 R/R 스코어 = 서브스코어 1.0)</span>
```

- [ ] **Step 5: Add Multi-Factor Weights section**

After the `{/* Calibration ceiling */}` block and before `{/* Sector concentration */}`, add:

```typescript
              {/* Multi-Factor Weights */}
              <div style={{ fontSize: '0.85em', fontWeight: 600, color: 'var(--text-secondary, #666)', marginBottom: '12px', marginTop: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>복합 점수 가중치</div>

              <div className="setting-field">
                <label className="setting-label">
                  R/R 비율
                  <span className="setting-hint">시나리오 기반 위험/보상 비율</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={riskForm.weight_rr_ratio ?? 0.25}
                    onChange={(e) => setRiskForm({ ...riskForm, weight_rr_ratio: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{((riskForm.weight_rr_ratio ?? 0.25) * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="setting-field">
                <label className="setting-label">
                  전문가 합의
                  <span className="setting-hint">전문가 패널 의견 일치도 + 신뢰도</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={riskForm.weight_expert_consensus ?? 0.25}
                    onChange={(e) => setRiskForm({ ...riskForm, weight_expert_consensus: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{((riskForm.weight_expert_consensus ?? 0.25) * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="setting-field">
                <label className="setting-label">
                  펀더멘털
                  <span className="setting-hint">PER, ROE, 부채비율, 영업이익률</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={riskForm.weight_fundamental ?? 0.20}
                    onChange={(e) => setRiskForm({ ...riskForm, weight_fundamental: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{((riskForm.weight_fundamental ?? 0.20) * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="setting-field">
                <label className="setting-label">
                  기술적 모멘텀
                  <span className="setting-hint">RSI, MACD, 거래량 추세</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={riskForm.weight_technical ?? 0.20}
                    onChange={(e) => setRiskForm({ ...riskForm, weight_technical: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{((riskForm.weight_technical ?? 0.20) * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="setting-field">
                <label className="setting-label">
                  기관/외국인 수급
                  <span className="setting-hint">외국인/기관 순매수 추세</span>
                </label>
                <div className="token-input-row">
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={riskForm.weight_institutional ?? 0.10}
                    onChange={(e) => setRiskForm({ ...riskForm, weight_institutional: Number(e.target.value) })}
                    className="token-slider"
                  />
                  <span className="token-value">{((riskForm.weight_institutional ?? 0.10) * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div style={{ fontSize: '0.8em', color: 'var(--text-tertiary, #999)', marginTop: '4px', marginBottom: '8px' }}>
                합계: {(((riskForm.weight_rr_ratio ?? 0.25) + (riskForm.weight_expert_consensus ?? 0.25) + (riskForm.weight_fundamental ?? 0.20) + (riskForm.weight_technical ?? 0.20) + (riskForm.weight_institutional ?? 0.10)) * 100).toFixed(0)}% (저장 시 자동 정규화)
              </div>
```

- [ ] **Step 6: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SettingsView.tsx
git commit -m "feat(ui): add multi-factor weight sliders, replace min_rr_score with min_composite_score"
```

---

### Task 8: Update DB defaults and migrate existing config

**Files:**
- Modify: `backend/data/trading.db` (via SQL)

- [ ] **Step 1: Update DB defaults**

```bash
cd backend && python -c "
import sqlite3
conn = sqlite3.connect('data/trading.db')
c = conn.cursor()

# Rename min_rr_score to min_composite_score
c.execute(\"DELETE FROM risk_config WHERE key = 'min_rr_score'\")
c.execute(\"INSERT OR REPLACE INTO risk_config (key, value) VALUES ('min_composite_score', '15')\")

# Add default weights
for key, val in [
    ('weight_rr_ratio', '0.25'),
    ('weight_expert_consensus', '0.25'),
    ('weight_fundamental', '0.20'),
    ('weight_technical', '0.20'),
    ('weight_institutional', '0.10'),
]:
    c.execute('INSERT OR REPLACE INTO risk_config (key, value) VALUES (?, ?)', (key, val))

conn.commit()
conn.close()
print('DB defaults updated successfully')
"
```

- [ ] **Step 2: Verify DB state**

```bash
cd backend && python -c "
import sqlite3
conn = sqlite3.connect('data/trading.db')
c = conn.cursor()
c.execute('SELECT key, value FROM risk_config ORDER BY key')
for row in c.fetchall():
    print(f'  {row[0]}: {row[1]}')
conn.close()
"
```

Expected: `min_composite_score: 15`, all 5 weight keys present, no `min_rr_score`.

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && python -m pytest -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/data/trading.db
git commit -m "feat(db): migrate min_rr_score to min_composite_score, add factor weight defaults"
```
