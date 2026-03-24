import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Signal } from '../../types';
import { getSignals, approveSignal, rejectSignal } from '../../services/api';
import { SignalCard } from '../signals/SignalCard';
import SignalDetailModal from '../signals/SignalDetailModal';
import { parseUTC } from '../../utils/time';

interface Props {
  refreshTrigger?: number;
}

/** Format a Date to "YYYY-MM-DD" in local timezone */
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Human-friendly label for a date key */
function dateLabel(key: string): string {
  const today = toDateKey(new Date());
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateKey(d);
  })();
  if (key === today) return '오늘';
  if (key === yesterday) return '어제';
  // e.g. "3월 15일 (토)"
  const d = new Date(key + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

type DateGroup = { key: string; signals: Signal[] };

export default function SignalPanel({ refreshTrigger }: Props) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [acting, setActing] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedSignalId, setSelectedSignalId] = useState<number | null>(null);

  const fetchSignals = useCallback(() => {
    getSignals(undefined, 50)
      .then((data) => setSignals(data.signals))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 60000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) fetchSignals();
  }, [refreshTrigger, fetchSignals]);

  // Group signals by date
  const groups: DateGroup[] = useMemo(() => {
    const map = new Map<string, Signal[]>();
    for (const sig of signals) {
      const key = toDateKey(parseUTC(sig.timestamp));
      const arr = map.get(key);
      if (arr) arr.push(sig);
      else map.set(key, [sig]);
    }
    // Sort date keys descending (newest first)
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, sigs]) => ({ key, signals: sigs }));
  }, [signals]);

  // Auto-collapse non-today groups when signals load/change
  useEffect(() => {
    if (groups.length === 0) return;
    const today = toDateKey(new Date());
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const g of groups) {
        if (g.key !== today && !next.has(g.key)) {
          next.add(g.key);
        }
      }
      // Make sure today is always expanded on fresh load
      next.delete(today);
      return next;
    });
  }, [groups]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          const pendingCount = group.signals.filter((s) => s.status === 'pending').length;
          return (
            <div key={group.key} className="signal-date-group">
              <button
                className="signal-date-header"
                onClick={() => toggleGroup(group.key)}
              >
                <span className={`signal-date-chevron ${isCollapsed ? '' : 'chevron-open'}`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4,2 8,6 4,10" />
                  </svg>
                </span>
                <span className="signal-date-label">{dateLabel(group.key)}</span>
                <span className="signal-date-key">{group.key}</span>
                <span className="signal-date-count">
                  {group.signals.length}건
                  {pendingCount > 0 && (
                    <span className="signal-date-pending">{pendingCount} pending</span>
                  )}
                </span>
              </button>
              {!isCollapsed && (
                <div className="signal-date-body">
                  {group.signals.map((sig) => (
                    <div key={sig.id} onClick={() => setSelectedSignalId(sig.id)} style={{ cursor: 'pointer' }}>
                      <SignalCard
                        signal={sig}
                        onApprove={sig.status === 'pending' ? handleApprove : undefined}
                        onReject={sig.status === 'pending' ? handleReject : undefined}
                        acting={acting === sig.id}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selectedSignalId && (
        <SignalDetailModal
          signalId={selectedSignalId}
          onClose={() => setSelectedSignalId(null)}
        />
      )}
    </div>
  );
}
