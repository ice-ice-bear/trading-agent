import { useEffect, useState, useCallback } from 'react';
import type { PortfolioData, Agent } from '../types';
import { getPortfolio, getAgents, runAgent, enableAgent, disableAgent } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import PortfolioSummary from './dashboard/PortfolioSummary';
import PositionsTable from './dashboard/PositionsTable';
import AgentPanel from './dashboard/AgentPanel';
import AlertFeed from './dashboard/AlertFeed';
import OrderHistory from './dashboard/OrderHistory';
import SignalPanel from './dashboard/SignalPanel';
import Watchlist from './dashboard/Watchlist';
import PerformanceChart from './dashboard/PerformanceChart';
import ReportList from './dashboard/ReportList';

export default function DashboardView() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const { connected: wsConnected, events } = useWebSocket();

  const fetchData = useCallback(async () => {
    try {
      const [portfolioData, agentsData] = await Promise.all([
        getPortfolio(),
        getAgents(),
      ]);
      setPortfolio(portfolioData);
      setAgents(agentsData.agents);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Refresh on relevant WebSocket events
  useEffect(() => {
    const lastEvent = events[events.length - 1];
    if (
      lastEvent?.event_type === 'portfolio.updated' ||
      lastEvent?.event_type === 'order.filled' ||
      lastEvent?.event_type === 'signal.approved'
    ) {
      fetchData();
    }
  }, [events, fetchData]);

  const handleRunAgent = async (agentId: string) => {
    setRunningAgent(agentId);
    try {
      await runAgent(agentId);
      await fetchData();
    } catch (err) {
      console.error('Failed to run agent:', err);
    } finally {
      setRunningAgent(null);
    }
  };

  const handleToggleAgent = async (agentId: string, enable: boolean) => {
    try {
      if (enable) {
        await enableAgent(agentId);
      } else {
        await disableAgent(agentId);
      }
      await fetchData();
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  return (
    <div className="dashboard-view">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <div className="dashboard-status">
          <span className={`ws-indicator ${wsConnected ? 'connected' : 'disconnected'}`}>
            WS {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <PortfolioSummary data={portfolio} loading={loading} />
          <PositionsTable positions={portfolio?.positions ?? []} />
          <PerformanceChart />
          <SignalPanel />
          <OrderHistory />
          <ReportList />
        </div>

        <div className="dashboard-sidebar">
          <AgentPanel
            agents={agents}
            runningAgent={runningAgent}
            onRunAgent={handleRunAgent}
            onToggleAgent={handleToggleAgent}
          />
          <Watchlist />
          <AlertFeed events={events} />
        </div>
      </div>
    </div>
  );
}
