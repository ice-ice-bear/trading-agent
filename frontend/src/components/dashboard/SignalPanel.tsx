import { useEffect, useState, useCallback } from 'react';
import type { Signal } from '../../types';
import { getSignals, approveSignal, rejectSignal } from '../../services/api';
import { SignalCard } from '../signals/SignalCard';

interface Props {
  refreshTrigger?: number;
}

export default function SignalPanel({ refreshTrigger }: Props) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [acting, setActing] = useState<number | null>(null);

  const fetchSignals = useCallback(() => {
    getSignals(undefined, 20)
      .then((data) => setSignals(data.signals))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // Refetch on external trigger (WS event)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) fetchSignals();
  }, [refreshTrigger, fetchSignals]);

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
          <SignalCard
            key={sig.id}
            signal={sig}
            onApprove={sig.status === 'pending' ? handleApprove : undefined}
            onReject={sig.status === 'pending' ? handleReject : undefined}
            acting={acting === sig.id}
          />
        ))}
      </div>
    </div>
  );
}
