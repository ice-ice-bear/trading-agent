import { useEffect, useState } from 'react';
import type { Agent, AgentLog } from '../../types';
import { getAgentLogs } from '../../services/api';
import { parseUTC } from '../../utils/time';

interface Props {
  agents: Agent[];
  runningAgent: string | null;
  onRunAgent: (agentId: string) => void;
  onToggleAgent: (agentId: string, enabled: boolean) => void;
  refreshTrigger?: number;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - parseUTC(timestamp).getTime();
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
