# Dashboard Reactivity & Report Viewer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard react to live agent events and add a dedicated Report Viewer page with structured KPI tiles, trade tables, and markdown narrative.

**Architecture:** Two independent vertical slices. Slice A wires WebSocket events to targeted panel refreshes, persists events to DB, shows agent logs and risk alerts. Slice B adds a 4th "Reports" tab with structured `summary_json` and a full-page viewer. Backend changes are additive (new table, new columns, enrichment helpers).

**Tech Stack:** React 19, TypeScript, CSS variables, FastAPI, aiosqlite. No new dependencies.

**`execute_insert` calling convention (use throughout):** `await execute_insert("INSERT INTO table (col1, col2) VALUES (?, ?)", (val1, val2))` — raw SQL string + params tuple.

**Spec:** `docs/superpowers/specs/2026-03-17-dashboard-reactivity-report-viewer-design.md`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `frontend/src/components/ReportViewer.tsx` | Full-page report viewer with sidebar list, KPI tiles, trade table, signal summary, risk timeline, markdown narrative |
| `frontend/src/components/dashboard/RiskAlertBanner.tsx` | Dismissible banner for stop-loss/take-profit events |
| `backend/tests/test_event_persistence.py` | Tests for event bus DB persistence and `/api/agents/events` DB query |
| `backend/tests/test_report_summary.py` | Tests for `_compute_summary()` KPI arithmetic |

### Modified Files
| File | Change |
|------|--------|
| `backend/app/models/database.py` | Add `agent_events` table; add `confidence_grades_json` column to `signals` |
| `backend/app/models/db.py` | Migration guard for `confidence_grades_json` |
| `backend/app/agents/event_bus.py` | DB persistence via `asyncio.create_task()` |
| `backend/app/agents/market_scanner.py` | Serialize `confidence_grades` into INSERT |
| `backend/app/agents/report_generator.py` | Add `_compute_summary()`, pass richer `summary_json` |
| `backend/app/routers/agents.py` | `GET /api/agents/events` reads from DB |
| `backend/app/routers/signals.py` | Parse `confidence_grades_json` in `_enrich_signal()` |
| `backend/app/routers/reports.py` | Add `_enrich_report()` to parse `summary_json` |
| `frontend/src/types.ts` | Add report summary interfaces; extend `AppView` |
| `frontend/src/App.tsx` | Add `'reports'` view case |
| `frontend/src/components/HeaderBar.tsx` | Add "Reports" tab + `onOpenReports` prop |
| `frontend/src/components/Sidebar.tsx` | Add "Reports" nav link + `onOpenReports` prop |
| `frontend/src/components/DashboardView.tsx` | Targeted WS refetch, remove ReportList, add RiskAlertBanner |
| `frontend/src/components/dashboard/SignalPanel.tsx` | Accept `refreshTrigger` prop |
| `frontend/src/components/dashboard/OrderHistory.tsx` | Accept `refreshTrigger` prop |
| `frontend/src/components/dashboard/PerformanceChart.tsx` | Accept `refreshTrigger` prop |
| `frontend/src/components/dashboard/AgentPanel.tsx` | Fetch + display agent logs |
| `frontend/src/components/dashboard/AlertFeed.tsx` | Fetch persisted events on mount |
| `frontend/src/services/api.ts` | Add `getReport(id)` function |
| `frontend/src/App.css` | Styles for ReportViewer, KPI tiles, risk banner, agent logs |

### Deleted Files
| File | Reason |
|------|--------|
| `frontend/src/components/dashboard/ReportList.tsx` | Replaced by `ReportViewer.tsx` |

---

## Chunk 1: Backend Data Layer

*Event persistence, confidence_grades fix, DB schema. No frontend changes.*

---

### Task 1: Add `agent_events` Table and `confidence_grades_json` Column

**Files:**
- Modify: `backend/app/models/database.py`
- Modify: `backend/app/models/db.py`

- [ ] **Step 1: Add `agent_events` table to SCHEMA_SQL**

In `backend/app/models/database.py`, add after the `dart_financials_cache` table (before the closing `"""`):

```sql
CREATE TABLE IF NOT EXISTS agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    agent_id TEXT,
    data TEXT,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp ON agent_events(timestamp);
```

Also add `confidence_grades_json TEXT` column to the `signals` table definition. Add a comma after `critic_result TEXT`, then the new column:

```sql
    critic_result TEXT,
    confidence_grades_json TEXT
```

- [ ] **Step 2: Add migration guard in `db.py`**

In `backend/app/models/db.py`, add to the `_ALTER_STATEMENTS` list after `"ALTER TABLE signals ADD COLUMN critic_result TEXT"`:

```python
            "ALTER TABLE signals ADD COLUMN confidence_grades_json TEXT",
```

- [ ] **Step 3: Verify schema loads without error**

```bash
cd backend && uv run python -c "from app.models.database import SCHEMA_SQL; print('OK:', len(SCHEMA_SQL))"
```
Expected: `OK:` followed by character count (no syntax error)

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/database.py backend/app/models/db.py
git commit -m "feat: add agent_events table and confidence_grades_json column"
```

---

### Task 2: Event Bus DB Persistence

**Files:**
- Modify: `backend/app/agents/event_bus.py`
- Create: `backend/tests/test_event_persistence.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_event_persistence.py
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch

from app.agents.event_bus import EventBus, AgentEvent


@pytest.fixture
def bus():
    return EventBus()


@pytest.mark.asyncio
async def test_event_stored_in_history(bus):
    event = AgentEvent(event_type="test.event", agent_id="test")
    await bus.publish(event)
    await asyncio.sleep(0)  # yield to let create_task run
    history = bus.get_history(limit=10)
    assert len(history) == 1
    assert history[0]["event_type"] == "test.event"


@pytest.mark.asyncio
@patch("app.agents.event_bus.execute_insert", new_callable=AsyncMock)
async def test_event_persisted_to_db(mock_insert, bus):
    event = AgentEvent(
        event_type="signal.generated",
        agent_id="scanner",
        data={"signal_id": 1},
    )
    await bus.publish(event)
    await asyncio.sleep(0)  # yield to let create_task run
    mock_insert.assert_called_once()
    call_args = mock_insert.call_args
    assert "INSERT INTO agent_events" in call_args[0][0]
    params = call_args[0][1]
    assert params[0] == "signal.generated"
    assert params[1] == "scanner"
    assert json.loads(params[2]) == {"signal_id": 1}


@pytest.mark.asyncio
@patch("app.agents.event_bus.execute_insert", new_callable=AsyncMock)
async def test_db_error_does_not_block_event(mock_insert, bus):
    mock_insert.side_effect = Exception("DB error")
    event = AgentEvent(event_type="test.event", agent_id="test")
    # Should not raise
    await bus.publish(event)
    await asyncio.sleep(0)  # yield to let create_task run
    # Event still in memory history
    assert len(bus.get_history()) == 1
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && uv run pytest tests/test_event_persistence.py -v
```
Expected: `test_event_persisted_to_db` fails (no DB insert in event_bus yet)

- [ ] **Step 3: Add DB persistence to `event_bus.py`**

Add import at top of `backend/app/agents/event_bus.py`:

```python
import json
```

Add after the existing imports:

```python
from app.models.db import execute_insert
```

Add a `_persist_event` method to the `EventBus` class, and call it from `publish`:

In the `publish` method, after `self._history.append(event)` (inside the lock block), add:

```python
        # Fire-and-forget DB persistence
        asyncio.create_task(self._persist_event(event))
```

Add the new method to the `EventBus` class:

```python
    async def _persist_event(self, event: AgentEvent) -> None:
        """Persist event to DB. Errors are suppressed to avoid blocking event delivery."""
        try:
            await execute_insert(
                "INSERT INTO agent_events (event_type, agent_id, data, timestamp) VALUES (?, ?, ?, ?)",
                (
                    event.event_type,
                    event.agent_id,
                    json.dumps(event.data) if event.data else "{}",
                    event.timestamp,
                ),
            )
        except Exception as e:
            logger.warning(f"Failed to persist event {event.event_type}: {e}")
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd backend && uv run pytest tests/test_event_persistence.py -v
```
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/event_bus.py backend/tests/test_event_persistence.py
git commit -m "feat: persist agent events to DB via fire-and-forget task"
```

---

### Task 3: Read Events from DB in API

**Files:**
- Modify: `backend/app/routers/agents.py`

- [ ] **Step 1: Update `get_agent_events` endpoint**

Replace the `get_agent_events` function in `backend/app/routers/agents.py`:

```python
@router.get("/events")
async def get_agent_events(limit: int = Query(default=100, ge=1, le=1000)):
    """Get recent events — from DB if available, falling back to in-memory."""
    try:
        rows = await execute_query(
            "SELECT event_type, agent_id, data, timestamp FROM agent_events ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        if rows:
            events = []
            for row in rows:
                evt = dict(row)
                try:
                    evt["data"] = json.loads(evt["data"]) if evt["data"] else {}
                except (json.JSONDecodeError, TypeError):
                    evt["data"] = {}
                events.append(evt)
            return {"events": events}
    except Exception:
        pass  # table may not exist yet — fall back
    events = event_bus.get_history(limit)
    return {"events": events}
```

Add `import json` to the top of the file if not already present.

- [ ] **Step 2: Verify endpoint works**

```bash
cd backend && uv run python -c "
import asyncio
from app.models.db import init_database
asyncio.run(init_database())
print('DB initialized')
"
```
Expected: `DB initialized`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/agents.py
git commit -m "feat: read agent events from DB with in-memory fallback"
```

---

### Task 4: Fix `confidence_grades_json` Pipeline

**Files:**
- Modify: `backend/app/agents/market_scanner.py`
- Modify: `backend/app/routers/signals.py`

- [ ] **Step 1: Add `confidence_grades_json` to market_scanner INSERT**

In `backend/app/agents/market_scanner.py`, update the Stage 6 INSERT (around line 276-302). Change the column list and VALUES:

```python
        signal_id = await execute_insert(
            """INSERT INTO signals
               (agent_id, stock_code, stock_name, direction, confidence, reason, status,
                scenarios_json, variant_view, rr_score, current_price, expert_stances_json,
                dart_fundamentals_json, critic_result, confidence_grades_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                self.agent_id,
                stock_code,
                stock_name,
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
                current_price,
                json.dumps(signal_analysis.expert_stances),
                json.dumps(dart_financials) if dart_financials else None,
                "pass",
                json.dumps(confidence_grades),
            ),
        )
```

- [ ] **Step 2: Parse `confidence_grades_json` in `_enrich_signal()`**

In `backend/app/routers/signals.py`, add `"confidence_grades_json"` to the JSON column parsing list in `_enrich_signal()`:

```python
def _enrich_signal(row: dict) -> dict:
    """Parse JSON columns from the signals DB row into Python objects."""
    result = dict(row)
    for json_col, out_key in [
        ("scenarios_json", "scenarios"),
        ("expert_stances_json", "expert_stances"),
        ("dart_fundamentals_json", "dart_fundamentals"),
        ("metadata_json", "metadata"),
        ("confidence_grades_json", "confidence_grades"),
    ]:
        raw = result.pop(json_col, None)
        try:
            result[out_key] = json.loads(raw) if raw else None
        except (json.JSONDecodeError, TypeError):
            result[out_key] = None
    return result
```

- [ ] **Step 3: Verify syntax**

```bash
cd backend && uv run python -c "from app.agents.market_scanner import MarketScannerAgent; print('OK')"
cd backend && uv run python -c "from app.routers.signals import _enrich_signal; print('OK')"
```
Expected: Both print `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/agents/market_scanner.py backend/app/routers/signals.py
git commit -m "fix: persist and parse confidence_grades_json in signal pipeline"
```

---

### Task 5: Structured `summary_json` in ReportGenerator

**Files:**
- Modify: `backend/app/agents/report_generator.py`
- Create: `backend/tests/test_report_summary.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_report_summary.py
import pytest
from app.agents.report_generator import ReportGeneratorAgent


def test_compute_summary_basic():
    agent = ReportGeneratorAgent()
    data = {
        "snapshots": [
            {"total_value": 10000000, "total_pnl": 0, "total_pnl_pct": 0, "timestamp": "2026-03-17T09:00:00"},
            {"total_value": 10200000, "total_pnl": 200000, "total_pnl_pct": 2.0, "timestamp": "2026-03-17T15:00:00"},
            {"total_value": 10100000, "total_pnl": 100000, "total_pnl_pct": 1.0, "timestamp": "2026-03-17T16:00:00"},
        ],
        "orders": [
            {"stock_name": "삼성전자", "stock_code": "005930", "side": "buy", "quantity": 10, "price": 80000, "status": "filled", "timestamp": "2026-03-17T10:00:00", "fill_price": 80000},
            {"stock_name": "SK하이닉스", "stock_code": "000660", "side": "sell", "quantity": 5, "price": 150000, "status": "filled", "timestamp": "2026-03-17T14:00:00", "fill_price": 152000},
        ],
        "signals": [
            {"stock_name": "삼성전자", "direction": "buy", "rr_score": 3.5, "status": "approved"},
            {"stock_name": "LG에너지솔루션", "direction": "sell", "rr_score": 2.1, "status": "rejected"},
            {"stock_name": "SK하이닉스", "direction": "buy", "rr_score": 4.0, "status": "approved"},
        ],
        "latest_pnl": 100000,
        "latest_pnl_pct": 1.0,
    }
    summary = agent._compute_summary(data)

    # KPIs
    assert summary["kpis"]["total_pnl"] == 100000
    assert summary["kpis"]["total_pnl_pct"] == 1.0
    assert summary["kpis"]["trade_count"] == 2
    assert summary["kpis"]["signal_count"] == 3
    assert summary["kpis"]["signal_approval_rate"] == pytest.approx(66.67, abs=0.1)

    # Trades
    assert len(summary["trades"]) == 2
    assert summary["trades"][0]["stock_name"] == "삼성전자"

    # Signals
    assert len(summary["signals"]) == 3

    # Max drawdown: peak was 10200000, trough after was 10100000
    # drawdown = (10200000 - 10100000) / 10200000 * 100 = ~0.98%
    assert summary["kpis"]["max_drawdown_pct"] == pytest.approx(0.98, abs=0.1)


def test_compute_summary_empty_data():
    agent = ReportGeneratorAgent()
    data = {"snapshots": [], "orders": [], "signals": [], "latest_pnl": 0, "latest_pnl_pct": 0}
    summary = agent._compute_summary(data)
    assert summary["kpis"]["trade_count"] == 0
    assert summary["kpis"]["win_rate"] == 0
    assert summary["kpis"]["max_drawdown_pct"] == 0
    assert summary["trades"] == []
    assert summary["signals"] == []
    assert summary["risk_events"] == []
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && uv run pytest tests/test_report_summary.py -v
```
Expected: `AttributeError: 'ReportGeneratorAgent' object has no attribute '_compute_summary'`

- [ ] **Step 3: Implement `_compute_summary()` in report_generator.py**

Add this method to the `ReportGeneratorAgent` class in `backend/app/agents/report_generator.py`:

```python
    def _compute_summary(self, data: dict) -> dict:
        """Compute structured summary from raw report data. No LLM needed."""
        snapshots = data.get("snapshots", [])
        orders = data.get("orders", [])
        signals = data.get("signals", [])

        # --- KPIs ---
        filled_orders = [o for o in orders if o.get("status") == "filled"]
        trade_count = len(filled_orders)

        # Win rate: buy orders where sell happened at higher price
        # Simplified: count orders with positive implied P/L
        # For now, use 0 if we can't determine (needs position matching)
        win_rate = 0.0

        # Max drawdown from snapshot series
        max_drawdown_pct = 0.0
        if len(snapshots) >= 2:
            peak = snapshots[0].get("total_value", 0)
            for snap in snapshots[1:]:
                val = snap.get("total_value", 0)
                if val > peak:
                    peak = val
                elif peak > 0:
                    dd = (peak - val) / peak * 100
                    if dd > max_drawdown_pct:
                        max_drawdown_pct = dd

        # Signal approval rate
        approved = sum(1 for s in signals if s.get("status") in ("approved", "executed"))
        signal_approval_rate = (approved / len(signals) * 100) if signals else 0.0

        kpis = {
            "total_pnl": data.get("latest_pnl", 0),
            "total_pnl_pct": data.get("latest_pnl_pct", 0),
            "trade_count": trade_count,
            "win_rate": round(win_rate, 2),
            "max_drawdown_pct": round(max_drawdown_pct, 2),
            "signal_count": len(signals),
            "signal_approval_rate": round(signal_approval_rate, 2),
        }

        # --- Trades ---
        trades = [
            {
                "stock_name": o.get("stock_name", o.get("stock_code", "")),
                "side": o.get("side", "buy"),
                "quantity": o.get("quantity", 0),
                "price": o.get("fill_price") or o.get("price", 0),
                "pnl": None,  # requires position matching — left for future
                "timestamp": o.get("timestamp", ""),
            }
            for o in filled_orders
        ]

        # --- Signal summaries ---
        signal_summaries = [
            {
                "stock_name": s.get("stock_name", s.get("stock_code", "")),
                "direction": s.get("direction", ""),
                "rr_score": s.get("rr_score"),
                "status": s.get("status", ""),
            }
            for s in signals
        ]

        # --- Risk events ---
        # Will be populated from agent_events table once persistence is active
        risk_events: list[dict] = []

        return {
            "kpis": kpis,
            "trades": trades,
            "signals": signal_summaries,
            "risk_events": risk_events,
        }
```

- [ ] **Step 4: Update `execute()` to use `_compute_summary()`**

In the `execute()` method, replace the existing `summary_json` computation (lines 50-56) with:

```python
        # 2.5 Compute structured summary
        summary = self._compute_summary(data)
        summary_json = json.dumps(summary, ensure_ascii=False)
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
cd backend && uv run pytest tests/test_report_summary.py -v
```
Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/agents/report_generator.py backend/tests/test_report_summary.py
git commit -m "feat: compute structured summary_json with KPIs and trade details"
```

---

### Task 6: Add `_enrich_report()` to Reports Router

**Files:**
- Modify: `backend/app/routers/reports.py`

- [ ] **Step 1: Add `_enrich_report()` helper and use in endpoints**

Add `import json` at the top of `backend/app/routers/reports.py`, then add the helper function after the router definition:

```python
import json


def _enrich_report(row: dict) -> dict:
    """Parse summary_json string into a dict for the frontend."""
    result = dict(row)
    raw = result.pop("summary_json", None)
    try:
        result["summary"] = json.loads(raw) if raw else None
    except (json.JSONDecodeError, TypeError):
        result["summary"] = None
    return result
```

Update `list_reports` return:

```python
    reports = [_enrich_report(dict(row)) for row in (rows or [])]
    return {"reports": reports}
```

Note: the list query currently excludes `content` (only selects metadata + summary_json). This is correct — the enriched `summary` field replaces the raw `summary_json` string.

Update `get_report` return:

```python
    return _enrich_report(dict(rows[0]))
```

- [ ] **Step 2: Verify syntax**

```bash
cd backend && uv run python -c "from app.routers.reports import _enrich_report; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/reports.py
git commit -m "feat: add _enrich_report() to parse summary_json in reports API"
```

---

## Chunk 2: Frontend Slice A — Live Dashboard

*Event-driven refresh, agent logs, risk alerts, AlertFeed persistence. No new pages.*

---

### Task 7: Add TypeScript Interfaces and Extend AppView

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Extend `AppView` and add report summary types**

At the bottom of `frontend/src/types.ts`, replace the `AppView` type and add new interfaces:

Replace:
```typescript
export type AppView = 'chat' | 'settings' | 'dashboard';
```

With:
```typescript
export type AppView = 'chat' | 'settings' | 'dashboard' | 'reports';

// --- Report Summary types ---

export interface ReportKPIs {
  total_pnl: number;
  total_pnl_pct: number;
  trade_count: number;
  win_rate: number;
  max_drawdown_pct: number;
  signal_count: number;
  signal_approval_rate: number;
}

export interface ReportTrade {
  stock_name: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  pnl?: number | null;
  timestamp: string;
}

export interface ReportSignalSummary {
  stock_name: string;
  direction: string;
  rr_score?: number | null;
  status: string;
}

export interface ReportRiskEvent {
  event_type: string;
  stock_name: string;
  detail: string;
  timestamp: string;
}

export interface ReportSummary {
  kpis: ReportKPIs;
  trades: ReportTrade[];
  signals: ReportSignalSummary[];
  risk_events: ReportRiskEvent[];
}
```

Also update the `Report` interface — replace `summary_json?: string;` with `summary?: ReportSummary | null;`:

```typescript
export interface Report {
  id: number;
  timestamp: string;
  report_type: 'daily' | 'weekly' | 'manual';
  period_start: string;
  period_end: string;
  title: string;
  content?: string;
  summary?: ReportSummary | null;
  agent_id: string;
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors related to types.ts (may see other pre-existing errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: add ReportSummary types and extend AppView with 'reports'"
```

---

### Task 8: Add `getReport(id)` to API Service

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add `getReport` function**

Add after the `generateReport` function in `frontend/src/services/api.ts`:

```typescript
export async function getReport(reportId: number): Promise<import('../types').Report> {
  const res = await fetch(`/api/reports/${reportId}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add getReport(id) API function"
```

---

### Task 9: SignalPanel + OrderHistory Accept `refreshTrigger` Prop

**Files:**
- Modify: `frontend/src/components/dashboard/SignalPanel.tsx`
- Modify: `frontend/src/components/dashboard/OrderHistory.tsx`
- Modify: `frontend/src/components/dashboard/PerformanceChart.tsx`

- [ ] **Step 1: Update SignalPanel**

Replace `frontend/src/components/dashboard/SignalPanel.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import type { Signal } from '../../types';
import { getSignals, approveSignal, rejectSignal } from '../../services/api';
import { SignalCard } from '../signals/SignalCard';

interface Props {
  refreshTrigger?: number;
}

export default function SignalPanel({ refreshTrigger }: Props) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [acting, setActing] = useState<number | null>(null);

  const fetchSignals = useCallback(() => {
    getSignals(undefined, 20)
      .then((data) => setSignals(data.signals))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // Refetch on external trigger (WS event)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) fetchSignals();
  }, [refreshTrigger, fetchSignals]);

  const handleApprove = async (id: number) => {
    setActing(id);
    try {
      await approveSignal(id);
      fetchSignals();
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: number) => {
    setActing(id);
    try {
      await rejectSignal(id);
      fetchSignals();
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setActing(null);
    }
  };

  if (signals.length === 0) {
    return (
      <div className="dashboard-card">
        <h3 className="card-title">Signals</h3>
        <div className="no-data">매매 신호 없음</div>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h3 className="card-title">Signals</h3>
      <div className="signal-list">
        {signals.map((sig) => (
          <SignalCard
            key={sig.id}
            signal={sig}
            onApprove={sig.status === 'pending' ? handleApprove : undefined}
            onReject={sig.status === 'pending' ? handleReject : undefined}
            acting={acting === sig.id}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update OrderHistory**

Replace `frontend/src/components/dashboard/OrderHistory.tsx` — add `refreshTrigger` prop and change poll to 60s:

```typescript
import { useEffect, useState, useCallback } from 'react';
import type { Order } from '../../types';
import { getOrders } from '../../services/api';

interface Props {
  refreshTrigger?: number;
}

export default function OrderHistory({ refreshTrigger }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);

  const fetchOrders = useCallback(() => {
    getOrders(20)
      .then((data) => setOrders(data.orders))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 60000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) fetchOrders();
  }, [refreshTrigger, fetchOrders]);

  if (orders.length === 0) {
    return (
      <div className="dashboard-card">
        <h3 className="card-title">Orders</h3>
        <div className="no-data">주문 내역 없음</div>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h3 className="card-title">Orders</h3>
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>시간</th>
            <th>종목</th>
            <th>구분</th>
            <th className="text-right">수량</th>
            <th className="text-right">가격</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td className="order-time">
                {new Date(order.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td>
                <span className="stock-code">{order.stock_code}</span>
                {order.stock_name && <span className="stock-name-sub"> {order.stock_name}</span>}
              </td>
              <td>
                <span className={`side-badge ${order.side}`}>
                  {order.side === 'buy' ? '매수' : '매도'}
                </span>
              </td>
              <td className="text-right">{order.quantity.toLocaleString()}</td>
              <td className="text-right">
                {order.price ? `${order.price.toLocaleString()}원` : '시장가'}
              </td>
              <td>
                <span className={`order-status status-${order.status}`}>
                  {order.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Update PerformanceChart**

In `frontend/src/components/dashboard/PerformanceChart.tsx`, add `refreshTrigger` prop:

Add interface and prop:

```typescript
interface Props {
  refreshTrigger?: number;
}

export default function PerformanceChart({ refreshTrigger }: Props) {
```

Change the `useEffect` to refetch on trigger:

```typescript
  const fetchHistory = useCallback(() => {
    fetch('/api/reports/performance/history?days=30')
      .then((res) => res.json())
      .then((data) => setHistory(data.history || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) fetchHistory();
  }, [refreshTrigger, fetchHistory]);
```

- [ ] **Step 4: Verify lint passes**

```bash
cd frontend && npm run lint 2>&1 | tail -5
```
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/SignalPanel.tsx frontend/src/components/dashboard/OrderHistory.tsx frontend/src/components/dashboard/PerformanceChart.tsx
git commit -m "feat: add refreshTrigger prop to SignalPanel, OrderHistory, PerformanceChart"
```

---

### Task 10: Agent Logs in AgentPanel

**Files:**
- Modify: `frontend/src/components/dashboard/AgentPanel.tsx`

- [ ] **Step 1: Add log fetching and display**

Replace `frontend/src/components/dashboard/AgentPanel.tsx`:

```typescript
import { useEffect, useState } from 'react';
import type { Agent, AgentLog } from '../../types';
import { getAgentLogs } from '../../services/api';

interface Props {
  agents: Agent[];
  runningAgent: string | null;
  onRunAgent: (agentId: string) => void;
  onToggleAgent: (agentId: string, enabled: boolean) => void;
  refreshTrigger?: number;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AgentPanel({ agents, runningAgent, onRunAgent, onToggleAgent, refreshTrigger }: Props) {
  const [logs, setLogs] = useState<AgentLog[]>([]);

  useEffect(() => {
    getAgentLogs(undefined, 20)
      .then((data) => setLogs(data.logs))
      .catch(console.error);
  }, [refreshTrigger]);

  const getAgentRecentLogs = (agentId: string) =>
    logs.filter((l) => l.agent_id === agentId).slice(0, 3);

  return (
    <div className="dashboard-card agent-panel">
      <h3 className="card-title">Agents</h3>
      {agents.length === 0 && <div className="no-data">에이전트 없음</div>}
      {agents.map((agent) => {
        const recentLogs = getAgentRecentLogs(agent.id);
        return (
          <div key={agent.id} className="agent-row">
            <div className="agent-info">
              <span className={`agent-status-dot status-${agent.status}`} />
              <div className="agent-detail">
                <span className="agent-name">{agent.name}</span>
                <span className="agent-role">{agent.role}</span>
              </div>
            </div>
            <div className="agent-actions">
              <button
                className={`agent-toggle-btn ${agent.status === 'disabled' ? 'toggle-off' : 'toggle-on'}`}
                onClick={() => onToggleAgent(agent.id, agent.status === 'disabled')}
                title={agent.status === 'disabled' ? '클릭하여 활성화' : '클릭하여 비활성화'}
              >
                {agent.status === 'disabled' ? 'OFF' : 'ON'}
              </button>
              <button
                className="agent-run-btn"
                onClick={() => onRunAgent(agent.id)}
                disabled={runningAgent === agent.id || agent.status === 'disabled'}
              >
                {runningAgent === agent.id ? '...' : 'Run'}
              </button>
            </div>
            {recentLogs.length > 0 && (
              <div className="agent-logs">
                {recentLogs.map((log) => (
                  <div key={log.id} className="agent-log-entry">
                    <span className={`log-status ${log.success !== 0 ? 'log-ok' : 'log-fail'}`}>
                      {log.success !== 0 ? 'OK' : 'ERR'}
                    </span>
                    <span className="log-action">{log.action}</span>
                    <span className="log-duration">{(log.duration_ms / 1000).toFixed(1)}s</span>
                    <span className="log-time">{timeAgo(log.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for agent logs**

Append to `frontend/src/App.css`:

```css
/* Agent log entries */
.agent-logs {
  width: 100%;
  margin-top: 4px;
  padding-left: 20px;
}

.agent-log-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  padding: 2px 0;
}

.log-status {
  font-weight: 600;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
}

.log-status.log-ok {
  background: var(--color-positive, #22c55e);
  color: white;
}

.log-status.log-fail {
  background: var(--color-negative, #ef4444);
  color: white;
}

.log-action {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-duration {
  color: var(--text-tertiary);
}

.log-time {
  color: var(--text-tertiary);
  font-size: 10px;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/AgentPanel.tsx frontend/src/App.css
git commit -m "feat: show recent agent logs in AgentPanel"
```

---

### Task 11: RiskAlertBanner Component

**Files:**
- Create: `frontend/src/components/dashboard/RiskAlertBanner.tsx`

- [ ] **Step 1: Create RiskAlertBanner**

```typescript
// frontend/src/components/dashboard/RiskAlertBanner.tsx
import { useState, useEffect, useCallback } from 'react';
import type { AgentEvent } from '../../types';

interface RiskAlert {
  id: string;
  eventType: string;
  stockName: string;
  pnlPct: number;
  timestamp: string;
}

interface Props {
  events: AgentEvent[];
}

export default function RiskAlertBanner({ events }: Props) {
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);

  // Watch for new risk events
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    if (last.event_type !== 'risk.stop_loss' && last.event_type !== 'risk.take_profit') return;

    const alert: RiskAlert = {
      id: `${last.timestamp}-${last.event_type}`,
      eventType: last.event_type,
      stockName: (last.data?.stock_name as string) || (last.data?.stock_code as string) || 'Unknown',
      pnlPct: (last.data?.pnl_pct as number) || 0,
      timestamp: last.timestamp,
    };

    setAlerts((prev) => [alert, ...prev].slice(0, 3));
  }, [events]);

  // Auto-dismiss alerts older than 30s
  useEffect(() => {
    if (alerts.length === 0) return;
    const interval = setInterval(() => {
      const cutoff = Date.now() - 30000;
      setAlerts((prev) => prev.filter((a) => new Date(a.timestamp).getTime() > cutoff));
    }, 5000);
    return () => clearInterval(interval);
  }, [alerts.length]);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="risk-alert-stack">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`risk-alert-banner ${alert.eventType === 'risk.stop_loss' ? 'risk-loss' : 'risk-profit'}`}
        >
          <span className="risk-alert-icon">
            {alert.eventType === 'risk.stop_loss' ? '!' : '$'}
          </span>
          <span className="risk-alert-text">
            <strong>{alert.eventType === 'risk.stop_loss' ? 'Stop-Loss' : 'Take-Profit'}</strong>
            {' '}{alert.stockName}{' '}
            <span className={alert.pnlPct >= 0 ? 'positive' : 'negative'}>
              {alert.pnlPct >= 0 ? '+' : ''}{alert.pnlPct.toFixed(2)}%
            </span>
          </span>
          <button className="risk-alert-dismiss" onClick={() => dismiss(alert.id)}>X</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for risk alerts**

Append to `frontend/src/App.css`:

```css
/* Risk Alert Banner */
.risk-alert-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.risk-alert-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: var(--text-sm);
  animation: slideDown 0.3s ease-out;
}

.risk-alert-banner.risk-loss {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--color-negative, #ef4444);
}

.risk-alert-banner.risk-profit {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: var(--color-positive, #22c55e);
}

.risk-alert-icon {
  font-weight: 700;
  font-size: var(--text-lg);
}

.risk-alert-text {
  flex: 1;
  color: var(--text-primary);
}

.risk-alert-dismiss {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  padding: 2px 6px;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/RiskAlertBanner.tsx frontend/src/App.css
git commit -m "feat: add RiskAlertBanner for stop-loss/take-profit events"
```

---

### Task 12: AlertFeed Persisted Events on Mount

**Files:**
- Modify: `frontend/src/components/dashboard/AlertFeed.tsx`

- [ ] **Step 1: Fetch persisted events on mount**

Replace `frontend/src/components/dashboard/AlertFeed.tsx`:

```typescript
import { useEffect, useState } from 'react';
import type { AgentEvent } from '../../types';
import { getAgentEvents } from '../../services/api';

interface Props {
  events: AgentEvent[];
}

const EVENT_ICONS: Record<string, string> = {
  'risk.stop_loss': '!',
  'risk.take_profit': '$',
  'signal.generated': '~',
  'signal.approved': '+',
  'signal.rejected': '-',
  'order.submitted': '>',
  'order.filled': 'v',
  'portfolio.updated': 'i',
  'report.generated': '#',
};

export default function AlertFeed({ events: liveEvents }: Props) {
  const [persistedEvents, setPersistedEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    getAgentEvents(50)
      .then((data) => setPersistedEvents(data.events))
      .catch(console.error);
  }, []);

  // Merge: persisted (oldest first) + live events, dedup by timestamp+type
  const seen = new Set<string>();
  const merged: AgentEvent[] = [];
  for (const evt of [...persistedEvents, ...liveEvents]) {
    const key = `${evt.timestamp}:${evt.event_type}:${evt.agent_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(evt);
    }
  }

  const recent = merged.slice(-30).reverse();

  return (
    <div className="dashboard-card alert-feed">
      <h3 className="card-title">Events</h3>
      {recent.length === 0 ? (
        <div className="empty-state">No events yet</div>
      ) : (
        <div className="event-list">
          {recent.map((evt, i) => (
            <div key={i} className={`event-item event-${evt.event_type.split('.')[0]}`}>
              <span className="event-icon">[{EVENT_ICONS[evt.event_type] ?? '?'}]</span>
              <span className="event-type">{evt.event_type}</span>
              <span className="event-agent">{evt.agent_id}</span>
              <span className="event-time">
                {new Date(evt.timestamp).toLocaleTimeString('ko-KR')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/AlertFeed.tsx
git commit -m "feat: fetch persisted events on AlertFeed mount, merge with live WS"
```

---

### Task 13: DashboardView — Targeted WS Refetch + RiskAlertBanner

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx`

- [ ] **Step 1: Rewrite DashboardView with targeted refresh triggers**

Replace `frontend/src/components/DashboardView.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import type { PortfolioData, Agent } from '../types';
import { getPortfolio, getAgents, runAgent, enableAgent, disableAgent } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import PortfolioSummary from './dashboard/PortfolioSummary';
import PositionsTable from './dashboard/PositionsTable';
import AgentPanel from './dashboard/AgentPanel';
import AlertFeed from './dashboard/AlertFeed';
import OrderHistory from './dashboard/OrderHistory';
import SignalPanel from './dashboard/SignalPanel';
import Watchlist from './dashboard/Watchlist';
import PerformanceChart from './dashboard/PerformanceChart';
import RiskAlertBanner from './dashboard/RiskAlertBanner';

export default function DashboardView() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const { connected: wsConnected, events } = useWebSocket();

  // Targeted refresh counters
  const [signalTrigger, setSignalTrigger] = useState(0);
  const [orderTrigger, setOrderTrigger] = useState(0);
  const [portfolioTrigger, setPortfolioTrigger] = useState(0);
  const [agentTrigger, setAgentTrigger] = useState(0);

  const fetchCoreData = useCallback(async () => {
    try {
      const [portfolioData, agentsData] = await Promise.all([
        getPortfolio(),
        getAgents(),
      ]);
      setPortfolio(portfolioData);
      setAgents(agentsData.agents);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 60s fallback poll
  useEffect(() => {
    fetchCoreData();
    const interval = setInterval(fetchCoreData, 60000);
    return () => clearInterval(interval);
  }, [fetchCoreData]);

  // Targeted WS event handling
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;

    switch (last.event_type) {
      case 'signal.generated':
      case 'signal.approved':
      case 'signal.rejected':
        setSignalTrigger((n) => n + 1);
        break;
      case 'order.filled':
      case 'order.submitted':
        setOrderTrigger((n) => n + 1);
        break;
      case 'portfolio.updated':
        setPortfolioTrigger((n) => n + 1);
        fetchCoreData();
        break;
      // risk.* events are handled by RiskAlertBanner directly
    }
    // Agent status may change on any event
    setAgentTrigger((n) => n + 1);
  }, [events, fetchCoreData]);

  const handleRunAgent = async (agentId: string) => {
    setRunningAgent(agentId);
    try {
      await runAgent(agentId);
      await fetchCoreData();
    } catch (err) {
      console.error('Failed to run agent:', err);
    } finally {
      setRunningAgent(null);
    }
  };

  const handleToggleAgent = async (agentId: string, enable: boolean) => {
    try {
      if (enable) {
        await enableAgent(agentId);
      } else {
        await disableAgent(agentId);
      }
      await fetchCoreData();
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  return (
    <div className="dashboard-view">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <div className="dashboard-status">
          <span className={`ws-indicator ${wsConnected ? 'connected' : 'disconnected'}`}>
            WS {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <RiskAlertBanner events={events} />

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <PortfolioSummary data={portfolio} loading={loading} />
          <PositionsTable positions={portfolio?.positions ?? []} />
          <PerformanceChart refreshTrigger={portfolioTrigger} />
          <SignalPanel refreshTrigger={signalTrigger} />
          <OrderHistory refreshTrigger={orderTrigger} />
        </div>

        <div className="dashboard-sidebar">
          <AgentPanel
            agents={agents}
            runningAgent={runningAgent}
            onRunAgent={handleRunAgent}
            onToggleAgent={handleToggleAgent}
            refreshTrigger={agentTrigger}
          />
          <Watchlist />
          <AlertFeed events={events} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd frontend && npm run lint 2>&1 | tail -10
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DashboardView.tsx
git commit -m "feat: targeted WS-driven refresh + RiskAlertBanner in dashboard"
```

---

## Chunk 3: Frontend Slice B — Report Viewer Page

*New Reports tab, navigation wiring, ReportViewer component, ReportList deletion.*

**Prerequisites:** Tasks 7 (types), 8 (getReport API), and 13 (DashboardView rewrite removing ReportList) must be completed before this chunk.

---

### Task 14: Navigation Wiring — HeaderBar, Sidebar, App.tsx

**Files:**
- Modify: `frontend/src/components/HeaderBar.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add Reports tab to HeaderBar**

In `frontend/src/components/HeaderBar.tsx`, add `onOpenReports` to the Props interface:

```typescript
interface Props {
  sessionTitle: string;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenDashboard: () => void;
  onOpenChat: () => void;
  onOpenReports: () => void;
  currentView: AppView;
  tradingMode: 'demo' | 'real';
  onNewChat: () => void;
}
```

Add to destructured props. Then in the `header-nav-tabs` div, after the Dashboard button, add:

```tsx
        <button
          className={`header-nav-tab ${currentView === 'reports' ? 'active' : ''}`}
          onClick={onOpenReports}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Reports
        </button>
```

- [ ] **Step 2: Add Reports nav to Sidebar**

In `frontend/src/components/Sidebar.tsx`, add `onOpenReports` to Props:

```typescript
interface Props {
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
  onOpenDashboard: () => void;
  onOpenReports: () => void;
  currentView: AppView;
  className?: string;
}
```

Add to destructured props. In the `sidebar-footer` div, after the Dashboard button and before the Settings button, add:

```tsx
        <button
          className={`sidebar-nav-link ${currentView === 'reports' ? 'active' : ''}`}
          onClick={onOpenReports}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>리포트</span>
        </button>
```

- [ ] **Step 3: Wire up App.tsx**

In `frontend/src/App.tsx`, add the import at top:

```typescript
import ReportViewer from './components/ReportViewer';
```

In the HeaderBar props, add:

```typescript
          onOpenReports={() => setCurrentView('reports')}
```

In the Sidebar props, add:

```typescript
            onOpenReports={() => setCurrentView('reports')}
```

Update the view conditional rendering. Replace the current ternary chain:

```tsx
        {currentView === 'settings' ? (
          <SettingsView
            settings={settings}
            onSave={saveSettings}
            error={settingsError}
            onBack={() => setCurrentView('chat')}
          />
        ) : currentView === 'dashboard' ? (
          <DashboardView />
        ) : currentView === 'reports' ? (
          <ReportViewer />
        ) : (
          <ChatView
            sessionId={activeSessionId}
            messages={activeMessages}
            setMessages={setActiveMessages}
            onFirstMessage={handleFirstMessage}
          />
        )}
```

Also update the sidebar visibility check — show sidebar for reports view too. Change:

```tsx
      {currentView !== 'dashboard' && (
```

To:

```tsx
      {currentView !== 'dashboard' && currentView !== 'reports' && (
```

- [ ] **Step 4: Create placeholder ReportViewer**

Create `frontend/src/components/ReportViewer.tsx` with a placeholder so compilation works:

```typescript
export default function ReportViewer() {
  return (
    <div className="report-viewer">
      <h2>Reports</h2>
      <p>Report viewer coming soon...</p>
    </div>
  );
}
```

- [ ] **Step 5: Verify lint passes**

```bash
cd frontend && npm run lint 2>&1 | tail -10
```
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/HeaderBar.tsx frontend/src/components/Sidebar.tsx frontend/src/App.tsx frontend/src/components/ReportViewer.tsx
git commit -m "feat: add Reports tab in navigation, wire to ReportViewer placeholder"
```

---

### Task 15: Full ReportViewer Component

**Files:**
- Modify: `frontend/src/components/ReportViewer.tsx`

- [ ] **Step 1: Implement full ReportViewer**

Replace `frontend/src/components/ReportViewer.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type { Report, ReportSummary } from '../types';
import { getReports, getReport, generateReport, deleteReport } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

type FilterType = 'all' | 'daily' | 'weekly';

export default function ReportViewer() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const { events } = useWebSocket();

  const fetchReports = useCallback(() => {
    const type = filter === 'all' ? undefined : filter;
    getReports(type, 50)
      .then((data) => {
        setReports(data.reports);
        setLoading(false);
      })
      .catch(console.error);
  }, [filter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Listen for report.generated WS event
  useEffect(() => {
    const last = events[events.length - 1];
    if (last?.event_type === 'report.generated') {
      fetchReports();
      setGenerating(false);
      // Auto-select the new report
      const reportId = last.data?.report_id as number;
      if (reportId) {
        getReport(reportId)
          .then(setSelectedReport)
          .catch(console.error);
      }
    }
  }, [events, fetchReports]);

  const handleSelectReport = async (report: Report) => {
    if (report.content !== undefined) {
      setSelectedReport(report);
      return;
    }
    try {
      const full = await getReport(report.id);
      setSelectedReport(full);
    } catch (err) {
      console.error('Failed to load report:', err);
    }
  };

  const handleGenerate = async (type: 'daily' | 'weekly') => {
    setGenerating(true);
    try {
      await generateReport(type);
      // WS event will trigger refresh + auto-select
    } catch (err) {
      console.error('Failed to generate report:', err);
      setGenerating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteReport(id);
      if (selectedReport?.id === id) setSelectedReport(null);
      fetchReports();
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  };

  const summary: ReportSummary | null = selectedReport?.summary ?? null;

  return (
    <div className="report-viewer">
      {/* Sidebar */}
      <div className="report-sidebar">
        <div className="report-sidebar-header">
          <h3>Reports</h3>
          <div className="report-filter-tabs">
            {(['all', 'daily', 'weekly'] as FilterType[]).map((f) => (
              <button
                key={f}
                className={`report-filter-tab ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'daily' ? 'Daily' : 'Weekly'}
              </button>
            ))}
          </div>
        </div>
        <div className="report-generate-actions">
          <button
            className="report-generate-btn"
            onClick={() => handleGenerate('daily')}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Daily Report'}
          </button>
          <button
            className="report-generate-btn"
            onClick={() => handleGenerate('weekly')}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Weekly Report'}
          </button>
        </div>
        <div className="report-list">
          {loading ? (
            <div className="no-data">Loading...</div>
          ) : reports.length === 0 ? (
            <div className="no-data">No reports yet</div>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                className={`report-list-item ${selectedReport?.id === r.id ? 'selected' : ''}`}
                onClick={() => handleSelectReport(r)}
              >
                <div className="report-list-item-header">
                  <span className={`report-type-badge type-${r.report_type}`}>
                    {r.report_type}
                  </span>
                  <button
                    className="report-delete-btn"
                    onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                    title="Delete"
                  >
                    X
                  </button>
                </div>
                <div className="report-list-item-title">{r.title || 'Untitled'}</div>
                <div className="report-list-item-date">
                  {new Date(r.timestamp).toLocaleDateString('ko-KR')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="report-content">
        {!selectedReport ? (
          <div className="report-empty-state">
            <p>Select a report or generate a new one.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="report-header">
              <h2>{selectedReport.title || 'Report'}</h2>
              <div className="report-header-meta">
                <span className={`report-type-badge type-${selectedReport.report_type}`}>
                  {selectedReport.report_type}
                </span>
                {selectedReport.period_start && selectedReport.period_end && (
                  <span className="report-period">
                    {selectedReport.period_start} ~ {selectedReport.period_end}
                  </span>
                )}
              </div>
            </div>

            {/* KPI Tiles */}
            {summary?.kpis && (
              <div className="report-kpi-grid">
                <KPITile label="Total P/L" value={`${summary.kpis.total_pnl.toLocaleString()}원`} colored={summary.kpis.total_pnl} />
                <KPITile label="P/L %" value={`${summary.kpis.total_pnl_pct.toFixed(2)}%`} colored={summary.kpis.total_pnl_pct} />
                <KPITile label="Trades" value={String(summary.kpis.trade_count)} />
                <KPITile label="Win Rate" value={`${summary.kpis.win_rate.toFixed(1)}%`} />
                <KPITile label="Max DD" value={`-${summary.kpis.max_drawdown_pct.toFixed(2)}%`} colored={-1} />
                <KPITile label="Signals" value={String(summary.kpis.signal_count)} />
                <KPITile label="Approval" value={`${summary.kpis.signal_approval_rate.toFixed(1)}%`} />
              </div>
            )}

            {/* Trade Table */}
            {summary?.trades && summary.trades.length > 0 && (
              <div className="report-section">
                <h3>Trades</h3>
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Stock</th>
                      <th>Side</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Price</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.trades.map((t, i) => (
                      <tr key={i}>
                        <td>{t.stock_name}</td>
                        <td><span className={`side-badge ${t.side}`}>{t.side === 'buy' ? '매수' : '매도'}</span></td>
                        <td className="text-right">{t.quantity.toLocaleString()}</td>
                        <td className="text-right">{t.price.toLocaleString()}원</td>
                        <td className="order-time">{new Date(t.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Signal Summary */}
            {summary?.signals && summary.signals.length > 0 && (
              <div className="report-section">
                <h3>Signals</h3>
                <div className="report-signal-grid">
                  {summary.signals.map((s, i) => (
                    <div key={i} className="report-signal-card">
                      <span className="report-signal-name">{s.stock_name}</span>
                      <span className={`direction-badge direction-${s.direction}`}>{s.direction.toUpperCase()}</span>
                      {s.rr_score != null && <span className="report-signal-rr">R/R {s.rr_score.toFixed(1)}</span>}
                      <span className={`order-status status-${s.status}`}>{s.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Events */}
            {summary?.risk_events && summary.risk_events.length > 0 && (
              <div className="report-section">
                <h3>Risk Events</h3>
                <div className="report-risk-timeline">
                  {summary.risk_events.map((r, i) => (
                    <div key={i} className={`risk-timeline-item ${r.event_type === 'stop_loss' ? 'risk-loss' : 'risk-profit'}`}>
                      <span className="risk-timeline-dot" />
                      <span className="risk-timeline-time">{new Date(r.timestamp).toLocaleTimeString('ko-KR')}</span>
                      <span className="risk-timeline-detail">{r.stock_name} — {r.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Narrative */}
            {selectedReport.content && (
              <div className="report-section report-narrative">
                <h3>Analysis</h3>
                <ReactMarkdown rehypePlugins={[rehypeHighlight]} remarkPlugins={[remarkGfm]}>
                  {selectedReport.content}
                </ReactMarkdown>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KPITile({ label, value, colored }: { label: string; value: string; colored?: number }) {
  const cls = colored !== undefined ? (colored >= 0 ? 'positive' : 'negative') : '';
  return (
    <div className="report-kpi-tile">
      <span className="report-kpi-label">{label}</span>
      <span className={`report-kpi-value ${cls}`}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd frontend && npm run lint 2>&1 | tail -10
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ReportViewer.tsx
git commit -m "feat: implement full ReportViewer with KPI tiles, trade table, signal grid, narrative"
```

---

### Task 16: ReportViewer CSS Styles

**Files:**
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Add ReportViewer styles**

Append to `frontend/src/App.css`:

```css
/* ===== Report Viewer ===== */
.report-viewer {
  display: flex;
  height: calc(100vh - 56px);
  overflow: hidden;
}

.report-sidebar {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background: var(--surface-color);
  overflow-y: auto;
}

.report-sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.report-sidebar-header h3 {
  margin: 0 0 10px 0;
  font-size: var(--text-lg);
}

.report-filter-tabs {
  display: flex;
  gap: 4px;
}

.report-filter-tab {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.report-filter-tab.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.report-generate-actions {
  display: flex;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
}

.report-generate-btn {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--surface-color);
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--text-primary);
}

.report-generate-btn:hover {
  background: var(--hover-color, rgba(0,0,0,0.05));
}

.report-generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.report-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.report-list-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
}

.report-list-item:hover {
  background: var(--hover-color, rgba(0,0,0,0.04));
}

.report-list-item.selected {
  background: var(--primary-color);
  color: white;
}

.report-list-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.report-type-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
}

.report-type-badge.type-daily {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.report-type-badge.type-weekly {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.report-type-badge.type-manual {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
}

.report-delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: 11px;
  padding: 2px 4px;
}

.report-list-item-title {
  font-size: var(--text-sm);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-list-item-date {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-top: 2px;
}

.report-list-item.selected .report-list-item-date,
.report-list-item.selected .report-type-badge {
  color: rgba(255,255,255,0.8);
}

.report-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.report-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: var(--text-lg);
}

.report-header {
  margin-bottom: 24px;
}

.report-header h2 {
  margin: 0 0 8px 0;
}

.report-header-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.report-period {
  color: var(--text-tertiary);
}

/* KPI Grid */
.report-kpi-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
}

.report-kpi-tile {
  flex: 1;
  min-width: 120px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
}

.report-kpi-label {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.report-kpi-value {
  font-size: var(--text-lg);
  font-weight: 600;
}

.report-kpi-value.positive { color: var(--color-positive, #22c55e); }
.report-kpi-value.negative { color: var(--color-negative, #ef4444); }

/* Report sections */
.report-section {
  margin-bottom: 24px;
}

.report-section h3 {
  font-size: var(--text-base);
  margin: 0 0 12px 0;
  color: var(--text-primary);
}

/* Signal grid */
.report-signal-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.report-signal-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  font-size: var(--text-sm);
}

.report-signal-name {
  font-weight: 500;
}

.report-signal-rr {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}

/* Risk timeline */
.report-risk-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 12px;
  border-left: 2px solid var(--border-color);
}

.risk-timeline-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--text-sm);
  position: relative;
}

.risk-timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  position: absolute;
  left: -17px;
}

.risk-timeline-item.risk-loss .risk-timeline-dot {
  background: var(--color-negative, #ef4444);
}

.risk-timeline-item.risk-profit .risk-timeline-dot {
  background: var(--color-positive, #22c55e);
}

.risk-timeline-time {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
  min-width: 60px;
}

/* Report narrative markdown */
.report-narrative {
  line-height: 1.7;
}

.report-narrative h1, .report-narrative h2, .report-narrative h3 {
  margin-top: 20px;
}

.report-narrative table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.report-narrative th, .report-narrative td {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  text-align: left;
  font-size: var(--text-sm);
}

.report-narrative th {
  background: var(--surface-color);
  font-weight: 600;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.css
git commit -m "feat: add ReportViewer CSS styles (layout, KPI tiles, timeline, narrative)"
```

---

### Task 17: Delete ReportList, Final Lint Check

**Files:**
- Delete: `frontend/src/components/dashboard/ReportList.tsx`

- [ ] **Step 1: Delete ReportList.tsx**

```bash
git rm frontend/src/components/dashboard/ReportList.tsx
```

- [ ] **Step 2: Run full lint**

```bash
cd frontend && npm run lint
```
Expected: No errors (ReportList was only imported in DashboardView which was already updated in Task 13)

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete ReportList.tsx (replaced by ReportViewer)"
```

---

### Task 18: Final Integration Verification

- [ ] **Step 1: Run backend tests**

```bash
cd backend && uv run pytest tests/ -v --tb=short 2>&1 | tail -20
```
Expected: All tests pass (including new test_event_persistence.py and test_report_summary.py)

- [ ] **Step 2: Run frontend lint**

```bash
cd frontend && npm run lint
```
Expected: No errors

- [ ] **Step 3: Build frontend**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```
Expected: Build succeeds without errors

- [ ] **Step 4: Verify backend starts**

```bash
cd backend && timeout 5 uv run python -c "
import asyncio
from app.models.db import init_database
asyncio.run(init_database())
print('DB OK')
from app.main import app
print('App OK')
" 2>&1 || true
```
Expected: `DB OK` and `App OK`
