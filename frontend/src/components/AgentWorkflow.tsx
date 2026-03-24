import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Agent, AgentLog, AgentEvent, ScheduledTask } from '../types';
import { getAgents, getAgentLogs, getAgentEvents, getTasks, runAgent, enableAgent, disableAgent } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { parseUTC } from '../utils/time';
import ScheduleManager from './dashboard/ScheduleManager';
import './AgentWorkflow.css';


function timeAgo(timestamp: string): string {
  const diff = Date.now() - parseUTC(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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

  const agentNameMap = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

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
              <div key={`${evt.timestamp}:${evt.event_type}:${evt.agent_id}`} className={`timeline-entry${i === 0 ? ' timeline-entry--new' : ''}`}>
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
    }

    const pulseTimer = last.agent_id ? setTimeout(() => setPulsingAgent(null), 1000) : undefined;

    // Prepend to event list (dedup)
    setAgentEvents((prev) => {
      const key = `${last.timestamp}:${last.event_type}:${last.agent_id}`;
      if (prev.some((e) => `${e.timestamp}:${e.event_type}:${e.agent_id}` === key)) return prev;
      return [last, ...prev].slice(0, 200);
    });

    // Refetch agents + logs for status updates (debounced via setTimeout)
    const timer = setTimeout(fetchData, 500);
    return () => {
      if (pulseTimer) clearTimeout(pulseTimer);
      clearTimeout(timer);
    };
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
        <div className="dag-header">
          <div className="dag-header-left">
            <span className="dag-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><circle cx="19" cy="12" r="2" />
                <line x1="7" y1="12" x2="10" y2="7" /><line x1="7" y1="12" x2="10" y2="17" /><line x1="14" y1="7" x2="17" y2="11" /><line x1="14" y1="17" x2="17" y2="13" />
              </svg>
            </span>
            <span className="dag-header-title">Agent Pipeline</span>
          </div>
          <div className="dag-header-stats">
            <span className="dag-stat">
              <span className="dag-stat-dot dag-stat-dot--active" />
              {agents.filter(a => a.status === 'idle' || a.status === 'running').length} active
            </span>
            <span className="dag-stat">
              {logs.length > 0 ? `Last run ${timeAgo(logs[0].timestamp)}` : 'No runs yet'}
            </span>
          </div>
        </div>

        <div className="dag-row-group">
          <div className="dag-row-label">Main Pipeline</div>
          <div className="dag-pipeline-row">
            <DagNode agent={getAgentById('portfolio_monitor')} agentId="portfolio_monitor" lastLog={getLastLog('portfolio_monitor')} selected={selectedAgent === 'portfolio_monitor'} pulsing={pulsingAgent === 'portfolio_monitor'} running={runningAgent === 'portfolio_monitor'} onClick={() => setSelectedAgent(selectedAgent === 'portfolio_monitor' ? null : 'portfolio_monitor')} onRun={() => handleRunAgent('portfolio_monitor')} />
            <div className="dag-connector">
              <span className="dag-connector-label">portfolio.updated</span>
              <div className="dag-connector-inner"><div className="dag-connector-line" /><div className="dag-connector-arrow" /></div>
            </div>
            <DagNode agent={getAgentById('risk_manager')} agentId="risk_manager" lastLog={getLastLog('risk_manager')} selected={selectedAgent === 'risk_manager'} pulsing={pulsingAgent === 'risk_manager'} running={runningAgent === 'risk_manager'} onClick={() => setSelectedAgent(selectedAgent === 'risk_manager' ? null : 'risk_manager')} onRun={() => handleRunAgent('risk_manager')} />
            <div className="dag-connector">
              <span className="dag-connector-label">signal.approved</span>
              <div className="dag-connector-inner"><div className="dag-connector-line" /><div className="dag-connector-arrow" /></div>
            </div>
            <DagNode agent={getAgentById('trading_executor')} agentId="trading_executor" lastLog={getLastLog('trading_executor')} selected={selectedAgent === 'trading_executor'} pulsing={pulsingAgent === 'trading_executor'} running={runningAgent === 'trading_executor'} onClick={() => setSelectedAgent(selectedAgent === 'trading_executor' ? null : 'trading_executor')} onRun={() => handleRunAgent('trading_executor')} />
          </div>
        </div>

        <div className="dag-divider">
          <span className="dag-divider-text">Independent Agents</span>
        </div>

        <div className="dag-row-group">
          <div className="dag-independent-row">
            <DagNode agent={getAgentById('market_scanner')} agentId="market_scanner" lastLog={getLastLog('market_scanner')} selected={selectedAgent === 'market_scanner'} pulsing={pulsingAgent === 'market_scanner'} running={runningAgent === 'market_scanner'} onClick={() => setSelectedAgent(selectedAgent === 'market_scanner' ? null : 'market_scanner')} onRun={() => handleRunAgent('market_scanner')} />
            <DagNode agent={getAgentById('report_generator')} agentId="report_generator" lastLog={getLastLog('report_generator')} selected={selectedAgent === 'report_generator'} pulsing={pulsingAgent === 'report_generator'} running={runningAgent === 'report_generator'} onClick={() => setSelectedAgent(selectedAgent === 'report_generator' ? null : 'report_generator')} onRun={() => handleRunAgent('report_generator')} />
          </div>
        </div>
      </div>

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

      {/* Section 3: Event Timeline */}
      <EventTimeline events={agentEvents} agents={agents} />

      {/* Section 4: Schedule Manager */}
      <ScheduleManager />
    </div>
  );
}
