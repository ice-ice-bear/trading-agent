import { useState, useEffect, useReducer } from 'react';
import { getPeerComparison } from '../../services/api';
import SectionSkeleton from './SectionSkeleton';

interface PeerSectionProps {
  stockCode: string;
}

interface State {
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'fetch' }
  | { type: 'success'; data: Record<string, unknown> }
  | { type: 'error'; message: string };

function reducer(_: State, action: Action): State {
  switch (action.type) {
    case 'fetch': return { data: null, loading: true, error: null };
    case 'success': return { data: action.data, loading: false, error: null };
    case 'error': return { data: null, loading: false, error: action.message };
  }
}

export default function PeerSection({ stockCode }: PeerSectionProps) {
  const [state, dispatch] = useReducer(reducer, { data: null, loading: true, error: null });
  const [expanded, setExpanded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    dispatch({ type: 'fetch' });
    getPeerComparison(stockCode)
      .then(d => dispatch({ type: 'success', data: d }))
      .catch(() => dispatch({ type: 'error', message: '동종업종 데이터를 불러올 수 없습니다' }));
  }, [stockCode, retryKey]);

  const { data, loading, error } = state;

  const peers = (data as { peers?: Record<string, unknown>[] })?.peers ?? [];
  const target = (data as { target?: Record<string, unknown> })?.target;
  const sector = (data as { sector?: string })?.sector ?? '';

  return (
    <SectionSkeleton title={`🏢 동종업종 비교${sector ? ` — ${sector}` : ''}`} loading={loading} error={error} onRetry={() => setRetryKey(k => k + 1)}>
      <div className="peer-container">
        <div className="peer-header-row">
          <button className="research-btn-sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? '축소' : '전체 보기'}
          </button>
        </div>
        <table className="peer-table">
          <thead>
            <tr>
              <th>종목</th>
              <th>PER</th>
              <th>PBR</th>
              {expanded && <th>영업이익률</th>}
              {expanded && <th>부채비율</th>}
            </tr>
          </thead>
          <tbody>
            {target && (
              <tr className="peer-target-row">
                <td>{(target as { name?: string }).name}</td>
                <td>{(target as { per?: number }).per?.toFixed(1) ?? '—'}x</td>
                <td>{(target as { pbr?: number }).pbr?.toFixed(2) ?? '—'}x</td>
                {expanded && <td>—</td>}
                {expanded && <td>—</td>}
              </tr>
            )}
            {(expanded ? peers : peers.slice(0, 3)).map((p, i) => (
              <tr key={i}>
                <td>{(p as { name?: string }).name}</td>
                <td>{(p as { per?: number }).per?.toFixed(1) ?? '—'}x</td>
                <td>{(p as { pbr?: number }).pbr?.toFixed(2) ?? '—'}x</td>
                {expanded && <td>—</td>}
                {expanded && <td>—</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionSkeleton>
  );
}
