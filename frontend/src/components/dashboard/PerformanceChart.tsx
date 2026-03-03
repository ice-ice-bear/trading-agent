import { useEffect, useState } from 'react';

interface HistoryPoint {
  timestamp: string;
  total_value: number;
  cash_balance: number;
  total_pnl: number;
  total_pnl_pct: number;
}

export default function PerformanceChart() {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports/performance/history?days=30')
      .then((res) => res.json())
      .then((data) => setHistory(data.history || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="dashboard-card">
        <h3 className="card-title">Performance</h3>
        <div className="no-data">로딩 중...</div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="dashboard-card">
        <h3 className="card-title">Performance</h3>
        <div className="no-data">포트폴리오 히스토리 없음</div>
      </div>
    );
  }

  // Simple chart: find min/max for scaling
  const values = history.map((h) => h.total_value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const chartHeight = 120;
  const chartWidth = 100; // percentage

  // Build SVG polyline points
  const points = history
    .map((h, i) => {
      const x = (i / Math.max(history.length - 1, 1)) * chartWidth;
      const y = chartHeight - ((h.total_value - minVal) / range) * (chartHeight - 10) - 5;
      return `${x},${y}`;
    })
    .join(' ');

  // Current stats
  const latest = history[history.length - 1];
  const first = history[0];
  const periodChange = latest.total_value - first.total_value;
  const periodChangePct = first.total_value > 0 ? (periodChange / first.total_value) * 100 : 0;

  return (
    <div className="dashboard-card performance-chart-card">
      <h3 className="card-title">Performance</h3>
      <div className="perf-stats">
        <div className="perf-stat">
          <span className="perf-label">총자산</span>
          <span className="perf-value">{latest.total_value.toLocaleString()}원</span>
        </div>
        <div className="perf-stat">
          <span className="perf-label">기간 변동</span>
          <span className={`perf-value ${periodChange >= 0 ? 'positive' : 'negative'}`}>
            {periodChange >= 0 ? '+' : ''}{periodChange.toLocaleString()}원 ({periodChangePct.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div className="perf-chart">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="perf-svg">
          <polyline
            fill="none"
            stroke={periodChange >= 0 ? 'var(--color-positive, #22c55e)' : 'var(--color-negative, #ef4444)'}
            strokeWidth="1.5"
            points={points}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="perf-range">
        <span>{new Date(first.timestamp).toLocaleDateString('ko-KR')}</span>
        <span>{new Date(latest.timestamp).toLocaleDateString('ko-KR')}</span>
      </div>
    </div>
  );
}
