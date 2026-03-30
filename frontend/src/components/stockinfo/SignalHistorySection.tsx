import { useState, useEffect, useReducer } from 'react';
import { getSignalHistory } from '../../services/api';
import SectionSkeleton from './SectionSkeleton';

interface SignalHistorySectionProps {
  stockCode: string;
}

interface State {
  history: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'fetch' }
  | { type: 'success'; history: Record<string, unknown>[] }
  | { type: 'error'; message: string };

function reducer(_: State, action: Action): State {
  switch (action.type) {
    case 'fetch': return { history: [], loading: true, error: null };
    case 'success': return { history: action.history, loading: false, error: null };
    case 'error': return { history: [], loading: false, error: action.message };
  }
}

export default function SignalHistorySection({ stockCode }: SignalHistorySectionProps) {
  const [state, dispatch] = useReducer(reducer, { history: [], loading: true, error: null });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    dispatch({ type: 'fetch' });
    getSignalHistory(stockCode)
      .then(res => dispatch({ type: 'success', history: res.history || [] }))
      .catch(() => dispatch({ type: 'error', message: '신호 이력을 불러올 수 없습니다' }));
  }, [stockCode, retryKey]);

  const { history, loading, error } = state;

  return (
    <SectionSkeleton title="📊 과거 매매신호" loading={loading} error={error} onRetry={() => setRetryKey(k => k + 1)}>
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
