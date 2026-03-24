import { useState, useEffect, useCallback } from 'react';
import { getPerformance } from '../../services/api';

interface Props {
  refreshTrigger?: number;
}

const PERIODS = [
  { label: '1일', value: '1d' },
  { label: '7일', value: '7d' },
  { label: '30일', value: '30d' },
  { label: '90일', value: '90d' },
];

export default function PerformanceChart({ refreshTrigger }: Props) {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState<{
    returns_pct: number;
    max_drawdown: number;
    trade_count: number;
    chart_data: Array<{ timestamp: string; total_value: number; total_pnl: number; total_pnl_pct: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getPerformance(period);
      setData(result);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData, refreshTrigger]);

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>성과 차트</h3>
        <div style={{ display: 'flex', gap: '4px' }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={`btn btn-sm ${period === p.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="card-body text-muted">로딩 중...</div>}

      {!loading && data && data.chart_data.length > 0 && (
        <div className="card-body">
          <svg viewBox="0 0 100 50" style={{ width: '100%', height: '120px' }} preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke={data.returns_pct >= 0 ? '#22c55e' : '#ef4444'}
              strokeWidth="0.5"
              points={data.chart_data.map((pt, i) => {
                const x = (i / Math.max(data.chart_data.length - 1, 1)) * 100;
                const values = data.chart_data.map(d => d.total_value);
                const minVal = Math.min(...values);
                const maxVal = Math.max(...values);
                const range = maxVal - minVal || 1;
                const y = 50 - ((pt.total_value - minVal) / range) * 50;
                return `${x},${y}`;
              }).join(' ')}
            />
          </svg>

          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.85rem' }}>
            <span className={data.returns_pct >= 0 ? 'text-positive' : 'text-negative'}>
              수익률 {data.returns_pct >= 0 ? '+' : ''}{data.returns_pct.toFixed(2)}%
            </span>
            <span className="text-negative">최대낙폭 {data.max_drawdown.toFixed(2)}%</span>
            <span className="text-muted">거래 {data.trade_count}건</span>
          </div>
        </div>
      )}

      {!loading && (!data || data.chart_data.length === 0) && (
        <div className="card-body text-muted">데이터 없음</div>
      )}
    </div>
  );
}
