# Trading Agent Enhancement Design

**Date:** 2026-03-16
**Approach:** Vertical Slice (Phase A → B → C)

## Overview

Three-phase enhancement to the LLM-based KIS paper trading agent, inspired by gaps identified against the `kipeum86/stock-analysis-agent` reference repo. The enhancements add fundamental data (DART API), rigorous signal quality controls (confidence grading, scenario framework, critic agent), and rich React dashboard output — all layered onto the existing multi-agent event-driven architecture without breaking current interfaces.

---

## Existing Architecture Reference Points

Key files and their relevant symbols (for integration clarity):

| File | Relevant to |
|------|-------------|
| `backend/app/agents/market_scanner.py` | `_analyze_stock()`, `run_expert_panel()`, `run_chief_debate()` |
| `backend/app/agents/risk_manager.py` | `_validate_signal()`, `_on_signal_generated()`, `_load_risk_config()` |
| `backend/app/agents/base.py` | `emit_event()`, `call_mcp_tool()`, `_log_execution()` |
| `backend/app/models/database.py` | `SCHEMA_SQL` string (DDL), `risk_config` key-value rows |
| `backend/app/models/db.py` | `init_database()` — calls `db.executescript(SCHEMA_SQL)` |
| `backend/app/routers/signals.py` | `GET /api/signals` response shape |
| `backend/app/config.py` | `pydantic-settings` config, required vs optional fields |
| `backend/app/main.py` | `lifespan()` — MCP connect, agent registration, scheduler start |

---

## Phase A: DART Integration + Fundamental Analyst

### DartClient (`backend/app/services/dart_client.py`)

New service wrapping the DART OpenAPI (opendart.fss.or.kr). Requires `DART_API_KEY` env var.

**`DART_API_KEY` is optional.** `DartClient` is instantiated as a module-level singleton in `dart_client.py` with `self.enabled = bool(settings.dart_api_key)`. When `enabled=False`, `fetch()` returns all fields at grade D immediately (no HTTP call). This means every signal is rejected at the confidence gate when `DART_API_KEY` is absent — the system logs a clear message and no Claude API calls are wasted.

**Startup initialization:** `DartClient` is imported and initialized in `main.py` `lifespan()` alongside MCP setup. The startup sequence: check `dart_corp_codes` table `MAX(cached_at)` → if stale (>30 days) or empty → fetch and parse `corpCode.xml` from DART → insert/replace rows. This is the only startup hook.

**DART API rate limits:** DART allows ~20,000 calls/day. Each scan run fetches up to 10 stocks (one `fnlttSinglAcntAll` call + one `alotMatter` call per stock = 20 calls max per run). DART financials are **cached per stock per calendar day** in a new `dart_financials_cache` table (see DB migrations). On each scan, `DartClient` checks the cache first; a fresh HTTP call is only made if no cache row exists for that stock today.

**Data fetched and confidence grades:**

| Field | DART API Endpoint | Grade |
|-------|-------------------|-------|
| 최근 4분기 매출/영업이익/순이익 | `fnlttSinglAcntAll` | A |
| EPS, BPS, PER, PBR | `fnlttSinglAcntAll` | A |
| 부채비율, 유동비율 | `fnlttSinglAcntAll` | A |
| 배당수익률 | `alotMatter` | B |

On any fetch failure → all DART fields set to grade D → confidence hard gate triggers → signal aborted before Stage 5.

**Corp code lookup:** DART uses 8-digit corp codes; KIS uses 6-digit stock codes. `DartClient` parses `corpCode.xml` and stores `stock_code (6-digit) → corp_code (8-digit)` mappings. Cache TTL: 30 days.

### `data_package` dict keys (actual structure in `_analyze_stock()`)

The existing inter-stage data object is a plain `dict` named `data_package`. The actual keys (verified from `market_scanner.py`) are:

```python
# Existing keys (actual, do NOT rename these)
data_package["stock"]              # dict: {"code": "005930", "name": "삼성전자", ...}
data_package["technicals"]         # dict: RSI, MACD, BB, Stoch, ATR values
data_package["portfolio_context"]  # dict: current positions, balance info

# New keys added in Phase A (appended, do not touch existing keys)
data_package["dart_financials"]    # dict | None — parsed DART fields (per, pbr, eps_yoy, etc.)
data_package["confidence_grades"]  # dict[str, str] — field_name → "A"/"B"/"C"/"D"
```

Access current price as `data_package["stock"]["current_price"]` (or whichever sub-key the stock dict uses — verify at implementation time).

### Confidence grade assignment for non-DART fields

`confidence_grades` is populated at the start of `_analyze_stock()` before DART fetch:

- `confidence_grades["current_price"]` = `"A"` if KIS price call succeeded in Stage 1; `"D"` if Stage 1 returned no price data
- `confidence_grades["volume"]` = `"A"` if KIS OHLCV returned a non-zero volume; `"D"` if volume field is missing or zero
- DART fields are set by `DartClient.fetch()` per the table above

Grades for `current_price` and `volume` are always set at the top of `_analyze_stock()` immediately after Stage 1 data is available, before calling DART.

### Confidence Grading (`backend/app/models/confidence.py`)

New file:

```python
from enum import Enum

class DataConfidence(Enum):
    A = "A"  # filing-sourced, arithmetic verified
    B = "B"  # 2+ sources, ≤5% variance
    C = "C"  # single source, unverified
    D = "D"  # unavailable — hard gate triggers

CRITICAL_FIELDS = [
    "current_price", "volume",
    "dart_revenue", "dart_operating_profit", "dart_per"
]

def check_hard_gate(confidence_grades: dict[str, str]) -> tuple[bool, list[str]]:
    """Returns (passed, list_of_failed_fields)."""
    failed = [f for f in CRITICAL_FIELDS
              if confidence_grades.get(f, "D") == "D"]
    return len(failed) == 0, failed
```

### `signal.failed` event

Emitted by `MarketScannerAgent` when `check_hard_gate()` returns False. Sequence:

1. Write a row to `signals` with `status = 'failed'` and `metadata_json = json.dumps({"reason": "confidence_gate", "failed_fields": [...]})`
2. Call `self._log_execution(...)` to record in `agent_logs`
3. Emit `signal.failed` event with the same payload

No agent subscribes to `signal.failed`. The `status` CHECK constraint in `SCHEMA_SQL` is updated to include `'failed'` (see DB migrations).

### Fundamental Analyst Expert (5th Expert)

Added as `기본적분석가` in Stage 4 of `_analyze_stock()`. All 5 experts run in parallel via `asyncio.gather`.

- Exclusive input: `data_package["dart_financials"]`
- Shared context: same `data_package["technicals"]` available to all experts
- Prompt focus: revenue trend, earnings quality (operating vs net margin), valuation vs sector, debt ratio, dividend sustainability

`dart_financials` is also injected into the context dict passed to all existing experts and to the Chief prompt.

---

## Phase B: Scenario Framework + Critic Agent

### Signal Schema Extension (`backend/app/models/signal.py`)

New Pydantic models (no existing models removed):

```python
class Scenario(BaseModel):
    label: str           # "강세" / "기본" / "약세"
    price_target: float  # absolute price target (KRW)
    upside_pct: float    # % from current price (negative = downside)
    probability: float   # 0.0–1.0; all 3 must sum to 1.0 ±0.01

class SignalAnalysis(BaseModel):
    direction: str             # "BUY" | "SELL" | "HOLD"
    bull: Scenario
    base: Scenario
    bear: Scenario
    rr_score: float            # server-computed (see formula)
    variant_view: str          # specific market misconception this signal exploits
    expert_stances: dict[str, str]  # expert name → "bullish"/"bearish"/"neutral"
    critic_result: str         # "pass" | "fail" | "pending"
    critic_feedback: str | None = None
```

**R/R score formula (server-computed, LLM value discarded):**

```python
def compute_rr_score(bull: Scenario, base: Scenario, bear: Scenario) -> float:
    numerator = (bull.upside_pct * bull.probability
                 + base.upside_pct * base.probability)
    denominator = max(abs(bear.upside_pct * bear.probability), 0.01)
    return numerator / denominator
```

The `max(..., 0.01)` prevents divide-by-zero. A zero-downside bear scenario produces a very high R/R score which is correct behavior (no downside = genuinely attractive).

### `run_chief_debate()` updated signature

`run_chief_debate()` in `market_scanner_experts.py` gains two new parameters:

```python
async def run_chief_debate(
    stock_info: dict,
    expert_analyses: list[dict],
    portfolio_context: dict,
    dart_financials: dict | None = None,   # NEW
    critic_feedback: str | None = None,    # NEW — set on revision loop only
) -> SignalAnalysis:
```

The function's return type changes from `dict` to `SignalAnalysis`. The Chief's prompt is updated to:

- Accept 5 expert analyses (including `기본적분석가`)
- Reference `dart_financials` in the context block
- Update expert count language from "4명의 전문가" to "5명의 전문가" throughout
- Produce the `SignalAnalysis` JSON schema (not the old `decision/confidence/reason` shape)
- If `critic_feedback` is provided, prepend it as a system message: `"CRITIC FEEDBACK: {critic_feedback}. Please revise your analysis addressing the feedback."`

**`consensus_hint` threshold update:** The existing code uses `bullish_count >= 3` out of 4 experts to label consensus as `"우세"`. With 5 experts, update to `bullish_count >= 4` for `"우세"` (≥80% agreement), `bullish_count == 3` for `"과반수"` (60% majority), and `bullish_count <= 2` for `"분열"`. The `consensus_hint` string passed into the Chief prompt must also reference `"5명의 전문가"` not `"4명의 전문가"` — search for all hardcoded counts in `run_chief_debate()` and update them.

The Chief's JSON output includes an `rr_score` field — this value is **ignored**. The server recomputes it via `compute_rr_score()` immediately after parsing the Chief's response and overwrites the value in the `SignalAnalysis` object.

**Critic check 3 (R/R arithmetic):** Even though the server recomputes R/R, the critic still compares the Chief's declared `rr_score` against the server-computed value. If the discrepancy exceeds 20% (relaxed from 5% since the server overrides anyway), it signals that the Chief's scenario probabilities or upside values are internally inconsistent — a sign of hallucinated numbers. The critic flags this as a quality issue even though the downstream R/R value is correct.

### RiskManager auto-approval gate

`risk_config` is a `key TEXT, value TEXT` row-store. Migration adds:

```sql
INSERT OR IGNORE INTO risk_config (key, value) VALUES ('min_rr_score', '2.0');
```

This is added to `SCHEMA_SQL` in `database.py` (not as DDL but as a DML statement run via `executescript` in `init_database()` in `db.py`).

`_load_risk_config()` in `risk_manager.py` is updated to parse `min_rr_score` as `float`.

`_validate_signal()` updated auto-approval condition:

```python
# signal_data is the dict from event.data (single signal, not a list)
rr_ok = signal_data.get("rr_score", 0.0) >= self.risk_config.get("min_rr_score", 2.0)
critic_ok = signal_data.get("critic_result") == "pass"
# Confidence gate is enforced upstream — RiskManager trusts it
auto_approve = rr_ok and critic_ok and existing_position_checks
```

### `signal.generated` event payload and DB sync

`MarketScannerAgent` writes the full `SignalAnalysis` to the `signals` DB row **before** emitting `signal.generated`. The event payload mirrors the DB row (no fields exist only in one place). New columns written at INSERT time:

- `scenarios_json` = `json.dumps({"bull": ..., "base": ..., "bear": ...})`
- `variant_view` = `signal_analysis.variant_view`
- `rr_score` = server-computed float
- `expert_stances_json` = `json.dumps(signal_analysis.expert_stances)`
- `dart_fundamentals_json` = `json.dumps(data_package["dart_financials"])`
- `critic_result` = `"pass"` (only passing signals are emitted)
- `confidence` = sigmoid-normalized `rr_score` (backward compat)

The `signal.generated` event payload is the full DB row dict (same pattern as existing code).

### SignalCriticAgent (`backend/app/agents/signal_critic.py`)

Instantiated as a module-level singleton (not registered with `agent_engine`). Rationale: the critic has no event subscriptions, no scheduled execution, and no need for the engine's lifecycle management. Registering it would add noise to the agent list with no benefit. It is initialized in `main.py` `lifespan()` as `signal_critic = SignalCriticAgent()` and stored on `app.state` for access by `MarketScannerAgent`.

**Class structure:**

```python
class SignalCriticAgent:
    def __init__(self): ...  # no db parameter

    async def review(
        self,
        signal_analysis: SignalAnalysis,
        expert_outputs: list[dict],
        confidence_grades: dict[str, str],
    ) -> tuple[bool, str | None]:
        """Returns (passed, feedback_string | None)."""
        # Step 1: programmatic checks (no Claude call)
        passed, feedback = self._check_programmatic(signal_analysis, confidence_grades)
        if not passed:
            return False, feedback
        # Step 2: Claude rubric check (items 4-5)
        return await self._check_qualitative(signal_analysis, expert_outputs)
```

This bypasses `BaseAgent` entirely — no `execute()`, no `_log_execution()` from the base class. The critic logs failures using the module-level `execute_insert()` helper from `db.py` (same pattern all other agents use for direct DB writes), not a passed `db` connection object.

**5-item rubric:**

| # | Check | Method | Pass Condition |
|---|-------|--------|----------------|
| 1 | Scenario completeness | programmatic | All 3 scenarios present; `sum(probabilities) == 1.0 ±0.01` |
| 2 | Data confidence | programmatic | All `CRITICAL_FIELDS` in `confidence_grades` are "A" or "B" |
| 3 | R/R arithmetic | programmatic | Chief's declared `rr_score` within 20% of server-computed value |
| 4 | Expert dissent | Claude call | At least one expert stance differs from majority; if unanimous, `variant_view` explicitly explains the unanimity with a concrete data point |
| 5 | Variant view specificity | Claude call | `variant_view` references a specific data point (e.g., DART filing figure, indicator value) — generic phrases like "리스크 대비 기회" fail |

**Revision loop (in `MarketScannerAgent._analyze_stock()`):**

```python
signal_analysis = await run_chief_debate(stock_info, expert_analyses, portfolio_context,
                                          dart_financials, critic_feedback=None)
signal_analysis.rr_score = compute_rr_score(...)  # server override

passed, feedback = await signal_critic.review(signal_analysis, expert_analyses, confidence_grades)
if not passed:
    # One revision attempt
    signal_analysis = await run_chief_debate(..., critic_feedback=feedback)
    signal_analysis.rr_score = compute_rr_score(...)  # server override again
    passed, feedback = await signal_critic.review(signal_analysis, expert_analyses, confidence_grades)

if not passed:
    # Write rejected row to DB directly (bypass RiskManager)
    # Use execute_insert() from db.py — same pattern as existing MarketScannerAgent DB writes
    await execute_insert("signals", {
        "stock_code": data_package["stock"]["code"],
        "stock_name": data_package["stock"]["name"],
        "direction": signal_analysis.direction,
        "confidence": 0.0,
        "status": "rejected",
        "metadata_json": json.dumps({"reason": "critic_failed", "feedback": feedback}),
        "rr_score": signal_analysis.rr_score,
        "critic_result": "fail",
        # ... other new columns as applicable
    })
    await self._log_execution(status="rejected", details={"reason": "critic_failed"})
    return  # do NOT emit signal.generated
```

`MarketScannerAgent` writes `status='rejected'` directly to the DB (no `signal.rejected` event emitted — critic rejection is an internal scanner concern, not a risk management decision). `RiskManagerAgent` never sees critic-rejected signals.

---

## Phase C: Rich React Dashboard Output

### New Components

**`SignalCard.tsx`** (`frontend/src/components/signals/SignalCard.tsx`)

Props:

```typescript
interface SignalCardProps {
  signal: Signal;  // extended Signal type (see TypeScript types below)
}
```

Layout: header row → scenario row → variant view → expert panel → footer. Grade badges use CSS classes (`.grade-a`, `.grade-b`, `.grade-c`, `.grade-d`) with colors green/goldenrod/orange/red. No emoji. Mobile (<600px): scenario columns stack vertically, `ScenarioChart` hidden via CSS media query.

**`ScenarioChart.tsx`** (`frontend/src/components/signals/ScenarioChart.tsx`)

Props:

```typescript
interface ScenarioChartProps {
  currentPrice: number;
  bull: Scenario;
  base: Scenario;
  bear: Scenario;
}
```

SVG implementation: x-axis spans from `bear.price_target * 0.95` to `bull.price_target * 1.05` (auto-scale with 5% padding). Current price rendered as a vertical line. Three labeled markers for each scenario target. Width: `100%` of container via `viewBox` + `preserveAspectRatio`. Hidden below 600px breakpoint via CSS.

**`FundamentalsKPI.tsx`** (`frontend/src/components/signals/FundamentalsKPI.tsx`)

Props:

```typescript
interface FundamentalsKPIProps {
  dartFundamentals: DartFundamentals;
  confidenceGrades: Record<string, string>;
}
```

Tiles: PER, PBR, EPS YoY%, 부채비율, 영업이익률. Each tile shows a CSS-class grade badge.

### TypeScript type extensions

Existing `Signal` type (location: verify in `frontend/src/types/` or `frontend/src/services/`) is extended:

```typescript
interface Scenario {
  label: string;
  price_target: number;
  upside_pct: number;
  probability: number;
}

interface DartFundamentals {
  per: number;
  pbr: number;
  eps_yoy_pct: number;
  debt_ratio: number;
  operating_margin: number;
}

interface Signal {
  // existing fields unchanged
  id: number;
  stock_code: string;
  stock_name: string;
  direction: string;
  confidence: number;
  status: string;
  created_at: string;
  // new fields
  scenarios?: { bull: Scenario; base: Scenario; bear: Scenario };
  rr_score?: number;
  variant_view?: string;
  confidence_grades?: Record<string, string>;
  expert_stances?: Record<string, string>;
  critic_result?: string;
  dart_fundamentals?: DartFundamentals;
}
```

All new fields are optional (`?`) for backward compatibility with signals created before this enhancement.

### API response JSON column parsing

The `GET /api/signals` router currently returns raw `aiosqlite.Row` dicts. The new JSON columns (`scenarios_json`, `expert_stances_json`, `dart_fundamentals_json`) are stored as strings. The router adds a helper:

```python
def _enrich_signal(row: dict) -> dict:
    result = dict(row)
    for json_col, out_key in [
        ("scenarios_json", "scenarios"),
        ("expert_stances_json", "expert_stances"),
        ("dart_fundamentals_json", "dart_fundamentals"),
    ]:
        raw = result.pop(json_col, None)
        result[out_key] = json.loads(raw) if raw else None
    return result
```

Applied to each row before returning the response list.

---

## Database Migrations

### Location

All schema changes go in `database.py` (`SCHEMA_SQL` string) for new databases, plus `ALTER TABLE` guards in `db.py` `init_database()` for existing databases.

### `signals` table — new columns

Added to `init_database()` in `db.py` via idempotent `ALTER TABLE`:

```python
ALTER_STATEMENTS = [
    "ALTER TABLE signals ADD COLUMN scenarios_json TEXT",
    "ALTER TABLE signals ADD COLUMN variant_view TEXT",
    "ALTER TABLE signals ADD COLUMN rr_score REAL",
    "ALTER TABLE signals ADD COLUMN expert_stances_json TEXT",
    "ALTER TABLE signals ADD COLUMN dart_fundamentals_json TEXT",
    "ALTER TABLE signals ADD COLUMN metadata_json TEXT",
    "ALTER TABLE signals ADD COLUMN critic_result TEXT",
]
for stmt in ALTER_STATEMENTS:
    try:
        await db.execute(stmt)
    except Exception:
        pass  # column already exists
```

The `status` CHECK constraint in `SCHEMA_SQL` (for new DBs) updated to:

```sql
status TEXT CHECK(status IN ('pending','approved','rejected','executed','failed'))
```

For existing DBs: SQLite does not support `ALTER TABLE` to change CHECK constraints. The application enforces allowed values in code. A dev environment DB rebuild is recommended.

### New tables

Added to `SCHEMA_SQL` in `database.py`:

```sql
CREATE TABLE IF NOT EXISTS dart_corp_codes (
    stock_code TEXT PRIMARY KEY,
    corp_code TEXT NOT NULL,
    corp_name TEXT,
    cached_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dart_financials_cache (
    stock_code TEXT NOT NULL,
    cache_date TEXT NOT NULL,
    financials_json TEXT NOT NULL,
    PRIMARY KEY (stock_code, cache_date)
);
```

### `risk_config` — new row

Added to `SCHEMA_SQL` as a DML statement (safe with `executescript`):

```sql
INSERT OR IGNORE INTO risk_config (key, value) VALUES ('min_rr_score', '2.0');
```

---

## Environment Changes

Add to `.env.example`:

```
DART_API_KEY=            # 금융감독원 DART OpenAPI key (free: opendart.fss.or.kr)
                         # Optional. If absent, all signals are rejected at confidence gate.
```

Add to `config.py` `Settings`:

```python
dart_api_key: str | None = None
```

---

## Vertical Slice Build Order

Single end-to-end slice for one stock before expanding breadth:

1. **DartClient** — `fetch()` for one corp code, confidence grading, corp code cache, financials daily cache
2. **Signal schema + DB migrations** — `Scenario`, `SignalAnalysis` Pydantic models; `ALTER TABLE` guards in `db.py`; new tables in `database.py`
3. **Fundamental Analyst expert** — 5th expert in Stage 4; DART data in shared context; `run_chief_debate()` signature updated; server-side R/R computation; confidence grade assignment at Stage 1
4. **SignalCriticAgent** — programmatic checks (items 1-3); Claude qualitative checks (items 4-5); revision loop wired in `_analyze_stock()`
5. **RiskManager gate** — `min_rr_score` row in `risk_config`; updated `_validate_signal()`
6. **API response extension** — `_enrich_signal()` helper in signals router; all new fields returned
7. **React components** — `Signal` type extended; `SignalCard`, `FundamentalsKPI`, `ScenarioChart` components; CSS grade classes and mobile breakpoint

Steps 1-2: no Claude calls (data layer). Steps 3-5: extend existing agent code. Steps 6-7: purely additive.

---

## Success Criteria

- A signal for a single KOSPI200 stock flows end-to-end: DART data fetched (or cache hit) → 5 experts debate → Chief produces `SignalAnalysis` JSON → server recomputes R/R → critic passes → signal written to DB → displayed in dashboard with scenario cards, expert stances, KPI tiles, and scenario chart
- Signal auto-approved only when `rr_score >= min_rr_score` (default 2.0) AND `critic_result == "pass"`
- If DART fetch fails → signal rejected at confidence gate before Stage 5 (no Claude API calls wasted)
- If `DART_API_KEY` absent → all signals rejected at confidence gate with clear log message
- `GET /api/signals` returns new fields; existing fields unchanged
- Mobile (<600px): scenario section stacks vertically; chart hidden
- No existing functionality broken: chat, portfolio monitoring, order execution unchanged
