# Frontend UI Grand Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the entire frontend UI with shadcn/ui + Tailwind CSS, making the Agent Activity panel the persistent core feature, replacing the monolithic App.css and chat drawer.

**Architecture:** Split-panel layout (main content + persistent Agent Activity right panel). Horizontal nav tabs in header replace the icon rail. Chat becomes a Cmd+K command palette. Each page is a self-contained view component using shadcn/ui primitives. All styling via Tailwind utility classes — no custom CSS files per component.

**Tech Stack:** React 19, Vite 7, TypeScript, Tailwind CSS v4, shadcn/ui (Radix UI), cmdk, lucide-react, @tanstack/react-table, recharts, lightweight-charts

**Spec:** `docs/superpowers/specs/2026-04-10-frontend-redesign.md`
**Mockup:** `frontend/mockup-all-pages.html`

---

## File Structure

```
frontend/src/
├── app.tsx                          # Layout shell: header + split panels
├── main.tsx                         # React root (unchanged)
├── globals.css                      # Tailwind directives + CSS custom properties
├── lib/
│   └── utils.ts                     # cn() helper (clsx + tailwind-merge)
├── hooks/
│   ├── use-theme.ts                 # Light/dark toggle (adapted from existing)
│   ├── use-settings.ts              # Settings persistence (existing, unchanged)
│   └── use-websocket.ts             # WebSocket events (existing, unchanged)
├── services/
│   └── api.ts                       # Backend API calls (existing, unchanged)
├── types.ts                         # Type definitions (existing + new AppView type)
├── components/
│   ├── ui/                          # shadcn/ui primitives (auto-generated via CLI)
│   │   ├── button.tsx
│   │   ├── badge.tsx
│   │   ├── card.tsx
│   │   ├── command.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── slider.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   └── toggle.tsx
│   ├── layout/
│   │   ├── header.tsx               # Top bar: logo, nav tabs, cmd-k, status
│   │   ├── main-layout.tsx          # Resizable split panel container
│   │   └── command-palette.tsx      # Cmd+K overlay (cmdk wrapper)
│   ├── agent-activity/
│   │   ├── activity-panel.tsx       # Right panel container with sub-tabs
│   │   ├── timeline-feed.tsx        # Event timeline list
│   │   ├── flow-event.tsx           # Single timeline event card
│   │   ├── decision-chain.tsx       # Horizontal step indicator
│   │   ├── expert-grid.tsx          # 3x2 expert vote grid
│   │   ├── agent-status-tab.tsx     # Agent overview tab
│   │   └── decision-log-tab.tsx     # Decision filter tab
│   ├── dashboard/
│   │   ├── dashboard-view.tsx       # Page container
│   │   ├── hero-card.tsx            # Portfolio hero (gradient)
│   │   ├── positions-table.tsx      # tanstack-table positions
│   │   ├── performance-chart.tsx    # recharts area chart
│   │   └── recent-orders.tsx        # Compact orders table
│   ├── signals/
│   │   ├── signals-view.tsx         # Page container with filters
│   │   ├── signal-card.tsx          # Full signal card
│   │   ├── scenario-row.tsx         # Bull/base/bear cards
│   │   └── expert-panel.tsx         # Expert stance chips
│   ├── research/
│   │   ├── research-view.tsx        # Page container (sidebar + detail)
│   │   ├── stock-sidebar.tsx        # Search + watchlist
│   │   ├── stock-detail.tsx         # Selected stock detail
│   │   ├── price-chart.tsx          # lightweight-charts wrapper
│   │   └── fundamentals-card.tsx    # KPI grid
│   ├─��� reports/
│   │   ├── reports-view.tsx         # Page container (list + reader)
│   │   ├── report-list.tsx          # Report sidebar
│   │   └── report-reader.tsx        # Markdown reader
│   └── settings/
│       ├── settings-view.tsx        # Page container
│       ├── trading-config.tsx       # Trading mode, approval mode
│       ├── risk-config.tsx          # Risk limits
│       ├── factor-weights.tsx       # Weight sliders
│       └── scheduler-table.tsx      # Cron task table
```

---

## Task 1: Initialize Tailwind CSS v4 + shadcn/ui Foundation

**Files:**
- Create: `frontend/src/globals.css`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/components.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.app.json`
- Modify: `frontend/package.json`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Install Tailwind CSS v4 + Vite plugin**

```bash
cd frontend && npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Install shadcn/ui dependencies**

```bash
cd frontend && npm install class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-slot
```

- [ ] **Step 3: Add path alias to tsconfig.app.json**

Add to `compilerOptions` in `frontend/tsconfig.app.json`:

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

- [ ] **Step 4: Update vite.config.ts with Tailwind plugin + path alias**

Replace `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8001',
      '/health': 'http://localhost:8001',
      '/ws': {
        target: 'ws://localhost:8001',
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 5: Create globals.css with Tailwind directives + design tokens**

Create `frontend/src/globals.css`:

```css
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

@theme {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;

  --color-background: #f8f9fb;
  --color-foreground: #0f172a;
  --color-surface: #ffffff;
  --color-muted: #f8f9fb;
  --color-muted-foreground: #64748b;
  --color-border: #e5e7eb;
  --color-border-light: #f0f1f3;
  --color-input: #e5e7eb;
  --color-ring: #4f46e5;

  --color-primary: #4f46e5;
  --color-primary-foreground: #ffffff;
  --color-primary-light: #eef2ff;

  --color-accent: #e04b3a;

  --color-success: #16a34a;
  --color-success-light: #f0fdf4;
  --color-warning: #f59e0b;
  --color-warning-light: #fffbeb;
  --color-error: #ef4444;
  --color-error-light: #fef2f2;
  --color-blue: #3b82f6;
  --color-blue-light: #eff6ff;
  --color-purple: #7c3aed;
  --color-purple-light: #f5f3ff;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.06);
}

/* Dark mode overrides */
[data-theme="dark"] {
  --color-background: #0f1117;
  --color-foreground: #e2e8f0;
  --color-surface: #1a1b26;
  --color-muted: #1e2030;
  --color-muted-foreground: #94a3b8;
  --color-border: #2d3348;
  --color-border-light: #1e2235;
  --color-input: #2d3348;
  --color-ring: #818cf8;

  --color-primary: #818cf8;
  --color-primary-foreground: #ffffff;
  --color-primary-light: rgba(129, 140, 248, 0.1);

  --color-success-light: rgba(22, 163, 74, 0.1);
  --color-warning-light: rgba(245, 158, 11, 0.1);
  --color-error-light: rgba(239, 68, 68, 0.1);
  --color-blue-light: rgba(59, 130, 246, 0.1);
  --color-purple-light: rgba(124, 58, 237, 0.1);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
  background: var(--color-background);
  color: var(--color-foreground);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  min-height: 100vh;
}
```

- [ ] **Step 6: Create lib/utils.ts**

Create `frontend/src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 7: Update main.tsx to use globals.css**

Replace `import './index.css'` with `import './globals.css'` in `frontend/src/main.tsx`. Remove the `import './App.css'` from `app.tsx` (will be done when we rewrite app.tsx in Task 3).

- [ ] **Step 8: Verify Tailwind works**

```bash
cd frontend && npx vite --port 5174 &
# Visit http://localhost:5174 — should render without CSS errors
# Kill the dev server after verification
```

- [ ] **Step 9: Commit**

```bash
cd frontend && git add package.json package-lock.json vite.config.ts tsconfig.app.json src/globals.css src/lib/utils.ts src/main.tsx
git commit -m "feat(ui): initialize Tailwind CSS v4 + shadcn/ui foundation"
```

---

## Task 2: Install shadcn/ui Components

**Files:**
- Create: `frontend/components.json`
- Create: `frontend/src/components/ui/*.tsx` (auto-generated)

- [ ] **Step 1: Create components.json for shadcn/ui**

Create `frontend/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 2: Add shadcn/ui components**

```bash
cd frontend && npx shadcn@latest add button badge card command dialog input select slider table tabs toggle-group separator dropdown-menu
```

If the CLI asks questions, accept defaults. This creates files in `src/components/ui/`.

- [ ] **Step 3: Verify components are importable**

Create a quick smoke test — add this to `main.tsx` temporarily and check no build errors:

```typescript
import { Button } from '@/components/ui/button'
console.log('shadcn loaded:', typeof Button)
```

Remove after verifying. Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
cd frontend && git add components.json src/components/ui/
git commit -m "feat(ui): add shadcn/ui components (button, badge, card, command, dialog, table, etc.)"
```

---

## Task 3: Build Layout Shell (Header + Split Panel)

**Files:**
- Create: `frontend/src/components/layout/header.tsx`
- Create: `frontend/src/components/layout/main-layout.tsx`
- Rewrite: `frontend/src/app.tsx`
- Delete (later): `frontend/src/components/IconRail.tsx`, `frontend/src/components/IconRail.css`

- [ ] **Step 1: Create header.tsx**

Create `frontend/src/components/layout/header.tsx`:

```tsx
import { LayoutDashboard, Activity, Search, FileText, Settings, Sun, Moon } from 'lucide-react'
import type { AppView } from '@/types'
import { cn } from '@/lib/utils'

interface HeaderProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  theme: string
  onToggleTheme: () => void
  tradingMode: string
  mcpConnected: boolean
  mcpToolsCount: number
  onOpenCmdK: () => void
}

const NAV_ITEMS: { id: AppView; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'signals', label: 'Signals', icon: Activity },
  { id: 'research', label: 'Research', icon: Search },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Header({
  currentView, onViewChange, theme, onToggleTheme,
  tradingMode, mcpConnected, mcpToolsCount, onOpenCmdK,
}: HeaderProps) {
  return (
    <header className="flex items-center h-[52px] px-5 bg-surface border-b border-border gap-6 shrink-0 z-20">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-purple flex items-center justify-center text-white font-extrabold text-sm">
          AP
        </div>
        <span className="text-[15px] font-bold tracking-wide">
          ALPHA <span className="text-accent">PULSE</span>
        </span>
      </div>

      {/* Nav Tabs */}
      <nav className="flex h-full items-stretch gap-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 text-[13px] font-medium border-b-2 transition-colors',
              currentView === id
                ? 'text-primary border-primary font-semibold'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted'
            )}
          >
            <Icon size={16} className={cn('opacity-70', currentView === id && 'opacity-100')} />
            {label}
          </button>
        ))}
      </nav>

      {/* Right section */}
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={onOpenCmdK}
          className="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
        >
          <span>Chat & Commands...</span>
          <kbd className="text-[11px] bg-surface border border-border rounded px-1.5 py-0.5 font-medium">⌘K</kbd>
        </button>

        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide',
          tradingMode === 'real'
            ? 'bg-error-light text-error'
            : 'bg-warning-light text-amber-700'
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full', tradingMode === 'real' ? 'bg-error' : 'bg-warning')} />
          {tradingMode === 'real' ? 'REAL' : 'DEMO'}
        </div>

        <div className={cn(
          'flex items-center gap-1.5 text-xs font-medium',
          mcpConnected ? 'text-success' : 'text-error'
        )}>
          <span className={cn(
            'w-[7px] h-[7px] rounded-full',
            mcpConnected ? 'bg-success shadow-[0_0_6px_rgba(22,163,74,0.4)]' : 'bg-error'
          )} />
          {mcpConnected ? `MCP (${mcpToolsCount})` : 'Disconnected'}
        </div>

        <button
          onClick={onToggleTheme}
          className="w-8 h-8 flex items-center justify-center border border-border rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Create main-layout.tsx (resizable split panel)**

Create `frontend/src/components/layout/main-layout.tsx`:

```tsx
import { useRef, useCallback, useState, type ReactNode } from 'react'

interface MainLayoutProps {
  children: ReactNode
  rightPanel: ReactNode
}

export default function MainLayout({ children, rightPanel }: MainLayoutProps) {
  const [rightWidth, setRightWidth] = useState(420)
  const isResizing = useRef(false)

  const onMouseDown = useCallback(() => {
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = window.innerWidth - e.clientX
      if (newWidth >= 280 && newWidth <= 600) {
        setRightWidth(newWidth)
      }
    }

    const onMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div className="flex h-[calc(100vh-52px)] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5 min-w-0">
        {children}
      </div>
      <div
        onMouseDown={onMouseDown}
        className="w-1 cursor-col-resize bg-transparent hover:bg-primary transition-colors shrink-0"
      />
      <div
        className="bg-surface border-l border-border flex flex-col overflow-hidden shrink-0"
        style={{ width: rightWidth }}
      >
        {rightPanel}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite app.tsx with new layout shell**

Replace `frontend/src/app.tsx`:

```tsx
import { useState, useCallback, useEffect } from 'react'
import type { AppView } from '@/types'
import { useTheme } from '@/hooks/use-theme'
import { useSettings } from '@/hooks/use-settings'
import { useWebSocket } from '@/hooks/use-websocket'
import { checkHealth } from '@/services/api'
import Header from '@/components/layout/header'
import MainLayout from '@/components/layout/main-layout'
import DashboardView from '@/components/dashboard/dashboard-view'
import SignalsView from '@/components/signals/signals-view'
import ResearchView from '@/components/research/research-view'
import ReportsView from '@/components/reports/reports-view'
import SettingsView from '@/components/settings/settings-view'
import ActivityPanel from '@/components/agent-activity/activity-panel'

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const { settings } = useSettings()
  const { connected: wsConnected, events } = useWebSocket()
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [mcpConnected, setMcpConnected] = useState(false)
  const [mcpToolsCount, setMcpToolsCount] = useState(0)
  const [cmdkOpen, setCmdkOpen] = useState(false)

  useEffect(() => {
    checkHealth().then((h) => {
      setMcpConnected(h.mcp_connected)
      setMcpToolsCount(h.mcp_tools_count)
    }).catch(() => {})
    const interval = setInterval(() => {
      checkHealth().then((h) => {
        setMcpConnected(h.mcp_connected)
        setMcpToolsCount(h.mcp_tools_count)
      }).catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Cmd+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdkOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const renderView = useCallback(() => {
    switch (currentView) {
      case 'dashboard': return <DashboardView />
      case 'signals': return <SignalsView />
      case 'research': return <ResearchView />
      case 'reports': return <ReportsView />
      case 'settings': return <SettingsView />
      default: return <DashboardView />
    }
  }, [currentView])

  return (
    <div className="h-screen overflow-hidden">
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        theme={theme}
        onToggleTheme={toggleTheme}
        tradingMode={settings.trading_mode}
        mcpConnected={mcpConnected}
        mcpToolsCount={mcpToolsCount}
        onOpenCmdK={() => setCmdkOpen(true)}
      />
      <MainLayout
        rightPanel={<ActivityPanel events={events} wsConnected={wsConnected} />}
      >
        {renderView()}
      </MainLayout>
    </div>
  )
}
```

- [ ] **Step 4: Update AppView type**

In `frontend/src/types.ts`, update the AppView type (if it exists) or add it:

```typescript
export type AppView = 'dashboard' | 'signals' | 'research' | 'reports' | 'settings'
```

- [ ] **Step 5: Rename hook files to kebab-case**

```bash
cd frontend/src/hooks
mv useTheme.ts use-theme.ts
mv useSettings.ts use-settings.ts
mv useWebSocket.ts use-websocket.ts
```

Update all imports inside these files if they reference each other (they don't based on current code).

- [ ] **Step 6: Create placeholder view components**

Create placeholder files so the app compiles. Each returns a simple div:

`frontend/src/components/dashboard/dashboard-view.tsx`:
```tsx
export default function DashboardView() {
  return <div className="text-foreground"><h2 className="text-xl font-bold">Dashboard</h2><p className="text-muted-foreground mt-2">Coming next...</p></div>
}
```

`frontend/src/components/signals/signals-view.tsx`:
```tsx
export default function SignalsView() {
  return <div className="text-foreground"><h2 className="text-xl font-bold">Signals</h2><p className="text-muted-foreground mt-2">Coming soon...</p></div>
}
```

`frontend/src/components/research/research-view.tsx`:
```tsx
export default function ResearchView() {
  return <div className="text-foreground"><h2 className="text-xl font-bold">Research</h2><p className="text-muted-foreground mt-2">Coming soon...</p></div>
}
```

`frontend/src/components/reports/reports-view.tsx`:
```tsx
export default function ReportsView() {
  return <div className="text-foreground"><h2 className="text-xl font-bold">Reports</h2><p className="text-muted-foreground mt-2">Coming soon...</p></div>
}
```

`frontend/src/components/settings/settings-view.tsx`:
```tsx
export default function SettingsView() {
  return <div className="text-foreground"><h2 className="text-xl font-bold">Settings</h2><p className="text-muted-foreground mt-2">Coming soon...</p></div>
}
```

`frontend/src/components/agent-activity/activity-panel.tsx`:
```tsx
import type { AgentEvent } from '@/types'

interface ActivityPanelProps {
  events: AgentEvent[]
  wsConnected: boolean
}

export default function ActivityPanel({ events, wsConnected }: ActivityPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-[13px] font-bold uppercase tracking-wider flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-success animate-pulse' : 'bg-error'}`} />
          Agent Activity
        </h3>
        <span className="text-[11px] text-muted-foreground">Live</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm text-muted-foreground">
        {events.length === 0 ? 'No events yet...' : `${events.length} events`}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify the shell renders**

```bash
cd frontend && npx vite --port 5174
```

Open http://localhost:5174 — should show header with nav tabs, split layout with placeholder content on left and "Agent Activity" panel on right. Tab switching should work. Resize handle should work.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/app.tsx src/components/layout/ src/components/dashboard/ src/components/signals/ src/components/research/ src/components/reports/ src/components/settings/ src/components/agent-activity/ src/types.ts src/hooks/
git commit -m "feat(ui): layout shell with header tabs, split panel, placeholder views"
```

---

## Task 4: Agent Activity Panel (Core Feature)

**Files:**
- Rewrite: `frontend/src/components/agent-activity/activity-panel.tsx`
- Create: `frontend/src/components/agent-activity/timeline-feed.tsx`
- Create: `frontend/src/components/agent-activity/flow-event.tsx`
- Create: `frontend/src/components/agent-activity/decision-chain.tsx`
- Create: `frontend/src/components/agent-activity/expert-grid.tsx`
- Create: `frontend/src/components/agent-activity/agent-status-tab.tsx`
- Create: `frontend/src/components/agent-activity/decision-log-tab.tsx`

- [ ] **Step 1: Create decision-chain.tsx**

Create `frontend/src/components/agent-activity/decision-chain.tsx`:

```tsx
import { cn } from '@/lib/utils'

export interface ChainStep {
  label: string
  status: 'pass' | 'fail' | 'active' | 'pending'
}

export default function DecisionChain({ steps }: { steps: ChainStep[] }) {
  return (
    <div className="flex items-center gap-1 mt-1.5 text-[11px] flex-wrap">
      {steps.map((step, i) => (
        <span key={i} className="contents">
          {i > 0 && <span className="text-muted-foreground text-[10px]">&rarr;</span>}
          <span className={cn(
            'px-2 py-0.5 rounded font-medium border',
            step.status === 'pass' && 'bg-success-light text-success border-success/20',
            step.status === 'fail' && 'bg-error-light text-error border-error/20',
            step.status === 'active' && 'bg-primary-light text-primary border-primary/20',
            step.status === 'pending' && 'bg-muted text-muted-foreground border-border-light',
          )}>
            {step.label}
          </span>
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create expert-grid.tsx**

Create `frontend/src/components/agent-activity/expert-grid.tsx`:

```tsx
import { cn } from '@/lib/utils'

interface ExpertVote {
  name: string
  stance: 'bullish' | 'bearish' | 'neutral'
}

export default function ExpertGrid({ votes }: { votes: ExpertVote[] }) {
  return (
    <div className="grid grid-cols-3 gap-1 mt-1.5">
      {votes.map((v) => (
        <div
          key={v.name}
          className={cn(
            'px-1.5 py-1 rounded text-[10px] text-center font-semibold',
            v.stance === 'bullish' && 'bg-success-light text-success',
            v.stance === 'bearish' && 'bg-error-light text-error',
            v.stance === 'neutral' && 'bg-muted text-muted-foreground',
          )}
        >
          {v.name}: {v.stance.charAt(0).toUpperCase() + v.stance.slice(1, 4)}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create flow-event.tsx**

Create `frontend/src/components/agent-activity/flow-event.tsx`:

```tsx
import { cn } from '@/lib/utils'
import type { AgentEvent } from '@/types'
import DecisionChain, { type ChainStep } from './decision-chain'
import ExpertGrid from './expert-grid'

const AGENT_ICONS: Record<string, { icon: string; bg: string; text: string }> = {
  market_scanner: { icon: '🔍', bg: 'bg-primary-light', text: 'text-primary' },
  risk_manager: { icon: '🛡', bg: 'bg-error-light', text: 'text-error' },
  trading_executor: { icon: '💹', bg: 'bg-blue-light', text: 'text-blue' },
  portfolio_monitor: { icon: '📊', bg: 'bg-success-light', text: 'text-success' },
  report_generator: { icon: '📝', bg: 'bg-purple-light', text: 'text-purple' },
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

function getDecisionChain(event: AgentEvent): ChainStep[] | null {
  const d = event.data || {}
  if (event.event_type === 'signal.approved') {
    return [
      { label: 'R/R', status: 'pass' },
      { label: 'Size', status: 'pass' },
      { label: 'Sector', status: 'pass' },
      { label: 'OK', status: 'pass' },
    ]
  }
  if (event.event_type === 'signal.rejected') {
    const reason = String(d.reason || '')
    const rrFail = reason.toLowerCase().includes('score') || reason.toLowerCase().includes('rr')
    return [
      { label: 'R/R', status: rrFail ? 'fail' : 'pass' },
      { label: 'Size', status: rrFail ? 'pending' : 'pass' },
      { label: 'Sector', status: 'pending' },
      { label: 'Rejected', status: 'fail' },
    ]
  }
  return null
}

function getExpertVotes(event: AgentEvent) {
  const stances = event.data?.expert_stances as Record<string, string> | undefined
  if (!stances) return null
  return Object.entries(stances).map(([name, stance]) => ({
    name: name.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    stance: (stance.toLowerCase().includes('bull') ? 'bullish' :
             stance.toLowerCase().includes('bear') ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
  }))
}

export default function FlowEvent({ event, isRunning = false }: { event: AgentEvent; isRunning?: boolean }) {
  const agentStyle = AGENT_ICONS[event.agent_id] || { icon: '⚡', bg: 'bg-muted', text: 'text-muted-foreground' }
  const chain = getDecisionChain(event)
  const votes = getExpertVotes(event)
  const d = event.data || {}

  return (
    <div className="flex gap-3 py-2.5 relative">
      {/* Timeline line */}
      <div className="absolute left-[15px] top-[40px] bottom-[-4px] w-0.5 bg-border-light" />

      {/* Icon */}
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 relative z-10',
        agentStyle.bg, agentStyle.text,
        isRunning && 'animate-pulse',
      )}>
        {event.event_type === 'signal.approved' ? '✔' :
         event.event_type === 'signal.rejected' ? '✘' :
         agentStyle.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">
            {(d.agent_name as string) || event.agent_id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            {isRunning && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue ml-1.5 animate-pulse" />}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(event.timestamp)}</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{event.event_type}</div>

        {/* Detail box */}
        <div className="mt-1.5 px-2.5 py-2 bg-muted rounded-md text-xs text-muted-foreground leading-relaxed">
          {event.event_type === 'signal.generated' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}{(d.direction as string)?.toUpperCase()}
              {d.rr_score != null && <> &middot; R/R: <span className="font-semibold text-foreground">{Number(d.rr_score).toFixed(2)}</span></>}
            </div>
          )}
          {event.event_type === 'signal.approved' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}{(d.direction as string)?.toUpperCase()} approved
              {d.rr_score != null && <><br />R/R: <span className="font-semibold text-foreground">{Number(d.rr_score).toFixed(2)}</span></>}
            </div>
          )}
          {event.event_type === 'signal.rejected' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}{(d.direction as string)?.toUpperCase()} rejected
              <br /><span className="text-error">{d.reason as string}</span>
            </div>
          )}
          {event.event_type === 'order.filled' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}{(d.side as string)?.toUpperCase()} {d.quantity as number}
              {d.fill_price != null && <> @ ₩{Number(d.fill_price).toLocaleString()}</>}
            </div>
          )}
          {event.event_type === 'order.failed' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}order failed: <span className="text-error">{d.reason as string}</span>
            </div>
          )}
          {event.event_type === 'portfolio.updated' && (
            <div>
              {d.positions && <>{(d.positions as unknown[]).length} positions</>}
              {d.total_pnl != null && <> &middot; P/L: <span className={cn('font-semibold', Number(d.total_pnl) >= 0 ? 'text-success' : 'text-error')}>
                {Number(d.total_pnl) >= 0 ? '+' : ''}{Number(d.total_pnl).toLocaleString()}
              </span></>}
            </div>
          )}
          {event.event_type === 'risk.stop_loss' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}stop-loss triggered &middot; P/L: <span className="text-error">{d.current_pnl_pct as number}%</span>
            </div>
          )}
          {event.event_type === 'risk.take_profit' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}take-profit triggered &middot; P/L: <span className="text-success">{d.current_pnl_pct as number}%</span>
            </div>
          )}
          {event.event_type === 'report.generated' && (
            <div>Report generated: {d.report_type as string}</div>
          )}
          {/* Fallback for unknown events */}
          {!['signal.generated','signal.approved','signal.rejected','order.filled','order.failed',
             'portfolio.updated','risk.stop_loss','risk.take_profit','report.generated',
             'agent.started','agent.completed','agent.failed'].includes(event.event_type) && (
            <div>{JSON.stringify(d).slice(0, 200)}</div>
          )}
          {(event.event_type === 'agent.started') && (
            <div>{(d.agent_name as string)} ({d.role as string}) started — trigger: {d.trigger as string}</div>
          )}
          {(event.event_type === 'agent.completed') && (
            <div>{(d.agent_name as string)} completed in {d.duration_ms as number}ms{d.summary ? ` — ${(d.summary as string).slice(0, 100)}` : ''}</div>
          )}
          {(event.event_type === 'agent.failed') && (
            <div className="text-error">{(d.agent_name as string)} failed: {(d.error as string)?.slice(0, 150)}</div>
          )}
        </div>

        {chain && <DecisionChain steps={chain} />}
        {votes && <ExpertGrid votes={votes} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create timeline-feed.tsx**

Create `frontend/src/components/agent-activity/timeline-feed.tsx`:

```tsx
import type { AgentEvent } from '@/types'
import FlowEvent from './flow-event'

export default function TimelineFeed({ events }: { events: AgentEvent[] }) {
  const sorted = [...events].reverse()

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        No agent events yet. Events will appear here when agents run.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {sorted.map((event, i) => {
        const isRunning = i === 0 && (
          event.event_type === 'agent.started' ||
          event.event_type.startsWith('scanner.')
        )
        return <FlowEvent key={`${event.timestamp}-${i}`} event={event} isRunning={isRunning} />
      })}
    </div>
  )
}
```

- [ ] **Step 5: Create agent-status-tab.tsx**

Create `frontend/src/components/agent-activity/agent-status-tab.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Agent } from '@/types'
import { getAgents, runAgent, enableAgent, disableAgent } from '@/services/api'

export default function AgentStatusTab() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [runningId, setRunningId] = useState<string | null>(null)

  const fetchAgents = () => getAgents().then(d => setAgents(d.agents)).catch(() => {})

  useEffect(() => { fetchAgents(); const i = setInterval(fetchAgents, 15000); return () => clearInterval(i) }, [])

  const handleRun = async (id: string) => {
    setRunningId(id)
    try { await runAgent(id); await fetchAgents() } finally { setRunningId(null) }
  }

  const handleToggle = async (id: string, enable: boolean) => {
    if (enable) await enableAgent(id); else await disableAgent(id)
    await fetchAgents()
  }

  return (
    <div className="flex flex-col">
      {agents.map(a => (
        <div key={a.id} className="flex items-center gap-2 py-2 border-b border-border-light last:border-0">
          <span className={cn(
            'w-2 h-2 rounded-full shrink-0',
            a.status === 'idle' && 'bg-muted-foreground',
            a.status === 'running' && 'bg-blue animate-pulse',
            a.status === 'error' && 'bg-error',
            a.status === 'disabled' && 'bg-muted-foreground opacity-40',
          )} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{a.name}</div>
            <div className="text-[11px] text-muted-foreground">{a.role}</div>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono shrink-0">
            {a.last_run ? new Date(a.last_run).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
          </span>
          <button
            onClick={() => handleToggle(a.id, a.status === 'disabled')}
            className={cn(
              'text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors',
              a.status === 'disabled'
                ? 'text-muted-foreground border-border'
                : 'text-success border-success/40'
            )}
          >
            {a.status === 'disabled' ? 'OFF' : 'ON'}
          </button>
          <button
            onClick={() => handleRun(a.id)}
            disabled={runningId === a.id || a.status === 'disabled'}
            className="text-[11px] font-medium px-2 py-0.5 bg-muted border border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {runningId === a.id ? '...' : 'Run'}
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Create decision-log-tab.tsx**

Create `frontend/src/components/agent-activity/decision-log-tab.tsx`:

```tsx
import type { AgentEvent } from '@/types'
import FlowEvent from './flow-event'

const DECISION_EVENTS = ['signal.approved', 'signal.rejected', 'risk.stop_loss', 'risk.take_profit', 'signal.pending_approval']

export default function DecisionLogTab({ events }: { events: AgentEvent[] }) {
  const decisions = [...events].filter(e => DECISION_EVENTS.includes(e.event_type)).reverse()

  if (decisions.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">No decisions yet.</div>
  }

  return (
    <div className="flex flex-col">
      {decisions.map((e, i) => <FlowEvent key={`${e.timestamp}-${i}`} event={e} />)}
    </div>
  )
}
```

- [ ] **Step 7: Rewrite activity-panel.tsx with tabs**

Replace `frontend/src/components/agent-activity/activity-panel.tsx`:

```tsx
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { AgentEvent } from '@/types'
import TimelineFeed from './timeline-feed'
import AgentStatusTab from './agent-status-tab'
import DecisionLogTab from './decision-log-tab'

type PanelTab = 'timeline' | 'agents' | 'decisions'

interface ActivityPanelProps {
  events: AgentEvent[]
  wsConnected: boolean
}

export default function ActivityPanel({ events, wsConnected }: ActivityPanelProps) {
  const [tab, setTab] = useState<PanelTab>('timeline')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-[13px] font-bold uppercase tracking-wider flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', wsConnected ? 'bg-success animate-pulse' : 'bg-error')} />
          Agent Activity
        </h3>
        <span className="text-[11px] text-muted-foreground">Live</span>
      </div>
      <div className="flex px-4 border-b border-border shrink-0">
        {(['timeline', 'agents', 'decisions'] as PanelTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize',
              tab === t ? 'text-primary border-primary font-semibold' : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'timeline' && <TimelineFeed events={events} />}
        {tab === 'agents' && <AgentStatusTab />}
        {tab === 'decisions' && <DecisionLogTab events={events} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Verify the Agent Activity panel renders with mock data**

Start dev server and check that the right panel shows the timeline with live WS events. If the backend is running, events should stream in real-time.

```bash
cd frontend && npx vite --port 5174
```

- [ ] **Step 9: Commit**

```bash
cd frontend && git add src/components/agent-activity/
git commit -m "feat(ui): agent activity panel with timeline, agent status, decision log"
```

---

## Task 5: Dashboard Page

**Files:**
- Rewrite: `frontend/src/components/dashboard/dashboard-view.tsx`
- Create: `frontend/src/components/dashboard/hero-card.tsx`
- Create: `frontend/src/components/dashboard/positions-table.tsx`
- Create: `frontend/src/components/dashboard/performance-chart.tsx`
- Create: `frontend/src/components/dashboard/recent-orders.tsx`

- [ ] **Step 1: Install recharts**

```bash
cd frontend && npm install recharts
```

- [ ] **Step 2: Create hero-card.tsx**

Create `frontend/src/components/dashboard/hero-card.tsx`:

```tsx
import type { PortfolioData } from '@/types'
import { cn } from '@/lib/utils'

export default function HeroCard({ data }: { data: PortfolioData | null }) {
  if (!data) return <div className="h-[140px] rounded-xl bg-muted animate-pulse" />

  const dayPnl = data.total_pnl
  const dayPnlPct = data.total_pnl_pct

  return (
    <div className="bg-gradient-to-br from-primary via-indigo-500 to-purple rounded-xl p-6 text-white shadow-lg shadow-primary/20 mb-5">
      <div className="text-xs font-medium opacity-80 uppercase tracking-widest mb-1">Total Portfolio Value</div>
      <div className="text-[32px] font-extrabold font-mono tracking-tight mb-4">
        ₩{data.total_value.toLocaleString()}
      </div>
      <div className="flex gap-8">
        <div>
          <div className="text-[11px] opacity-70 uppercase tracking-wide">Total P/L</div>
          <div className={cn('text-base font-bold font-mono', dayPnl >= 0 ? 'text-green-300' : 'text-red-300')}>
            {dayPnl >= 0 ? '+' : ''}₩{dayPnl.toLocaleString()} ({dayPnlPct >= 0 ? '+' : ''}{dayPnlPct.toFixed(2)}%)
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-70 uppercase tracking-wide">Cash</div>
          <div className="text-base font-bold font-mono">₩{data.cash_balance.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[11px] opacity-70 uppercase tracking-wide">Positions</div>
          <div className="text-base font-bold font-mono">{data.positions.length}</div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create positions-table.tsx**

Create `frontend/src/components/dashboard/positions-table.tsx`:

```tsx
import type { Position } from '@/types'
import { cn } from '@/lib/utils'

export default function PositionsTable({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return <div className="bg-surface border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">No positions</div>
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden mb-4">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Positions</h3>
        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{positions.length} holdings</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Stock</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Qty</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Avg Price</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Current</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">P/L</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Stop-Loss</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(p => (
              <tr key={p.stock_code} className="hover:bg-muted/50 transition-colors">
                <td className="px-3 py-2.5 border-b border-border-light">
                  <div className="font-semibold">{p.stock_name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{p.stock_code}</div>
                </td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">{p.quantity}</td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">{p.avg_buy_price.toLocaleString()}</td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">{p.current_price.toLocaleString()}</td>
                <td className={cn('text-right px-3 py-2.5 border-b border-border-light font-mono text-xs font-semibold',
                  p.unrealized_pnl >= 0 ? 'text-success' : 'text-error'
                )}>
                  {p.unrealized_pnl >= 0 ? '+' : ''}{p.unrealized_pnl.toLocaleString()} ({p.unrealized_pnl_pct >= 0 ? '+' : ''}{p.unrealized_pnl_pct.toFixed(2)}%)
                </td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">
                  {p.stop_loss_pct != null ? `${p.stop_loss_pct}%` : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create performance-chart.tsx**

Create `frontend/src/components/dashboard/performance-chart.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

type Period = '1W' | '1M' | '3M'

interface PerfData {
  date: string
  value: number
  returns_pct: number
}

export default function PerformanceChart() {
  const [period, setPeriod] = useState<Period>('1W')
  const [data, setData] = useState<PerfData[]>([])

  useEffect(() => {
    fetch(`/api/dashboard/performance?period=${period.toLowerCase()}`)
      .then(r => r.ok ? r.json() : { snapshots: [] })
      .then(d => setData(d.snapshots || []))
      .catch(() => setData([]))
  }, [period])

  const lastReturns = data.length > 0 ? data[data.length - 1].returns_pct : 0
  const isPositive = lastReturns >= 0

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Performance</h3>
        <div className="flex gap-0.5">
          {(['1W', '1M', '3M'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                period === p ? 'bg-primary-light text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="px-[18px] py-3">
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.15} />
                <stop offset="100%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isPositive ? '#22c55e' : '#ef4444'}
              strokeWidth={2}
              fill="url(#perfGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-5 mt-2 text-xs">
          <span>Returns: <strong className={isPositive ? 'text-success' : 'text-error'}>{isPositive ? '+' : ''}{lastReturns.toFixed(2)}%</strong></span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create recent-orders.tsx**

Create `frontend/src/components/dashboard/recent-orders.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Order } from '@/types'
import { getOrders } from '@/services/api'

export default function RecentOrders({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    getOrders(10).then(d => setOrders(d.orders)).catch(() => {})
  }, [refreshTrigger])

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Recent Orders</h3>
        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No orders yet</div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Stock</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Side</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Qty</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 5).map(o => (
              <tr key={o.id} className="hover:bg-muted/50">
                <td className="px-3 py-2.5 border-b border-border-light font-semibold">{o.stock_name}</td>
                <td className="px-3 py-2.5 border-b border-border-light">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-bold text-white',
                    o.side === 'buy' ? 'bg-error' : 'bg-blue'
                  )}>
                    {o.side.toUpperCase()}
                  </span>
                </td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">{o.quantity}</td>
                <td className={cn('px-3 py-2.5 border-b border-border-light text-xs font-semibold',
                  o.status === 'filled' ? 'text-success' : o.status === 'rejected' ? 'text-error' : 'text-muted-foreground'
                )}>
                  {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Rewrite dashboard-view.tsx**

Replace `frontend/src/components/dashboard/dashboard-view.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react'
import type { PortfolioData } from '@/types'
import { getPortfolio } from '@/services/api'
import HeroCard from './hero-card'
import PositionsTable from './positions-table'
import PerformanceChart from './performance-chart'
import RecentOrders from './recent-orders'

export default function DashboardView() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)

  const fetchData = useCallback(async () => {
    try { setPortfolio(await getPortfolio()) } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i) }, [fetchData])

  return (
    <div>
      <HeroCard data={portfolio} />
      <PositionsTable positions={portfolio?.positions ?? []} />
      <div className="grid grid-cols-2 gap-4">
        <PerformanceChart />
        <RecentOrders />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify dashboard renders**

```bash
cd frontend && npx vite --port 5174
```

Check Dashboard tab shows hero card, positions table, performance chart, orders.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/components/dashboard/
git commit -m "feat(ui): dashboard page with hero card, positions, performance chart, orders"
```

---

## Task 6: Signals Page

**Files:**
- Rewrite: `frontend/src/components/signals/signals-view.tsx`
- Create: `frontend/src/components/signals/signal-card.tsx`
- Create: `frontend/src/components/signals/scenario-row.tsx`
- Create: `frontend/src/components/signals/expert-panel.tsx`

- [ ] **Step 1: Create scenario-row.tsx**

Create `frontend/src/components/signals/scenario-row.tsx`:

```tsx
import { cn } from '@/lib/utils'
import type { Scenario } from '@/types'

interface ScenarioRowProps {
  bull?: Scenario
  base?: Scenario
  bear?: Scenario
}

function ScenarioCard({ scenario, variant }: { scenario: Scenario; variant: 'bull' | 'base' | 'bear' }) {
  return (
    <div className={cn(
      'flex-1 p-2.5 rounded-lg text-center border',
      variant === 'bull' && 'bg-success/5 border-success/12',
      variant === 'base' && 'bg-muted-foreground/5 border-muted-foreground/12',
      variant === 'bear' && 'bg-error/5 border-error/12',
    )}>
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{scenario.label || variant}</div>
      <div className={cn(
        'text-lg font-extrabold font-mono mt-1',
        variant === 'bull' && 'text-success',
        variant === 'base' && 'text-foreground',
        variant === 'bear' && 'text-error',
      )}>
        {scenario.upside_pct >= 0 ? '+' : ''}{scenario.upside_pct.toFixed(1)}%
      </div>
      <div className="text-[11px] text-muted-foreground">{(scenario.probability * 100).toFixed(0)}% probability</div>
      <div className="text-[11px] text-muted-foreground opacity-70 mt-0.5">₩{scenario.price_target.toLocaleString()}</div>
    </div>
  )
}

export default function ScenarioRow({ bull, base, bear }: ScenarioRowProps) {
  if (!bull && !base && !bear) return null
  return (
    <div className="flex gap-2 mb-3">
      {bull && <ScenarioCard scenario={bull} variant="bull" />}
      {base && <ScenarioCard scenario={base} variant="base" />}
      {bear && <ScenarioCard scenario={bear} variant="bear" />}
    </div>
  )
}
```

- [ ] **Step 2: Create expert-panel.tsx**

Create `frontend/src/components/signals/expert-panel.tsx`:

```tsx
import { cn } from '@/lib/utils'

export default function ExpertPanel({ stances }: { stances: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {Object.entries(stances).map(([name, stance]) => {
        const s = stance.toLowerCase()
        const isBullish = s.includes('bull') || s.includes('강세')
        const isBearish = s.includes('bear') || s.includes('약세')
        return (
          <span
            key={name}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-semibold border',
              isBullish && 'bg-success-light text-success border-success/15',
              isBearish && 'bg-error-light text-error border-error/15',
              !isBullish && !isBearish && 'bg-muted text-muted-foreground border-border',
            )}
          >
            {name.replace(/[_-]/g, ' ')}: {stance}
          </span>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create signal-card.tsx**

Create `frontend/src/components/signals/signal-card.tsx`:

```tsx
import { cn } from '@/lib/utils'
import type { Signal } from '@/types'
import ScenarioRow from './scenario-row'
import ExpertPanel from './expert-panel'

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-success-light text-success',
  rejected: 'bg-error-light text-error',
  pending: 'bg-warning-light text-amber-700',
  executed: 'bg-blue-light text-blue',
  failed: 'bg-error-light text-error',
}

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-yellow-100 text-yellow-800',
  C: 'bg-orange-100 text-orange-900',
  D: 'bg-red-100 text-red-800',
}

export default function SignalCard({ signal }: { signal: Signal }) {
  const grade = signal.confidence_grades?.overall || (signal.confidence >= 0.8 ? 'A' : signal.confidence >= 0.6 ? 'B' : 'C')

  return (
    <div className="bg-surface border border-border rounded-xl p-[18px] mb-3 cursor-pointer hover:border-primary hover:shadow-md hover:shadow-primary/5 transition-all">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2.5">
          <span className={cn(
            'px-3 py-1 rounded text-xs font-bold text-white tracking-wide',
            signal.direction === 'buy' ? 'bg-error' : signal.direction === 'sell' ? 'bg-blue' : 'bg-muted-foreground'
          )}>
            {signal.direction.toUpperCase()}
          </span>
          <div>
            <div className="text-[15px] font-bold">{signal.stock_name}</div>
            <div className="text-xs text-muted-foreground font-mono">{signal.stock_code}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('px-2 py-0.5 rounded text-[11px] font-semibold', STATUS_STYLES[signal.status] || '')}>
            {signal.status.charAt(0).toUpperCase() + signal.status.slice(1)}
          </span>
          {signal.rr_score != null && (
            <span className="font-mono font-bold text-[15px]">{signal.rr_score.toFixed(2)}</span>
          )}
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', GRADE_STYLES[grade] || 'bg-muted text-muted-foreground')}>
            {grade}
          </span>
        </div>
      </div>

      {/* Scenarios */}
      {signal.scenarios && (
        <ScenarioRow
          bull={signal.scenarios.bull}
          base={signal.scenarios.base}
          bear={signal.scenarios.bear}
        />
      )}

      {/* Expert Stances */}
      {signal.expert_stances && <ExpertPanel stances={signal.expert_stances} />}

      {/* Rejection reason */}
      {signal.status === 'rejected' && signal.risk_notes && (
        <div className="px-3 py-2 bg-error-light rounded-md text-xs text-error mb-3">
          <strong>Rejection:</strong> {signal.risk_notes}
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between items-center pt-2.5 border-t border-border-light text-xs text-muted-foreground">
        <span>
          {new Date(signal.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} KST
          {signal.investment_horizon && <> &middot; {signal.investment_horizon}</>}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite signals-view.tsx**

Replace `frontend/src/components/signals/signals-view.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Signal } from '@/types'
import { getSignals } from '@/services/api'
import SignalCard from './signal-card'

type StatusFilter = 'all' | 'approved' | 'rejected' | 'pending' | 'executed'

export default function SignalsView() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    const status = filter === 'all' ? undefined : filter
    getSignals(status, 100).then(d => setSignals(d.signals)).catch(() => {})
  }, [filter])

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-xl font-bold">Signals</h2>
        <span className="text-sm text-muted-foreground">AI-generated trading signals</span>
      </div>

      <div className="flex gap-0.5 bg-muted rounded-md p-0.5 mb-5 w-fit">
        {(['all', 'approved', 'rejected', 'pending', 'executed'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded transition-colors capitalize',
              filter === f ? 'bg-surface text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {signals.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">No signals found</div>
      ) : (
        signals.map(s => <SignalCard key={s.id} signal={s} />)
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify signals page**

Start dev server, click Signals tab, check cards render with scenarios and expert stances.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/signals/
git commit -m "feat(ui): signals page with cards, scenarios, expert stances, filters"
```

---

## Task 7: Research Page

**Files:**
- Rewrite: `frontend/src/components/research/research-view.tsx`
- Create: `frontend/src/components/research/stock-sidebar.tsx`
- Create: `frontend/src/components/research/stock-detail.tsx`
- Create: `frontend/src/components/research/fundamentals-card.tsx`
- Create: `frontend/src/components/research/price-chart.tsx`

This task follows the same pattern as Tasks 5-6. The key components:

- [ ] **Step 1: Install lightweight-charts**

```bash
cd frontend && npm install lightweight-charts
```

- [ ] **Step 2: Create stock-sidebar.tsx**

Create `frontend/src/components/research/stock-sidebar.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { WatchlistItem } from '@/types'
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '@/services/api'

interface StockSidebarProps {
  selectedCode: string | null
  onSelect: (code: string, name: string) => void
}

export default function StockSidebar({ selectedCode, onSelect }: StockSidebarProps) {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    getWatchlist().then(d => setItems(d.items)).catch(() => {})
  }, [])

  const handleAdd = async () => {
    if (!search.trim()) return
    await addToWatchlist(search.trim())
    setSearch('')
    getWatchlist().then(d => setItems(d.items)).catch(() => {})
  }

  const handleRemove = async (code: string) => {
    await removeFromWatchlist(code)
    getWatchlist().then(d => setItems(d.items)).catch(() => {})
  }

  return (
    <div className="w-[260px] shrink-0 bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="flex gap-1.5">
          <input
            className="flex-1 px-3 py-2 text-[13px] border border-border rounded-md bg-muted text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            placeholder="Search stocks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            className="px-2.5 py-2 text-xs font-bold bg-primary text-white rounded-md hover:bg-primary/90"
          >+</button>
        </div>
      </div>
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Watchlist</div>
      <div className="flex-1 overflow-y-auto px-1">
        {items.map(item => (
          <div
            key={item.stock_code}
            onClick={() => onSelect(item.stock_code, item.stock_name)}
            className={cn(
              'flex justify-between items-center px-3 py-2.5 rounded-md cursor-pointer transition-colors',
              selectedCode === item.stock_code ? 'bg-primary-light' : 'hover:bg-muted'
            )}
          >
            <div>
              <div className="text-[13px] font-semibold">{item.stock_name}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{item.stock_code}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(item.stock_code) }}
              className="text-muted-foreground hover:text-error text-xs"
            >&times;</button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create fundamentals-card.tsx**

Create `frontend/src/components/research/fundamentals-card.tsx`:

```tsx
import { cn } from '@/lib/utils'
import type { DartFundamentals } from '@/types'

export default function FundamentalsCard({ data }: { data: DartFundamentals | null }) {
  if (!data) return null

  const kpis = [
    { label: 'PER', value: data.dart_per != null ? `${data.dart_per.toFixed(1)}x` : '--' },
    { label: 'PBR', value: data.dart_pbr != null ? `${data.dart_pbr.toFixed(2)}x` : '--' },
    { label: 'EPS YoY', value: data.dart_eps_yoy_pct != null ? `${data.dart_eps_yoy_pct >= 0 ? '+' : ''}${data.dart_eps_yoy_pct.toFixed(1)}%` : '--', color: data.dart_eps_yoy_pct != null && data.dart_eps_yoy_pct >= 0 },
    { label: 'Op. Margin', value: data.dart_operating_margin != null ? `${data.dart_operating_margin.toFixed(1)}%` : '--' },
    { label: 'Debt Ratio', value: data.dart_debt_ratio != null ? `${data.dart_debt_ratio.toFixed(1)}%` : '--' },
    { label: 'Div. Yield', value: data.dart_dividend_yield != null ? `${data.dart_dividend_yield.toFixed(1)}%` : '--' },
  ]

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Fundamentals</h3>
      </div>
      <div className="p-[18px] grid grid-cols-3 gap-2">
        {kpis.map(k => (
          <div key={k.label} className="text-center p-2.5 bg-muted rounded-md">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{k.label}</div>
            <div className={cn('text-sm font-bold font-mono', k.color === true && 'text-success', k.color === false && 'text-error')}>
              {k.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create price-chart.tsx (lightweight-charts wrapper)**

Create `frontend/src/components/research/price-chart.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { createChart, type IChartApi } from 'lightweight-charts'

interface PriceChartProps {
  stockCode: string
}

export default function PriceChart({ stockCode }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 240,
      layout: {
        background: { color: 'transparent' },
        textColor: '#64748b',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(0,0,0,0.04)' },
        horzLines: { color: 'rgba(0,0,0,0.04)' },
      },
      timeScale: { borderColor: '#e5e7eb' },
      rightPriceScale: { borderColor: '#e5e7eb' },
    })
    chartRef.current = chart

    const series = chart.addAreaSeries({
      lineColor: '#4f46e5',
      topColor: 'rgba(79, 70, 229, 0.15)',
      bottomColor: 'rgba(79, 70, 229, 0)',
      lineWidth: 2,
    })

    // Placeholder data — in production, fetch from API
    const now = Math.floor(Date.now() / 1000)
    const data = Array.from({ length: 30 }, (_, i) => ({
      time: (now - (30 - i) * 86400) as unknown as string,
      value: 70000 + Math.random() * 5000,
    }))
    series.setData(data)
    chart.timeScale().fitContent()

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [stockCode])

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Price Chart</h3>
      </div>
      <div className="p-[18px]" ref={containerRef} />
    </div>
  )
}
```

- [ ] **Step 5: Create stock-detail.tsx**

Create `frontend/src/components/research/stock-detail.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Signal } from '@/types'
import { cn } from '@/lib/utils'
import PriceChart from './price-chart'
import FundamentalsCard from './fundamentals-card'

interface StockDetailProps {
  stockCode: string
  stockName: string
}

export default function StockDetail({ stockCode, stockName }: StockDetailProps) {
  const [signals, setSignals] = useState<Signal[]>([])

  useEffect(() => {
    fetch(`/api/signals/history/${stockCode}`)
      .then(r => r.ok ? r.json() : { signals: [] })
      .then(d => setSignals(d.signals || []))
      .catch(() => setSignals([]))
  }, [stockCode])

  const latestSignal = signals[0]

  return (
    <div className="flex-1 overflow-y-auto min-w-0">
      {/* Header */}
      <div className="flex items-end gap-4 mb-5 pb-4 border-b border-border">
        <div>
          <div className="text-2xl font-extrabold">{stockName}</div>
          <div className="text-sm text-muted-foreground font-mono">{stockCode} &middot; KOSPI</div>
        </div>
      </div>

      {/* Chart */}
      <div className="mb-4">
        <PriceChart stockCode={stockCode} />
      </div>

      {/* Fundamentals */}
      <div className="mb-4">
        <FundamentalsCard data={latestSignal?.dart_fundamentals || null} />
      </div>

      {/* Signal History */}
      {signals.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-[18px] py-3.5 border-b border-border-light">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">Signal History</h3>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Date</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Direction</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Score</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Status</th>
              </tr>
            </thead>
            <tbody>
              {signals.map(s => (
                <tr key={s.id}>
                  <td className="px-3 py-2 border-b border-border-light font-mono text-xs">{new Date(s.timestamp).toLocaleDateString('ko-KR')}</td>
                  <td className="px-3 py-2 border-b border-border-light">
                    <span className={cn('px-2 py-0.5 rounded text-[11px] font-bold text-white', s.direction === 'buy' ? 'bg-error' : 'bg-blue')}>
                      {s.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-right px-3 py-2 border-b border-border-light font-mono">{s.rr_score?.toFixed(2) || '--'}</td>
                  <td className={cn('px-3 py-2 border-b border-border-light text-xs font-semibold',
                    s.status === 'approved' || s.status === 'executed' ? 'text-success' : s.status === 'rejected' ? 'text-error' : 'text-muted-foreground'
                  )}>
                    {s.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Rewrite research-view.tsx**

Replace `frontend/src/components/research/research-view.tsx`:

```tsx
import { useState } from 'react'
import StockSidebar from './stock-sidebar'
import StockDetail from './stock-detail'

export default function ResearchView() {
  const [selected, setSelected] = useState<{ code: string; name: string } | null>(null)

  return (
    <div className="flex gap-5 h-[calc(100vh-92px)]">
      <StockSidebar
        selectedCode={selected?.code ?? null}
        onSelect={(code, name) => setSelected({ code, name })}
      />
      {selected ? (
        <StockDetail stockCode={selected.code} stockName={selected.name} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a stock from the watchlist to view research
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Verify research page**

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/components/research/
git commit -m "feat(ui): research page with watchlist sidebar, price chart, fundamentals, signal history"
```

---

## Task 8: Reports Page

**Files:**
- Rewrite: `frontend/src/components/reports/reports-view.tsx`
- Create: `frontend/src/components/reports/report-list.tsx`
- Create: `frontend/src/components/reports/report-reader.tsx`

- [ ] **Step 1: Create report-list.tsx**

Create `frontend/src/components/reports/report-list.tsx`:

```tsx
import { cn } from '@/lib/utils'
import type { Report } from '@/types'

interface ReportListProps {
  reports: Report[]
  selectedId: number | null
  onSelect: (id: number) => void
  filter: string
  onFilterChange: (f: string) => void
}

export default function ReportList({ reports, selectedId, onSelect, filter, onFilterChange }: ReportListProps) {
  return (
    <div className="w-[280px] shrink-0 flex flex-col">
      <div className="flex gap-0.5 bg-muted rounded-md p-0.5 mb-3">
        {['all', 'daily', 'weekly'].map(f => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded text-center capitalize transition-colors',
              filter === f ? 'bg-surface text-foreground shadow-sm font-semibold' : 'text-muted-foreground'
            )}
          >{f}</button>
        ))}
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto flex-1">
        {reports.map(r => (
          <div
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={cn(
              'px-3.5 py-3 rounded-lg cursor-pointer transition-colors',
              selectedId === r.id ? 'bg-primary-light border border-primary/15' : 'hover:bg-muted'
            )}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                r.report_type === 'daily' ? 'bg-blue-light text-blue' : 'bg-purple-light text-purple'
              )}>
                {r.report_type}
              </span>
              <span className="text-[13px] font-semibold truncate">{r.title || `${r.report_type} Report`}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {new Date(r.timestamp).toLocaleDateString('ko-KR')} &middot; {new Date(r.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create report-reader.tsx**

Create `frontend/src/components/reports/report-reader.tsx`:

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Report } from '@/types'

export default function ReportReader({ report }: { report: Report }) {
  return (
    <div className="flex-1 overflow-y-auto min-w-0">
      <div className="bg-surface border border-border rounded-xl p-7 text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children }) => <h2 className="text-lg font-bold mt-5 mb-2.5">{children}</h2>,
            h3: ({ children }) => <h3 className="text-[15px] font-bold mt-4 mb-2 text-muted-foreground">{children}</h3>,
            p: ({ children }) => <p className="mb-3 text-muted-foreground">{children}</p>,
            ul: ({ children }) => <ul className="pl-5 mb-3 list-disc">{children}</ul>,
            li: ({ children }) => <li className="mb-1 text-muted-foreground">{children}</li>,
            strong: ({ children }) => <strong className="text-foreground">{children}</strong>,
            table: ({ children }) => <table className="w-full text-xs border-collapse my-3">{children}</table>,
            th: ({ children }) => <th className="text-left px-2 py-1.5 border-b border-border text-muted-foreground font-semibold">{children}</th>,
            td: ({ children }) => <td className="px-2 py-1.5 border-b border-border-light">{children}</td>,
          }}
        >
          {report.content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite reports-view.tsx**

Replace `frontend/src/components/reports/reports-view.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Report } from '@/types'
import { getReports } from '@/services/api'
import ReportList from './report-list'
import ReportReader from './report-reader'

export default function ReportsView() {
  const [reports, setReports] = useState<Report[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const type = filter === 'all' ? undefined : filter
    getReports(type, 50).then(d => {
      setReports(d.reports)
      if (d.reports.length > 0 && !selectedId) setSelectedId(d.reports[0].id)
    }).catch(() => {})
  }, [filter])

  const selected = reports.find(r => r.id === selectedId)

  return (
    <div>
      <h2 className="text-xl font-bold mb-5">Reports</h2>
      <div className="flex gap-5 h-[calc(100vh-140px)]">
        <ReportList reports={reports} selectedId={selectedId} onSelect={setSelectedId} filter={filter} onFilterChange={setFilter} />
        {selected ? (
          <ReportReader report={selected} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a report</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify reports page**

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/reports/
git commit -m "feat(ui): reports page with list sidebar and markdown reader"
```

---

## Task 9: Settings Page

**Files:**
- Rewrite: `frontend/src/components/settings/settings-view.tsx`
- Create: `frontend/src/components/settings/trading-config.tsx`
- Create: `frontend/src/components/settings/risk-config.tsx`
- Create: `frontend/src/components/settings/factor-weights.tsx`
- Create: `frontend/src/components/settings/scheduler-table.tsx`

- [ ] **Step 1: Create trading-config.tsx**

Create `frontend/src/components/settings/trading-config.tsx`:

```tsx
import type { AppSettings, RiskConfig } from '@/types'

interface TradingConfigProps {
  settings: AppSettings
  riskConfig: RiskConfig | null
  onSettingsChange: (patch: Partial<AppSettings>) => void
  onRiskChange: (patch: Partial<RiskConfig>) => void
}

export default function TradingConfig({ settings, riskConfig, onSettingsChange, onRiskChange }: TradingConfigProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-4">
      <h3 className="text-sm font-bold mb-4 pb-2.5 border-b border-border-light">Trading Configuration</h3>

      <div className="flex items-center justify-between py-2.5 border-b border-border-light">
        <div><div className="text-[13px] font-medium">Trading Mode</div><div className="text-xs text-muted-foreground mt-0.5">Paper trading or live</div></div>
        <select
          className="px-2.5 py-1.5 text-[13px] border border-border rounded-md bg-surface text-foreground"
          value={settings.trading_mode}
          onChange={e => onSettingsChange({ trading_mode: e.target.value as 'demo' | 'real' })}
        >
          <option value="demo">Demo (Paper)</option>
          <option value="real">Real</option>
        </select>
      </div>

      <div className="flex items-center justify-between py-2.5 border-b border-border-light">
        <div><div className="text-[13px] font-medium">Signal Approval</div><div className="text-xs text-muted-foreground mt-0.5">Auto-approve or manual</div></div>
        <select
          className="px-2.5 py-1.5 text-[13px] border border-border rounded-md bg-surface text-foreground"
          value={riskConfig?.signal_approval_mode || 'auto'}
          onChange={e => onRiskChange({ signal_approval_mode: e.target.value as 'auto' | 'manual' })}
        >
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <div className="flex items-center justify-between py-2.5">
        <div><div className="text-[13px] font-medium">Min Composite Score</div></div>
        <input
          type="number"
          step="0.1"
          className="w-20 px-2.5 py-1.5 text-[13px] border border-border rounded-md bg-muted text-foreground font-mono text-right"
          value={riskConfig?.min_composite_score ?? 1.5}
          onChange={e => onRiskChange({ min_composite_score: parseFloat(e.target.value) || 1.5 })}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create risk-config.tsx**

Create `frontend/src/components/settings/risk-config.tsx`:

```tsx
import type { RiskConfig } from '@/types'

interface RiskConfigProps {
  config: RiskConfig | null
  onChange: (patch: Partial<RiskConfig>) => void
}

export default function RiskConfigSection({ config, onChange }: RiskConfigProps) {
  if (!config) return null

  const rows = [
    { label: 'Max Position Weight', key: 'max_position_weight_pct' as const, suffix: '%' },
    { label: 'Stop-Loss Threshold', key: 'stop_loss_pct' as const, suffix: '%' },
    { label: 'Take-Profit Threshold', key: 'take_profit_pct' as const, suffix: '%' },
    { label: 'Max Positions', key: 'max_positions' as const, suffix: '' },
  ]

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-4">
      <h3 className="text-sm font-bold mb-4 pb-2.5 border-b border-border-light">Risk Management</h3>
      {rows.map(r => (
        <div key={r.key} className="flex items-center justify-between py-2.5 border-b border-border-light last:border-0">
          <div className="text-[13px] font-medium">{r.label}</div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="1"
              className="w-20 px-2.5 py-1.5 text-[13px] border border-border rounded-md bg-muted text-foreground font-mono text-right"
              value={config[r.key] ?? 0}
              onChange={e => onChange({ [r.key]: parseFloat(e.target.value) || 0 })}
            />
            {r.suffix && <span className="text-xs text-muted-foreground">{r.suffix}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create factor-weights.tsx**

Create `frontend/src/components/settings/factor-weights.tsx`:

```tsx
import type { RiskConfig } from '@/types'

interface FactorWeightsProps {
  config: RiskConfig | null
  onChange: (patch: Partial<RiskConfig>) => void
}

const FACTORS = [
  { label: 'R/R Ratio', key: 'weight_rr_ratio' as const },
  { label: 'Expert Consensus', key: 'weight_expert_consensus' as const },
  { label: 'Fundamental', key: 'weight_fundamental' as const },
  { label: 'Technical', key: 'weight_technical' as const },
  { label: 'Institutional', key: 'weight_institutional' as const },
]

export default function FactorWeights({ config, onChange }: FactorWeightsProps) {
  if (!config) return null

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-4">
      <h3 className="text-sm font-bold mb-1 pb-2.5 border-b border-border-light">Factor Weights</h3>
      <p className="text-xs text-muted-foreground mb-3">How each factor contributes to the composite score</p>
      {FACTORS.map(f => {
        const val = (config[f.key] ?? 0.2)
        return (
          <div key={f.key} className="flex items-center gap-3 py-2">
            <span className="text-xs w-28 shrink-0">{f.label}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(val * 100)}
              onChange={e => onChange({ [f.key]: parseInt(e.target.value) / 100 })}
              className="flex-1 h-1 accent-primary"
            />
            <span className="text-xs font-mono font-semibold w-9 text-right">{val.toFixed(2)}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Create scheduler-table.tsx**

Create `frontend/src/components/settings/scheduler-table.tsx`:

```tsx
import { useEffect, useState } from 'react'

interface ScheduledTask {
  task_id: string
  agent_id: string
  cron: string
  enabled: boolean
  description: string
}

export default function SchedulerTable() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])

  useEffect(() => {
    fetch('/api/scheduler/tasks')
      .then(r => r.ok ? r.json() : { tasks: [] })
      .then(d => setTasks(d.tasks || []))
      .catch(() => {})
  }, [])

  const toggleTask = async (taskId: string, enabled: boolean) => {
    await fetch(`/api/scheduler/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).catch(() => {})
    setTasks(prev => prev.map(t => t.task_id === taskId ? { ...t, enabled } : t))
  }

  if (tasks.length === 0) return null

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-3.5 border-b border-border-light">
        <h3 className="text-sm font-bold">Scheduler</h3>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Task</th>
            <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Agent</th>
            <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Cron</th>
            <th className="text-center px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Enabled</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.task_id}>
              <td className="px-3 py-2.5 border-b border-border-light">{t.description || t.task_id}</td>
              <td className="px-3 py-2.5 border-b border-border-light text-muted-foreground">{t.agent_id}</td>
              <td className="px-3 py-2.5 border-b border-border-light font-mono text-xs">{t.cron}</td>
              <td className="px-3 py-2.5 border-b border-border-light text-center">
                <button
                  onClick={() => toggleTask(t.task_id, !t.enabled)}
                  className={`w-10 h-[22px] rounded-full relative transition-colors ${t.enabled ? 'bg-primary' : 'bg-border'}`}
                >
                  <span className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${t.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Rewrite settings-view.tsx**

Replace `frontend/src/components/settings/settings-view.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react'
import type { AppSettings, RiskConfig } from '@/types'
import { getSettings, updateSettings, getRiskConfig, updateRiskConfig } from '@/services/api'
import TradingConfig from './trading-config'
import RiskConfigSection from './risk-config'
import FactorWeights from './factor-weights'
import SchedulerTable from './scheduler-table'

export default function SettingsView() {
  const [settings, setSettings] = useState<AppSettings>({ trading_mode: 'demo', claude_model: '', claude_max_tokens: 4096 })
  const [riskConfig, setRiskConfig] = useState<RiskConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
    getRiskConfig().then(setRiskConfig).catch(() => {})
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await updateSettings(settings)
      if (riskConfig) await updateRiskConfig(riskConfig)
    } finally {
      setSaving(false)
    }
  }, [settings, riskConfig])

  return (
    <div className="max-w-[720px]">
      <h2 className="text-xl font-bold mb-5">Settings</h2>
      <TradingConfig
        settings={settings}
        riskConfig={riskConfig}
        onSettingsChange={patch => setSettings(prev => ({ ...prev, ...patch }))}
        onRiskChange={patch => setRiskConfig(prev => prev ? { ...prev, ...patch } : null)}
      />
      <RiskConfigSection config={riskConfig} onChange={patch => setRiskConfig(prev => prev ? { ...prev, ...patch } : null)} />
      <FactorWeights config={riskConfig} onChange={patch => setRiskConfig(prev => prev ? { ...prev, ...patch } : null)} />
      <SchedulerTable />
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-[13px] font-medium bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify settings page**

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/components/settings/
git commit -m "feat(ui): settings page with trading config, risk config, factor weights, scheduler"
```

---

## Task 10: Command Palette (Cmd+K)

**Files:**
- Create: `frontend/src/components/layout/command-palette.tsx`
- Modify: `frontend/src/app.tsx`

- [ ] **Step 1: Install cmdk**

```bash
cd frontend && npm install cmdk
```

- [ ] **Step 2: Create command-palette.tsx**

Create `frontend/src/components/layout/command-palette.tsx`:

```tsx
import { Command } from 'cmdk'
import { LayoutDashboard, Activity, Search, FileText, Settings, Play, RefreshCw, MessageCircle } from 'lucide-react'
import type { AppView } from '@/types'
import { runAgent } from '@/services/api'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onNavigate: (view: AppView) => void
}

export default function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  if (!open) return null

  const navigate = (view: AppView) => { onNavigate(view); onClose() }

  const handleRunAgent = async (agentId: string) => {
    onClose()
    try { await runAgent(agentId) } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-[120px] z-[1000]" onClick={onClose}>
      <div className="w-[560px] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <Command>
          <Command.Input
            placeholder="Search commands, navigate, run agents..."
            className="w-full px-5 py-4 border-b border-border-light bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>

            <Command.Group heading="Quick Actions" className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Command.Item onSelect={() => handleRunAgent('market_scanner')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <Play size={16} /> Run Market Scanner
              </Command.Item>
              <Command.Item onSelect={() => handleRunAgent('portfolio_monitor')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <RefreshCw size={16} /> Refresh Portfolio
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Navigate" className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Command.Item onSelect={() => navigate('dashboard')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <LayoutDashboard size={16} /> Dashboard
              </Command.Item>
              <Command.Item onSelect={() => navigate('signals')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <Activity size={16} /> Signals
              </Command.Item>
              <Command.Item onSelect={() => navigate('research')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <Search size={16} /> Research
              </Command.Item>
              <Command.Item onSelect={() => navigate('reports')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <FileText size={16} /> Reports
              </Command.Item>
              <Command.Item onSelect={() => navigate('settings')} className="flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-[13px] text-muted-foreground hover:bg-primary-light hover:text-primary">
                <Settings size={16} /> Settings
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add CommandPalette to app.tsx**

Add to the imports in `app.tsx`:
```tsx
import CommandPalette from '@/components/layout/command-palette'
```

Add before the closing `</div>` in the return:
```tsx
<CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} onNavigate={setCurrentView} />
```

- [ ] **Step 4: Verify Cmd+K works**

Press Cmd+K, search for "Dashboard", click it. Navigate should work.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/layout/command-palette.tsx src/app.tsx
git commit -m "feat(ui): command palette with navigation and agent quick actions"
```

---

## Task 11: Cleanup — Remove Old Files

**Files:**
- Delete: `frontend/src/App.css`
- Delete: `frontend/src/index.css`
- Delete: `frontend/src/components/IconRail.tsx`, `frontend/src/components/IconRail.css`
- Delete: `frontend/src/components/ChatDrawer.tsx`, `frontend/src/components/ChatDrawer.css`
- Delete: `frontend/src/components/ChatView.tsx`
- Delete: `frontend/src/components/HeaderBar.tsx`
- Delete: `frontend/src/components/AgentWorkflow.tsx`, `frontend/src/components/AgentWorkflow.css`
- Delete: `frontend/src/components/StockInfoView.tsx`, `frontend/src/components/StockInfoView.css`
- Delete: `frontend/src/components/ReportViewer.tsx`
- Delete: `frontend/src/components/MessageBubble.tsx`
- Delete: `frontend/src/components/ToolIndicator.tsx`
- Delete: `frontend/src/components/SettingsView.tsx`
- Delete: `frontend/src/components/DashboardView.tsx`
- Delete old dashboard subcomponents from `frontend/src/components/dashboard/` and `frontend/src/components/signals/` and `frontend/src/components/stockinfo/` that aren't part of the new structure

- [ ] **Step 1: Remove old CSS files**

```bash
cd frontend/src && rm -f App.css index.css
cd frontend/src/components && rm -f IconRail.css ChatDrawer.css AgentWorkflow.css StockInfoView.css
```

- [ ] **Step 2: Remove old component files**

```bash
cd frontend/src/components
rm -f IconRail.tsx ChatDrawer.tsx ChatView.tsx HeaderBar.tsx AgentWorkflow.tsx StockInfoView.tsx ReportViewer.tsx MessageBubble.tsx ToolIndicator.tsx SettingsView.tsx DashboardView.tsx
```

- [ ] **Step 3: Remove old subcomponent directories (files replaced by new ones)**

```bash
cd frontend/src/components
rm -rf stockinfo/
# Keep dashboard/ and signals/ (they now have new files)
# Remove old dashboard files that were replaced:
cd dashboard && rm -f PortfolioSummary.tsx PositionsTable.tsx AgentPanel.tsx AlertFeed.tsx OrderHistory.tsx SignalPanel.tsx Watchlist.tsx CatalystTimeline.tsx PerformanceChart.tsx RiskAlertBanner.tsx RiskDashboard.tsx ScheduleManager.tsx 2>/dev/null
cd ../signals && rm -f SignalCard.tsx SignalDetailModal.tsx SignalHistory.tsx ScenarioChart.tsx ValuationView.tsx PeerComparison.tsx FundamentalsKPI.tsx 2>/dev/null
```

- [ ] **Step 4: Verify build succeeds**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```

Fix any remaining import errors.

- [ ] **Step 5: Verify all pages work in dev**

```bash
cd frontend && npx vite --port 5174
```

Click through all 5 tabs + Cmd+K + Agent Activity panel.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add -A
git commit -m "chore(ui): remove old CSS and component files, complete migration to shadcn/ui + Tailwind"
```

---

## Task 12: Dark Mode Polish

**Files:**
- Modify: `frontend/src/globals.css`
- Modify: Various components for dark-mode-specific tweaks

- [ ] **Step 1: Toggle to dark mode and audit**

Open the app, toggle to dark mode. Check each page for:
- Text contrast (muted text visible?)
- Card borders visible?
- Hero card gradient still looks good?
- Charts readable?
- Expert grid colors distinguishable?

- [ ] **Step 2: Fix dark mode gradient for hero card**

In `hero-card.tsx`, the gradient works in both modes. But ensure the P/L colors have enough contrast:

In the hero card, `text-green-300` and `text-red-300` work in both modes since they're on a gradient background.

- [ ] **Step 3: Fix chart colors for dark mode**

In `performance-chart.tsx`, add dark mode detection and adjust tooltip styles:

```tsx
// Add to PerformanceChart component
const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
```

Update Tooltip: `contentStyle={{ fontSize: 12, borderRadius: 6, background: isDark ? '#1a1b26' : '#fff', border: '1px solid', borderColor: isDark ? '#2d3348' : '#e5e7eb' }}`

- [ ] **Step 4: Verify all pages in dark mode**

- [ ] **Step 5: Commit**

```bash
cd frontend && git add -A
git commit -m "fix(ui): dark mode polish — contrast, chart colors, gradient adjustments"
```

---

## Summary

| Task | Component | Est. Files |
|------|-----------|-----------|
| 1 | Tailwind + shadcn init | 6 |
| 2 | shadcn/ui components | ~12 auto |
| 3 | Layout shell (header, split panel) | 9 |
| 4 | Agent Activity panel | 7 |
| 5 | Dashboard page | 5 |
| 6 | Signals page | 4 |
| 7 | Research page | 5 |
| 8 | Reports page | 3 |
| 9 | Settings page | 5 |
| 10 | Command palette | 1 |
| 11 | Cleanup old files | -30+ |
| 12 | Dark mode polish | tweaks |

**Total: ~45 new files, ~30+ deleted, 12 atomic commits**
