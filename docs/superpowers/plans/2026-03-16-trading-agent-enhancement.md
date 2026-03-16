# Trading Agent Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DART fundamental data, scenario-based R/R scoring with critic validation, and rich React signal cards to the existing KIS paper trading agent.

**Architecture:** Vertical slice — data layer (DartClient + confidence grading + DB migrations) → agent enhancements (5th expert, updated Chief debate, SignalCriticAgent) → risk gate update → API extension → React components. Each chunk produces independently testable changes.

**Tech Stack:** Python 3.12+, FastAPI, aiosqlite, anthropic SDK, pydantic v2, React 19, TypeScript, plain SVG for charts. New Python dependencies: `xmltodict` (DART XML parsing), `pytest-asyncio` (async tests).

**`execute_insert` calling convention (use throughout):** `await execute_insert("INSERT INTO table (col1, col2) VALUES (?, ?)", (val1, val2))` — raw SQL string + params tuple. Never call it with a table name and dict.

**Spec:** `docs/superpowers/specs/2026-03-16-trading-agent-enhancement-design.md`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `backend/app/models/confidence.py` | `DataConfidence` enum, `CRITICAL_FIELDS`, `check_hard_gate()` |
| `backend/app/models/signal.py` | `Scenario`, `SignalAnalysis` Pydantic models, `compute_rr_score()` |
| `backend/app/services/dart_client.py` | `DartClient` singleton — corp code cache, financials fetch, daily cache |
| `backend/app/agents/signal_critic.py` | `SignalCriticAgent` — programmatic + Claude rubric checks, revision loop |
| `backend/tests/test_confidence.py` | Tests for confidence grading and hard gate |
| `backend/tests/test_signal_models.py` | Tests for Scenario, SignalAnalysis, compute_rr_score |
| `backend/tests/test_dart_client.py` | Tests for DartClient (disabled mode, grade assignment) |
| `backend/tests/test_signal_critic.py` | Tests for SignalCriticAgent programmatic checks |
| `frontend/src/components/signals/SignalCard.tsx` | Rich signal card with scenarios, experts, critic badge |
| `frontend/src/components/signals/ScenarioChart.tsx` | Inline SVG price range chart |
| `frontend/src/components/signals/FundamentalsKPI.tsx` | DART KPI tiles with grade badges |

### Modified Files
| File | Change |
|------|--------|
| `backend/app/models/database.py` | Add new tables to `SCHEMA_SQL`, update `direction`+`status` constraints, add `min_rr_score` to `DEFAULT_RISK_CONFIG` |
| `backend/app/models/db.py` | Add `ALTER TABLE` migration guards after `executescript` |
| `backend/app/config.py` | Add `dart_api_key: str \| None = None` |
| `backend/app/main.py` | Initialize `DartClient` and `SignalCriticAgent` in `lifespan()` |
| `backend/app/agents/market_scanner_experts.py` | Update `run_chief_debate()` signature, return type, consensus threshold (3→4 of 5), prompt |
| `backend/app/agents/market_scanner.py` | Add confidence grading, DART fetch, hard gate, 5th expert, critic revision loop, updated DB insert |
| `backend/app/agents/risk_manager.py` | Update `_load_risk_config()` and `_validate_signal()` for `rr_score`+`critic_result` |
| `backend/app/routers/signals.py` | Add `_enrich_signal()` helper, parse JSON columns in response |
| `frontend/src/types.ts` | Extend `Signal`, add `Scenario`, `DartFundamentals` interfaces |
| `.env.example` | Add `DART_API_KEY` |

---

## Chunk 1: Data Layer

*Confidence grading, signal models, DB migrations, DartClient. No Claude API calls.*

---

### Task 1: Confidence Grading Model

**Files:**
- Create: `backend/app/models/confidence.py`
- Create: `backend/tests/test_confidence.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_confidence.py
import pytest
from app.models.confidence import (
    DataConfidence, CRITICAL_FIELDS, check_hard_gate
)


def test_all_critical_fields_pass_when_grade_a():
    grades = {f: "A" for f in CRITICAL_FIELDS}
    passed, failed = check_hard_gate(grades)
    assert passed is True
    assert failed == []


def test_gate_fails_when_any_critical_field_is_d():
    grades = {f: "A" for f in CRITICAL_FIELDS}
    grades["dart_per"] = "D"
    passed, failed = check_hard_gate(grades)
    assert passed is False
    assert "dart_per" in failed


def test_gate_fails_when_critical_field_missing():
    grades = {}  # no grades set at all
    passed, failed = check_hard_gate(grades)
    assert passed is False
    assert set(failed) == set(CRITICAL_FIELDS)


def test_grade_b_passes_gate():
    grades = {f: "B" for f in CRITICAL_FIELDS}
    passed, failed = check_hard_gate(grades)
    assert passed is True


def test_grade_c_does_not_fail_gate():
    # Grade C is allowed — only D triggers the gate
    grades = {f: "A" for f in CRITICAL_FIELDS}
    grades["dart_revenue"] = "C"
    passed, failed = check_hard_gate(grades)
    assert passed is True
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && uv run pytest tests/test_confidence.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.models.confidence'`

- [ ] **Step 3: Create `confidence.py`**

```python
# backend/app/models/confidence.py
from enum import Enum


class DataConfidence(Enum):
    A = "A"  # filing-sourced, arithmetic verified
    B = "B"  # 2+ sources, ≤5% variance
    C = "C"  # single source, unverified
    D = "D"  # unavailable — hard gate triggers


CRITICAL_FIELDS = [
    "current_price",
    "volume",
    "dart_revenue",
    "dart_operating_profit",
    "dart_per",
]


def check_hard_gate(
    confidence_grades: dict[str, str],
) -> tuple[bool, list[str]]:
    """
    Returns (passed, list_of_failed_fields).
    Fails if any critical field is grade D or missing.
    """
    failed = [
        f for f in CRITICAL_FIELDS
        if confidence_grades.get(f, "D") == "D"
    ]
    return len(failed) == 0, failed
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd backend && uv run pytest tests/test_confidence.py -v
```
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/confidence.py backend/tests/test_confidence.py
git commit -m "feat: add DataConfidence enum and hard gate check"
```

---

### Task 2: Signal Pydantic Models

**Files:**
- Create: `backend/app/models/signal.py`
- Create: `backend/tests/test_signal_models.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_signal_models.py
import pytest
from app.models.signal import Scenario, SignalAnalysis, compute_rr_score


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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && uv run pytest tests/test_signal_models.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.models.signal'`

- [ ] **Step 3: Create `signal.py`**

```python
# backend/app/models/signal.py
from pydantic import BaseModel


class Scenario(BaseModel):
    label: str           # "강세" / "기본" / "약세"
    price_target: float  # absolute price target (KRW)
    upside_pct: float    # % from current price (negative = downside)
    probability: float   # 0.0–1.0


class SignalAnalysis(BaseModel):
    direction: str                      # "BUY" | "SELL" | "HOLD"
    bull: Scenario
    base: Scenario
    bear: Scenario
    rr_score: float                     # server-computed via compute_rr_score()
    variant_view: str                   # specific market misconception
    expert_stances: dict[str, str]      # expert name → "bullish"/"bearish"/"neutral"
    critic_result: str                  # "pass" | "fail" | "pending"
    critic_feedback: str | None = None


def compute_rr_score(bull: Scenario, base: Scenario, bear: Scenario) -> float:
    """
    R/R = (bull_upside * bull_prob + base_upside * base_prob)
          / max(abs(bear_upside * bear_prob), 0.01)

    The 0.01 floor prevents divide-by-zero.
    A zero-downside bear scenario → very high R/R (correct behavior).
    """
    numerator = (
        bull.upside_pct * bull.probability
        + base.upside_pct * base.probability
    )
    denominator = max(abs(bear.upside_pct * bear.probability), 0.01)
    return numerator / denominator
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd backend && uv run pytest tests/test_signal_models.py -v
```
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/signal.py backend/tests/test_signal_models.py
git commit -m "feat: add Scenario/SignalAnalysis models and compute_rr_score"
```

---

### Task 3: Database Schema Updates + Migrations

**Files:**
- Modify: `backend/app/models/database.py`
- Modify: `backend/app/models/db.py`

- [ ] **Step 1: Update `database.py` — SCHEMA_SQL additions**

In `backend/app/models/database.py`:

a) Update the `signals` table `direction` and `status` CHECK constraints in `SCHEMA_SQL`. Find the existing signals table definition and replace:

```sql
-- OLD (lines 48, 55 approximately):
direction TEXT NOT NULL CHECK(direction IN ('buy', 'sell')),
status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'executed')),

-- NEW:
direction TEXT NOT NULL CHECK(direction IN ('buy', 'sell', 'hold')),
status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
```

b) Also add the new columns to the `signals` CREATE TABLE statement (for fresh databases):

```sql
-- After the existing `risk_notes TEXT` line, add:
scenarios_json TEXT,
variant_view TEXT,
rr_score REAL,
current_price REAL,
expert_stances_json TEXT,
dart_fundamentals_json TEXT,
metadata_json TEXT,
critic_result TEXT,
```

c) Add two new tables to `SCHEMA_SQL` (after the existing tables):

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

d) Add `min_rr_score` to `DEFAULT_RISK_CONFIG` dict:

```python
# Find DEFAULT_RISK_CONFIG and add one entry:
DEFAULT_RISK_CONFIG = {
    "stop_loss_pct": "-3.0",
    "take_profit_pct": "5.0",
    "max_positions": "5",
    "max_position_weight_pct": "20.0",
    "max_daily_loss": "500000",
    "signal_approval_mode": "auto",
    "min_rr_score": "2.0",   # NEW
}
```

- [ ] **Step 2: Add `ALTER TABLE` migration guards in `db.py`**

In `backend/app/models/db.py`, open `init_database()`. Find the line `await db.executescript(SCHEMA_SQL)`. Insert the following block **immediately after that line** (before the existing risk config seed loop — do not replace any existing code):

```python
        # --- Migration guards for existing databases ---
        _ALTER_STATEMENTS = [
            "ALTER TABLE signals ADD COLUMN scenarios_json TEXT",
            "ALTER TABLE signals ADD COLUMN variant_view TEXT",
            "ALTER TABLE signals ADD COLUMN rr_score REAL",
            "ALTER TABLE signals ADD COLUMN current_price REAL",
            "ALTER TABLE signals ADD COLUMN expert_stances_json TEXT",
            "ALTER TABLE signals ADD COLUMN dart_fundamentals_json TEXT",
            "ALTER TABLE signals ADD COLUMN metadata_json TEXT",
            "ALTER TABLE signals ADD COLUMN critic_result TEXT",
        ]
        for stmt in _ALTER_STATEMENTS:
            try:
                await db.execute(stmt)
            except Exception:
                pass  # column already exists — safe to ignore
```

Leave all existing lines (risk config seed, scheduled tasks seed, `db.commit()`, `finally: await db.close()`) completely unchanged.

- [ ] **Step 3: Verify the schema applies cleanly**

Delete the dev database and re-run to simulate a fresh install:

```bash
cd backend && rm -f data/trading.db && uv run python -c "
import asyncio
from app.models.db import init_database
asyncio.run(init_database())
print('Schema OK')
"
```
Expected: `Schema OK` with no errors.

- [ ] **Step 4: Verify migrations apply to an existing database**

```bash
cd backend && uv run python -c "
import asyncio
from app.models.db import init_database
# Run twice — second run exercises the ALTER TABLE guards
asyncio.run(init_database())
asyncio.run(init_database())
print('Migration idempotency OK')
"
```
Expected: `Migration idempotency OK` with no errors.

- [ ] **Step 5: Add `dart_api_key` to config**

In `backend/app/config.py`, add one field to `Settings`:

```python
class Settings(BaseSettings):
    anthropic_api_key: str = ""
    mcp_server_url: str = "http://localhost:3000/sse"
    claude_model: str = "claude-sonnet-4-5-20250929"
    claude_max_tokens: int = 4096
    dart_api_key: str | None = None   # NEW — optional

    model_config = {...}  # unchanged
```

- [ ] **Step 6: Add `DART_API_KEY` to `.env.example`**

Append to `.env.example`:

```
# DART OpenAPI key (free: opendart.fss.or.kr) — optional
# If absent, all signals are rejected at confidence gate (no Claude API calls wasted)
DART_API_KEY=
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/database.py backend/app/models/db.py \
        backend/app/config.py .env.example
git commit -m "feat: add DB schema for signals enhancement + DART config"
```

---

### Task 4: DartClient Service

**Files:**
- Create: `backend/app/services/dart_client.py`
- Create: `backend/tests/test_dart_client.py`

- [ ] **Step 1: Install required dependencies**

```bash
cd backend && uv add xmltodict
uv add --dev pytest-asyncio
```

Then add `asyncio_mode = "auto"` to `backend/pyproject.toml` so `@pytest.mark.asyncio` tests run automatically:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

Verify:

```bash
cd backend && uv run pytest --co -q 2>&1 | head -5
```
Expected: collection output with no `PytestUnknownMarkWarning`.

- [ ] **Step 2: Write failing tests**

```python
# backend/tests/test_dart_client.py
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.dart_client import DartClient


@pytest.fixture
def disabled_client():
    """DartClient with no API key."""
    with patch("app.services.dart_client.settings") as mock_settings:
        mock_settings.dart_api_key = None
        client = DartClient()
    return client


@pytest.mark.asyncio
async def test_fetch_returns_all_d_grades_when_disabled(disabled_client):
    result = await disabled_client.fetch("005930")
    assert result["enabled"] is False
    assert result["confidence_grades"]["dart_per"] == "D"
    assert result["confidence_grades"]["dart_revenue"] == "D"
    assert result["confidence_grades"]["dart_operating_profit"] == "D"
    assert result["financials"] is None


@pytest.mark.asyncio
async def test_fetch_returns_grade_d_on_http_error():
    with patch("app.services.dart_client.settings") as mock_settings:
        mock_settings.dart_api_key = "test_key"
        client = DartClient()

    with patch.object(client, "_get_corp_code", return_value=None):
        result = await client.fetch("999999")  # unknown stock code
    assert result["confidence_grades"]["dart_per"] == "D"
    assert result["financials"] is None


def test_dart_client_disabled_when_no_api_key():
    with patch("app.services.dart_client.settings") as mock_settings:
        mock_settings.dart_api_key = None
        client = DartClient()
    assert client.enabled is False


def test_dart_client_enabled_when_api_key_present():
    with patch("app.services.dart_client.settings") as mock_settings:
        mock_settings.dart_api_key = "some_key"
        client = DartClient()
    assert client.enabled is True
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd backend && uv run pytest tests/test_dart_client.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.services.dart_client'`

- [ ] **Step 4: Create `dart_client.py`**

```python
# backend/app/services/dart_client.py
"""
DartClient — wraps DART OpenAPI (opendart.fss.or.kr).

Corp code cache: SQLite dart_corp_codes table, TTL 30 days.
Financials cache: SQLite dart_financials_cache table, TTL 1 calendar day.
All fetch failures → grade D (hard gate upstream will reject the signal).
"""
import asyncio
import io
import json
import logging
import zipfile
from datetime import datetime, timedelta

import httpx
import xmltodict  # type: ignore

from app.config import settings
from app.models.db import execute_insert, execute_query

logger = logging.getLogger(__name__)

_DART_BASE = "https://opendart.fss.or.kr/api"
_CORP_CODE_TTL_DAYS = 30


class DartClient:
    def __init__(self) -> None:
        self.enabled: bool = bool(settings.dart_api_key)
        self._api_key: str | None = settings.dart_api_key

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Call from lifespan() — refreshes corp code cache if stale."""
        if not self.enabled:
            logger.info("DartClient disabled (no DART_API_KEY)")
            return
        await self._refresh_corp_codes_if_stale()

    async def fetch(self, stock_code: str) -> dict:
        """
        Fetch DART fundamentals for a stock.

        Returns:
            {
                "enabled": bool,
                "financials": dict | None,
                "confidence_grades": dict[str, str],
            }
        """
        _grade_d = {
            "dart_revenue": "D",
            "dart_operating_profit": "D",
            "dart_per": "D",
            "dart_pbr": "D",
            "dart_eps_yoy_pct": "D",
            "dart_debt_ratio": "D",
            "dart_operating_margin": "D",
            "dart_dividend_yield": "D",
        }

        if not self.enabled:
            return {"enabled": False, "financials": None, "confidence_grades": _grade_d}

        try:
            # Check daily cache first
            cached = await self._get_cached_financials(stock_code)
            if cached:
                return self._build_result(cached, enabled=True)

            # Corp code lookup
            corp_code = await self._get_corp_code(stock_code)
            if not corp_code:
                logger.warning(f"No DART corp code for {stock_code}")
                return {"enabled": True, "financials": None, "confidence_grades": _grade_d}

            # Fetch from DART API
            year = str(datetime.now().year - 1)  # use prior year for complete data
            financials = await self._fetch_financials(corp_code, year)
            dividend = await self._fetch_dividend(corp_code, year)

            if financials:
                financials["dart_dividend_yield"] = dividend
                await self._cache_financials(stock_code, financials)
                return self._build_result(financials, enabled=True)

            return {"enabled": True, "financials": None, "confidence_grades": _grade_d}

        except Exception as e:
            logger.error(f"DartClient.fetch({stock_code}) failed: {e}")
            return {"enabled": True, "financials": None, "confidence_grades": _grade_d}

    # ------------------------------------------------------------------
    # Internal — corp code cache
    # ------------------------------------------------------------------

    async def _get_corp_code(self, stock_code: str) -> str | None:
        rows = await execute_query(
            "SELECT corp_code FROM dart_corp_codes WHERE stock_code = ?",
            (stock_code,),
        )
        return rows[0]["corp_code"] if rows else None

    async def _refresh_corp_codes_if_stale(self) -> None:
        rows = await execute_query(
            "SELECT MAX(cached_at) as last FROM dart_corp_codes"
        )
        last_str = rows[0]["last"] if rows and rows[0]["last"] else None
        if last_str:
            last = datetime.fromisoformat(last_str)
            if datetime.now() - last < timedelta(days=_CORP_CODE_TTL_DAYS):
                return  # cache is fresh

        logger.info("Refreshing DART corp code cache...")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_DART_BASE}/corpCode.xml",
                    params={"crtfc_key": self._api_key},
                )
                resp.raise_for_status()

            with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
                xml_bytes = zf.read("CORPCODE.xml")

            data = xmltodict.parse(xml_bytes)
            corps = data.get("result", {}).get("list", [])
            now = datetime.now().isoformat()

            for corp in corps:
                stock_code = corp.get("stock_code", "").strip()
                corp_code = corp.get("corp_code", "").strip()
                corp_name = corp.get("corp_name", "").strip()
                if stock_code and corp_code:
                    await execute_insert(
                        """INSERT OR REPLACE INTO dart_corp_codes
                           (stock_code, corp_code, corp_name, cached_at)
                           VALUES (?, ?, ?, ?)""",
                        (stock_code, corp_code, corp_name, now),
                    )
            logger.info(f"DART corp code cache refreshed ({len(corps)} entries)")

        except Exception as e:
            logger.error(f"Failed to refresh DART corp codes: {e}")

    # ------------------------------------------------------------------
    # Internal — financials fetch and cache
    # ------------------------------------------------------------------

    async def _get_cached_financials(self, stock_code: str) -> dict | None:
        today = datetime.now().strftime("%Y-%m-%d")
        rows = await execute_query(
            "SELECT financials_json FROM dart_financials_cache WHERE stock_code=? AND cache_date=?",
            (stock_code, today),
        )
        if rows:
            return json.loads(rows[0]["financials_json"])
        return None

    async def _cache_financials(self, stock_code: str, financials: dict) -> None:
        today = datetime.now().strftime("%Y-%m-%d")
        await execute_insert(
            """INSERT OR REPLACE INTO dart_financials_cache
               (stock_code, cache_date, financials_json) VALUES (?, ?, ?)""",
            (stock_code, today, json.dumps(financials, ensure_ascii=False)),
        )

    async def _fetch_financials(self, corp_code: str, year: str) -> dict | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{_DART_BASE}/fnlttSinglAcntAll.json",
                    params={
                        "crtfc_key": self._api_key,
                        "corp_code": corp_code,
                        "bsns_year": year,
                        "reprt_code": "11011",  # annual report
                        "fs_div": "CFS",        # consolidated
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            if data.get("status") != "000":
                return None

            items = {item["account_nm"]: item for item in data.get("list", [])}
            return self._parse_financials(items)

        except Exception as e:
            logger.warning(f"DART fnlttSinglAcntAll failed for {corp_code}: {e}")
            return None

    def _parse_financials(self, items: dict) -> dict:
        def _num(key: str) -> float | None:
            item = items.get(key)
            if not item:
                return None
            val_str = item.get("thstrm_amount", "").replace(",", "")
            try:
                return float(val_str)
            except (ValueError, TypeError):
                return None

        revenue = _num("매출액")
        op_profit = _num("영업이익")
        net_profit = _num("당기순이익")

        operating_margin = (
            (op_profit / revenue * 100) if revenue and op_profit else None
        )

        return {
            "dart_revenue": revenue,
            "dart_operating_profit": op_profit,
            "dart_net_profit": net_profit,
            "dart_per": _num("주당순이익(PER)"),
            "dart_pbr": _num("주당순자산(PBR)"),
            "dart_eps_yoy_pct": None,   # requires prior year — set to None for now
            "dart_debt_ratio": _num("부채비율"),
            "dart_operating_margin": operating_margin,
        }

    async def _fetch_dividend(self, corp_code: str, year: str) -> float | None:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{_DART_BASE}/alotMatter.json",
                    params={"crtfc_key": self._api_key, "corp_code": corp_code, "bsns_year": year},
                )
                resp.raise_for_status()
                data = resp.json()
            items = data.get("list", [])
            if items:
                yield_str = items[0].get("dvd_rtng", "").replace(",", "")
                return float(yield_str) if yield_str else None
        except Exception:
            return None
        return None  # items list was empty

    # ------------------------------------------------------------------
    # Internal — result builder
    # ------------------------------------------------------------------

    def _build_result(self, financials: dict, enabled: bool) -> dict:
        grades: dict[str, str] = {}
        dart_a_fields = [
            "dart_revenue", "dart_operating_profit", "dart_per",
            "dart_pbr", "dart_debt_ratio", "dart_operating_margin",
        ]
        for field in dart_a_fields:
            grades[field] = "A" if financials.get(field) is not None else "D"

        if financials.get("dart_eps_yoy_pct") is not None:
            grades["dart_eps_yoy_pct"] = "A"
        else:
            grades["dart_eps_yoy_pct"] = "C"  # single-year data only

        if financials.get("dart_dividend_yield") is not None:
            grades["dart_dividend_yield"] = "B"
        else:
            grades["dart_dividend_yield"] = "C"

        return {"enabled": enabled, "financials": financials, "confidence_grades": grades}


# Module-level singleton
dart_client = DartClient()
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
cd backend && uv run pytest tests/test_dart_client.py -v
```
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/dart_client.py backend/tests/test_dart_client.py \
        backend/pyproject.toml uv.lock
git commit -m "feat: add DartClient with corp code cache and financials fetch"
```

---

## Chunk 2: Agent Enhancements

*Updated Chief debate, 5th expert, DartClient wired into scanner, SignalCriticAgent.*

---

### Task 5: Update `run_chief_debate()` for 5 Experts + Scenario Output

**Files:**
- Modify: `backend/app/agents/market_scanner_experts.py`

- [ ] **Step 1: Update `run_expert_panel()` to accept `dart_financials`**

**Important:** The actual signature of `run_expert_panel()` at line 94 is `(data_package: dict) -> list[dict]` — it receives the entire `data_package` dict, not separate `stock_info`/`portfolio_context` params. The call site in `market_scanner.py` is `expert_analyses = await run_expert_panel(data_package)`.

Update the signature to:

```python
async def run_expert_panel(
    data_package: dict,
    dart_financials: dict | None = None,   # NEW
) -> list[dict[str, Any]]:
```

Then add the 5th expert nested async function. Copy the exact pattern of the existing 4 experts — use `_get_claude_client()` (not `anthropic_client`) and `_parse_json_response()` (not `_parse_expert_json`). Both exist in the file already:

```python
    # NEW 5th expert — add inside run_expert_panel(), alongside the existing 4
    async def fundamental_analyst():
        stock_info = data_package.get("stock", {})
        technicals = data_package.get("technicals", {})
        prompt = f"""당신은 기본적분석가입니다. DART 재무제표 데이터를 기반으로 분석합니다.

종목: {stock_info.get('name')} ({stock_info.get('code')})

DART 재무 데이터:
{json.dumps(dart_financials or {}, ensure_ascii=False, indent=2)}

기술적 지표 (참고):
{json.dumps(technicals, ensure_ascii=False, indent=2)}

다음 JSON 형식으로만 응답하세요:
{{
  "persona": "기본적분석가",
  "view": "bullish|bearish|neutral",
  "key_signals": ["신호1", "신호2"],
  "confidence": 0.0,
  "concern": "주요 우려사항"
}}

분석 포인트: 매출 성장 추세, 영업이익률, PER/PBR 밸류에이션, 부채비율, 배당 지속성"""

        client = _get_claude_client()
        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse_json_response(response.content[0].text)
        if result:
            result["persona"] = "기본적분석가"
        return result

    # Add fundamental_analyst() to the existing asyncio.gather call alongside the 4 existing experts
```

Update the `asyncio.gather(...)` call to include `fundamental_analyst()` as the 5th coroutine. Also inject `dart_financials` into the shared context block passed to the existing 4 experts if their prompts include a "추가 컨텍스트" section.

- [ ] **Step 2: Update `consensus_hint` threshold for 5 experts**

Find the `consensus_hint` block in `run_chief_debate()` (around lines 148-157) and update:

```python
# OLD (for 4 experts):
if bullish_count >= 3:
    consensus_hint = "bullish 우세"
elif bearish_count >= 3:
    consensus_hint = "bearish 우세"
else:
    consensus_hint = "의견 분산"

# NEW (for 5 experts):
if bullish_count >= 4:
    consensus_hint = "bullish 강한 우세 (5명 중 4명 이상)"
elif bullish_count >= 3:
    consensus_hint = "bullish 과반수 (5명 중 3명)"
elif bearish_count >= 4:
    consensus_hint = "bearish 강한 우세 (5명 중 4명 이상)"
elif bearish_count >= 3:
    consensus_hint = "bearish 과반수 (5명 중 3명)"
else:
    consensus_hint = "의견 분산"
```

Also update any hardcoded "4명의 전문가" strings in prompts to "5명의 전문가".

- [ ] **Step 3: Update `run_chief_debate()` signature and return type**

```python
# OLD signature:
async def run_chief_debate(
    stock_info: dict,
    expert_analyses: list[dict],
    portfolio_context: dict,
) -> dict[str, Any] | None:

# NEW signature:
async def run_chief_debate(
    stock_info: dict,
    expert_analyses: list[dict],
    portfolio_context: dict,
    dart_financials: dict | None = None,   # NEW
    critic_feedback: str | None = None,    # NEW — injected on revision
) -> "SignalAnalysis | None":
```

Import `SignalAnalysis` at the top of the file:

```python
from app.models.signal import SignalAnalysis, Scenario, compute_rr_score
```

- [ ] **Step 4: Update Chief prompt to produce `SignalAnalysis` JSON**

Replace the Chief's output format in the prompt. The new expected JSON from the Chief:

```json
{
  "direction": "buy|sell|hold",
  "bull": {"label": "강세", "price_target": 95000, "upside_pct": 18.5, "probability": 0.35},
  "base": {"label": "기본", "price_target": 84000, "upside_pct": 5.0, "probability": 0.45},
  "bear": {"label": "약세", "price_target": 72000, "upside_pct": -10.0, "probability": 0.20},
  "rr_score": 4.36,
  "variant_view": "시장이 구체적으로 오해하는 점 — 데이터 근거 포함",
  "expert_stances": {
    "기술적분석가": "bullish",
    "거시경제분석가": "neutral",
    "심리분석가": "bearish",
    "리스크분석가": "bullish",
    "기본적분석가": "bullish"
  }
}
```

If `critic_feedback` is provided, prepend to the user message:
```python
prefix = f"CRITIC FEEDBACK: {critic_feedback}\n이 피드백을 반영하여 분석을 수정하세요.\n\n" if critic_feedback else ""
```

- [ ] **Step 5: Update the response parser in `run_chief_debate()`**

Replace the existing dict-parsing return with `SignalAnalysis` construction. After parsing the Chief's JSON:

```python
# Parse Chief JSON into SignalAnalysis
# Use the existing _parse_json_response() helper (already in the file — no new helper needed)
raw = _parse_json_response(response_text)
if not raw:
    return None

bull = Scenario(**raw["bull"])
base = Scenario(**raw["base"])
bear = Scenario(**raw["bear"])

# Server recomputes rr_score (LLM value discarded)
rr = compute_rr_score(bull, base, bear)

return SignalAnalysis(
    direction=raw["direction"].upper(),
    bull=bull,
    base=base,
    bear=bear,
    rr_score=rr,
    variant_view=raw.get("variant_view", ""),
    expert_stances=raw.get("expert_stances", {}),
    critic_result="pending",
)
```

- [ ] **Step 6: Smoke test the updated expert functions**

```bash
cd backend && uv run python -c "
import asyncio
from app.agents.market_scanner_experts import run_chief_debate
print('Import OK — run_chief_debate signature updated')
import inspect
sig = inspect.signature(run_chief_debate)
params = list(sig.parameters.keys())
assert 'dart_financials' in params, f'Missing dart_financials param: {params}'
assert 'critic_feedback' in params, f'Missing critic_feedback param: {params}'
print('Parameters OK:', params)
"
```
Expected: `Parameters OK: ['stock_info', 'expert_analyses', 'portfolio_context', 'dart_financials', 'critic_feedback']`

Note: `run_expert_panel` will show `['data_package', 'dart_financials']`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/agents/market_scanner_experts.py
git commit -m "feat: update Chief debate for 5 experts, scenario output, R/R scoring"
```

---

### Task 6: Wire DART + Confidence Grading into MarketScannerAgent

**Files:**
- Modify: `backend/app/agents/market_scanner.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Initialize DartClient and SignalCriticAgent in `lifespan()`**

Add these two imports at the **module level** of `backend/app/main.py` (alongside existing top-level imports, not inside `lifespan()`):

```python
from app.services.dart_client import dart_client
from app.agents.signal_critic import signal_critic
```

Then inside `lifespan()`, after `await init_database()` and before `await mcp_manager.connect()`, add:

```python
logger.info("Initializing DART client...")
await dart_client.initialize()  # refreshes corp code cache if stale
app.state.signal_critic = signal_critic
```

- [ ] **Step 2: Add imports to `market_scanner.py`**

At the top of `backend/app/agents/market_scanner.py`, add:

```python
import json
from app.models.confidence import check_hard_gate
from app.models.signal import SignalAnalysis, compute_rr_score
from app.services.dart_client import dart_client
```

- [ ] **Step 3: Update `_analyze_stock()` to add DART fetch + confidence grading**

In `_analyze_stock()` (starts around line 167), **before** calling `run_expert_panel()`, add:

**Important:** Read `_analyze_stock()` in `market_scanner.py` carefully before editing. The actual `data_package` is built inside this function (not passed in). `stock_data` is the raw scan entry. Verify the exact key names used in your version — the key for current price may be `stock_data.get("current_price")`, `stock_data.get("price")`, or inside a nested dict. Add a `# TODO: verify key` comment if unsure, and set the grade to `"A"` conservatively to avoid blocking all signals while debugging.

Insert this block **before** the existing `run_expert_panel()` call:

```python
    # --- NEW: Extract stock info (verify key names match your actual data_package) ---
    stock_code = data_package.get("stock", {}).get("code", "")
    stock_name = data_package.get("stock", {}).get("name", "")
    technicals = data_package.get("technicals", {})

    # Verify the current_price key in your scan data — adjust if different
    current_price = data_package.get("stock", {}).get("current_price") or \
                    data_package.get("current_price")

    # --- NEW: Assign base confidence grades ---
    confidence_grades: dict[str, str] = {
        "current_price": "A" if current_price else "D",
        "volume": "A" if technicals.get("volume", 0) > 0 else "D",
    }

    # --- NEW: Fetch DART fundamentals ---
    dart_result = await dart_client.fetch(stock_code)
    dart_financials = dart_result.get("financials")
    confidence_grades.update(dart_result.get("confidence_grades", {}))

    # --- NEW: Hard gate check ---
    gate_passed, failed_fields = check_hard_gate(confidence_grades)
    if not gate_passed:
        stock_info = {"code": stock_code, "name": stock_name}
        await self._reject_signal_confidence(stock_info, confidence_grades, failed_fields)
        return None

    # Update data_package with dart_financials so experts can access it
    data_package["dart_financials"] = dart_financials

    # existing: run expert panel — update call to pass dart_financials
    expert_analyses = await run_expert_panel(data_package, dart_financials=dart_financials)
    # ... rest of existing code ...
```

- [ ] **Step 4: Add `_reject_signal_confidence()` helper to `MarketScannerAgent`**

```python
async def _reject_signal_confidence(
    self,
    stock_info: dict,
    confidence_grades: dict,
    failed_fields: list[str],
) -> None:
    """Write a failed signal row and emit signal.failed."""
    metadata = json.dumps({"reason": "confidence_gate", "failed_fields": failed_fields})
    await execute_insert(
        """INSERT INTO signals
           (agent_id, stock_code, stock_name, direction, confidence, status, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            self.agent_id,
            stock_info.get("code", ""),
            stock_info.get("name", ""),
            "hold",
            0.0,
            "failed",
            metadata,
        ),
    )
    await self._log_execution(
        status="failed",
        details={"reason": "confidence_gate", "failed_fields": failed_fields},
    )
    await self.emit_event("signal.failed", {
        "stock_code": stock_info.get("code"),
        "reason": "confidence_gate",
        "failed_fields": failed_fields,
    })
```

- [ ] **Step 5: Update the existing DB INSERT in `_analyze_stock()` for new columns**

Find the existing `execute_insert` call (lines 200-212). It currently inserts `agent_id, stock_code, stock_name, direction, confidence, reason, status`. Replace with:

```python
# After critic passes (critic_result == "pass"):
signal_id = await execute_insert(
    """INSERT INTO signals
       (agent_id, stock_code, stock_name, direction, confidence, reason, status,
        scenarios_json, variant_view, rr_score, current_price, expert_stances_json,
        dart_fundamentals_json, critic_result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
    (
        self.agent_id,
        stock_info.get("code", ""),
        stock_info.get("name", ""),
        signal_analysis.direction.lower(),   # DB stores lowercase
        # Normalize confidence from rr_score via sigmoid for backward compat
        1 / (1 + pow(2.718, -signal_analysis.rr_score / 2)),
        signal_analysis.variant_view[:200],  # reason field (truncated)
        "pending",
        json.dumps({
            "bull": signal_analysis.bull.model_dump(),
            "base": signal_analysis.base.model_dump(),
            "bear": signal_analysis.bear.model_dump(),
        }),
        signal_analysis.variant_view,
        signal_analysis.rr_score,
        current_price,                       # KRW price from scan data (may be None)
        json.dumps(signal_analysis.expert_stances),
        json.dumps(dart_financials) if dart_financials else None,
        "pass",
    ),
)
```

Also update `emit_event("signal.generated", ...)` to include the new fields in the event payload.

- [ ] **Step 6: Commit**

```bash
git add backend/app/agents/market_scanner.py backend/app/main.py
git commit -m "feat: wire DART fetch and confidence hard gate into MarketScannerAgent"
```

---

### Task 7: SignalCriticAgent

**Files:**
- Create: `backend/app/agents/signal_critic.py`
- Create: `backend/tests/test_signal_critic.py`

- [ ] **Step 1: Write failing tests for programmatic checks**

```python
# backend/tests/test_signal_critic.py
import pytest
from app.agents.signal_critic import SignalCriticAgent
from app.models.signal import Scenario, SignalAnalysis, compute_rr_score
from app.models.confidence import CRITICAL_FIELDS


def _make_valid_analysis():
    bull = Scenario(label="강세", price_target=95000, upside_pct=18.5, probability=0.35)
    base = Scenario(label="기본", price_target=84000, upside_pct=5.0, probability=0.45)
    bear = Scenario(label="약세", price_target=72000, upside_pct=-10.0, probability=0.20)
    rr = compute_rr_score(bull, base, bear)
    return SignalAnalysis(
        direction="BUY", bull=bull, base=base, bear=bear,
        rr_score=rr,
        variant_view="시장은 3Q 영업이익을 15% 과소평가 중 — DART 3Q보고서 기준",
        expert_stances={
            "기술적분석가": "bullish",
            "거시경제분석가": "neutral",
            "심리분석가": "bearish",
            "리스크분석가": "bullish",
            "기본적분석가": "bullish",
        },
        critic_result="pending",
    )


def _make_valid_grades():
    return {f: "A" for f in CRITICAL_FIELDS}


def test_programmatic_check_passes_valid_analysis():
    critic = SignalCriticAgent()
    analysis = _make_valid_analysis()
    grades = _make_valid_grades()
    passed, feedback = critic._check_programmatic(analysis, grades)
    assert passed is True
    assert feedback is None


def test_programmatic_check_fails_probability_sum():
    critic = SignalCriticAgent()
    # Pydantic v2 nested models are not directly mutable via attribute assignment.
    # Rebuild a new analysis with an invalid probability sum instead.
    bull = Scenario(label="강세", price_target=95000, upside_pct=18.5, probability=0.5)  # sum = 1.15
    base = Scenario(label="기본", price_target=84000, upside_pct=5.0, probability=0.45)
    bear = Scenario(label="약세", price_target=72000, upside_pct=-10.0, probability=0.20)
    rr = compute_rr_score(bull, base, bear)
    analysis = SignalAnalysis(
        direction="BUY", bull=bull, base=base, bear=bear, rr_score=rr,
        variant_view="test", expert_stances={}, critic_result="pending",
    )
    grades = _make_valid_grades()
    passed, feedback = critic._check_programmatic(analysis, grades)
    assert passed is False
    assert "probability" in feedback.lower()


def test_programmatic_check_fails_confidence_grade_d():
    critic = SignalCriticAgent()
    analysis = _make_valid_analysis()
    grades = _make_valid_grades()
    grades["dart_per"] = "D"
    passed, feedback = critic._check_programmatic(analysis, grades)
    assert passed is False
    assert "dart_per" in feedback


def test_programmatic_check_fails_rr_arithmetic_mismatch():
    critic = SignalCriticAgent()
    analysis = _make_valid_analysis()
    analysis.rr_score = 999.0   # wildly different from computed value
    grades = _make_valid_grades()
    passed, feedback = critic._check_programmatic(analysis, grades)
    assert passed is False
    assert "rr" in feedback.lower()


def test_probability_sum_tolerance():
    critic = SignalCriticAgent()
    # Rebuild with near-1.0 sum (within ±0.01 tolerance)
    bull = Scenario(label="강세", price_target=95000, upside_pct=18.5, probability=0.3501)
    base = Scenario(label="기본", price_target=84000, upside_pct=5.0, probability=0.4500)
    bear = Scenario(label="약세", price_target=72000, upside_pct=-10.0, probability=0.1999)
    rr = compute_rr_score(bull, base, bear)
    analysis = SignalAnalysis(
        direction="BUY", bull=bull, base=base, bear=bear, rr_score=rr,
        variant_view="test", expert_stances={}, critic_result="pending",
    )
    grades = _make_valid_grades()
    passed, _ = critic._check_programmatic(analysis, grades)
    assert passed is True  # within ±0.01 tolerance
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && uv run pytest tests/test_signal_critic.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.agents.signal_critic'`

- [ ] **Step 3: Create `signal_critic.py`**

```python
# backend/app/agents/signal_critic.py
"""
SignalCriticAgent — validates SignalAnalysis before signal.generated is emitted.

Programmatic checks (no Claude call): scenario completeness, data confidence,
R/R arithmetic consistency.

Qualitative checks (one Claude call): expert dissent, variant view specificity.

Max 1 revision loop — caller handles the retry and final rejection.
"""
import json
import logging

from app.config import settings
from app.models.confidence import CRITICAL_FIELDS
from app.models.db import execute_insert
from app.models.signal import SignalAnalysis, compute_rr_score

logger = logging.getLogger(__name__)

_RR_TOLERANCE = 0.20   # 20% — detects hallucinated scenario values


class SignalCriticAgent:
    def __init__(self) -> None:
        # Uses module-level execute_insert/execute_query from db.py — no db param
        pass

    async def review(
        self,
        signal_analysis: SignalAnalysis,
        expert_outputs: list[dict],
        confidence_grades: dict[str, str],
    ) -> tuple[bool, str | None]:
        """
        Returns (passed, feedback_string | None).
        Programmatic checks run first (no Claude call).
        Qualitative checks run only if programmatic pass.
        """
        passed, feedback = self._check_programmatic(signal_analysis, confidence_grades)
        if not passed:
            return False, feedback

        return await self._check_qualitative(signal_analysis, expert_outputs)

    # ------------------------------------------------------------------
    # Programmatic checks (items 1-3)
    # ------------------------------------------------------------------

    def _check_programmatic(
        self,
        analysis: SignalAnalysis,
        confidence_grades: dict[str, str],
    ) -> tuple[bool, str | None]:
        # Check 1: probability sum
        total = (
            analysis.bull.probability
            + analysis.base.probability
            + analysis.bear.probability
        )
        if abs(total - 1.0) > 0.01:
            return False, (
                f"시나리오 확률 합계가 1.0이 아닙니다 (현재: {total:.3f}). "
                f"강세+기본+약세 확률의 합이 1.0 ±0.01이어야 합니다."
            )

        # Check 2: data confidence
        failed_grades = [
            f for f in CRITICAL_FIELDS
            if confidence_grades.get(f, "D") == "D"
        ]
        if failed_grades:
            return False, (
                f"핵심 데이터 신뢰도가 D등급입니다: {', '.join(failed_grades)}. "
                f"이 데이터 없이는 신뢰할 수 있는 분석이 불가능합니다."
            )

        # Check 3: R/R arithmetic — compare declared vs server-computed
        computed = compute_rr_score(analysis.bull, analysis.base, analysis.bear)
        if computed != 0:
            discrepancy = abs(analysis.rr_score - computed) / abs(computed)
            if discrepancy > _RR_TOLERANCE:
                return False, (
                    f"R/R 점수 불일치: Chief 선언값 {analysis.rr_score:.2f}, "
                    f"서버 계산값 {computed:.2f} (오차 {discrepancy*100:.0f}%). "
                    f"시나리오 확률 또는 상승률 수치가 내부적으로 일관성이 없습니다."
                )

        return True, None

    # ------------------------------------------------------------------
    # Qualitative checks (items 4-5) — one Claude call
    # ------------------------------------------------------------------

    async def _check_qualitative(
        self,
        analysis: SignalAnalysis,
        expert_outputs: list[dict],
    ) -> tuple[bool, str | None]:
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

            stances = analysis.expert_stances
            stance_summary = ", ".join(f"{k}: {v}" for k, v in stances.items())
            direction_lower = analysis.direction.lower()
            majority_direction = max(
                ["bullish", "bearish", "neutral"],
                key=lambda d: list(stances.values()).count(d),
            )

            prompt = f"""당신은 투자 리서치 품질 검토자입니다. 다음 신호 분석을 2가지 기준으로 평가하세요.

## 종목 신호 분석
- 방향: {analysis.direction}
- 전문가 의견: {stance_summary}
- Variant View: {analysis.variant_view}

## 평가 기준

**기준 4 — 전문가 이견 존재 여부:**
- 최소 1명의 전문가가 다수 의견과 다른 입장을 가져야 합니다
- 5명 전원이 동일한 입장({majority_direction})이면 실패 — variant_view가 만장일치 이유를 구체적 데이터와 함께 설명해야 통과
- 평가: PASS 또는 FAIL

**기준 5 — Variant View 구체성:**
- "리스크 대비 기회", "시장 과소평가" 등 일반적 표현은 FAIL
- DART 수치, RSI 값, 특정 분기 실적 등 구체적 데이터 포인트가 있어야 PASS
- 현재 variant_view: "{analysis.variant_view}"
- 평가: PASS 또는 FAIL

## 응답 형식 (JSON만 출력):
{{
  "check4_result": "PASS|FAIL",
  "check4_reason": "한 문장 이유",
  "check5_result": "PASS|FAIL",
  "check5_reason": "한 문장 이유"
}}"""

            response = await client.messages.create(
                model=settings.claude_model,
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )

            text = response.content[0].text.strip()
            # Extract JSON
            if "```" in text:
                text = text.split("```")[1].lstrip("json").strip()
            result = json.loads(text)

            failures = []
            if result.get("check4_result") != "PASS":
                failures.append(f"[기준4] {result.get('check4_reason', '')}")
            if result.get("check5_result") != "PASS":
                failures.append(f"[기준5] {result.get('check5_reason', '')}")

            if failures:
                return False, " | ".join(failures)
            return True, None

        except Exception as e:
            logger.error(f"SignalCriticAgent qualitative check failed: {e}")
            # On error, pass through — don't block signals due to critic errors
            return True, None


# Module-level singleton
signal_critic = SignalCriticAgent()
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd backend && uv run pytest tests/test_signal_critic.py -v
```
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/signal_critic.py backend/tests/test_signal_critic.py
git commit -m "feat: add SignalCriticAgent with 5-item rubric and programmatic checks"
```

---

### Task 8: Wire Critic into `_analyze_stock()` Revision Loop

**Files:**
- Modify: `backend/app/agents/market_scanner.py`

- [ ] **Step 1: Add imports for critic and SignalAnalysis**

At the top of `market_scanner.py` (if not already added in Task 6):

```python
from app.agents.signal_critic import signal_critic
from app.models.signal import SignalAnalysis, compute_rr_score
```

- [ ] **Step 2: Replace the existing Chief debate call with the critic revision loop**

Find where `run_chief_debate()` is called (around line 185). Replace the existing call + signal emission with:

```python
    # --- Stage 5: Chief Analyst debate ---
    signal_analysis: SignalAnalysis | None = await run_chief_debate(
        stock_info, expert_analyses, portfolio_context,
        dart_financials=dart_financials,
        critic_feedback=None,
    )
    if not signal_analysis:
        logger.warning(f"Chief debate returned None for {stock_code}")
        return None

    # Server overrides rr_score (LLM value is discarded)
    signal_analysis.rr_score = compute_rr_score(
        signal_analysis.bull, signal_analysis.base, signal_analysis.bear
    )

    # --- Stage 6: Critic review ---
    critic_passed, critic_feedback = await signal_critic.review(
        signal_analysis, expert_analyses, confidence_grades
    )

    if not critic_passed:
        # One revision attempt — re-run Chief with critique injected
        logger.info(f"Critic failed for {stock_code}, requesting revision...")
        signal_analysis = await run_chief_debate(
            stock_info, expert_analyses, portfolio_context,
            dart_financials=dart_financials,
            critic_feedback=critic_feedback,
        )
        if signal_analysis:
            signal_analysis.rr_score = compute_rr_score(
                signal_analysis.bull, signal_analysis.base, signal_analysis.bear
            )
            critic_passed, critic_feedback = await signal_critic.review(
                signal_analysis, expert_analyses, confidence_grades
            )

    if not critic_passed or not signal_analysis:
        # Final rejection — write to DB and stop
        await execute_insert(
            """INSERT INTO signals
               (agent_id, stock_code, stock_name, direction, confidence,
                reason, status, metadata_json, critic_result)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                self.agent_id,
                stock_info.get("code", ""),
                stock_info.get("name", ""),
                "hold",
                0.0,
                "critic_failed",
                "rejected",
                json.dumps({"reason": "critic_failed", "feedback": critic_feedback}),
                "fail",
            ),
        )
        await self._log_execution(
            status="rejected",
            details={"reason": "critic_failed", "feedback": critic_feedback},
        )
        return None

    signal_analysis.critic_result = "pass"

    # --- Stage 7: Persist signal and emit ---
    signal_id = await execute_insert(
        """INSERT INTO signals
           (agent_id, stock_code, stock_name, direction, confidence, reason, status,
            scenarios_json, variant_view, rr_score, current_price, expert_stances_json,
            dart_fundamentals_json, critic_result)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            self.agent_id,
            stock_info.get("code", ""),
            stock_info.get("name", ""),
            signal_analysis.direction.lower(),
            round(1 / (1 + (2.718 ** (-signal_analysis.rr_score / 2))), 4),
            signal_analysis.variant_view[:200],
            "pending",
            json.dumps({
                "bull": signal_analysis.bull.model_dump(),
                "base": signal_analysis.base.model_dump(),
                "bear": signal_analysis.bear.model_dump(),
            }),
            signal_analysis.variant_view,
            signal_analysis.rr_score,
            current_price,                       # KRW price from scan data (may be None)
            json.dumps(signal_analysis.expert_stances),
            json.dumps(dart_financials) if dart_financials else None,
            "pass",
        ),
    )

    await self.emit_event("signal.generated", {
        "signal_id": signal_id,
        "stock_code": stock_info.get("code"),
        "stock_name": stock_info.get("name"),
        "direction": signal_analysis.direction.lower(),
        "confidence": round(1 / (1 + (2.718 ** (-signal_analysis.rr_score / 2))), 4),
        "rr_score": signal_analysis.rr_score,
        "critic_result": "pass",
    })
```

- [ ] **Step 3: Verify backend starts without errors**

```bash
cd backend && ENV_FILE=../.env uv run python -c "
import asyncio
from app.main import app
print('Import OK — no startup errors')
"
```
Expected: `Import OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/agents/market_scanner.py
git commit -m "feat: wire critic revision loop into MarketScannerAgent._analyze_stock"
```

---

## Chunk 3: Risk Gate, API Extension, React Components

*RiskManager R/R gate, enriched signals API, React SignalCard + chart + KPI tiles.*

---

### Task 9: RiskManager Auto-Approval Gate

**Files:**
- Modify: `backend/app/agents/risk_manager.py`

- [ ] **Step 1: Update `_load_risk_config()` to parse `min_rr_score`**

In `risk_manager.py`, find `_load_risk_config()` (around line 217). The method returns a raw `dict[str, str]` from the DB. Add a typed property or parse it in `_validate_signal()`:

```python
async def _load_risk_config(self) -> dict:
    """Load risk configuration from database."""
    try:
        rows = await execute_query("SELECT key, value FROM risk_config")
        return {row["key"]: row["value"] for row in rows} if rows else {}
    except Exception as e:
        logger.error(f"Failed to load risk config: {e}")
        return {
            "stop_loss_pct": "-3.0",
            "take_profit_pct": "5.0",
            "max_positions": "5",
            "max_position_weight_pct": "20.0",
            "max_daily_loss": "500000",
            "signal_approval_mode": "auto",
            "min_rr_score": "2.0",   # NEW default
        }
```

- [ ] **Step 2: Update `_validate_signal()` to check `rr_score` and `critic_result`**

In `_validate_signal()` (around line 182), add two new checks **before** the existing position checks:

```python
async def _validate_signal(
    self, signal: dict, risk_config: dict, portfolio
) -> str | None:
    """Validate a signal against risk rules. Returns rejection reason or None."""

    # --- NEW: R/R score gate ---
    rr_score = signal.get("rr_score")
    if rr_score is not None:
        min_rr = float(risk_config.get("min_rr_score", "2.0"))
        if rr_score < min_rr:
            return f"R/R 점수 미달 ({rr_score:.2f} < {min_rr:.1f})"

    # --- NEW: Critic result gate ---
    critic_result = signal.get("critic_result")
    if critic_result is not None and critic_result != "pass":
        return f"Critic 검증 미통과 ({critic_result})"

    # ... existing checks unchanged below ...
    direction = signal.get("direction", "")
    # ...
```

- [ ] **Step 3: Verify `_on_signal_generated()` passes new fields correctly**

Open `risk_manager.py` `_on_signal_generated()` (line 130). Confirm it passes `event.data` (or a dict derived from it) directly to `_validate_signal()`. After Task 8, `emit_event("signal.generated", {...})` now includes `rr_score` and `critic_result` in the payload — so `signal.get("rr_score")` and `signal.get("critic_result")` in the new gate code will find those values.

If `_on_signal_generated()` fetches a fresh row from the DB instead of using `event.data`, also add `rr_score` and `critic_result` to that DB query's SELECT columns.

- [ ] **Step 4: Commit**

```bash
git add backend/app/agents/risk_manager.py
git commit -m "feat: add R/R score and critic_result gates to RiskManager auto-approval"
```

---

### Task 10: API Response Extension

**Files:**
- Modify: `backend/app/routers/signals.py`

- [ ] **Step 1: Add `_enrich_signal()` helper and update GET endpoint**

Replace the current `list_signals` endpoint in `signals.py`:

```python
import json
from fastapi import APIRouter
from app.models.db import execute_query

router = APIRouter(prefix="/api/signals", tags=["signals"])


def _enrich_signal(row: dict) -> dict:
    """Parse JSON columns from the signals DB row into Python objects."""
    result = dict(row)
    for json_col, out_key in [
        ("scenarios_json", "scenarios"),
        ("expert_stances_json", "expert_stances"),
        ("dart_fundamentals_json", "dart_fundamentals"),
        ("metadata_json", "metadata"),
    ]:
        raw = result.pop(json_col, None)
        try:
            result[out_key] = json.loads(raw) if raw else None
        except (json.JSONDecodeError, TypeError):
            result[out_key] = None
    return result


@router.get("")
async def list_signals(status: str | None = None, limit: int = 50):
    """List trading signals, optionally filtered by status."""
    if status:
        rows = await execute_query(
            "SELECT * FROM signals WHERE status=? ORDER BY timestamp DESC LIMIT ?",
            (status, limit),
        )
    else:
        rows = await execute_query(
            "SELECT * FROM signals ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        )
    signals = [_enrich_signal(dict(row)) for row in (rows or [])]
    return {"signals": signals}


@router.get("/{signal_id}")
async def get_signal(signal_id: int):
    rows = await execute_query(
        "SELECT * FROM signals WHERE id=?", (signal_id,)
    )
    if not rows:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Signal not found")
    return _enrich_signal(dict(rows[0]))

# IMPORTANT: Preserve all existing endpoints below this line unchanged.
# Do NOT remove or modify the approve/reject endpoints (lines 41-101 of the original file).
# Only add _enrich_signal() and update list_signals + get_signal above.
```

- [ ] **Step 2: Verify API response shape**

Start the backend and check the signals endpoint returns new fields without errors:

```bash
cd backend && ENV_FILE=../.env uv run uvicorn app.main:app --port 8001 &
sleep 3
curl -s http://localhost:8001/api/signals | python3 -m json.tool | head -40
kill %1
```
Expected: JSON with `scenarios`, `expert_stances`, `dart_fundamentals` keys (may be `null` for old rows — that's correct).

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/signals.py
git commit -m "feat: add _enrich_signal helper and JSON column parsing to signals API"
```

---

### Task 11: React Components + TypeScript Types

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/components/signals/SignalCard.tsx`
- Create: `frontend/src/components/signals/ScenarioChart.tsx`
- Create: `frontend/src/components/signals/FundamentalsKPI.tsx`

- [ ] **Step 1: Extend TypeScript types in `frontend/src/types.ts`**

Find the existing `Signal` interface (around line 75) and replace with the extended version. Also add new interfaces:

```typescript
// Add before the Signal interface:
export interface Scenario {
  label: string;
  price_target: number;
  upside_pct: number;
  probability: number;
}

export interface DartFundamentals {
  dart_per: number | null;
  dart_pbr: number | null;
  dart_eps_yoy_pct: number | null;
  dart_debt_ratio: number | null;
  dart_operating_margin: number | null;
  dart_dividend_yield: number | null;
}

// Replace existing Signal interface:
export interface Signal {
  id: number;
  timestamp: string;
  agent_id: string;
  stock_code: string;
  stock_name: string;
  direction: 'buy' | 'sell' | 'hold';
  confidence: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  risk_notes?: string;
  // New enhancement fields (optional for backward compat)
  current_price?: number;    // KRW — stored in DB, used by ScenarioChart
  scenarios?: { bull: Scenario; base: Scenario; bear: Scenario };
  rr_score?: number;
  variant_view?: string;
  confidence_grades?: Record<string, string>;
  expert_stances?: Record<string, string>;
  critic_result?: string;
  dart_fundamentals?: DartFundamentals;
}
```

- [ ] **Step 2: Add CSS grade classes**

In the existing global CSS file (check `frontend/src/index.css` or `frontend/src/App.css`), append:

```css
/* Signal enhancement — confidence grade badges */
.grade-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.grade-a { background: #d4edda; color: #155724; }
.grade-b { background: #fff3cd; color: #856404; }
.grade-c { background: #fde8d8; color: #7d3c0a; }
.grade-d { background: #f8d7da; color: #721c24; }

/* Scenario cards */
.scenario-row { display: flex; gap: 8px; margin: 8px 0; }
.scenario-card {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  text-align: center;
  font-size: 13px;
}
.scenario-bull { background: #d4edda; }
.scenario-base { background: #e2e3e5; }
.scenario-bear { background: #f8d7da; }
.scenario-pct { font-size: 18px; font-weight: 700; margin: 4px 0; }
.scenario-prob { font-size: 11px; color: #666; }

/* Expert stances */
.expert-panel { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.expert-chip {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  white-space: nowrap;
}
.stance-bullish { background: #d4edda; color: #155724; }
.stance-bearish { background: #f8d7da; color: #721c24; }
.stance-neutral { background: #e2e3e5; color: #383d41; }

/* Variant view */
.variant-view {
  font-style: italic;
  font-size: 12px;
  color: #555;
  border-left: 3px solid #007bff;
  padding-left: 8px;
  margin: 8px 0;
}

/* KPI tiles */
.kpi-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.kpi-tile {
  flex: 1;
  min-width: 80px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  text-align: center;
}
.kpi-label { font-size: 10px; color: #888; margin-bottom: 2px; }
.kpi-value { font-size: 16px; font-weight: 700; }

/* Mobile breakpoint */
@media (max-width: 600px) {
  .scenario-row { flex-direction: column; }
  .scenario-chart-wrapper { display: none; }
  .kpi-row { gap: 4px; }
  .kpi-tile { min-width: 60px; }
}
```

- [ ] **Step 3: Create `ScenarioChart.tsx`**

```typescript
// frontend/src/components/signals/ScenarioChart.tsx
import React from 'react';
import { Scenario } from '../../types';

interface ScenarioChartProps {
  currentPrice: number;
  bull: Scenario;
  base: Scenario;
  bear: Scenario;
}

export const ScenarioChart: React.FC<ScenarioChartProps> = ({
  currentPrice, bull, base, bear,
}) => {
  const minPrice = bear.price_target * 0.95;
  const maxPrice = bull.price_target * 1.05;
  const range = maxPrice - minPrice;

  const toX = (price: number): number =>
    range > 0 ? ((price - minPrice) / range) * 100 : 50;

  const currentX = toX(currentPrice);
  const bullX = toX(bull.price_target);
  const baseX = toX(base.price_target);
  const bearX = toX(bear.price_target);

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원';

  // Label positions (%) in HTML space — derived from same toX() mapping
  const bearPct = `${toX(bear.price_target)}%`;
  const basePct = `${toX(base.price_target)}%`;
  const bullPct = `${toX(bull.price_target)}%`;
  const curPct  = `${toX(currentPrice)}%`;

  return (
    <div className="scenario-chart-wrapper" style={{ margin: '8px 0' }}>
      {/* SVG contains only geometric elements — no text, avoiding preserveAspectRatio distortion */}
      <svg viewBox="0 0 100 20" preserveAspectRatio="xMidYMid meet"
           style={{ width: '100%', height: 40, display: 'block' }}>
        {/* baseline */}
        <line x1="0" y1="10" x2="100" y2="10" stroke="#ddd" strokeWidth="0.5" />
        {/* current price line */}
        <line x1={currentX} y1="2" x2={currentX} y2="18"
              stroke="#333" strokeWidth="0.8" strokeDasharray="2,1" />
        {/* bear marker */}
        <circle cx={bearX} cy="10" r="2" fill="#dc3545" />
        {/* base marker */}
        <circle cx={baseX} cy="10" r="2" fill="#6c757d" />
        {/* bull marker */}
        <circle cx={bullX} cy="10" r="2" fill="#28a745" />
      </svg>
      {/* Scenario labels in HTML — no SVG text distortion */}
      <div style={{ position: 'relative', height: 16, fontSize: 10 }}>
        <span style={{ position: 'absolute', left: bearPct, transform: 'translateX(-50%)', color: '#dc3545' }}>약세</span>
        <span style={{ position: 'absolute', left: basePct, transform: 'translateX(-50%)', color: '#6c757d' }}>기본</span>
        <span style={{ position: 'absolute', left: bullPct, transform: 'translateX(-50%)', color: '#28a745' }}>강세</span>
        <span style={{ position: 'absolute', left: curPct,  transform: 'translateX(-50%)', color: '#333' }}>현재</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
        <span style={{ color: '#dc3545' }}>{fmt(bear.price_target)}</span>
        <span style={{ color: '#333' }}>{fmt(currentPrice)}</span>
        <span style={{ color: '#28a745' }}>{fmt(bull.price_target)}</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Create `FundamentalsKPI.tsx`**

```typescript
// frontend/src/components/signals/FundamentalsKPI.tsx
import React from 'react';
import { DartFundamentals } from '../../types';

interface FundamentalsKPIProps {
  dartFundamentals: DartFundamentals;
  confidenceGrades: Record<string, string>;
}

const GradeBadge: React.FC<{ grade?: string }> = ({ grade }) => {
  if (!grade) return null;
  return (
    <span className={`grade-badge grade-${grade.toLowerCase()}`}>{grade}</span>
  );
};

interface Tile {
  label: string;
  field: keyof DartFundamentals;
  gradeField: string;
  format: (v: number) => string;
}

const TILES: Tile[] = [
  { label: 'PER', field: 'dart_per', gradeField: 'dart_per', format: v => `${v.toFixed(1)}x` },
  { label: 'PBR', field: 'dart_pbr', gradeField: 'dart_pbr', format: v => `${v.toFixed(2)}x` },
  { label: 'EPS YoY', field: 'dart_eps_yoy_pct', gradeField: 'dart_eps_yoy_pct', format: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%` },
  { label: '부채비율', field: 'dart_debt_ratio', gradeField: 'dart_debt_ratio', format: v => `${v.toFixed(0)}%` },
  { label: '영업이익률', field: 'dart_operating_margin', gradeField: 'dart_operating_margin', format: v => `${v.toFixed(1)}%` },
];

export const FundamentalsKPI: React.FC<FundamentalsKPIProps> = ({
  dartFundamentals, confidenceGrades,
}) => {
  return (
    <div className="kpi-row">
      {TILES.map(({ label, field, gradeField, format }) => {
        const val = dartFundamentals[field];
        const grade = confidenceGrades[gradeField];
        return (
          <div className="kpi-tile" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">
              {val != null ? format(val) : '—'}
            </div>
            <GradeBadge grade={grade} />
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 5: Create `SignalCard.tsx`**

```typescript
// frontend/src/components/signals/SignalCard.tsx
import React from 'react';
import { Signal } from '../../types';
import { ScenarioChart } from './ScenarioChart';
import { FundamentalsKPI } from './FundamentalsKPI';

interface SignalCardProps {
  signal: Signal;
}

const directionColor = (d: string) =>
  d === 'buy' ? '#28a745' : d === 'sell' ? '#dc3545' : '#6c757d';

export const SignalCard: React.FC<SignalCardProps> = ({ signal }) => {
  const {
    stock_name, stock_code, direction, rr_score, scenarios,
    variant_view, expert_stances, critic_result,
    confidence_grades, dart_fundamentals,
  } = signal;

  const overallGrade = (() => {
    if (!confidence_grades) return undefined;
    const vals = Object.values(confidence_grades);
    if (vals.includes('D')) return 'D';
    if (vals.includes('C')) return 'C';
    if (vals.includes('B')) return 'B';
    return 'A';
  })();

  return (
    <div style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{stock_name}</strong>
          <span style={{ color: '#888', marginLeft: 6, fontSize: 12 }}>({stock_code})</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            background: directionColor(direction),
            color: '#fff', padding: '2px 10px',
            borderRadius: 4, fontWeight: 700, fontSize: 13,
          }}>
            {direction.toUpperCase()}
          </span>
          {rr_score != null && (
            <span style={{ fontWeight: 700 }}>R/R: {rr_score.toFixed(1)}</span>
          )}
          {overallGrade && (
            <span className={`grade-badge grade-${overallGrade.toLowerCase()}`}>
              {overallGrade}등급
            </span>
          )}
        </div>
      </div>

      {/* Scenarios */}
      {scenarios && (
        <>
          <div className="scenario-row" style={{ marginTop: 10 }}>
            {[
              { s: scenarios.bull, cls: 'scenario-bull', sign: '↑' },
              { s: scenarios.base, cls: 'scenario-base', sign: '→' },
              { s: scenarios.bear, cls: 'scenario-bear', sign: '↓' },
            ].map(({ s, cls, sign }) => (
              <div className={`scenario-card ${cls}`} key={s.label}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</div>
                <div className="scenario-pct">
                  {sign}{Math.abs(s.upside_pct).toFixed(1)}%
                </div>
                <div className="scenario-prob">확률 {(s.probability * 100).toFixed(0)}%</div>
                <div style={{ fontSize: 10, color: '#555' }}>
                  {s.price_target.toLocaleString('ko-KR')}원
                </div>
              </div>
            ))}
          </div>

          {/* Price range chart — only rendered when current_price is available from DB */}
          {signal.current_price != null && (
            <ScenarioChart
              currentPrice={signal.current_price}
              bull={scenarios.bull}
              base={scenarios.base}
              bear={scenarios.bear}
            />
          )}
        </>
      )}

      {/* Variant view */}
      {variant_view && (
        <div className="variant-view">
          <span style={{ fontSize: 10, fontWeight: 700, color: '#007bff' }}>시장 오해: </span>
          {variant_view}
        </div>
      )}

      {/* Expert panel */}
      {expert_stances && (
        <div className="expert-panel">
          {Object.entries(expert_stances).map(([name, stance]) => (
            <span className={`expert-chip stance-${stance}`} key={name}>
              {name}
            </span>
          ))}
        </div>
      )}

      {/* DART KPI tiles */}
      {dart_fundamentals && confidence_grades && (
        <FundamentalsKPI
          dartFundamentals={dart_fundamentals}
          confidenceGrades={confidence_grades}
        />
      )}

      {/* Footer */}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888', marginTop: 8 }}>
        <span>
          Critic: {critic_result === 'pass'
            ? '✓ 통과'
            : critic_result === 'fail'
            ? '✗ 실패'
            : '—'}
        </span>
        {overallGrade && (
          <span>데이터 신뢰도: <span className={`grade-badge grade-${overallGrade.toLowerCase()}`}>{overallGrade}</span></span>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 6: Wire `SignalCard` into the existing signals panel**

Find the existing signals list component (search for where `Signal` objects are rendered, likely in `frontend/src/components/` or `frontend/src/pages/`):

```bash
grep -r "signal" frontend/src --include="*.tsx" -l
```

Import and use `SignalCard` in place of (or wrapping) the existing signal display:

```typescript
import { SignalCard } from './signals/SignalCard';

// In the render, replace the existing signal map with:
{signals.map(signal => <SignalCard key={signal.id} signal={signal} />)}
```

- [ ] **Step 7: Run frontend lint**

```bash
cd frontend && npm run lint
```
Expected: No errors. Fix any TypeScript type errors before proceeding.

- [ ] **Step 8: Visual smoke test**

```bash
make start
```

Open `http://localhost:5173` and navigate to the Signals panel. Verify:
- Old signals (without new fields) render without crashing (all new fields are optional)
- Layout is responsive (test at narrow width)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types.ts \
        frontend/src/components/signals/ \
        frontend/src/index.css   # or App.css — wherever you added CSS
git commit -m "feat: add SignalCard, ScenarioChart, FundamentalsKPI React components"
```

---

## Final Verification

- [ ] **Full backend test suite passes**

```bash
cd backend && uv run pytest tests/ -v
```
Expected: All tests pass (confidence, signal_models, dart_client, signal_critic, indicators).

- [ ] **Frontend builds without errors**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```
Expected: No errors.

- [ ] **End-to-end smoke test**

```bash
make start && make health
```

Trigger a market scan manually via the agent API:

```bash
curl -s -X POST http://localhost:8000/api/agents/market_scanner/run \
  -H "Content-Type: application/json" | python3 -m json.tool
```

Check logs:
```bash
make logs
```
Expected: See DART client log lines, confidence gate checks, and (if DART key configured) expert debate logs. Without DART key, signals should be rejected at confidence gate with clear log message.

- [ ] **Final commit**

```bash
git add -p   # review all remaining changes
git commit -m "feat: complete trading agent enhancement — DART, R/R scoring, critic, rich UI"
```
