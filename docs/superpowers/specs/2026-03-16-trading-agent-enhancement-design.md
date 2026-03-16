# Trading Agent Enhancement Design
**Date:** 2026-03-16
**Approach:** Vertical Slice (Phase A → B → C)

## Overview

Three-phase enhancement to the LLM-based KIS paper trading agent, inspired by gaps identified against the `kipeum86/stock-analysis-agent` reference repo. The enhancements add fundamental data (DART API), rigorous signal quality controls (confidence grading, scenario framework, critic agent), and rich React dashboard output — all layered onto the existing multi-agent event-driven architecture without breaking current interfaces.

---

## Phase A: DART Integration + Fundamental Analyst

### DartClient (`backend/app/services/dart_client.py`)

New service wrapping the DART OpenAPI (opendart.fss.or.kr). Requires `DART_API_KEY` env var (free registration at opendart.fss.or.kr).

**Data fetched and confidence grades:**

| Field | DART API Endpoint | Grade |
|---|---|---|
| 최근 4분기 매출/영업이익/순이익 | `fnlttSinglAcntAll` | A |
| EPS, BPS, PER, PBR | `fnlttSinglAcntAll` | A |
| 부채비율, 유동비율 | `fnlttSinglAcntAll` | A |
| 배당수익률 | `alotMatter` | B |

On any fetch failure → field grade set to D → hard gate triggers (signal aborted, no hallucination fallback).

**Corp code lookup:** DART uses 8-digit corp codes, not stock ticker codes. `DartClient` maintains a local mapping (fetched once via `corpCode.xml` DART endpoint, cached in SQLite `dart_corp_codes` table) to translate KIS stock codes to DART corp codes.

### Confidence Grading (`backend/app/models/confidence.py`)

```python
class DataConfidence(Enum):
    A = "A"  # filing-sourced, arithmetic verified
    B = "B"  # 2+ sources, ≤5% variance
    C = "C"  # single source, unverified
    D = "D"  # unavailable — hard gate triggers
```

`SignalContext` (the data object passed between MarketScannerAgent stages) gains:
```python
confidence_grades: dict[str, DataConfidence]  # keyed by field name
```

Critical fields requiring ≥ grade B: `current_price`, `volume`, `dart_revenue`, `dart_operating_profit`, `dart_per`. If any critical field is grade D → abort before Stage 5, emit `signal.failed`.

### Fundamental Analyst Expert (5th Expert)

Added as `기본적분석가` in `MarketScannerAgent` Stage 4 alongside the existing 4 experts. Runs in parallel via `asyncio.gather`.

- **Exclusive input:** DART financials (revenue trend, earnings quality, valuation ratios, balance sheet)
- **Shared context:** same technical indicator data available to all experts
- **Prompt focus:** revenue trend direction, earnings quality (operating vs net), valuation vs sector median, balance sheet health (debt ratio, current ratio), dividend sustainability

DART data is also injected into the shared context object passed to all existing experts and the Chief — so the Chief's final debate has fundamentals alongside technicals.

---

## Phase B: Scenario Framework + Critic Agent

### Signal Schema Extension (`backend/app/models/signal.py`)

Replaces the current `confidence: float` with a structured scenario analysis:

```python
class Scenario(BaseModel):
    label: str           # "강세" / "기본" / "약세"
    price_target: float  # absolute price target (KRW)
    upside_pct: float    # % from current price (negative = downside)
    probability: float   # 0.0–1.0; all 3 must sum to 1.0 ±0.01

class SignalAnalysis(BaseModel):
    bull: Scenario
    base: Scenario
    bear: Scenario
    rr_score: float      # (bull.upside_pct * bull.prob + base.upside_pct * base.prob)
                         #  / abs(bear.upside_pct * bear.prob)
    variant_view: str    # specific market misconception this signal exploits
    expert_stances: dict[str, str]  # expert name → "bullish"/"bearish"/"neutral"
```

**DB migration:** `signals` table gains `scenarios_json TEXT`, `variant_view TEXT`, `rr_score REAL`, `expert_stances_json TEXT`. Existing `confidence` column retained (populated from `rr_score` normalized via sigmoid for backward compatibility).

### Chief Analyst Prompt Update

Chief's prompt updated to produce structured JSON output with three scenarios + explicit probabilities. The variant view field must reference a concrete data point (e.g. "시장은 3Q 영업이익 컨센서스를 15% 과소평가 중"), not generic language ("리스크 대비 기회").

### RiskManager Auto-Approval Gate

`risk_config` table gains: `min_rr_score REAL DEFAULT 2.0`

Auto-approval logic becomes:
```
signal.approved iff:
  signal.rr_score >= risk_config.min_rr_score
  AND all critical confidence_grades >= B
  AND critic_result == "pass"
```

Frontend risk config panel gains a "최소 R/R 점수" slider (range 1.0–5.0, step 0.1).

### SignalCriticAgent (`backend/app/agents/signal_critic.py`)

Not a scheduled agent. Invoked imperatively by `MarketScannerAgent` after Stage 5, before `signal.generated`. Registered in `main.py` lifespan (for consistent lifecycle management) but has no event subscriptions.

**5-item rubric:**

| # | Check | Pass Condition |
|---|---|---|
| 1 | Scenario completeness | All 3 scenarios present; probabilities sum to 1.0 ±0.01 |
| 2 | Data confidence | No critical field at grade D; key fields ≥ grade B |
| 3 | R/R arithmetic | Computed R/R matches declared value within 5% tolerance |
| 4 | Expert dissent | At least one expert expressed a non-consensus stance |
| 5 | Variant view specificity | `variant_view` references a concrete data point, not generic risk language |

**Revision loop:**
- Fail → critic returns structured feedback → Chief re-runs with critique injected → critic re-checks once
- Second fail → `signal.rejected` with `reason: "critic_failed"`, logged to `agent_logs`
- Max 1 revision to bound latency

**Integration in MarketScannerAgent:**
```
Stage 5: Chief debate → SignalAnalysis JSON
    ↓
Stage 6: SignalCriticAgent.review(signal_analysis, expert_outputs, confidence_grades)
    → pass:  proceed to signal.generated
    → fail:  1 revision attempt
        → pass:  proceed
        → fail:  signal.rejected (logged)
```

---

## Phase C: Rich React Dashboard Output

### New Components

**`SignalCard.tsx`** — replaces current plain-text signal display in the signals panel.

Layout:
```
┌─────────────────────────────────────────────────────┐
│  삼성전자 (005930)          BUY    R/R: 2.8  [A등급] │
├──────────────┬──────────────┬───────────────────────┤
│  강세 시나리오  │  기본 시나리오  │    약세 시나리오        │
│   +18% ↑    │    +7% →    │     -9% ↓            │
│   확률: 35%  │   확률: 45%  │    확률: 20%           │
├─────────────────────────────────────────────────────┤
│  Variant View: 시장은 HBM 경쟁 심화를 과대평가 중...    │
├─────────────────────────────────────────────────────┤
│  전문가 패널                                           │
│  기술적 ✅  거시경제 ✅  심리 ⚠️  리스크 ✅  기본적 ✅   │
├─────────────────────────────────────────────────────┤
│  Critic: ✅ 통과 (1차)    데이터 신뢰도: A등급           │
└─────────────────────────────────────────────────────┘
```

**`ScenarioChart.tsx`** — horizontal range bar showing bull/base/bear price targets vs current price. Implemented with plain SVG (no new charting library).

**`FundamentalsKPI.tsx`** — compact tile row of DART-sourced metrics with confidence grade badges:

| Tile | Value | Grade Badge |
|---|---|---|
| PER | 12.4x | 🟢 A |
| PBR | 1.2x | 🟢 A |
| EPS YoY | +18% | 🟢 A |
| 부채비율 | 32% | 🟢 A |
| 영업이익률 | 14.2% | 🟢 A |

Grade badge colors: A=green, B=yellow, C=orange, D=red (not shown in signal — hard gate prevents D from reaching UI).

### API Extension

`GET /api/signals` response extended with new fields:
```json
{
  "scenarios": { "bull": {...}, "base": {...}, "bear": {...} },
  "rr_score": 2.8,
  "variant_view": "...",
  "confidence_grades": { "current_price": "A", "dart_per": "A", ... },
  "expert_stances": { "기술적분석가": "bullish", ... },
  "critic_result": "pass",
  "dart_fundamentals": { "per": 12.4, "pbr": 1.2, ... }
}
```

Existing fields unchanged. No breaking changes to current consumers.

**No new npm dependencies** — SVG for charts, existing CSS for styling.

---

## Environment Changes

Add to `.env.example`:
```
DART_API_KEY=            # 금융감독원 DART OpenAPI key (free: opendart.fss.or.kr)
```

---

## Database Migrations

| Table | Change |
|---|---|
| `signals` | Add `scenarios_json TEXT`, `variant_view TEXT`, `rr_score REAL`, `expert_stances_json TEXT` |
| `risk_config` | Add `min_rr_score REAL DEFAULT 2.0` |
| `dart_corp_codes` | New table: `stock_code TEXT PK, corp_code TEXT, corp_name TEXT, cached_at TEXT` |

---

## Vertical Slice Build Order

One end-to-end slice for a single stock before expanding breadth:

1. **DartClient** — `fetch()` for one corp_code, confidence grading, unit test with real API
2. **Signal schema extension** — `Scenario`, `SignalAnalysis` models + DB migration
3. **Fundamental Analyst expert** — 5th expert in Stage 4, DART as shared context, Chief prompt updated
4. **SignalCriticAgent** — 5-item rubric, revision loop, wired into Stage 6
5. **RiskManager gate** — `min_rr_score` in risk_config, updated auto-approval logic
6. **API response extension** — `/api/signals` returns new fields
7. **React components** — `SignalCard`, `FundamentalsKPI`, `ScenarioChart`

Steps 1–2 have no Claude calls (pure data layer). Steps 3–5 extend existing agent code minimally. Steps 6–7 are purely additive.

---

## Success Criteria

- A signal for 삼성전자 flows end-to-end: DART data fetched → 5 experts debate → Chief produces scenarios → critic passes → signal displayed in dashboard with KPI tiles and scenario chart
- Signal is auto-approved only when `rr_score >= 2.0` AND all critical data ≥ grade B AND critic passes
- If DART fetch fails, signal is rejected before Claude calls are made (no wasted API cost)
- No existing functionality broken (chat, portfolio monitoring, order execution unchanged)
