import { useState, useEffect } from 'react';
import { getSignalHistory } from '../../services/api';
import SectionSkeleton from './SectionSkeleton';

interface SignalHistorySectionProps {
  stockCode: string;
}

export default function SignalHistorySection({ stockCode }: SignalHistorySectionProps) {
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    getSignalHistory(stockCode)
      .then(res => setHistory(res.history || []))
      .catch(() => setError('신호 이력을 불러올 수 없습니다'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [stockCode]);

  return (
    <SectionSkeleton title="📊 과거 매매신호" loading={loading} error={error} onRetry={fetchData}>
      {history.length > 0 ? (
        <table className="signal-history-table">
          <thead>
            <tr><th>일시</th><th>방향</th><th>R/R</th><th>상태</th></tr>
          </thead>
          <tbody>
            {history.map((s, i) => (
              <tr key={i}>
                <td>{String(s.timestamp ?? s.snapshot_date ?? '').slice(0, 10)}</td>
                <td>
                  <span className={`badge ${s.direction === 'buy' ? 'badge-long' : s.direction === 'sell' ? 'badge-short' : 'badge-neutral'}`}>
                    {String(s.direction ?? '').toUpperCase()}
                  </span>
                </td>
                <td>{s.rr_score != null ? Number(s.rr_score).toFixed(1) : '—'}</td>
                <td>{String(s.status ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-muted">매매신호 이력 없음</div>
      )}
    </SectionSkeleton>
  );
}
