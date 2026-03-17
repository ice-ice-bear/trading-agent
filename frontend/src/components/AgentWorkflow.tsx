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

// Edges: [from, to] pairs for arrows (used for documentation / future SVG rendering)
const _DAG_EDGES: [string, string][] = [
  ['portfolio_monitor', 'risk_manager'],
  ['market_scanner', 'risk_manager'],
  ['risk_manager', 'trading_executor'],
];
void _DAG_EDGES;

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

  // Suppress unused variable warnings for state used by future tasks
  void agentEvents;
  void tasks;
  void selectedAgent;

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

  // Suppress unused variable warning for handleToggleAgent (used by future tasks)
  void handleToggleAgent;

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
