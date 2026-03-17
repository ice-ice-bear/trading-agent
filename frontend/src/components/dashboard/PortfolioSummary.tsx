import type { PortfolioData } from '../../types';
import { parseUTC } from '../../utils/time';

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
  const initialCapital = data?.initial_capital ?? 0;
  const pnl = data?.total_pnl ?? 0;
  const pnlPct = data?.total_pnl_pct ?? 0;
  const posCount = data?.positions?.length ?? 0;

  return (
    <div className="dashboard-card portfolio-summary">
      <h3 className="card-title">Portfolio</h3>
      <div className="summary-grid">
        <div className="summary-item">
          <span className="summary-label">
            Total
            <i className="info-hint" data-tip="당일 매매 미반영 — KIS T+2 결제로 매수/매도 대금은 D+2 영업일에 예수금에 반영됩니다.">i</i>
          </span>
          <span className="summary-value">{formatKRW(totalValue)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Initial</span>
          <span className="summary-value summary-value--muted">{formatKRW(initialCapital)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">
            Cash
            <i className="info-hint" data-tip="예수금 총금액 기준. 당일 거래 대금은 T+2 영업일 후 반영됩니다.">i</i>
          </span>
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
        <div className="summary-timestamp">Updated: {parseUTC(data.timestamp).toLocaleString('ko-KR')}</div>
      )}
    </div>
  );
}

function formatKRW(value: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(value);
}
