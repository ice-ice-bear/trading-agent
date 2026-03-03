import type { PortfolioData } from '../../types';

interface Props {
  data: PortfolioData | null;
  loading: boolean;
}

export default function PortfolioSummary({ data, loading }: Props) {
  if (loading) {
    return <div className="dashboard-card portfolio-summary"><div className="loading-text">Loading...</div></div>;
  }

  const totalValue = data?.total_value ?? 0;
  const cash = data?.cash_balance ?? 0;
  const pnl = data?.total_pnl ?? 0;
  const pnlPct = data?.total_pnl_pct ?? 0;
  const posCount = data?.positions?.length ?? 0;

  return (
    <div className="dashboard-card portfolio-summary">
      <h3 className="card-title">Portfolio</h3>
      <div className="summary-grid">
        <div className="summary-item">
          <span className="summary-label">Total</span>
          <span className="summary-value">{formatKRW(totalValue)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Cash</span>
          <span className="summary-value">{formatKRW(cash)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">P/L</span>
          <span className={`summary-value ${pnl >= 0 ? 'positive' : 'negative'}`}>
            {formatKRW(pnl)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Positions</span>
          <span className="summary-value">{posCount}</span>
        </div>
      </div>
      {data?.timestamp && (
        <div className="summary-timestamp">Updated: {new Date(data.timestamp + 'Z').toLocaleString('ko-KR')}</div>
      )}
    </div>
  );
}

function formatKRW(value: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(value);
}
