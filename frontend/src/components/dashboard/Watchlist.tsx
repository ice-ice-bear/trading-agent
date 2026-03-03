import { useEffect, useState, useCallback } from 'react';
import type { WatchlistItem } from '../../types';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '../../services/api';

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [newCode, setNewCode] = useState('');

  const fetchWatchlist = useCallback(() => {
    getWatchlist()
      .then((data) => setItems(data.items))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchWatchlist();
    const interval = setInterval(fetchWatchlist, 30000);
    return () => clearInterval(interval);
  }, [fetchWatchlist]);

  const handleAdd = async () => {
    const code = newCode.trim();
    if (!code) return;
    await addToWatchlist(code);
    setNewCode('');
    fetchWatchlist();
  };

  const handleRemove = async (stockCode: string) => {
    await removeFromWatchlist(stockCode);
    fetchWatchlist();
  };

  return (
    <div className="dashboard-card">
      <h3 className="card-title">Watchlist</h3>
      <div className="watchlist-add">
        <input
          className="watchlist-input"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="종목코드 (예: 005930)"
        />
        <button className="watchlist-add-btn" onClick={handleAdd}>+</button>
      </div>
      {items.length === 0 ? (
        <div className="no-data">관심 종목 없음</div>
      ) : (
        <div className="watchlist-items">
          {items.map((item) => (
            <div key={item.id} className="watchlist-row">
              <div className="watchlist-info">
                <span className="stock-code">{item.stock_code}</span>
                {item.stock_name && <span className="stock-name-sub">{item.stock_name}</span>}
              </div>
              <div className="watchlist-right">
                {item.last_price != null && (
                  <span className="watchlist-price">
                    {item.last_price.toLocaleString()}원
                  </span>
                )}
                <button
                  className="watchlist-remove-btn"
                  onClick={() => handleRemove(item.stock_code)}
                  title="삭제"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
