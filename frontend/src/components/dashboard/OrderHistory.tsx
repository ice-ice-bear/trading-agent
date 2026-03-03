import { useEffect, useState } from 'react';
import type { Order } from '../../types';
import { getOrders } from '../../services/api';

export default function OrderHistory() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    getOrders(20)
      .then((data) => setOrders(data.orders))
      .catch(console.error);

    const interval = setInterval(() => {
      getOrders(20)
        .then((data) => setOrders(data.orders))
        .catch(console.error);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  if (orders.length === 0) {
    return (
      <div className="dashboard-card">
        <h3 className="card-title">Orders</h3>
        <div className="no-data">주문 내역 없음</div>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h3 className="card-title">Orders</h3>
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>시간</th>
            <th>종목</th>
            <th>구분</th>
            <th className="text-right">수량</th>
            <th className="text-right">가격</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td className="order-time">
                {new Date(order.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td>
                <span className="stock-code">{order.stock_code}</span>
                {order.stock_name && <span className="stock-name-sub"> {order.stock_name}</span>}
              </td>
              <td>
                <span className={`side-badge ${order.side}`}>
                  {order.side === 'buy' ? '매수' : '매도'}
                </span>
              </td>
              <td className="text-right">{order.quantity.toLocaleString()}</td>
              <td className="text-right">
                {order.price ? `${order.price.toLocaleString()}원` : '시장가'}
              </td>
              <td>
                <span className={`order-status status-${order.status}`}>
                  {order.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
