# Multi-Factor Composite Scoring (Approach C) — Design Spec

**Date:** 2026-03-31
**Status:** Approved
**Replaces:** Linear confidence mapping from Approach B (`compute_confidence()`)

---

## Problem Statement

The current signal quality assessment compresses everything into a single number — `rr_score` — which is the ratio of probability-weighted upside to probability-weighted downside from the Chief Analyst's 3 scenarios. This ignores expert consensus strength, data quality, fundamental alignment, technical momentum, and institutional flow — all of which are already collected by the pipeline but discarded at scoring time.

**Goal:** Replace the single-formula score with a multi-factor composite that weighs multiple independent quality signals, producing a more meaningful 0–100 confidence score. Factor weights must be configurable via the Settings UI.

---

## Architecture

A new pure-function module (`composite_score.py`) computes a weighted composite from 5 sub-scores, each normalized to 0–1. A data quality multiplier scales the result. The composite replaces `compute_confidence()` as the `confidence` value stored in the DB and shown in the UI.

**Pipeline position:** After Chief debate returns `SignalAnalysis` and `compute_rr_score()` runs (Stage 4.5), before Critic review (Stage 5). All required data is already in scope — no new data fetching needed.

---

## Section 1: Factor Definitions

### 5 Factors + Data Quality Multiplier

| Factor | Default Weight | Data Source |
|--------|---------------|-------------|
| R/R Ratio | 25% | `compute_rr_score()` output + `calibration_ceiling` |
| Expert Consensus | 25% | Expert panel results (view + confidence) |
| Fundamental Quality | 20% | DART financials (PER, ROE, debt ratio, operating margin) |
| Technical Momentum | 20% | Technicals dict (RSI, MACD histogram, volume trend) |
| Institutional Flow | 10% | `investor_trend` (foreign + institutional net buy) |

Data Quality is a multiplier (0–1), not a 6th weighted factor.

### Sub-Score Formulas

**1. R/R Sub-score**
```python
rr_sub = min(max(rr_score / calibration_ceiling, 0), 1.0)
```
Reuses existing `calibration_ceiling` config (default 2.0). An rr_score of 2.0 = perfect 1.0 sub-score.

**2. Expert Consensus Sub-score**
```python
majority_view = most common view among experts (bullish/bearish/neutral)
agreement_ratio = count(majority_view) / total_experts
avg_confidence = mean of all experts' confidence values (0–1)
expert_sub = agreement_ratio * 0.6 + avg_confidence * 0.4
```
6/6 agree with avg confidence 0.8 → 0.92. Split opinions with low confidence → ~0.3.

**3. Fundamental Quality Sub-score**
```python
components = []
if PER exists and PER > 0:  components.append(clamp(1 - PER/40, 0, 1))
if ROE exists:              components.append(clamp(ROE/30, 0, 1))
if debt_ratio exists:       components.append(clamp(1 - debt_ratio/200, 0, 1))
if operating_margin exists: components.append(clamp(operating_margin/25, 0, 1))
fundamental_sub = mean(components) if components else 0.5
```
Each metric independently normalized. Missing metrics excluded (not penalized — data quality handles that). PER 40 = neutral, ROE 30% = perfect, debt 200% = zero, margin 25% = perfect.

**4. Technical Momentum Sub-score**
```python
rsi_score:
  RSI 50–70: linear map to 0.5–1.0 (bullish momentum)
  RSI 40–50: linear map 0.3–0.5 (neutral-weak)
  RSI 30–40: 0.2–0.3 (oversold, potential reversal)
  RSI > 80: 0.3 (overbought penalty)
  RSI < 30: 0.4 (deeply oversold — contrarian opportunity but risky)

macd_score:
  histogram > 0 and rising: 1.0
  histogram > 0 and falling: 0.6
  histogram < 0 and rising: 0.4
  histogram < 0 and falling: 0.2

volume_score:
  volume_trend_pct > 50%: 1.0
  volume_trend_pct 0%: 0.5
  volume_trend_pct < -30%: 0.2
  Linear interpolation between these points

technical_sub = mean(available_scores) or 0.5
```

**5. Institutional Flow Sub-score**
```python
combined = foreign_net_buy + institution_net_buy
flow_sub = 1 / (1 + exp(-combined / scale_factor))
```
Sigmoid normalization: large positive → 1.0, large negative → 0.0, zero → 0.5. `scale_factor` is a constant tuned to typical KRW net buy ranges (initial value: 1_000_000_000 i.e. 10억원).

**Data Quality Multiplier**
```python
grade_values = {"A": 1.0, "B": 0.85, "C": 0.6, "D": 0.3}
quality = mean(grade_values[g] for g in confidence_grades.values())
```

**Final Composite**
```python
raw = sum(weight_i * subscore_i for each factor)
composite = raw * data_quality_multiplier * 100  # 0–100
```

---

## Section 2: Configuration

### New Config Keys (5)

| Key | Default | Type | UI Control |
|-----|---------|------|------------|
| `weight_rr_ratio` | 0.25 | float | Slider 0.0–0.5, step 0.05 |
| `weight_expert_consensus` | 0.25 | float | Slider 0.0–0.5, step 0.05 |
| `weight_fundamental` | 0.20 | float | Slider 0.0–0.5, step 0.05 |
| `weight_technical` | 0.20 | float | Slider 0.0–0.5, step 0.05 |
| `weight_institutional` | 0.10 | float | Slider 0.0–0.5, step 0.05 |

### Renamed Config Key (1)

| Old Key | New Key | Default | Purpose |
|---------|---------|---------|---------|
| `min_rr_score` | `min_composite_score` | 15 | Minimum composite score (0–100) to pass risk gate |

### Unchanged Config Keys

| Key | Purpose in new system |
|-----|----------------------|
| `calibration_ceiling` | Used inside R/R sub-score: `min(rr_score / ceiling, 1.0)` |

### Weight Normalization

Weights are auto-normalized on save: backend divides each weight by their sum. Users set relative importance without worrying about exact math. The response shows normalized values.

### UI Layout

A new "Multi-Factor Weights" subsection in SettingsView, below the existing confidence calibration controls. Each factor gets a labeled slider showing the percentage (e.g., "R/R Ratio: 25%"). A summary line shows "Total: 100% (auto-normalized)".

The old `min_rr_score` slider is replaced by `min_composite_score` with range 0–50, step 1, displayed as integer percentage.

---

## Section 3: Pipeline Integration

### Computation Point

In `market_scanner.py`, after Stage 4 (Chief debate) and rr_score computation, before Stage 5 (Critic):

```
Stage 4:   Chief debate → signal_analysis
Stage 4.1: compute_rr_score() → signal_analysis.rr_score
Stage 4.5: compute_composite_score() → composite_score (NEW)
Stage 5:   Critic review (unchanged)
Stage 6:   Persist signal — confidence = composite_score / 100
```

### Data Available at Stage 4.5

| Input | Source Variable |
|-------|----------------|
| `rr_score` | `signal_analysis.rr_score` |
| `expert_analyses` | `expert_analyses` (list of dicts from Stage 3) |
| `technicals` | `indicators` (dict from Stage 2) |
| `dart_financials` | `dart_financials` (dict from Stage 2.6) |
| `investor_trend` | `investor_trend` (dict from Stage 2.65) |
| `confidence_grades` | `confidence_grades` (dict from Stage 2/2.6) |
| Factor weights | `self._risk_config` (5 weight keys) |

### Risk Manager Changes

- `_validate_signal()`: rename `min_rr_score` gate to `min_composite_score` gate
- Gate checks `signal.get("confidence", 0) * 100 >= min_composite_score` (confidence is already the composite score / 100)
- Raw `rr_score` is still passed in signal events for logging, but no longer gated on
- Default fallback in `_load_risk_config()`: `min_composite_score: 15`

### Signal Event Payload

```python
{
    "signal_id": signal_id,
    "stock_code": stock_code,
    "direction": direction,
    "confidence": composite_score / 100,  # 0.0–1.0
    "rr_score": raw_rr_score,             # kept for analysis
    "critic_result": "pass",
}
```

### DB Storage

- `confidence` column: `composite_score / 100` (same 0–1 range as before)
- `rr_score` column: raw R/R ratio (unchanged)
- No schema changes needed

---

## Section 4: Files Modified

| File | Changes |
|------|---------|
| `backend/app/models/composite_score.py` | **NEW** — `compute_composite_score()`, 5 sub-score functions, data quality multiplier. Pure functions, no I/O. |
| `backend/app/models/signal.py` | Remove `compute_confidence()` (replaced by composite scorer) |
| `backend/app/agents/market_scanner.py` | Import composite scorer; call at Stage 4.5; replace `compute_confidence()` calls with composite score |
| `backend/app/agents/risk_manager.py` | Rename `min_rr_score` gate to `min_composite_score`; update default from 0.3 to 15; gate on confidence instead of rr_score |
| `backend/app/routers/agents.py` | Add 5 weight fields to `RiskConfigUpdate`; rename `min_rr_score` to `min_composite_score`; update `_format_risk_config()` |
| `frontend/src/types.ts` | Add 5 weight fields; rename `min_rr_score` to `min_composite_score` in `RiskConfig` |
| `frontend/src/components/SettingsView.tsx` | Add "Multi-Factor Weights" section with 5 sliders; replace `min_rr_score` slider with `min_composite_score`; show auto-normalize total |
| `backend/tests/test_composite_score.py` | **NEW** — Unit tests for all 5 sub-scores, data quality multiplier, composite function, weight normalization |

### Files NOT Changed

- `compute_rr_score()` in `signal.py` — unchanged, used inside R/R sub-score
- Expert panel (`market_scanner_experts.py`) — unchanged
- Signal critic (`signal_critic.py`) — unchanged
- Event bus flow — unchanged
- DB schema — no new columns or tables
- SELL/HOLD distinction — unchanged

---

## Section 5: Unchanged Behaviors

- `compute_rr_score()` formula stays the same
- Expert panel (6 experts + Chief + Critic) — unchanged
- Signal critic validation — unchanged
- Event bus flow (`signal.generated` → `signal.approved/rejected`) — unchanged
- SELL→HOLD hard gate — unchanged
- DB schema — no migrations needed
- All existing BUY/SELL validation in risk manager — unchanged (except threshold rename)

---

## Section 6: Future Considerations

- **IC-based dynamic weights:** Once enough trades are executed, compute Information Coefficient per factor and auto-adjust weights. This is a weight-update mechanism, not a scoring change.
- **Per-direction weights:** Different weight profiles for BUY vs SELL signals. Deferred — insufficient data to calibrate.
- **Sector-relative fundamentals:** Compare PER/ROE to sector averages instead of absolute thresholds. Requires sector benchmark data.
