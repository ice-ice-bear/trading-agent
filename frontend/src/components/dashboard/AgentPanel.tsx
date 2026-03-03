import type { Agent } from '../../types';

interface Props {
  agents: Agent[];
  runningAgent: string | null;
  onRunAgent: (agentId: string) => void;
  onToggleAgent: (agentId: string, enabled: boolean) => void;
}

export default function AgentPanel({ agents, runningAgent, onRunAgent, onToggleAgent }: Props) {
  return (
    <div className="dashboard-card agent-panel">
      <h3 className="card-title">Agents</h3>
      {agents.length === 0 && <div className="no-data">에이전트 없음</div>}
      {agents.map((agent) => (
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
              className="agent-toggle-btn"
              onClick={() => onToggleAgent(agent.id, agent.status === 'disabled')}
              title={agent.status === 'disabled' ? '활성화' : '비활성화'}
            >
              {agent.status === 'disabled' ? 'ON' : 'OFF'}
            </button>
            <button
              className="agent-run-btn"
              onClick={() => onRunAgent(agent.id)}
              disabled={runningAgent === agent.id || agent.status === 'disabled'}
            >
              {runningAgent === agent.id ? '...' : 'Run'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
