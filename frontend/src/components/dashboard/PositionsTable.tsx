import type { Position } from '../../types';

interface Props {
  positions: Position[];
}

export default function PositionsTable({ positions }: Props) {
  if (positions.length === 0) {
    return (
      <div className="dashboard-card">
        <h3 className="card-title">Positions</h3>
        <div className="empty-state">No positions</div>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <h3 className="card-title">Positions ({positions.length})</h3>
      <div className="table-wrapper">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th className="num">Qty</th>
              <th className="num">Avg Price</th>
              <th className="num">Current</th>
              <th className="num">P/L</th>
              <th className="num">P/L %</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => (
              <tr key={pos.stock_code}>
                <td className="mono">{pos.stock_code}</td>
                <td>{pos.stock_name}</td>
                <td className="num">{pos.quantity.toLocaleString()}</td>
                <td className="num">{pos.avg_buy_price.toLocaleString()}</td>
                <td className="num">{pos.current_price.toLocaleString()}</td>
                <td className={`num ${pos.unrealized_pnl >= 0 ? 'positive' : 'negative'}`}>
                  {pos.unrealized_pnl.toLocaleString()}
                </td>
                <td className={`num ${pos.unrealized_pnl_pct >= 0 ? 'positive' : 'negative'}`}>
                  {pos.unrealized_pnl_pct >= 0 ? '+' : ''}{pos.unrealized_pnl_pct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
