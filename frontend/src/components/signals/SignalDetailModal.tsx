import { useState, useEffect } from 'react';
import { getSignal, getOrders } from '../../services/api';
import type { Signal, Order } from '../../types';
import { SignalCard } from '../signals/SignalCard';
import { parseUTC } from '../../utils/time';

interface Props {
  signalId: number;
  onClose: () => void;
}

export default function SignalDetailModal({ signalId, onClose }: Props) {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [relatedOrders, setRelatedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sig, ordersRes] = await Promise.all([
          getSignal(signalId),
          getOrders(100),
        ]);
        setSignal(sig as unknown as Signal);
        setRelatedOrders(
          ordersRes.orders.filter((o: Order) => o.signal_id === signalId)
        );
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
  }, [signalId]);

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content"><p>로딩 중...</p></div>
    </div>
  );
  if (!signal) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px', maxHeight: '85vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3>시그널 상세 #{signal.id}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <SignalCard signal={signal} />

        {relatedOrders.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4>관련 주문</h4>
            <table className="table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>시간</th>
                  <th>구분</th>
                  <th className="text-right">수량</th>
                  <th className="text-right">체결가</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {relatedOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{parseUTC(order.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span className={`badge badge-${order.side === 'buy' ? 'long' : 'short'}`}>{order.side === 'buy' ? '매수' : '매도'}</span></td>
                    <td className="text-right">{order.quantity.toLocaleString()}</td>
                    <td className="text-right">{order.fill_price ? order.fill_price.toLocaleString() : '-'}</td>
                    <td><span className={`badge status-${order.status}`}>{order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {relatedOrders.length === 0 && signal.status !== 'pending' && (
          <p className="text-muted" style={{ marginTop: '12px', fontSize: '0.85rem' }}>
            관련 주문 없음
          </p>
        )}
      </div>
    </div>
  );
}
