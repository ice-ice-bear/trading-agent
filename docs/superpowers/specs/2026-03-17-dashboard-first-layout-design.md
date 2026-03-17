# Dashboard-First Layout Refactor

## Problem

The current UI uses a horizontal header with tab-based navigation (Chat, Dashboard, Agents, Reports). Chat occupies a full-page view, which wastes space for a trading application where the dashboard and agent monitoring are the primary focus. Each service is isolated but the layout doesn't reflect this — switching between views loses context of the previous view.

## Solution

Refactor to a **dashboard-first layout** with:
1. **Vertical icon rail** for navigation (replacing horizontal header tabs)
2. **Chat as a push/split drawer** on the right (replacing full-page chat view)
3. **Simplified header** (brand + status indicators only)
4. **Dashboard as default landing view**

## Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ [≡] KIS Trading              모의투자  MCP 연결됨  ⚙  ◑  │  Slim header
├────┬───────────────────────────────────┬─────────────────┤
│ 📊 │                                   │                 │
│ 🤖 │      Main Content Area            │   Chat Drawer   │
│ 📋 │   (Dashboard / Agents /           │   (~380px)      │
│    │    Reports / Settings)            │   push/split    │
│    │                                   │                 │
│ ── │                                   │                 │
│ 💬 │                                   │   [input box]   │
│ ⚙  │                                   │                 │
├────┴───────────────────────────────────┴─────────────────┤
```

## Component Architecture

### New Components

#### `IconRail.tsx` (~56px wide)
- Fixed left-edge vertical navigation bar
- **Top group** (view switching): Dashboard, Agents, Reports
- **Bottom group** (utilities): Chat toggle, Settings
- Active view indicated by a left-edge highlight bar + icon color change
- Tooltips on hover showing full label (e.g., "대시보드", "에이전트")
- Icons: inline SVGs (consistent with existing codebase approach)

#### `ChatDrawer.tsx` (~380px wide)
- Right-side panel wrapping the existing `ChatView` component
- **Drawer header:** session title (editable) + session dropdown trigger + close (×) button
- **Session management:** dropdown list within the drawer (replaces the old full sidebar session list)
- **Input box:** pinned to bottom of drawer
- **Animation:** CSS transition `transform: translateX()` for smooth open/close
- **State:** `isChatOpen` boolean in App.tsx, persisted to localStorage

#### `AppLayout.tsx`
- New layout orchestrator replacing the current inline layout in App.tsx
- CSS Grid base: `grid-template-columns: 56px 1fr` (icon rail + main content)
- Chat drawer is positioned absolutely/fixed on the right, not a grid column
- When chat opens: main content gets `margin-right: var(--chat-drawer-width)` with CSS transition, drawer slides in via `transform: translateX(0)`
- When chat closes: margin resets to 0, drawer slides out via `transform: translateX(100%)`

### Modified Components

#### `HeaderBar.tsx` (simplified)
- **Removed:** Navigation tabs (Chat, Dashboard, Agents, Reports), sidebar toggle, new chat button
- **Kept:** Brand "KIS Trading", trading mode badge, MCP status indicator, tools count badge, settings button, theme toggle
- Height reduced from current size to ~48px
- No hamburger menu — session management lives entirely in the ChatDrawer header

#### `App.tsx` (state changes)
- `AppView` type: remove `'chat'` — becomes `'dashboard' | 'settings' | 'agents' | 'reports'`
- Default `currentView`: `'dashboard'` (was `'chat'`)
- New state: `isChatOpen: boolean` (persisted to localStorage key `kis-chat-open`)
- Remove: `sidebarOpen` state (replaced by chat drawer and icon rail)
- All existing state for sessions, messages, theme remain unchanged
- **`handleNewChat`:** Updated to create a new session + `setIsChatOpen(true)` (no longer sets `currentView` to `'chat'`). Triggered from ChatDrawer's "new chat" button.
- **Settings `onBack`:** Updated to navigate to `'dashboard'` instead of `'chat'`

### Deleted Components

#### `Sidebar.tsx`
- Session management → moves into `ChatDrawer.tsx` as a dropdown
- Navigation links (Dashboard, Agents, Reports, Settings) → moves into `IconRail.tsx`
- The component file is deleted entirely

### Unchanged Components
- `ChatView.tsx` — used as-is inside ChatDrawer (may need minor prop adjustments)
- `DashboardView.tsx` — renders in main content area, unchanged
- `AgentWorkflow.tsx` — renders in main content area, unchanged
- `ReportViewer.tsx` — renders in main content area, unchanged
- `SettingsView.tsx` — renders in main content area, unchanged
- `MessageBubble.tsx`, `ToolIndicator.tsx` — unchanged
- All `dashboard/*` sub-components — unchanged
- All `signals/*` sub-components — unchanged

## Data Flow

```
App.tsx
├── currentView: 'dashboard' | 'agents' | 'reports' | 'settings'
├── isChatOpen: boolean
├── sessions, activeSessionId, allMessages (unchanged)
│
├── HeaderBar (brand + status indicators)
├── IconRail
│   ├── onViewChange(view) → sets currentView
│   └── onChatToggle() → toggles isChatOpen
├── Main Content (view dispatcher, same as current)
│   ├── DashboardView (default)
│   ├── AgentWorkflow
│   ├── ReportViewer
│   └── SettingsView
└── ChatDrawer (conditional on isChatOpen)
    ├── Session dropdown (sessions, activeSessionId)
    ├── ChatView (messages, setMessages, onFirstMessage)
    └── Close button → sets isChatOpen=false
```

## Responsive Behavior

### Desktop (>1024px)
- Icon rail (56px) + main content (fluid) + chat drawer (380px, push/split)
- Full layout as described above

### Tablet (768-1024px)
- Icon rail collapses to **bottom tab bar** (horizontal, ~56px tall)
- Chat drawer **overlays** instead of pushing (to preserve content width)
- Chat drawer width: 380px or 50% of viewport, whichever is smaller

### Mobile (<768px)
- **Bottom tab bar** navigation (Dashboard, Agents, Reports, Chat, Settings)
- Chat opens as **full-screen overlay** with back button
- No split view — screen too narrow

## Behavioral Details

- **Chat drawer persists across view switches:** If the chat drawer is open on Dashboard and the user clicks Agents, the drawer stays open. `isChatOpen` is independent of `currentView`.
- **Session selection in drawer:** Selecting a session from the dropdown auto-closes the dropdown (not the drawer). On mobile full-screen overlay, session selection keeps the overlay open.
- **Keyboard shortcut:** `Cmd+Shift+C` (Mac) / `Ctrl+Shift+C` (Windows) toggles the chat drawer.

## CSS Strategy

- Use CSS Grid for the main layout (`AppLayout`)
- CSS custom properties for drawer width: `--chat-drawer-width: 380px`
- **Chat drawer animation:** Use `transform: translateX()` on the drawer panel + `margin-right` or flex-basis transition on the main content for the push effect. Avoid animating `grid-template-columns` directly as browser support for this animation is inconsistent. Instead, render both columns always and toggle the drawer's `translateX(100%)` / `translateX(0)` with the main content area adjusting via `margin-right: var(--chat-drawer-width)` transition.
- Media queries at 768px and 1024px breakpoints
- Reuse existing CSS variable system (colors, spacing, radius, transitions)
- Icon rail: introduce `--rail-bg` and `--rail-text` CSS variables (mapped to existing sidebar color values initially, but semantically correct for the new component)

## Migration Notes

- No backend changes required — this is purely a frontend layout refactor
- No API changes — all data flow remains the same
- localStorage key `kis-chat-open` is new; existing keys unchanged
- `currentView` is not currently persisted to localStorage, so no migration is needed for stored view state. The default simply changes from `'chat'` to `'dashboard'` in code.
- All references to `setCurrentView('chat')` must be replaced: `handleNewChat` → opens chat drawer instead; Settings `onBack` → navigates to `'dashboard'`
