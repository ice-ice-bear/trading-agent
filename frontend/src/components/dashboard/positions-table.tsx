import type { Position } from '@/types'
import { cn } from '@/lib/utils'

export default function PositionsTable({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return <div className="bg-surface border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">No positions</div>
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden mb-4">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Positions</h3>
        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{positions.length} holdings</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Stock</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Qty</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Avg Price</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Current</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">P/L</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Stop-Loss</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(p => (
              <tr key={p.stock_code} className="hover:bg-muted/50 transition-colors">
                <td className="px-3 py-2.5 border-b border-border-light">
                  <div className="font-semibold">{p.stock_name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{p.stock_code}</div>
                </td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">{p.quantity}</td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">{p.avg_buy_price.toLocaleString()}</td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">{p.current_price.toLocaleString()}</td>
                <td className={cn('text-right px-3 py-2.5 border-b border-border-light font-mono text-xs font-semibold',
                  p.unrealized_pnl >= 0 ? 'text-success' : 'text-error'
                )}>
                  {p.unrealized_pnl >= 0 ? '+' : ''}{p.unrealized_pnl.toLocaleString()} ({p.unrealized_pnl_pct >= 0 ? '+' : ''}{p.unrealized_pnl_pct.toFixed(2)}%)
                </td>
                <td className="text-right px-3 py-2.5 border-b border-border-light font-mono text-xs">
                  {p.stop_loss_pct != null ? `${p.stop_loss_pct}%` : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
