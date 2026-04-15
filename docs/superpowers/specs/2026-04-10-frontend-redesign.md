# Frontend UI Grand Redesign

**Date:** 2026-04-10
**Status:** Approved
**Mockup:** `frontend/mockup-all-pages.html`

## Overview

Complete frontend UI rebuild replacing the current monolithic CSS with a shadcn/ui + Tailwind CSS component system. The redesign prioritizes agent observability (80% monitoring use case) by making the Agent Activity panel a persistent, always-visible feature. Chat is demoted from a permanent drawer to a Cmd+K command palette.

## Design Principles

1. **Monitoring-first** -- Optimize for glanceability. Big numbers, clear hierarchy, scannable data.
2. **Agent observability is the star** -- Live decision chains, expert panel votes, approval reasoning always visible.
3. **Light-first, both modes polished** -- Design in light mode, verify dark mode has proper contrast.
4. **Data density with breathing room** -- More info per pixel than current, but with proper spacing and hierarchy.
5. **One card system, one color system** -- No competing patterns. shadcn/ui components everywhere.

## Tech Stack Changes

| Current | New |
|---------|-----|
| Pure CSS (3077-line App.css) | Tailwind CSS v4 + CSS variables for tokens |
| No component library | shadcn/ui (Radix UI primitives) |
| Inline SVG icons | lucide-react icons |
| Raw SVG charts | lightweight-charts (price) + recharts (perf) |
| Custom tables | @tanstack/react-table |
| No command palette | cmdk (command menu) |

### New Dependencies

```
tailwindcss @tailwindcss/vite
@radix-ui/react-* (via shadcn/ui init)
cmdk
lucide-react
@tanstack/react-table
lightweight-charts
recharts
class-variance-authority
clsx tailwind-merge
```

### Removed

- `App.css` (3077 lines) -- replaced entirely
- `IconRail.css`, `ChatDrawer.css`, `AgentWorkflow.css`, `StockInfoView.css` -- replaced
- `ChatDrawer.tsx` component -- replaced by cmdk command palette + slide-over chat

## Layout Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Header: Logo | Nav Tabs | Cmd+K | Mode | Status | Theme│
├─────────────────────────────────────────────────────────┤
│                        │ resize │                        │
│   Main Panel           │ handle │  Right Panel           │
│   (page content)       │   4px  │  (Agent Activity)      │
│   flex: 1              │        │  width: 420px          │
│   overflow-y: auto     │        │  min: 280px            │
│                        │        │  max: 600px            │
│                        │        │  persistent across     │
│                        │        │  all pages             │
└─────────────────────────────────────────────────────────┘
```

### Header (52px)

- **Left:** Logo icon + "ALPHA PULSE" brand text
- **Center:** Horizontal nav tabs (Dashboard, Signals, Research, Reports, Settings)
  - Active tab: primary color underline + text
  - Each tab has a lucide icon + label
- **Right:** Cmd+K button, trading mode badge, MCP status pill, settings icon, theme toggle
- No icon rail. Navigation is horizontal tabs in header.

### Main Panel (left, flex: 1)

- Full-height scrollable content area
- Switches view based on active tab
- Padding: 20px 24px

### Right Panel (Agent Activity, persistent)

- Width: 420px default, resizable 280-600px via drag handle
- Always visible on all pages (the monitoring core)
- Sub-tabs: Timeline | Agents | Decisions
- Sticky header with live dot indicator

### Chat (Cmd+K Command Palette)

- Triggered by Cmd+K or clicking the header button
- Modal overlay with search input
- Sections: Quick Actions (run agents), Chat (open full conversation), Navigate (go to pages)
- Full chat opens as a slide-over panel (not permanent space consumer)
- Chat shortcut: Cmd+J for direct chat open

## Pages

### 1. Dashboard

**Purpose:** Portfolio overview and recent activity at a glance.

**Components:**
- **Hero Card** -- Gradient background (indigo -> purple), displays total portfolio value (large mono font), today's P/L, total P/L, cash balance, position count. This is the visual anchor.
- **Positions Table** -- tanstack/react-table with columns: Stock (name + code), Qty, Avg Price, Current, P/L (colored), Stop-Loss, Horizon badge, Re-eval status. Sortable, overflow-x scrollable wrapper.
- **Performance Chart** -- recharts line chart with area fill. Period selector (1W/1M/3M). KPI row below: returns %, Sharpe ratio, max drawdown.
- **Recent Orders** -- Compact table with stock, side badge, qty, status.

**Layout:** Hero card full width, positions full width, then 2-column grid (performance + orders).

### 2. Signals

**Purpose:** Browse and inspect all AI-generated trading signals.

**Components:**
- **Filter Bar** -- Segmented button groups for status (All/Approved/Rejected/Pending/Executed) and time range (Today/This Week/All Time).
- **Signal Cards** -- One card per signal containing:
  - Header: Direction badge (BUY red / SELL blue) + stock name/code + status badge + score + grade
  - Scenario Row: 3 cards (bull/base/bear) with percentage, probability, target price
  - Expert Panel: Chip row showing each expert's stance (bullish/bearish/neutral colored pills)
  - Rejection Detail (if rejected): Red-tinted box with reason text
  - Footer: Timestamp, scan source, horizon, "View Detail" button
- **Signal Detail Modal** -- Expanded view with scenario chart, peer comparison, fundamentals KPIs, signal history. Opens on "View Detail" click.

### 3. Research

**Purpose:** Stock discovery and deep-dive analysis.

**Layout:** Sidebar (260px) + Main content area.

**Sidebar Components:**
- Search input with stock code/name lookup
- Watchlist section: Stock rows with name, code, current price, day change
- Recent Signals section: Stocks with recent signal activity

**Main Content Components (for selected stock):**
- **Header Bar** -- Stock name, code, exchange, current price (large), day change
- **Price Chart** -- lightweight-charts candlestick chart with period selector (1M/3M/1Y)
- **Fundamentals Card** -- 3x2 KPI grid: PER, PBR, ROE, Revenue YoY, Op. Margin, Div. Yield
- **Valuation Card** -- Peer comparison visualization
- **News & Disclosures** -- Table with date, title, source (DART/News)
- **Signal History** -- Table of past signals for this stock with direction, score, grade, status, outcome

**Layout:** Price chart full width, then 2-column grid (fundamentals + valuation), then full-width news and signal history.

### 4. Reports

**Purpose:** Read daily and weekly AI-generated reports.

**Layout:** Sidebar (280px) + Main reader area.

**Sidebar Components:**
- Filter toggle: All / Daily / Weekly
- Report list items: Type badge (daily=blue, weekly=purple) + title + date/time

**Main Content:**
- Report body rendered as markdown with:
  - KPI summary row at top (portfolio value, day P/L, signals count, trades count)
  - Sections: Market Overview, Trading Activity, Signal Summary, Risk Status
  - Clean typography: 14px base, 1.8 line-height, proper heading hierarchy

### 5. Settings

**Purpose:** Configure trading parameters, risk limits, factor weights, scheduler.

**Layout:** Single column, max-width 720px.

**Sections:**
- **Trading Configuration** -- Trading mode select, signal approval mode, min composite score input
- **Risk Management** -- Max position weight, stop-loss threshold, take-profit threshold
- **Factor Weights** -- Slider controls for each weight (R/R ratio, expert consensus, fundamental, technical, institutional) with numeric display
- **Scheduler** -- Table of scheduled tasks with agent, cron expression, enable/disable toggles
- **Actions** -- Save Settings (primary button), Reset to Defaults

## Right Panel: Agent Activity (Core Feature)

### Timeline Tab (default)

A vertical timeline of agent events, newest first. Each event has:
- **Icon** -- Color-coded by agent type (scanner=indigo, risk=red, executor=blue, portfolio=green, report=purple)
- **Agent name** + timestamp
- **Event type** (signal.generated, signal.approved, order.filled, etc.)
- **Decision chain** -- Horizontal step indicators showing the pipeline stage (e.g., Screen -> Enrich -> Experts -> Score) with pass/fail/active coloring
- **Detail box** -- Expandable gray box with:
  - For scanner events: Stock name, expert vote grid (3x2), consensus summary
  - For risk events: R/R score, position weight, sector check, approval/rejection chain
  - For executor events: Fill price, quantity, total value
  - For portfolio events: Position count, P/L summary

**Running state:** Active events show a pulsing icon animation and blue dot after agent name. Decision chain highlights the current step.

### Agents Tab

Status overview of all 5 agents:
- Agent name + role
- Status dot (idle=gray, running=blue pulse, error=red)
- Last run timestamp
- Enable/disable toggle
- Run Now button

### Decisions Tab

Filtered view showing only decision-point events (signal.approved, signal.rejected, risk.stop_loss, risk.take_profit) with full reasoning detail.

## Backend Changes Required

### New Events to Emit

To support the rich agent timeline, the following intermediate events need to be added:

1. `scanner.screening_complete` -- {candidates_count, top_candidates[]}
2. `scanner.enrichment_progress` -- {stock_code, stage: "technicals"|"fundamentals"|"news"}
3. `scanner.expert_opinion` -- {stock_code, expert_name, view, confidence, key_signals[]}
4. `scanner.chief_complete` -- {stock_code, direction, scenarios, consensus}
5. `scanner.scoring_complete` -- {stock_code, composite_score, grade, passed}

These are emitted by adding `self.emit()` calls at intermediate points in the market scanner agent's `run()` method and the expert panel functions. No new API endpoints needed -- events flow through the existing EventBus -> WebSocket pipeline.

## Design Tokens (Tailwind Config)

```js
// tailwind.config.js theme extension
colors: {
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  primary: { DEFAULT: '#4f46e5', foreground: '#ffffff', light: '#eef2ff' },
  muted: { DEFAULT: '#f8f9fb', foreground: '#64748b' },
  accent: { DEFAULT: '#e04b3a' },
  success: { DEFAULT: '#16a34a', light: '#f0fdf4' },
  warning: { DEFAULT: '#f59e0b', light: '#fffbeb' },
  error: { DEFAULT: '#ef4444', light: '#fef2f2' },
  border: '#e5e7eb',
},
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['SF Mono', 'Fira Code', 'monospace'],
},
fontSize: {
  xs: '12px',   // bumped from 11px
  sm: '13px',
  base: '14px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
}
```

Dark mode tokens override via `dark:` variant class or CSS variables in `[data-theme="dark"]`.

## Component File Structure

```
src/
├── app.tsx                    # Layout shell only
├── main.tsx
├── globals.css                # Tailwind directives + CSS variables
├── lib/
│   └── utils.ts               # cn() helper
├── hooks/
│   ├── use-theme.ts
│   ├── use-settings.ts
│   └── use-websocket.ts
├── services/
│   └── api.ts
├── components/
│   ├── ui/                    # shadcn/ui primitives (auto-generated)
│   │   ├── button.tsx
│   │   ├── badge.tsx
│   │   ├── card.tsx
│   │   ├── command.tsx        # cmdk palette
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── slider.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   └── toggle.tsx
│   ├── layout/
│   │   ├── header.tsx         # Top bar with nav tabs
│   │   ├── main-layout.tsx    # Split panel container
│   │   └── command-palette.tsx # Cmd+K overlay
│   ├── agent-activity/        # Right panel
│   │   ├── activity-panel.tsx # Container with sub-tabs
│   │   ├── timeline-feed.tsx  # Event timeline
│   │   ├── agent-status.tsx   # Agent overview tab
│   │   ├── decision-log.tsx   # Decision filter tab
│   │   ├── flow-event.tsx     # Single timeline event
│   │   ├── decision-chain.tsx # Step indicator
│   │   └── expert-grid.tsx    # Expert vote visualization
│   ├── dashboard/
│   │   ├── dashboard-view.tsx
│   │   ├── hero-card.tsx      # Portfolio hero
│   │   ├── positions-table.tsx
│   │   ├── performance-chart.tsx
│   │   └── recent-orders.tsx
│   ├── signals/
│   │   ├── signals-view.tsx
│   │   ├── signal-filters.tsx
│   │   ├── signal-card.tsx
│   │   ├── scenario-row.tsx
│   │   ├── expert-panel.tsx
│   │   └── signal-detail-modal.tsx
│   ├── research/
│   │   ├── research-view.tsx
│   │   ├── stock-sidebar.tsx
│   │   ├── stock-detail.tsx
│   │   ├── price-chart.tsx
│   │   ├── fundamentals-card.tsx
│   │   ├── news-table.tsx
│   │   └── signal-history.tsx
│   ├── reports/
│   │   ├── reports-view.tsx
│   │   ├── report-list.tsx
│   │   └── report-reader.tsx
│   └── settings/
│       ├── settings-view.tsx
│       ├── trading-config.tsx
│       ├── risk-config.tsx
│       ├── factor-weights.tsx
│       └── scheduler-table.tsx
└── types.ts
```

## Migration Strategy

This is a full rewrite, not an incremental migration. The approach:

1. **Initialize Tailwind + shadcn/ui** in the existing frontend project
2. **Build the layout shell** (header, main-layout, right panel) first
3. **Port pages one by one** starting with Dashboard (most visible)
4. **Agent Activity panel** built early since it's the core feature
5. **Delete old CSS files** once all pages are ported
6. **Backend: Add intermediate scanner events** in parallel

Old components are not reused -- they're replaced. Business logic (hooks, services, types) is preserved and adapted.

## What's NOT Changing

- React 19 + Vite 7 (no framework change)
- TypeScript
- Backend API endpoints (all existing endpoints preserved)
- WebSocket event pipeline (just adding more event types)
- hooks/useTheme, hooks/useSettings, hooks/useWebSocket (adapted, not rewritten)
- services/api.ts (preserved as-is)
- types.ts (extended, not replaced)

## Success Criteria

1. All 5 pages render with the new design matching the mockup
2. Agent Activity timeline shows live events with decision chains
3. Light and dark mode both pass WCAG AA contrast
4. No CSS file exceeds 200 lines (component-scoped via Tailwind)
5. Cmd+K palette works for navigation, agent commands, and chat access
6. Positions table handles 20+ rows without layout breakage
7. Resizable right panel works smoothly
