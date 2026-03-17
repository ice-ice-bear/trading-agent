# Agent Workflow Page Design

**Date:** 2026-03-17
**Goal:** Add a dedicated "Agents" page that visualizes the 5-agent pipeline as an interactive DAG, shows per-agent execution details via expand-in-place panels, and provides a filterable event timeline — giving full visibility into agent orchestration without leaving the UI.

**Architecture:** Single new page (frontend-only) consuming existing backend APIs. A pure CSS DAG renders the fixed 5-node agent topology with click-to-expand detail panels. Below the DAG, a vertical event timeline shows chronological agent activity with category filters. WebSocket events drive live updates to both the DAG node states and the timeline.

**Tech Stack:** React 19, TypeScript, CSS variables (existing patterns). No new dependencies.

**Prior work:** Builds on the 2026-03-17 dashboard reactivity work (event persistence in `agent_events` table, `parseUTC` utility, `useWebSocket` hook, existing agent APIs).

---

## File Map

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/AgentWorkflow.tsx` | Full-page component: DAG pipeline, expand-in-place detail panel, event timeline with filters |
| `frontend/src/components/AgentWorkflow.css` | All styles: DAG nodes, CSS arrows, detail panel transition, timeline entries, filter pills |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/types.ts` | Extend `AppView` union to include `'agents'` |
| `frontend/src/App.tsx` | Add `'agents'` case to view switch, render `AgentWorkflow`, pass `onOpenAgents` to HeaderBar/Sidebar |
| `frontend/src/components/HeaderBar.tsx` | Add "Agents" tab between Dashboard and Reports, with `onOpenAgents` callback prop |
| `frontend/src/components/Sidebar.tsx` | Add "Agents" navigation entry with `onOpenAgents` callback prop |
| `frontend/src/App.css` | Minor additions only: `.agent-workflow` page container sizing. All component-specific styles go in `AgentWorkflow.css` |

### No Backend Changes

All data comes from existing APIs:
- `GET /api/agents` — agent list with status
- `GET /api/agents/logs?limit=50` — execution logs with result_summary
- `GET /api/agents/events?limit=100` — persisted event timeline
- `POST /api/agents/{id}/run` — manual trigger
- `POST /api/agents/{id}/enable` / `POST /api/agents/{id}/disable` — toggle agent
- `GET /api/tasks` — scheduled tasks (for cron schedule display in detail panel)
- WebSocket — live event push for real-time updates (reuses existing `useWebSocket` hook — accepts duplicate connections per page, same as DashboardView/ReportViewer pattern)

---

## Page Layout

Three vertical zones in a single scrollable column:

```
┌─────────────────────────────────────────────────┐
│  Agent Pipeline DAG  (~200px fixed height)        │
│                                                   │
│  Row 1: [PortMon] ──→ [RiskMgr] ──→ [Executor]  │
│  Row 2: [Scanner] ──↗               [Reporter]   │
├─────────────────────────────────────────────────┤
│  Agent Detail Panel  (0px collapsed, ~200px open) │
│  (expand-in-place when a DAG node is clicked)     │
├─────────────────────────────────────────────────┤
│  Event Timeline  (fills remaining height)         │
│  Filter pills + vertical event list               │
└─────────────────────────────────────────────────┘
```

Navigation: "Agents" tab added to HeaderBar (between Dashboard and Reports) and Sidebar. Routed via `AppView = 'agents'`. Sidebar hidden for agents view (same as dashboard/reports — add `'agents'` to the exclusion check in `App.tsx`).

---

## Section 1: Agent Pipeline DAG

### Layout

5 agent nodes arranged in two rows using CSS grid/flexbox:

- **Row 1 (main pipeline):** Portfolio Monitor → Risk Manager → Trading Executor
- **Row 2 (independent agents):** Market Scanner (with diagonal arrow to Risk Manager), Report Generator (no arrows — independent)

The arrows represent the event-driven subscription graph:
- PortfolioMonitor emits `portfolio.updated` → RiskManager subscribes
- MarketScanner emits `signal.generated` → RiskManager subscribes
- RiskManager emits `signal.approved`, `risk.stop_loss`, `risk.take_profit` → TradingExecutor subscribes

### Each Node Shows

- **Status dot** — colored by agent status: green (idle), blue (running), red (error), gray (disabled)
- **Agent name** — Korean name (e.g., "마켓 스캐너")
- **Last run info** — relative time + duration (e.g., "2m ago · 12.3s")
- **Result badge** — "OK" (green) or "ERR" (red) based on last log's `success` field
- **Run button** — small button to manually trigger the agent (disabled when running or disabled)

### Arrows

CSS `::after` pseudo-elements with border tricks for arrowheads:
- Two horizontal arrows: PortMon → Risk, Risk → Executor
- One diagonal arrow: Scanner → Risk
- Report Generator has no arrows (standalone)

### Live Behavior

- When a WS event arrives matching an agent's ID, the corresponding node pulses briefly (CSS `@keyframes` animation, ~1s)
- Node status dot updates when `GET /api/agents` refreshes (on WS event or 60s fallback poll)
- Clicking a node selects it (accent border) and opens the detail panel below

---

## Section 2: Agent Detail Panel (Expand In-Place)

### Trigger

Clicking a DAG node opens this panel between the DAG and the timeline. The panel slides open with a CSS `max-height` + `opacity` transition (~200ms).

- Clicking the same node again collapses the panel
- Clicking a different node swaps content instantly (no collapse/re-expand)
- Panel has an accent-colored left border

### Three-Column Layout

| Column 1: Summary | Column 2: Recent Logs | Column 3: Events & Actions |
|---|---|---|
| Agent name + role | Last 5 execution logs from `agent_logs` | Events emitted (grouped count from `agent_events`) |
| Status badge (idle/running/error/disabled) | Each log: OK/ERR badge, action name, duration, relative time | e.g., "signal.generated × 3", "signal.failed × 12" |
| Last `result_summary` text (the key output) | Error message shown if ERR (expandable) | Schedule info (cron expression from `scheduled_tasks`) |
| Toggle ON/OFF + Run button | | |

### Data Sources

- Agent info: from the `agents` array already fetched for the DAG
- Logs: filtered from `GET /api/agents/logs` response by `agent_id`
- Events: filtered from `GET /api/agents/events` response by `agent_id`, grouped by `event_type` with count
- Schedule info: from `GET /api/tasks` (already exists, returns `scheduled_tasks` with `agent_id`, `cron_expression`, `enabled`). Fetched once on mount alongside agents/logs/events. Matched to agent by `agent_id`.

---

## Section 3: Event Timeline

### Layout

A vertical timeline below the detail panel, filling the remaining page height.

**Filter bar** at the top: horizontal row of toggleable pill buttons for event categories. All active by default. Click to toggle off/on.

| Category | Event Types | Pill Color |
|----------|-------------|------------|
| Signal | `signal.generated`, `signal.approved`, `signal.rejected`, `signal.failed` | Green |
| Order | `order.filled`, `order.failed` | Blue |
| Portfolio | `portfolio.updated` | Gray |
| Risk | `risk.stop_loss`, `risk.take_profit` | Red |
| Report | `report.generated` | Purple |

### Each Timeline Entry Shows

- **Colored dot** — matching the event category color
- **Event type badge** — e.g., `signal.generated`
- **Agent name** — Korean name looked up from the agents list (e.g., "마켓 스캐너" instead of raw `market_scanner`)
- **Summary text** — extracted from event data payload:

| Event Type | Summary Format |
|-----------|---------------|
| `signal.generated` | "{stock_name} {direction} (R/R: {rr_score})" |
| `signal.approved` | "{stock_name} approved" |
| `signal.rejected` | "{stock_name} rejected — {reason}" |
| `signal.failed` | "{stock_name} — confidence gate ({failed_fields})" |
| `order.filled` | "{side} {quantity}× {stock_name}" |
| `order.failed` | "{stock_name} — {reason}" |
| `portfolio.updated` | "총자산 {total_value} · P/L {total_pnl_pct}%" |
| `risk.stop_loss` | "STOP {stock_name} ({pnl_pct}%)" |
| `risk.take_profit` | "TAKE {stock_name} ({pnl_pct}%)" |
| `report.generated` | "{report_type} report" |

- **Timestamp** — formatted with `parseUTC()` + `toLocaleTimeString('ko-KR')`

### Data & Live Updates

- **Initial load:** `GET /api/agents/events?limit=100` on mount
- **Live updates:** New WS events prepend to the top with a slide-in CSS animation
- **Deduplication:** Same pattern as AlertFeed — `timestamp + event_type + agent_id` key
- **Most recent at top**, ordered by timestamp DESC

---

## Testing Strategy

### Frontend Tests (Manual Verification)
- Navigate to Agents tab → verify DAG renders with all 5 nodes
- Click a node → verify detail panel expands in-place with correct agent data
- Click same node → verify panel collapses
- Click different node → verify content swaps without flicker
- Run an agent manually → verify node pulses, logs update, event appears in timeline
- Toggle agent ON/OFF → verify status dot changes
- Filter timeline by category → verify entries show/hide correctly
- Verify all timestamps display correctly (not 9hr offset)

### Edge Cases
- If `GET /api/agents` returns fewer than 5 agents (registration failure), render missing nodes as grayed-out with "unavailable" text
- Loading state: show a simple "Loading..." text in each zone while fetching (follow existing dashboard patterns)
- API error: show "Failed to load" inline with a retry button (no modal)
- On narrow screens (≤768px): detail panel columns stack vertically, DAG nodes shrink but remain readable

### Lint
- `cd frontend && npm run lint` — must pass with no errors
