import { useState, useEffect } from 'react';
import { getPeerComparison } from '../../services/api';
import SectionSkeleton from './SectionSkeleton';

interface PeerSectionProps {
  stockCode: string;
}

export default function PeerSection({ stockCode }: PeerSectionProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    getPeerComparison(stockCode)
      .then(setData)
      .catch(() => setError('동종업종 데이터를 불러올 수 없습니다'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [stockCode]);

  const peers = (data as { peers?: Record<string, unknown>[] })?.peers ?? [];
  const target = (data as { target?: Record<string, unknown> })?.target;
  const sector = (data as { sector?: string })?.sector ?? '';

  return (
    <SectionSkeleton title={`🏢 동종업종 비교${sector ? ` — ${sector}` : ''}`} loading={loading} error={error} onRetry={fetchData}>
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
