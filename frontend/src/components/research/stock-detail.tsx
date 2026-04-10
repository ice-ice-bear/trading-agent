import { useEffect, useState } from 'react'
import type { Signal } from '@/types'
import { cn } from '@/lib/utils'
import PriceChart from './price-chart'
import FundamentalsCard from './fundamentals-card'

interface StockDetailProps {
  stockCode: string
  stockName: string
}

export default function StockDetail({ stockCode, stockName }: StockDetailProps) {
  const [signals, setSignals] = useState<Signal[]>([])

  useEffect(() => {
    fetch(`/api/signals/history/${stockCode}`)
      .then(r => r.ok ? r.json() : { signals: [] })
      .then(d => setSignals(d.signals || []))
      .catch(() => setSignals([]))
  }, [stockCode])

  const latestSignal = signals[0]

  return (
    <div className="flex-1 overflow-y-auto min-w-0">
      {/* Header */}
      <div className="flex items-end gap-4 mb-5 pb-4 border-b border-border">
        <div>
          <div className="text-2xl font-extrabold">{stockName}</div>
          <div className="text-sm text-muted-foreground font-mono">{stockCode} &middot; KOSPI</div>
        </div>
      </div>

      <div className="mb-4">
        <PriceChart stockCode={stockCode} />
      </div>

      <div className="mb-4">
        <FundamentalsCard data={latestSignal?.dart_fundamentals || null} />
      </div>

      {signals.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-[18px] py-3.5 border-b border-border-light">
            <h3 className="text-[13px] font-bold uppercase tracking-wider">Signal History</h3>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Date</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Direction</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Score</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Status</th>
              </tr>
            </thead>
            <tbody>
              {signals.map(s => (
                <tr key={s.id}>
                  <td className="px-3 py-2 border-b border-border-light font-mono text-xs">{new Date(s.timestamp).toLocaleDateString('ko-KR')}</td>
                  <td className="px-3 py-2 border-b border-border-light">
                    <span className={cn('px-2 py-0.5 rounded text-[11px] font-bold text-white', s.direction === 'buy' ? 'bg-error' : 'bg-blue')}>
                      {s.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-right px-3 py-2 border-b border-border-light font-mono">{s.rr_score?.toFixed(2) || '--'}</td>
                  <td className={cn('px-3 py-2 border-b border-border-light text-xs font-semibold',
                    s.status === 'approved' || s.status === 'executed' ? 'text-success' : s.status === 'rejected' ? 'text-error' : 'text-muted-foreground'
                  )}>
                    {s.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
