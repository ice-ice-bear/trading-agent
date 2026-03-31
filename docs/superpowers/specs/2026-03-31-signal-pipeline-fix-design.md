# Signal Pipeline Fix — Design Spec

**Date:** 2026-03-31
**Status:** Approved
**Approach:** B (Data Pipeline + Formula + Gates), with clean extension points for future Approach C (Multi-Factor Scoring)

---

## Problem Statement

The trading agent system has never executed a trade. Three interconnected root causes create a deadlocked pipeline:

1. **Expert data starvation** — Investor trends, peer data, and DCF valuations are collected by the scanner but never passed to the expert panel prompts. Experts produce neutral/hedged opinions due to insufficient data.
2. **SELL signals for unheld stocks** — The Chief Analyst conflates "bearish sentiment" with "sell order." SELL signals are generated for stocks not in the portfolio, which are logically impossible to execute.
3. **Unreachable R/R threshold** — The `min_rr_score` default is 2.0, but actual signal scores range 0.01–0.15. The sigmoid confidence formula compresses all scores to ~50%. Every signal is rejected.

**Causal chain:**
```
Data starvation → neutral expert opinions → balanced scenarios
  → rr_score ≈ 0 → confidence ≈ 50% → risk manager rejects (threshold 2.0 vs actual 0.05)
    → 0 trades ever executed
```

## Design Philosophy

- Conservative-leaning (Approach A intent): the system should still reject most signals, but be *capable* of executing high-conviction ones
- All thresholds configurable via the existing Settings UI — no code changes needed to adjust aggressiveness
- Clean interfaces so future Approach C (multi-factor scoring) is a scoring-layer swap, not a rewrite

---

## Section 1: Expert Data Enrichment

### Current State

`_analyze_stock()` in `market_scanner.py` builds a `data_package` with only `stock`, `technicals`, and `portfolio_context`. The 4 generic experts (Technical, Momentum, Risk, Portfolio Strategist) called via `_call_expert()` only see these fields. Meanwhile, `investor_trend`, `dart_financials`, and `confidence_grades` are fetched but siloed — only the Fundamental and News/Macro experts (which have their own functions) access their respective data.

### Change

Enrich `data_package` before calling `run_expert_panel()`:

```python
data_package = {
    "stock": stock_info,
    "technicals": indicators,
    "portfolio_context": portfolio_context,
    "investor_trend": investor_trend,        # foreign/institutional flow
    "dart_summary": dart_summary,            # compact DART financials
    "news_summary": news_data,               # if available
    "confidence_grades": confidence_grades,   # data quality signals
}
```

Update `_call_expert()` prompt to include the relevant subset per expert specialty:

| Expert | Additional Data |
|--------|----------------|
| Technical Analyst | `investor_trend` (foreign/institutional flow confirms chart signals) |
| Momentum Trader | `investor_trend` |
| Risk Assessor | `confidence_grades` (data quality awareness) |
| Portfolio Strategist | `dart_summary`, `investor_trend` |

This is selective enrichment — each expert gets data relevant to their role, not a data dump.

Note: `dart_summary` is a compact subset of `dart_financials` containing key ratios (PER, PBR, ROE, debt ratio, revenue growth) rather than the full financial statements. This keeps expert prompts focused and within token limits.

### Files

- `backend/app/agents/market_scanner.py` — enrich `data_package` before `run_expert_panel()` call
- `backend/app/agents/market_scanner_experts.py` — update `_call_expert()` prompt template to include per-expert data sections

### Approach C Extension Point

`confidence_grades` flowing into experts means a future multi-factor scoring system can weight expert opinions by data quality.

---

## Section 2: SELL vs HOLD Distinction

### Current State

The Chief Analyst prompt offers three choices (`buy / sell / hold`) without clarifying that SELL means "liquidate existing position." When experts are bearish, Claude outputs SELL even when the stock isn't held. The risk manager has no SELL-specific validation — all position checks are inside `if direction == "buy":`.

### Change — Three Layers

**Layer 1: Prompt-level (Chief Analyst in `market_scanner_experts.py`)**

Add explicit direction rules to the Chief debate prompt:

```
## 매매 방향 규칙
- BUY: 이 종목을 신규 매수하라
- SELL: 보유 중인 포지션을 청산하라 (현재 보유 종목: {held_codes})
- HOLD: 관망 (매수하지도, 매도하지도 않음)

중요: SELL은 반드시 현재 보유 중인 종목에 대해서만 가능합니다.
{stock_code}가 보유 종목 목록에 없으면 SELL 대신 HOLD를 선택하세요.
```

**Layer 2: Hard gate (Market Scanner in `market_scanner.py`)**

After `run_chief_debate()` returns, before saving the signal:

```python
if signal_analysis.direction == "SELL" and stock_code not in portfolio_context["held_codes"]:
    signal_analysis.direction = "HOLD"
```

HOLD signals are not emitted as `signal.generated` events, so they stop flowing through the pipeline naturally.

**Layer 3: Risk Manager backup (`risk_manager.py`)**

Add SELL validation in `_validate_signal()`:

```python
if direction == "sell":
    held = any(p.get("stock_code") == stock_code for p in portfolio.positions)
    if not held:
        return f"미보유 종목 매도 불가 ({stock_code})"
```

### Files

- `backend/app/agents/market_scanner_experts.py` — Chief Analyst prompt update
- `backend/app/agents/market_scanner.py` — post-debate hard gate
- `backend/app/agents/risk_manager.py` — SELL validation block

---

## Section 3: R/R Score & Confidence Recalibration

### Current State

- `compute_rr_score()` produces values in the 0.01–0.15 range for typical balanced scenarios
- Default `min_rr_score` is 2.0 — 13-200x higher than actual outputs
- Sigmoid formula `1 / (1 + e^(-rr_score/2))` maps 0.01–0.15 to 50.0%–50.4% confidence — meaningless

### Change — Three Parts

**Part 1: Keep `compute_rr_score()` unchanged**

The formula is mathematically sound. The problem is threshold miscalibration. Preserving it maintains historical signal comparability. Future Approach C replaces this function.

**Part 2: Recalibrate default threshold**

Based on 32 historical signals (range -0.025 to 0.15, mean ~0.057):

| Setting | Old | New |
|---------|-----|-----|
| `min_rr_score` default | 2.0 | 0.3 |
| UI slider range | 0.5–5.0 | 0.1–3.0 |
| UI slider step | 0.1 | 0.05 |

Interpretation: rr_score 0.3 means expected upside is 30% of expected downside (weighted by probability). Conservative but achievable.

**Part 3: Replace confidence display formula**

Replace sigmoid with linear mapping:

```python
confidence = min(max(rr_score / calibration_ceiling * 100, 0), 100)
```

Where `calibration_ceiling` is a new config value (default: 2.0) — "what rr_score = 100% confidence."

| rr_score | Old (sigmoid) | New (linear, ceiling=2.0) |
|----------|--------------|---------------------------|
| 0.05 | 50.1% | 2.5% |
| 0.3 | 51.4% | 15% |
| 0.6 | 53.7% | 30% |
| 1.0 | 56.2% | 50% |
| 2.0 | 63.2% | 100% |

### New Config Fields

| Key | Default | UI Control | Purpose |
|-----|---------|------------|---------|
| `calibration_ceiling` | 2.0 | Slider 1.0–5.0, step 0.5 | Maps rr_score to 0–100% confidence display |

### Files

- `backend/app/models/signal.py` — no change to `compute_rr_score()`
- `backend/app/agents/market_scanner.py` — replace sigmoid with linear mapping at signal save (line 338) and event emit (line 371)
- `backend/app/agents/risk_manager.py` — update default `min_rr_score` from 2.0 to 0.3
- `frontend/src/components/SettingsView.tsx` — adjust slider range/step; add `calibration_ceiling` slider

### Approach C Extension Point

`calibration_ceiling` becomes a parameter of the future scoring system. The linear mapping can be swapped for a multi-factor composite without UI changes.

---

## Section 4: Risk Manager — Direction-Aware Validation

### Current State

`_validate_signal()` has common gates (rr_score, critic) followed by a single `if direction == "buy":` block containing all position validation. SELL signals fall through to `return None` (approved) with no validation.

### Change

Restructure into three blocks:

```
1. Common gates (both directions)
   - R/R score gate (existing, now with calibrated threshold)
   - Critic result gate (existing, unchanged)

2. if direction == "buy": (existing, unchanged)
   - Max positions
   - Concentration limit
   - Daily loss limit
   - Sector concentration

3. elif direction == "sell": (new)
   - Position existence check
   - Minimum hold time check (optional)
```

### New Config Fields

| Key | Default | UI Control | Purpose |
|-----|---------|------------|---------|
| `min_hold_minutes` | 0 | Number input (0 = disabled) | Minimum hold time before SELL allowed |

### Files

- `backend/app/agents/risk_manager.py` — add `elif direction == "sell":` block
- `frontend/src/components/SettingsView.tsx` — add `min_hold_minutes` field
- `frontend/src/types.ts` — add new fields to `RiskConfig` type

---

## Summary of All Changes

### Files Modified (5)

| File | Changes |
|------|---------|
| `backend/app/agents/market_scanner.py` | Enrich `data_package`; SELL→HOLD hard gate; replace sigmoid with linear confidence mapping |
| `backend/app/agents/market_scanner_experts.py` | Per-expert data in prompts; SELL/HOLD rules in Chief Analyst prompt |
| `backend/app/agents/risk_manager.py` | Direction-aware validation (common/BUY/SELL blocks); position-existence check; default threshold 0.3 |
| `frontend/src/components/SettingsView.tsx` | Adjust `min_rr_score` slider; add `calibration_ceiling` slider; add `min_hold_minutes` field |
| `frontend/src/types.ts` | Add `calibration_ceiling` and `min_hold_minutes` to `RiskConfig` |

### New Config Fields (2)

| Key | Default | Purpose |
|-----|---------|---------|
| `calibration_ceiling` | 2.0 | Maps rr_score to 0–100% confidence display |
| `min_hold_minutes` | 0 | Minimum hold time before SELL allowed (0 = disabled) |

### Default Changes (1)

| Key | Old | New |
|-----|-----|-----|
| `min_rr_score` | 2.0 | 0.3 |

### Unchanged

- `compute_rr_score()` formula
- All existing BUY validation logic
- Expert panel structure (6 experts + Chief + Critic)
- Event bus flow (`signal.generated` → `signal.approved/rejected`)
- Database schema
- Backend API endpoints

### Approach C Future Path

When ready, Approach C (multi-factor scoring) replaces:
- `compute_rr_score()` → multi-factor composite score
- `calibration_ceiling` → redefined by new scoring rubric
- Linear confidence mapping → factor-weighted confidence

Everything else from this spec (data enrichment, SELL/HOLD distinction, direction-aware validation) carries forward unchanged.
