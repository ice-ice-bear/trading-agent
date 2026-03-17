# Agent Workflow Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated "Agents" page with a CSS DAG pipeline visualization, expand-in-place detail panels, and a filterable event timeline.

**Architecture:** Frontend-only page consuming existing backend APIs (`/api/agents`, `/api/agents/logs`, `/api/agents/events`, `/api/tasks`). Pure CSS DAG for the fixed 5-node topology, WebSocket for live updates. No new backend work or dependencies.

**Tech Stack:** React 19, TypeScript, CSS variables (existing patterns)

**Spec:** `docs/superpowers/specs/2026-03-17-agent-workflow-page-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create:** `frontend/src/components/AgentWorkflow.tsx` | Full-page component: DAG, detail panel, event timeline |
| **Create:** `frontend/src/components/AgentWorkflow.css` | All component-specific styles |
| **Modify:** `frontend/src/types.ts` | Add `'agents'` to `AppView` union |
| **Modify:** `frontend/src/App.tsx` | Route `'agents'` view, sidebar exclusion, pass `onOpenAgents` |
| **Modify:** `frontend/src/components/HeaderBar.tsx` | Add "Agents" tab |
| **Modify:** `frontend/src/components/Sidebar.tsx` | Add "Agents" nav entry |
| **Modify:** `frontend/src/App.css` | `.agent-workflow` container sizing only |

---

## Chunk 1: Navigation & Routing

### Task 1: Add 'agents' to AppView and wire navigation

**Files:**
- Modify: `frontend/src/types.ts:173`
- Modify: `frontend/src/App.tsx:133-186`
- Modify: `frontend/src/components/HeaderBar.tsx:5-18,82-116`
- Modify: `frontend/src/components/Sidebar.tsx:80-112`

- [ ] **Step 1: Extend AppView type**

In `frontend/src/types.ts`, change line 173:

```typescript
// FROM:
export type AppView = 'chat' | 'settings' | 'dashboard' | 'reports';
// TO:
export type AppView = 'chat' | 'settings' | 'dashboard' | 'agents' | 'reports';
```

- [ ] **Step 2: Add Agents tab to HeaderBar**

In `frontend/src/components/HeaderBar.tsx`, add `onOpenAgents` to the Props interface:

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
  onOpenAgents: () => void;      // ADD THIS
  currentView: AppView;
  tradingMode: 'demo' | 'real';
  onNewChat: () => void;
}
```

Then add the Agents tab button between the Dashboard and Reports tabs (matching the exact existing pattern). Use a network/workflow SVG icon:

```tsx
<button
  className={`header-nav-tab ${currentView === 'agents' ? 'active' : ''}`}
  onClick={onOpenAgents}
>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="6" r="2" />
    <circle cx="12" cy="18" r="2" />
    <circle cx="19" cy="12" r="2" />
    <line x1="7" y1="12" x2="10" y2="7" />
    <line x1="7" y1="12" x2="10" y2="17" />
    <line x1="14" y1="7" x2="17" y2="11" />
    <line x1="14" y1="17" x2="17" y2="13" />
  </svg>
  Agents
</button>
```

Remember to destructure `onOpenAgents` in the function signature.

- [ ] **Step 3: Add Agents nav entry to Sidebar**

In `frontend/src/components/Sidebar.tsx`, add `onOpenAgents` to props and add a nav button between 대시보드 and 리포트 in the sidebar-footer:

```tsx
<button
  className={`sidebar-nav-link ${currentView === 'agents' ? 'active' : ''}`}
  onClick={onOpenAgents}
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="6" r="2" />
    <circle cx="12" cy="18" r="2" />
    <circle cx="19" cy="12" r="2" />
    <line x1="7" y1="12" x2="10" y2="7" />
    <line x1="7" y1="12" x2="10" y2="17" />
    <line x1="14" y1="7" x2="17" y2="11" />
    <line x1="14" y1="17" x2="17" y2="13" />
  </svg>
  <span>에이전트</span>
</button>
```

- [ ] **Step 4: Create placeholder AgentWorkflow component**

Create `frontend/src/components/AgentWorkflow.tsx`:

```tsx
import './AgentWorkflow.css';

export default function AgentWorkflow() {
  return (
    <div className="agent-workflow">
      <h2>Agent Workflow</h2>
      <p>Coming soon...</p>
    </div>
  );
}
```

Create `frontend/src/components/AgentWorkflow.css`:

```css
.agent-workflow {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}
```

- [ ] **Step 5: Wire routing in App.tsx**

In `frontend/src/App.tsx`:

1. Add import: `import AgentWorkflow from './components/AgentWorkflow';`

2. Add `'agents'` to the sidebar exclusion check (line ~133):
```tsx
{currentView !== 'dashboard' && currentView !== 'reports' && currentView !== 'agents' && (
```

3. Pass `onOpenAgents` to HeaderBar and Sidebar:
```tsx
onOpenAgents={() => setCurrentView('agents')}
```

4. Add the view case in the rendering chain (between `'reports'` and the ChatView fallback):
```tsx
) : currentView === 'agents' ? (
  <AgentWorkflow />
```

- [ ] **Step 6: Lint and verify**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types.ts frontend/src/App.tsx frontend/src/components/HeaderBar.tsx frontend/src/components/Sidebar.tsx frontend/src/components/AgentWorkflow.tsx frontend/src/components/AgentWorkflow.css
git commit -m "feat: add Agents tab navigation and placeholder AgentWorkflow page"
```

---

## Chunk 2: DAG Pipeline Component

### Task 2: Implement the Agent Pipeline DAG

**Files:**
- Modify: `frontend/src/components/AgentWorkflow.tsx`
- Modify: `frontend/src/components/AgentWorkflow.css`

**Context:** The DAG is a fixed 5-node graph showing the agent event-driven subscription topology. Each node shows agent status, last run info, and a run button. Clicking a node selects it (used by Task 3 for the detail panel).

- [ ] **Step 1: Build the DAG data fetching and state**

Replace the placeholder `AgentWorkflow.tsx` with the full data-fetching scaffold:

```tsx
import { useEffect, useState, useCallback } from 'react';
import type { Agent, AgentLog, AgentEvent, ScheduledTask } from '../types';
import { getAgents, getAgentLogs, getAgentEvents, getTasks, runAgent, enableAgent, disableAgent } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { parseUTC } from '../utils/time';
import './AgentWorkflow.css';

// Fixed DAG topology — agent IDs and their positions
const DAG_LAYOUT = {
  row1: ['portfolio_monitor', 'risk_manager', 'trading_executor'],
  row2: ['market_scanner', null, 'report_generator'],
} as const;

// Edges: [from, to] pairs for arrows
const DAG_EDGES: [string, string][] = [
  ['portfolio_monitor', 'risk_manager'],
  ['market_scanner', 'risk_manager'],
  ['risk_manager', 'trading_executor'],
];

function timeAgo(timestamp: string): string {
  const diff = Date.now() - parseUTC(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AgentWorkflow() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [pulsingAgent, setPulsingAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { events: wsEvents } = useWebSocket();
  const lastWsEventCount = wsEvents.length;

  const fetchData = useCallback(async () => {
    try {
      const [agentRes, logRes, eventRes, taskRes] = await Promise.all([
        getAgents(),
        getAgentLogs(undefined, 50),
        getAgentEvents(100),
        getTasks(),
      ]);
      setAgents(agentRes.agents);
      setLogs(logRes.logs);
      setAgentEvents(eventRes.events);
      setTasks(taskRes.tasks);
      setError(false);
    } catch (e) {
      console.error('Failed to fetch agent data:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Live WS event handling — uses lastWsEventCount to avoid re-running on every array reference change
  useEffect(() => {
    const last = wsEvents[wsEvents.length - 1];
    if (!last) return;

    // Pulse the agent node
    if (last.agent_id) {
      setPulsingAgent(last.agent_id);
      setTimeout(() => setPulsingAgent(null), 1000);
    }

    // Prepend to event list (dedup)
    setAgentEvents((prev) => {
      const key = `${last.timestamp}:${last.event_type}:${last.agent_id}`;
      if (prev.some((e) => `${e.timestamp}:${e.event_type}:${e.agent_id}` === key)) return prev;
      return [last, ...prev].slice(0, 200);
    });

    // Refetch agents + logs for status updates (debounced via setTimeout)
    const timer = setTimeout(fetchData, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastWsEventCount]);

  const handleRunAgent = useCallback(async (agentId: string) => {
    setRunningAgent(agentId);
    try {
      await runAgent(agentId);
    } catch (e) {
      console.error('Failed to run agent:', e);
    } finally {
      setRunningAgent(null);
      fetchData();
    }
  }, [fetchData]);

  const handleToggleAgent = useCallback(async (agentId: string, enable: boolean) => {
    try {
      if (enable) await enableAgent(agentId);
      else await disableAgent(agentId);
      fetchData();
    } catch (e) {
      console.error('Failed to toggle agent:', e);
    }
  }, [fetchData]);

  const getAgentById = (id: string) => agents.find((a) => a.id === id);
  const getLastLog = (agentId: string) => logs.find((l) => l.agent_id === agentId);

  if (loading) {
    return <div className="agent-workflow"><div className="loading-text">Loading...</div></div>;
  }

  if (error && agents.length === 0) {
    return (
      <div className="agent-workflow">
        <div className="error-state">
          Failed to load agent data.
          <button className="retry-btn" onClick={fetchData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-workflow">
      {/* Section 1: DAG */}
      <div className="dag-container">
        <div className="dag-row">
          {DAG_LAYOUT.row1.map((id) => (
            <DagNode
              key={id}
              agent={getAgentById(id)}
              agentId={id}
              lastLog={getLastLog(id)}
              selected={selectedAgent === id}
              pulsing={pulsingAgent === id}
              running={runningAgent === id}
              onClick={() => setSelectedAgent(selectedAgent === id ? null : id)}
              onRun={() => handleRunAgent(id)}
            />
          ))}
        </div>
        {/* Arrows rendered via CSS */}
        <div className="dag-arrows">
          <div className="dag-arrow arrow-pm-rm" />
          <div className="dag-arrow arrow-rm-te" />
          <div className="dag-arrow arrow-ms-rm" />
        </div>
        <div className="dag-row">
          {DAG_LAYOUT.row2.map((id, i) =>
            id ? (
              <DagNode
                key={id}
                agent={getAgentById(id)}
                agentId={id}
                lastLog={getLastLog(id)}
                selected={selectedAgent === id}
                pulsing={pulsingAgent === id}
                running={runningAgent === id}
                onClick={() => setSelectedAgent(selectedAgent === id ? null : id)}
                onRun={() => handleRunAgent(id)}
              />
            ) : (
              <div key={`spacer-${i}`} className="dag-node-spacer" />
            )
          )}
        </div>
      </div>

      {/* Section 2: Detail Panel — Task 3 */}
      {/* Section 3: Event Timeline — Task 4 */}
    </div>
  );
}

// --- DagNode sub-component ---

interface DagNodeProps {
  agent: Agent | undefined;
  agentId: string;
  lastLog: AgentLog | undefined;
  selected: boolean;
  pulsing: boolean;
  running: boolean;
  onClick: () => void;
  onRun: () => void;
}

function DagNode({ agent, agentId, lastLog, selected, pulsing, running, onClick, onRun }: DagNodeProps) {
  if (!agent) {
    return (
      <div className="dag-node dag-node--unavailable">
        <span className="dag-node-status status-disabled" />
        <span className="dag-node-name">{agentId}</span>
        <span className="dag-node-info">unavailable</span>
      </div>
    );
  }

  const status = running ? 'running' : agent.status;

  return (
    <div
      className={`dag-node ${selected ? 'dag-node--selected' : ''} ${pulsing ? 'dag-node--pulse' : ''}`}
      onClick={onClick}
    >
      <div className="dag-node-header">
        <span className={`dag-node-status status-${status}`} />
        <span className="dag-node-name">{agent.name}</span>
      </div>
      <div className="dag-node-body">
        {lastLog ? (
          <>
            <span className={`dag-node-badge ${lastLog.success !== 0 ? 'badge-ok' : 'badge-err'}`}>
              {lastLog.success !== 0 ? 'OK' : 'ERR'}
            </span>
            <span className="dag-node-info">
              {timeAgo(lastLog.timestamp)} · {(lastLog.duration_ms / 1000).toFixed(1)}s
            </span>
          </>
        ) : (
          <span className="dag-node-info">no runs yet</span>
        )}
      </div>
      <button
        className="dag-node-run-btn"
        onClick={(e) => { e.stopPropagation(); onRun(); }}
        disabled={running || agent.status === 'disabled'}
      >
        {running ? '...' : 'Run'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add DAG CSS styles**

Replace `frontend/src/components/AgentWorkflow.css` with:

```css
/* === Agent Workflow Page === */
.agent-workflow {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* === DAG Container === */
.dag-container {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 40px;
  padding: 24px 16px;
  background: var(--bg-secondary, #1a1a2e);
  border-radius: 12px;
  border: 1px solid var(--border, #2a2a3e);
}

.dag-row {
  display: flex;
  justify-content: space-around;
  align-items: center;
  gap: 16px;
}

.dag-node-spacer {
  flex: 1;
  max-width: 200px;
}

/* === DAG Node === */
.dag-node {
  flex: 1;
  max-width: 200px;
  padding: 12px;
  background: var(--bg-primary, #0f0f1a);
  border: 2px solid var(--border, #2a2a3e);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dag-node:hover {
  border-color: var(--accent, #6366f1);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);
}

.dag-node--selected {
  border-color: var(--accent, #6366f1);
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.25);
}

.dag-node--unavailable {
  opacity: 0.4;
  cursor: default;
}

.dag-node--pulse {
  animation: dagPulse 1s ease-out;
}

@keyframes dagPulse {
  0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5); }
  100% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0); }
}

.dag-node-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dag-node-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dag-node-status.status-idle { background: #22c55e; }
.dag-node-status.status-running { background: #3b82f6; animation: statusBlink 1s infinite; }
.dag-node-status.status-error { background: #ef4444; }
.dag-node-status.status-disabled { background: #6b7280; }

@keyframes statusBlink {
  50% { opacity: 0.4; }
}

.dag-node-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e2e8f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dag-node-body {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
}

.dag-node-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.badge-ok { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.badge-err { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

.dag-node-info {
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dag-node-run-btn {
  align-self: flex-end;
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid var(--border, #2a2a3e);
  background: transparent;
  color: var(--text-secondary, #94a3b8);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.dag-node-run-btn:hover:not(:disabled) {
  background: var(--accent, #6366f1);
  color: #fff;
  border-color: var(--accent, #6366f1);
}

.dag-node-run-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* === DAG Arrows === */
.dag-arrows {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.dag-arrow {
  position: absolute;
  background: var(--text-secondary, #94a3b8);
  opacity: 0.3;
}

/* Horizontal arrows: PortMon → Risk, Risk → Executor */
.arrow-pm-rm,
.arrow-rm-te {
  height: 2px;
  top: calc(24px + 40px);  /* padding + half node height approx */
  width: 40px;
}

.arrow-pm-rm { left: calc(33.3% - 8px); }
.arrow-rm-te { left: calc(66.6% - 8px); }

.arrow-pm-rm::after,
.arrow-rm-te::after {
  content: '';
  position: absolute;
  right: -4px;
  top: -3px;
  border: 4px solid transparent;
  border-left: 6px solid var(--text-secondary, #94a3b8);
  opacity: 0.3;
}

/* Diagonal arrow: Scanner → Risk */
.arrow-ms-rm {
  height: 2px;
  width: 60px;
  top: 55%;
  left: 28%;
  transform: rotate(-35deg);
  transform-origin: left center;
}

.arrow-ms-rm::after {
  content: '';
  position: absolute;
  right: -4px;
  top: -3px;
  border: 4px solid transparent;
  border-left: 6px solid var(--text-secondary, #94a3b8);
  opacity: 0.3;
}
```

- [ ] **Step 3: Add container sizing to App.css**

In `frontend/src/App.css`, add near the other page-level container styles:

```css
.agent-workflow {
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 4: Lint and verify**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AgentWorkflow.tsx frontend/src/components/AgentWorkflow.css frontend/src/App.css
git commit -m "feat: implement Agent Pipeline DAG with status dots, run buttons, and live pulse"
```

---

## Chunk 3: Detail Panel & Event Timeline

### Task 3: Add the expand-in-place Agent Detail Panel

**Files:**
- Modify: `frontend/src/components/AgentWorkflow.tsx`
- Modify: `frontend/src/components/AgentWorkflow.css`

**Context:** When a DAG node is selected, a detail panel slides open below the DAG showing three columns: agent summary, recent logs, and events/schedule info. Clicking the same node collapses it; clicking a different node swaps content.

- [ ] **Step 1: Add the AgentDetailPanel sub-component**

In `AgentWorkflow.tsx`, add this component before the `export default`:

```tsx
// --- AgentDetailPanel sub-component ---

interface DetailPanelProps {
  agent: Agent;
  logs: AgentLog[];
  events: AgentEvent[];
  schedule: ScheduledTask | undefined;
  onToggle: (enable: boolean) => void;
  onRun: () => void;
  running: boolean;
}

function AgentDetailPanel({ agent, logs, events, schedule, onToggle, onRun, running }: DetailPanelProps) {
  const agentLogs = logs.filter((l) => l.agent_id === agent.id).slice(0, 5);
  const agentEvents = events.filter((e) => e.agent_id === agent.id);

  // Group events by type with count
  const eventCounts: Record<string, number> = {};
  for (const e of agentEvents) {
    eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
  }

  const lastLog = agentLogs[0];

  return (
    <div className="detail-panel">
      {/* Column 1: Summary */}
      <div className="detail-col">
        <div className="detail-agent-name">{agent.name}</div>
        <div className="detail-agent-role">{agent.role}</div>
        <div className={`detail-status-badge status-${agent.status}`}>{agent.status}</div>
        {lastLog && (
          <div className="detail-result-summary">{lastLog.result_summary}</div>
        )}
        <div className="detail-actions">
          <button
            className={`agent-toggle-btn ${agent.status === 'disabled' ? 'toggle-off' : 'toggle-on'}`}
            onClick={() => onToggle(agent.status === 'disabled')}
          >
            {agent.status === 'disabled' ? 'OFF' : 'ON'}
          </button>
          <button
            className="dag-node-run-btn"
            onClick={onRun}
            disabled={running || agent.status === 'disabled'}
          >
            {running ? '...' : 'Run'}
          </button>
        </div>
      </div>

      {/* Column 2: Recent Logs */}
      <div className="detail-col">
        <div className="detail-col-title">Recent Logs</div>
        {agentLogs.length === 0 ? (
          <div className="detail-empty">No logs yet</div>
        ) : (
          agentLogs.map((log) => (
            <div key={log.id} className="detail-log-entry">
              <span className={`dag-node-badge ${log.success !== 0 ? 'badge-ok' : 'badge-err'}`}>
                {log.success !== 0 ? 'OK' : 'ERR'}
              </span>
              <span className="detail-log-action">{log.action}</span>
              <span className="detail-log-duration">{(log.duration_ms / 1000).toFixed(1)}s</span>
              <span className="detail-log-time">{timeAgo(log.timestamp)}</span>
              {log.success === 0 && log.error_message && (
                <div className="detail-log-error">{log.error_message}</div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Column 3: Events & Schedule */}
      <div className="detail-col">
        <div className="detail-col-title">Events Emitted</div>
        {Object.keys(eventCounts).length === 0 ? (
          <div className="detail-empty">No events</div>
        ) : (
          Object.entries(eventCounts).map(([type, count]) => (
            <div key={type} className="detail-event-count">
              <span className="detail-event-type">{type}</span>
              <span className="detail-event-num">× {count}</span>
            </div>
          ))
        )}
        {schedule && (
          <div className="detail-schedule">
            <div className="detail-col-title" style={{ marginTop: 12 }}>Schedule</div>
            <div className="detail-schedule-cron">
              <code>{schedule.cron_expression}</code>
              <span className={schedule.enabled !== 0 ? 'badge-ok' : 'badge-err'}>
                {schedule.enabled !== 0 ? 'enabled' : 'disabled'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the detail panel into the main component**

In `AgentWorkflow`'s return JSX, replace `{/* Section 2: Detail Panel — Task 3 */}` with:

```tsx
{/* Section 2: Detail Panel */}
<div className={`detail-panel-wrapper ${selectedAgent ? 'detail-panel--open' : ''}`}>
  {selectedAgent && getAgentById(selectedAgent) && (
    <AgentDetailPanel
      agent={getAgentById(selectedAgent)!}
      logs={logs}
      events={agentEvents}
      schedule={tasks.find((t) => t.agent_id === selectedAgent)}
      onToggle={(enable) => handleToggleAgent(selectedAgent, enable)}
      onRun={() => handleRunAgent(selectedAgent)}
      running={runningAgent === selectedAgent}
    />
  )}
</div>
```

- [ ] **Step 3: Add detail panel CSS**

Append to `AgentWorkflow.css`:

```css
/* === Error / Retry State === */
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-secondary, #94a3b8);
  font-size: 14px;
}

.retry-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--accent, #6366f1);
  background: transparent;
  color: var(--accent, #6366f1);
  cursor: pointer;
  font-size: 13px;
}

.retry-btn:hover { background: var(--accent, #6366f1); color: #fff; }

/* === Detail Panel === */
.detail-panel-wrapper {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 0.2s ease, opacity 0.2s ease;
}

.detail-panel--open {
  max-height: 300px;
  opacity: 1;
}

.detail-panel {
  display: flex;
  gap: 20px;
  padding: 16px;
  background: var(--bg-secondary, #1a1a2e);
  border-radius: 10px;
  border: 1px solid var(--border, #2a2a3e);
  border-left: 3px solid var(--accent, #6366f1);
}

.detail-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.detail-agent-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #e2e8f0);
}

.detail-agent-role {
  font-size: 12px;
  color: var(--text-secondary, #94a3b8);
}

.detail-status-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  width: fit-content;
}

.detail-status-badge.status-idle { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.detail-status-badge.status-running { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
.detail-status-badge.status-error { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.detail-status-badge.status-disabled { background: rgba(107, 114, 128, 0.15); color: #6b7280; }

.detail-result-summary {
  font-size: 12px;
  color: var(--text-primary, #e2e8f0);
  margin-top: 4px;
  line-height: 1.4;
}

.detail-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.detail-actions .agent-toggle-btn {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid var(--border, #2a2a3e);
  cursor: pointer;
  font-weight: 700;
}

.detail-actions .toggle-on {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border-color: #22c55e;
}

.detail-actions .toggle-off {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
  border-color: #6b7280;
}

.detail-col-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.detail-empty {
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  font-style: italic;
}

.detail-log-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  flex-wrap: wrap;
}

.detail-log-action {
  color: var(--text-primary, #e2e8f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-log-duration,
.detail-log-time {
  color: var(--text-secondary, #94a3b8);
  flex-shrink: 0;
}

.detail-log-error {
  width: 100%;
  font-size: 10px;
  color: #ef4444;
  padding: 2px 0 2px 34px;
}

.detail-event-count {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}

.detail-event-type {
  color: var(--text-primary, #e2e8f0);
  font-family: monospace;
}

.detail-event-num {
  color: var(--text-secondary, #94a3b8);
}

.detail-schedule-cron {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.detail-schedule-cron code {
  font-size: 11px;
  color: var(--text-primary, #e2e8f0);
  background: var(--bg-primary, #0f0f1a);
  padding: 2px 6px;
  border-radius: 3px;
}

.detail-schedule-cron .badge-ok,
.detail-schedule-cron .badge-err {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
}

/* Responsive: stack detail columns on narrow screens */
@media (max-width: 768px) {
  .detail-panel { flex-direction: column; }
}
```

- [ ] **Step 4: Lint and verify**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AgentWorkflow.tsx frontend/src/components/AgentWorkflow.css
git commit -m "feat: add expand-in-place Agent Detail Panel with logs, events, schedule"
```

---

### Task 4: Add the filterable Event Timeline

**Files:**
- Modify: `frontend/src/components/AgentWorkflow.tsx`
- Modify: `frontend/src/components/AgentWorkflow.css`

**Context:** Below the detail panel, a vertical timeline shows all agent events with category filter pills. Events are color-coded by type and show extracted summary text from the event data payload. New WS events prepend with a slide-in animation.

- [ ] **Step 1: Add the EventTimeline sub-component**

In `AgentWorkflow.tsx`, add this component before the `export default`:

```tsx
// --- Event category definitions ---

type EventCategory = 'signal' | 'order' | 'portfolio' | 'risk' | 'report';

const EVENT_CATEGORIES: Record<EventCategory, { types: string[]; color: string; label: string }> = {
  signal: { types: ['signal.generated', 'signal.approved', 'signal.rejected', 'signal.failed'], color: '#22c55e', label: 'Signal' },
  order: { types: ['order.filled', 'order.failed'], color: '#3b82f6', label: 'Order' },
  portfolio: { types: ['portfolio.updated'], color: '#6b7280', label: 'Portfolio' },
  risk: { types: ['risk.stop_loss', 'risk.take_profit'], color: '#ef4444', label: 'Risk' },
  report: { types: ['report.generated'], color: '#a855f7', label: 'Report' },
};

function getCategoryForEvent(eventType: string): EventCategory | null {
  for (const [cat, def] of Object.entries(EVENT_CATEGORIES)) {
    if (def.types.includes(eventType)) return cat as EventCategory;
  }
  return null;
}

function getEventSummary(evt: AgentEvent): string {
  const d = evt.data || {};
  switch (evt.event_type) {
    case 'signal.generated':
      return `${d.stock_name || d.stock_code || '?'} ${d.direction || ''} (R/R: ${d.rr_score ?? '?'})`;
    case 'signal.approved':
      return `${d.stock_name || d.stock_code || '?'} approved`;
    case 'signal.rejected':
      return `${d.stock_name || d.stock_code || '?'} rejected — ${d.reason || '?'}`;
    case 'signal.failed': {
      const fields = Array.isArray(d.failed_fields) ? (d.failed_fields as string[]).join(', ') : '';
      return `${d.stock_name || d.stock_code || '?'} — confidence gate${fields ? ` (${fields})` : ''}`;
    }
    case 'order.filled':
      return `${d.side || '?'} ${d.quantity ?? '?'}× ${d.stock_name || d.stock_code || '?'}`;
    case 'order.failed':
      return `${d.stock_name || d.stock_code || '?'} — ${d.reason || 'failed'}`;
    case 'portfolio.updated':
      return `총자산 ${Number(d.total_value || 0).toLocaleString()} · P/L ${d.total_pnl_pct ?? 0}%`;
    case 'risk.stop_loss':
      return `STOP ${d.stock_name || '?'} (${d.pnl_pct ?? '?'}%)`;
    case 'risk.take_profit':
      return `TAKE ${d.stock_name || '?'} (${d.pnl_pct ?? '?'}%)`;
    case 'report.generated':
      return `${d.report_type || ''} report`;
    default:
      return evt.event_type;
  }
}

// --- EventTimeline sub-component ---

interface TimelineProps {
  events: AgentEvent[];
  agents: Agent[];
}

function EventTimeline({ events, agents }: TimelineProps) {
  const [activeFilters, setActiveFilters] = useState<Set<EventCategory>>(
    new Set(Object.keys(EVENT_CATEGORIES) as EventCategory[])
  );

  const toggleFilter = (cat: EventCategory) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

  const filteredEvents = events.filter((evt) => {
    const cat = getCategoryForEvent(evt.event_type);
    return cat && activeFilters.has(cat);
  });

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <h3 className="card-title">Event Timeline</h3>
        <div className="timeline-filters">
          {(Object.entries(EVENT_CATEGORIES) as [EventCategory, typeof EVENT_CATEGORIES[EventCategory]][]).map(([cat, def]) => (
            <button
              key={cat}
              className={`timeline-filter-pill ${activeFilters.has(cat) ? 'pill-active' : ''}`}
              style={{ '--pill-color': def.color } as React.CSSProperties}
              onClick={() => toggleFilter(cat)}
            >
              {def.label}
            </button>
          ))}
        </div>
      </div>
      <div className="timeline-list">
        {filteredEvents.length === 0 ? (
          <div className="detail-empty">No events match filters</div>
        ) : (
          filteredEvents.map((evt, i) => {
            const cat = getCategoryForEvent(evt.event_type);
            const color = cat ? EVENT_CATEGORIES[cat].color : '#6b7280';
            return (
              <div key={`${evt.timestamp}-${evt.event_type}-${i}`} className="timeline-entry">
                <span className="timeline-dot" style={{ background: color }} />
                <span className="timeline-type">{evt.event_type}</span>
                <span className="timeline-agent">{agentNameMap.get(evt.agent_id) || evt.agent_id}</span>
                <span className="timeline-summary">{getEventSummary(evt)}</span>
                <span className="timeline-time">{parseUTC(evt.timestamp).toLocaleTimeString('ko-KR')}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the timeline into the main component**

In `AgentWorkflow`'s return JSX, replace `{/* Section 3: Event Timeline — Task 4 */}` with:

```tsx
{/* Section 3: Event Timeline */}
<EventTimeline events={agentEvents} agents={agents} />
```

- [ ] **Step 3: Add timeline CSS**

Append to `AgentWorkflow.css`:

```css
/* === Event Timeline === */
.timeline-container {
  flex: 1;
  min-height: 200px;
  background: var(--bg-secondary, #1a1a2e);
  border-radius: 12px;
  border: 1px solid var(--border, #2a2a3e);
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.timeline-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.timeline-filter-pill {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid var(--border, #2a2a3e);
  background: transparent;
  color: var(--text-secondary, #94a3b8);
  cursor: pointer;
  transition: all 0.15s;
}

.timeline-filter-pill.pill-active {
  background: color-mix(in srgb, var(--pill-color) 20%, transparent);
  border-color: var(--pill-color);
  color: var(--pill-color);
}

.timeline-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border, #2a2a3e);
  animation: slideIn 0.2s ease;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.timeline-type {
  font-size: 11px;
  font-family: monospace;
  color: var(--text-secondary, #94a3b8);
  flex-shrink: 0;
  min-width: 120px;
}

.timeline-agent {
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  flex-shrink: 0;
  min-width: 80px;
}

.timeline-summary {
  font-size: 12px;
  color: var(--text-primary, #e2e8f0);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timeline-time {
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  flex-shrink: 0;
}

/* Responsive: timeline entry stacks */
@media (max-width: 768px) {
  .timeline-entry {
    flex-wrap: wrap;
  }
  .timeline-type { min-width: auto; }
  .timeline-agent { min-width: auto; }
  .dag-row { flex-wrap: wrap; }
  .dag-node { max-width: none; min-width: 140px; }
}
```

- [ ] **Step 4: Lint and verify**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AgentWorkflow.tsx frontend/src/components/AgentWorkflow.css
git commit -m "feat: add filterable Event Timeline with category pills and live WS updates"
```

---

## Final Verification

After all tasks are complete:

- [ ] Run `cd frontend && npm run lint` — must pass
- [ ] Run `cd frontend && npx vite build` — must succeed
- [ ] Manual testing:
  - Navigate to Agents tab from HeaderBar and Sidebar
  - Verify all 5 DAG nodes render with correct status
  - Click a node → detail panel expands with logs/events/schedule
  - Click same node → collapses
  - Click different node → swaps content
  - Run an agent → node pulses, logs update, event appears in timeline
  - Toggle filter pills → timeline entries show/hide
  - Verify timestamps display correctly (not 9hr offset)
