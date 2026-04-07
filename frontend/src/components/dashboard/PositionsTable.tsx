import { useState } from 'react';
import type { Position } from '../../types';
import { updateStockStopLoss, resetStockStopLoss } from '../../services/api';

interface Props {
  positions: Position[];
  onRefresh?: () => void;
}

export default function PositionsTable({ positions, onRefresh }: Props) {
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  if (positions.length === 0) {
    return (
      <div className="dashboard-card">
        <h3 className="card-title">Positions</h3>
        <div className="empty-state">No positions</div>
      </div>
    );
  }

  const handleEditStart = (pos: Position) => {
    setEditingCode(pos.stock_code);
    setEditValue(String(pos.stop_loss_pct ?? -3));
  };

  const handleEditSave = async (stockCode: string) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val >= 0) return;
    try {
      await updateStockStopLoss(stockCode, val);
      setEditingCode(null);
      onRefresh?.();
    } catch (e) {
      console.error('Failed to update stop-loss:', e);
    }
  };

  const handleReset = async (stockCode: string) => {
    try {
      await resetStockStopLoss(stockCode);
      setEditingCode(null);
      onRefresh?.();
    } catch (e) {
      console.error('Failed to reset stop-loss:', e);
    }
  };

  return (
    <div className="dashboard-card">
      <h3 className="card-title">Positions ({positions.length})</h3>
      <div className="table-wrapper">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>종목</th>
              <th className="num">수량</th>
              <th className="num">매입가</th>
              <th className="num">현재가</th>
              <th className="num">P/L %</th>
              <th className="num">손절선</th>
              <th>기간</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const isEditing = editingCode === pos.stock_code;
              const pnlClose = pos.stop_loss_pct != null
                ? Math.abs(pos.unrealized_pnl_pct - pos.stop_loss_pct) < 1.5
                : false;

              return (
                <tr key={pos.stock_code}>
                  <td>
                    <span className="mono">{pos.stock_code}</span>
                    {pos.stock_name && <span className="text-muted"> {pos.stock_name}</span>}
                  </td>
                  <td className="num">{pos.quantity.toLocaleString()}</td>
                  <td className="num">{pos.avg_buy_price.toLocaleString()}</td>
                  <td className="num">{pos.current_price.toLocaleString()}</td>
                  <td className={`num ${pos.unrealized_pnl_pct >= 0 ? 'positive' : 'negative'}`}>
                    {pos.unrealized_pnl_pct >= 0 ? '+' : ''}{pos.unrealized_pnl_pct.toFixed(2)}%
                  </td>
                  <td className="num">
                    {isEditing ? (
                      <span className="stop-loss-edit">
                        <input
                          type="number"
                          className="stop-loss-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditSave(pos.stock_code);
                            if (e.key === 'Escape') setEditingCode(null);
                          }}
                          onBlur={() => handleEditSave(pos.stock_code)}
                          step="0.5"
                          max="-0.5"
                          autoFocus
                        />
                        <span className="text-muted">%</span>
                      </span>
                    ) : (
                      <span
                        className={`stop-loss-value ${pnlClose ? 'stop-loss-warning' : ''}`}
                        onClick={() => handleEditStart(pos)}
                        title="클릭하여 손절선 수정"
                      >
                        {pos.stop_loss_pct != null ? `${pos.stop_loss_pct.toFixed(1)}%` : '-'}
                        {pos.stop_loss_source === 'manual' && (
                          <span
                            className="stop-loss-reset"
                            onClick={(e) => { e.stopPropagation(); handleReset(pos.stock_code); }}
                            title="자동으로 리셋"
                          >↺</span>
                        )}
                        {pos.stop_loss_source === 'auto' && <span className="text-muted text-xs"> ATR</span>}
                      </span>
                    )}
                  </td>
                  <td>
                    {pos.investment_horizon && (
                      <span className={`horizon-badge ${pos.investment_horizon}`}>
                        {pos.investment_horizon === 'long' ? '장기' : '단기'}
                      </span>
                    )}
                  </td>
                  <td>
                    {pos.reeval_status && (
                      <span className={`reeval-dot ${pos.reeval_status}`} title={pos.reeval_status}>
                        {pos.reeval_status === 'hold' ? '●' : pos.reeval_status === 'caution' ? '▲' : '✕'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
