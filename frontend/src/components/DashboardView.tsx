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
import RiskAlertBanner from './dashboard/RiskAlertBanner';

export default function DashboardView() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const { connected: wsConnected, events } = useWebSocket();

  // Targeted refresh counters
  const [signalTrigger, setSignalTrigger] = useState(0);
  const [orderTrigger, setOrderTrigger] = useState(0);
  const [portfolioTrigger, setPortfolioTrigger] = useState(0);
  const [agentTrigger, setAgentTrigger] = useState(0);

  const fetchCoreData = useCallback(async () => {
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

  // Initial fetch + 60s fallback poll
  useEffect(() => {
    fetchCoreData();
    const interval = setInterval(fetchCoreData, 60000);
    return () => clearInterval(interval);
  }, [fetchCoreData]);

  // Targeted WS event handling
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;

    switch (last.event_type) {
      case 'signal.generated':
      case 'signal.approved':
      case 'signal.rejected':
        setSignalTrigger((n) => n + 1);
        break;
      case 'order.filled':
      case 'order.submitted':
        setOrderTrigger((n) => n + 1);
        break;
      case 'portfolio.updated':
        setPortfolioTrigger((n) => n + 1);
        fetchCoreData();
        break;
      // risk.* events are handled by RiskAlertBanner directly
    }
    // Agent status may change on any event
    setAgentTrigger((n) => n + 1);
  }, [events, fetchCoreData]);

  const handleRunAgent = async (agentId: string) => {
    setRunningAgent(agentId);
    try {
      await runAgent(agentId);
      await fetchCoreData();
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
      await fetchCoreData();
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

      <RiskAlertBanner events={events} />

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <PortfolioSummary data={portfolio} loading={loading} />
          <PositionsTable positions={portfolio?.positions ?? []} />
          <PerformanceChart refreshTrigger={portfolioTrigger} />
          <SignalPanel refreshTrigger={signalTrigger} />
          <OrderHistory refreshTrigger={orderTrigger} />
        </div>

        <div className="dashboard-sidebar">
          <AgentPanel
            agents={agents}
            runningAgent={runningAgent}
            onRunAgent={handleRunAgent}
            onToggleAgent={handleToggleAgent}
            refreshTrigger={agentTrigger}
          />
          <Watchlist />
          <AlertFeed events={events} />
        </div>
      </div>
    </div>
  );
}
