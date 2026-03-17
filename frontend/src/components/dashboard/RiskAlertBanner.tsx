// frontend/src/components/dashboard/RiskAlertBanner.tsx
import { useState, useEffect, useCallback } from 'react';
import type { AgentEvent } from '../../types';

interface RiskAlert {
  id: string;
  eventType: string;
  stockName: string;
  pnlPct: number;
  timestamp: string;
}

interface Props {
  events: AgentEvent[];
}

export default function RiskAlertBanner({ events }: Props) {
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);

  // Watch for new risk events
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    if (last.event_type !== 'risk.stop_loss' && last.event_type !== 'risk.take_profit') return;

    const alert: RiskAlert = {
      id: `${last.timestamp}-${last.event_type}`,
      eventType: last.event_type,
      stockName: (last.data?.stock_name as string) || (last.data?.stock_code as string) || 'Unknown',
      pnlPct: (last.data?.pnl_pct as number) || 0,
      timestamp: last.timestamp,
    };

    setAlerts((prev) => [alert, ...prev].slice(0, 3));
  }, [events]);

  // Auto-dismiss alerts older than 30s
  useEffect(() => {
    if (alerts.length === 0) return;
    const interval = setInterval(() => {
      const cutoff = Date.now() - 30000;
      setAlerts((prev) => prev.filter((a) => new Date(a.timestamp).getTime() > cutoff));
    }, 5000);
    return () => clearInterval(interval);
  }, [alerts.length]);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="risk-alert-stack">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`risk-alert-banner ${alert.eventType === 'risk.stop_loss' ? 'risk-loss' : 'risk-profit'}`}
        >
          <span className="risk-alert-icon">
            {alert.eventType === 'risk.stop_loss' ? '!' : '$'}
          </span>
          <span className="risk-alert-text">
            <strong>{alert.eventType === 'risk.stop_loss' ? 'Stop-Loss' : 'Take-Profit'}</strong>
            {' '}{alert.stockName}{' '}
            <span className={alert.pnlPct >= 0 ? 'positive' : 'negative'}>
              {alert.pnlPct >= 0 ? '+' : ''}{alert.pnlPct.toFixed(2)}%
            </span>
          </span>
          <button className="risk-alert-dismiss" onClick={() => dismiss(alert.id)}>X</button>
        </div>
      ))}
    </div>
  );
}
