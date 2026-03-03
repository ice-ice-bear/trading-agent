import { useEffect, useState, useCallback } from 'react';
import type { Signal } from '../../types';
import { getSignals, approveSignal, rejectSignal } from '../../services/api';

export default function SignalPanel() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [acting, setActing] = useState<number | null>(null);

  const fetchSignals = useCallback(() => {
    getSignals(undefined, 20)
      .then((data) => setSignals(data.signals))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 10000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const handleApprove = async (id: number) => {
    setActing(id);
    try {
      await approveSignal(id);
      fetchSignals();
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: number) => {
    setActing(id);
    try {
      await rejectSignal(id);
      fetchSignals();
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setActing(null);
    }
  };

  if (signals.length === 0) {
    return (
      <div className="dashboard-card">
        <h3 className="card-title">Signals</h3>
        <div className="no-data">매매 신호 없음</div>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h3 className="card-title">Signals</h3>
      <div className="signal-list">
        {signals.map((sig) => (
          <div key={sig.id} className="signal-row">
            <div className="signal-info">
              <span className={`side-badge ${sig.direction}`}>
                {sig.direction === 'buy' ? '매수' : '매도'}
              </span>
              <span className="stock-code">{sig.stock_code}</span>
              {sig.stock_name && <span className="stock-name-sub">{sig.stock_name}</span>}
              <span className="signal-confidence">{(sig.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="signal-actions">
              {sig.status === 'pending' ? (
                <>
                  <button
                    className="signal-approve-btn"
                    onClick={() => handleApprove(sig.id)}
                    disabled={acting === sig.id}
                  >
                    승인
                  </button>
                  <button
                    className="signal-reject-btn"
                    onClick={() => handleReject(sig.id)}
                    disabled={acting === sig.id}
                  >
                    거부
                  </button>
                </>
              ) : (
                <span className={`signal-status status-${sig.status}`}>
                  {sig.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
