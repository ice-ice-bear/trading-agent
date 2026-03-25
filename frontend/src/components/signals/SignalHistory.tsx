import { useState, useEffect } from 'react';
import { getSignalHistory } from '../../services/api';

export default function SignalHistory({ stockCode }: { stockCode: string }) {
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    getSignalHistory(stockCode).then(res => setHistory(res.history)).catch(() => {});
  }, [stockCode]);

  if (history.length === 0) return null;

  return (
    <div className="signal-history-section">
      <h4>시그널 이력 ({stockCode})</h4>
      <table className="table">
        <thead>
          <tr>
            <th>날짜</th>
            <th>방향</th>
            <th style={{ textAlign: 'right' }}>R/R</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h, i) => (
            <tr key={i}>
              <td>{String(h.snapshot_date || '')}</td>
              <td>
                <span className={`badge badge-${h.direction === 'buy' ? 'long' : h.direction === 'sell' ? 'short' : 'neutral'}`}>
                  {String(h.direction || '').toUpperCase()}
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>{Number(h.rr_score || 0).toFixed(1)}</td>
              <td>{String(h.status || '-')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
