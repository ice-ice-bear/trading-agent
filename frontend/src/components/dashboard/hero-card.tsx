import type { PortfolioData } from '@/types'
import { cn } from '@/lib/utils'

export default function HeroCard({ data }: { data: PortfolioData | null }) {
  if (!data) return <div className="h-[140px] rounded-xl bg-muted animate-pulse" />

  const totalPnl = data.total_pnl
  const totalPnlPct = data.total_pnl_pct
  const totalReturn = data.total_value - data.initial_capital
  const totalReturnPct = data.initial_capital > 0 ? (totalReturn / data.initial_capital) * 100 : 0

  return (
    <div className="bg-gradient-to-br from-primary via-indigo-500 to-purple rounded-xl p-6 text-white shadow-lg shadow-primary/20 mb-5">
      <div className="text-xs font-medium opacity-80 uppercase tracking-widest mb-1">Total Portfolio Value</div>
      <div className="text-[32px] font-extrabold font-mono tracking-tight mb-4">
        ₩ {data.total_value.toLocaleString()}
      </div>
      <div className="flex gap-8">
        <div>
          <div className="text-[11px] opacity-70 uppercase tracking-wide">Today's P/L</div>
          <div className={cn('text-base font-bold font-mono', totalPnl >= 0 ? 'text-green-300' : 'text-red-300')}>
            {totalPnl >= 0 ? '+' : ''}₩{Math.abs(totalPnl).toLocaleString()} ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-70 uppercase tracking-wide">Total P/L</div>
          <div className={cn('text-base font-bold font-mono', totalReturn >= 0 ? 'text-green-300' : 'text-red-300')}>
            {totalReturn >= 0 ? '+' : ''}₩{Math.abs(totalReturn).toLocaleString()} ({totalReturnPct >= 0 ? '+' : ''}{totalReturnPct.toFixed(2)}%)
          </div>
        </div>
        <div>
          <div className="text-[11px] opacity-70 uppercase tracking-wide">Cash</div>
          <div className="text-base font-bold font-mono">₩ {data.cash_balance.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[11px] opacity-70 uppercase tracking-wide">Positions</div>
          <div className="text-base font-bold font-mono">{data.positions.length}</div>
        </div>
      </div>
    </div>
  )
}
