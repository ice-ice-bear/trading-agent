# Dashboard Reactivity & Report Viewer Design

**Date:** 2026-03-17
**Goal:** Make the dashboard feel alive by wiring WebSocket events to panel refreshes, persisting events, showing agent activity logs and risk alerts — then add a dedicated Report Viewer page with structured KPI tiles, trade tables, and a markdown narrative section.

**Architecture:** Two independent vertical slices. Slice A (Live Dashboard) enhances existing panels with event-driven reactivity and light backend additions. Slice B (Report Viewer) adds a 4th navigation tab with a structured report display, backed by a programmatically-computed `summary_json`.

**Tech Stack:** React 19, TypeScript, CSS variables (existing patterns), FastAPI, aiosqlite. No new dependencies.

**Prior work:** Builds on the 2026-03-16 trading agent enhancement (DART + R/R scoring + SignalCard). Fixes the `confidence_grades_json` persistence gap identified in that plan's review.

---

## File Map

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/ReportViewer.tsx` | Full-page report viewer: report list sidebar, KPI header tiles, trade table, signal summary, risk events timeline, markdown narrative |
| `frontend/src/components/dashboard/RiskAlertBanner.tsx` | Dismissible top-of-dashboard banner for stop-loss/take-profit events |

### Modified Files

| File | Change |
|------|--------|
| **Frontend** | |
| `frontend/src/types.ts` | Add `ReportSummary`, `ReportKPIs`, `ReportTrade`, `ReportSignalSummary`, `ReportRiskEvent` interfaces; extend `AppView` to include `'reports'` |
| `frontend/src/App.tsx` | Add `'reports'` case to view switch, render `ReportViewer` |
| `frontend/src/components/HeaderBar.tsx` | Add "Reports" tab after Dashboard in nav tabs; add `onOpenReports` callback prop |
| `frontend/src/components/Sidebar.tsx` | Add "Reports" navigation entry for consistency with HeaderBar |
| `frontend/src/components/DashboardView.tsx` | Extend existing WS-driven refresh (already partially implemented for `portfolio.updated`, `order.filled`, `signal.approved`) to cover all event types; increase poll fallback to 60s; remove `ReportList` panel; add `RiskAlertBanner`; pass refresh triggers to child panels |
| `frontend/src/components/dashboard/PerformanceChart.tsx` | Accept `refreshTrigger` prop, refetch on change (currently only fetches on mount) |
| `frontend/src/components/dashboard/AgentPanel.tsx` | Fetch and display last 3 agent logs per agent from `/api/agents/logs` |
| `frontend/src/components/dashboard/AlertFeed.tsx` | On mount fetch persisted events from `/api/agents/events`, then append live WS events |
| `frontend/src/components/dashboard/SignalPanel.tsx` | Accept `refreshTrigger` prop from parent, refetch when it changes |
| `frontend/src/components/dashboard/OrderHistory.tsx` | Accept `refreshTrigger` prop from parent, refetch when it changes |
| `frontend/src/services/api.ts` | Ensure `getAgentEvents(limit)` and `getReport(id)` API calls exist |
| `frontend/src/App.css` | Styles for ReportViewer layout, KPI tiles, risk alert banner, agent log entries |
| **Backend** | |
| `backend/app/models/database.py` | Add `agent_events` table to `SCHEMA_SQL`; add `confidence_grades_json` column to `signals` table |
| `backend/app/models/db.py` | Migration guards for `confidence_grades_json` column and `agent_events` table |
| `backend/app/agents/market_scanner.py` | Serialize `confidence_grades` dict into the signals INSERT statement as `confidence_grades_json` |
| `backend/app/agents/report_generator.py` | Compute `summary_json` programmatically from raw data before Claude call; save to reports table |
| `backend/app/routers/signals.py` | Parse `confidence_grades_json` in `_enrich_signal()` |
| `backend/app/routers/agents.py` | Ensure `GET /api/agents/events` reads from `agent_events` DB table |
| `backend/app/routers/reports.py` | Add `_enrich_report()` helper to parse `summary_json` string into dict |
| `backend/app/agents/event_bus.py` | Add DB persistence via `asyncio.create_task()` — insert each emitted event into `agent_events` table |

### Deleted Files

| File | Reason |
|------|--------|
| `frontend/src/components/dashboard/ReportList.tsx` | Replaced by `ReportViewer.tsx`; removes `dangerouslySetInnerHTML` XSS risk |

---

## Slice A: Live Dashboard Reactivity

### A1. Event-Driven Smart Refetch

**Current state:** Each dashboard panel polls independently on timers (SignalPanel 10s, OrderHistory 15s, DashboardView master poll 30s). `DashboardView.tsx` already has partial WS-driven refresh — it listens for `portfolio.updated`, `order.filled`, and `signal.approved` events and calls `fetchData()` on match. However, this refetches *all* data on *any* event, and some event types (`signal.generated`, `signal.rejected`, `risk.*`, `report.generated`) are not handled.

**Change:** Replace the blanket `fetchData()` refetch with targeted `refreshTrigger` counters per panel group:

| WS Event Type | Triggers Refetch Of |
|----------------|-------------------|
| `signal.generated`, `signal.approved`, `signal.rejected` | SignalPanel |
| `order.filled`, `order.submitted` | OrderHistory |
| `portfolio.updated` | PortfolioSummary, PositionsTable, PerformanceChart |
| `report.generated` | (no longer on dashboard — moved to ReportViewer) |
| `risk.stop_loss`, `risk.take_profit` | RiskAlertBanner (show banner) |

**Mechanism:** DashboardView maintains `refreshTrigger` state counters per panel group. On WS event match, increment the relevant counter. Child panels accept `refreshTrigger` as a prop and use `useEffect` to refetch when it changes. Existing polling intervals increased to 60s as fallback for WS disconnection.

**Child panel changes:**
- `SignalPanel`: Replace internal `setInterval` with `useEffect` on `refreshTrigger` prop. Keep a 60s fallback poll.
- `OrderHistory`: Same pattern — `refreshTrigger` prop + 60s fallback.
- `PortfolioSummary`, `PositionsTable`, `PerformanceChart`: Already fetched by DashboardView parent — parent refetches on `portfolio.updated` event.

### A2. Agent Activity Logs in AgentPanel

**Current state:** AgentPanel shows agent name, role, and status dot (idle/running/error/disabled). No activity trail.

**Change:** Below each agent card, show the last 3 execution logs. Fetched from `GET /api/agents/logs?limit=10` (already exists). Each log entry shows:
- Action name (e.g., "scan_market", "check_portfolio")
- Duration (e.g., "12.3s")
- Success/fail badge
- Relative timestamp (e.g., "2m ago")

Refresh on any agent-related WS event or every 60s fallback.

### A3. Risk Alert Banner

**New component:** `RiskAlertBanner.tsx`

When a `risk.stop_loss` or `risk.take_profit` event arrives via WebSocket:
- Show a banner at the top of the dashboard (above PortfolioSummary)
- Red background for stop-loss, green for take-profit
- Content: event type icon + stock name + P/L % + timestamp
- Dismiss button (X) or auto-dismiss after 30 seconds
- Stack multiple alerts if they arrive in quick succession (max 3 visible)

The banner reads event data from the WS event payload: `{ stock_code, stock_name, pnl_pct, event_type }`.

### A4. Event Persistence (Backend)

**Current state:** Events exist only in the event bus's in-memory history (1000-event ring buffer) and the WebSocket client's 100-event buffer. Lost on backend restart and frontend reload respectively.

**Change:**

**New table** in `database.py` SCHEMA_SQL:
```sql
CREATE TABLE IF NOT EXISTS agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    agent_id TEXT,
    data TEXT,
    timestamp TEXT NOT NULL
);
```

**Event bus persistence:** In `event_bus.py`, the global event emission path gains a DB insert. After notifying subscribers and global listeners, insert the event into `agent_events`. Use `asyncio.create_task()` for fire-and-forget insertion (the DB write must not block or delay event delivery to subscribers). Wrap the insert in a try/except to suppress DB errors — event delivery to WS clients must never fail due to persistence issues.

**API change:** `GET /api/agents/events?limit=50` in `agents.py` reads from the `agent_events` table instead of (or in addition to) the in-memory buffer. Returns events ordered by timestamp DESC.

**Frontend change:** `AlertFeed.tsx` on mount calls `getAgentEvents(50)` to populate the initial list, then appends live WS events. Deduplicates by checking if an event's timestamp+type already exists in the list.

### A5. Fix `confidence_grades_json` Pipeline

**Problem:** The `INSERT INTO signals` in `market_scanner.py` does not include `confidence_grades_json`. The frontend `SignalCard` reads `confidence_grades` but it's always undefined.

**Backend changes:**
1. `database.py`: Add `confidence_grades_json TEXT` column to `signals` table definition
2. `db.py`: Add migration guard: `ALTER TABLE signals ADD COLUMN confidence_grades_json TEXT`
3. `market_scanner.py`: In the signals INSERT, serialize `confidence_grades` dict as JSON and include as a column value
4. `signals.py` `_enrich_signal()`: Parse `confidence_grades_json` column and add to response dict

**Frontend:** No change needed — `SignalCard` and `FundamentalsKPI` already read `confidence_grades` from the signal object.

---

## Slice B: Report Viewer Page

### B1. Navigation Update

**Change `AppView` type:**
```typescript
type AppView = 'chat' | 'settings' | 'dashboard' | 'reports';
```

**HeaderBar.tsx:** Add a "Reports" tab button after Dashboard in the nav tabs.

**App.tsx:** Add `case 'reports': return <ReportViewer />` to the view switch.

**DashboardView.tsx:** Remove the `ReportList` panel from the dashboard grid. The freed space lets remaining panels breathe.

### B2. Structured `summary_json` Schema

**Problem:** ReportGenerator currently stores `summary_json` with a limited schema (`total_trades`, `filled_trades`, `total_signals`, `latest_pnl`, `latest_pnl_pct`). The Report Viewer needs richer structured data — win rate, drawdown, per-trade details, signal summaries, and risk events — for KPI tiles and tables.

**Solution:** Compute `summary_json` programmatically from raw DB data in `report_generator.py`, *before* calling Claude. Claude generates the prose narrative only. The structured data is never LLM-dependent.

**TypeScript interfaces:**

```typescript
interface ReportKPIs {
  total_pnl: number;            // period P/L in KRW
  total_pnl_pct: number;        // period P/L %
  trade_count: number;           // orders executed in period
  win_rate: number;              // % of profitable closed trades
  max_drawdown_pct: number;      // worst peak-to-trough in period
  signal_count: number;          // signals generated
  signal_approval_rate: number;  // % approved out of total
}

interface ReportTrade {
  stock_name: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  pnl?: number;                  // realized P/L if available
  timestamp: string;
}

interface ReportSignalSummary {
  stock_name: string;
  direction: string;
  rr_score?: number;
  status: string;
}

interface ReportRiskEvent {
  event_type: string;            // 'stop_loss' | 'take_profit'
  stock_name: string;
  detail: string;                // e.g., "-3.2% P/L triggered stop-loss"
  timestamp: string;
}

interface ReportSummary {
  kpis: ReportKPIs;
  trades: ReportTrade[];
  signals: ReportSignalSummary[];
  risk_events: ReportRiskEvent[];
}
```

**Backend computation in `report_generator.py`:**

The ReportGenerator already queries portfolio_snapshots, orders, signals, and agent_logs for the reporting period. The change adds a `_compute_summary()` method that:

1. **KPIs:** Compute from snapshots (P/L, drawdown), orders (trade count, win rate), signals (count, approval rate)
2. **Trades:** Extract from orders table for the period
3. **Signals:** Extract from signals table for the period
4. **Risk events:** Filter agent_events (or agent_logs) for `risk.stop_loss` / `risk.take_profit` in the period

The resulting dict is JSON-serialized into `summary_json` column. Claude receives this data as context for generating the narrative `content`.

**Backward compatibility:** Old reports with `summary_json = null` display only the markdown narrative section. No KPI tiles or tables shown.

**`summary_json` parsing strategy:** The backend `GET /api/reports` and `GET /api/reports/{id}` endpoints return `summary_json` as a JSON string (not a parsed object). Add an `_enrich_report()` helper in `reports.py` (following the `_enrich_signal()` pattern in `signals.py`) that parses `summary_json` into a dict before returning. On the frontend, the `Report` interface's `summary_json?: string` field should be replaced with `summary?: ReportSummary | null` to reflect the parsed object.

**`ReportList.tsx` disposition:** Delete `ReportList.tsx` after `ReportViewer.tsx` is complete. The ReportViewer fully replaces its functionality. This also eliminates the `dangerouslySetInnerHTML` usage in ReportList (an XSS risk) by using `react-markdown` for all narrative rendering.

### B3. ReportViewer Component

**New file:** `frontend/src/components/ReportViewer.tsx`

**Layout (two-column):**

**Left sidebar (narrow, ~250px):**
- Type filter tabs: All | Daily | Weekly
- Generate report buttons (daily / weekly)
- Generation progress indicator (spinner + WS listener for `report.generated`)
- Scrollable report list: each entry shows type badge, title, date
- Click to select → loads in main area
- Delete button per report

**Main content area (right, fills remaining width):**

When a report is selected:

1. **Report header** — Title, type badge, date range (period_start → period_end)

2. **KPI tiles row** — 7 tiles from `summary_json.kpis`:
   - Total P/L (KRW, colored red/green)
   - P/L % (colored)
   - Trade Count
   - Win Rate %
   - Max Drawdown %
   - Signals Generated
   - Approval Rate %

   Uses the same tile styling pattern as `FundamentalsKPI` (flex-wrap grid, consistent sizing).

3. **Trade table** — From `summary_json.trades`:
   - Columns: Stock, Side (badge), Qty, Price, P/L (colored)
   - Sorted by timestamp DESC
   - Compact table styling matching existing `OrderHistory` patterns

4. **Signal summary grid** — From `summary_json.signals`:
   - Compact cards: stock name, direction badge, R/R score, status badge
   - Flex-wrap layout

5. **Risk events timeline** — From `summary_json.risk_events`:
   - Vertical timeline with colored dots (red for stop-loss, green for take-profit)
   - Each entry: timestamp, event type, stock name, detail text
   - Empty state if no risk events in period

6. **Narrative section** — The markdown `content` field rendered with `react-markdown` + `rehype-highlight` + `remark-gfm` (same stack as `MessageBubble` in chat)

**When no report selected:** Show a centered empty state with "Select a report or generate a new one."

**Fallback for old reports:** If `summary_json` is null, skip sections 2-5 and show only the header + narrative.

### B4. Report Generation UX

**Current:** Click generate → button disables → silent wait (30-60s for Claude) → report appears in list.

**Change:**
1. Click "Generate Daily" or "Generate Weekly" button
2. Button shows spinner + "Generating..." text
3. POST `/api/reports/generate` fires
4. Listen for `report.generated` WS event
5. On event: refetch report list, auto-select the new report, clear spinner
6. On POST error: show error message, clear spinner

No SSE streaming needed — the WS event is sufficient for completion notification.

---

## Testing Strategy

### Backend Tests
- **Event persistence:** Test event bus DB insert + query via `/api/agents/events`
- **`confidence_grades_json` round-trip:** Insert signal with grades → call `_enrich_signal()` → verify grades in response
- **`summary_json` computation:** Unit test `_compute_summary()` with mock DB data — verify KPI arithmetic (win rate, drawdown, P/L %)

### Frontend Tests
- **Manual verification:**
  - Trigger market scanner → verify SignalPanel updates via WS (not just poll)
  - Trigger portfolio monitor → verify PortfolioSummary updates immediately
  - Generate report → verify Report Viewer shows structured KPI tiles + tables
  - Check old reports render markdown-only (no broken tiles)
  - Verify risk alerts show/dismiss correctly
  - Verify AlertFeed persists across page reload
  - Verify agent logs show in AgentPanel
- **Lint:** `cd frontend && npm run lint` — must pass with no errors
