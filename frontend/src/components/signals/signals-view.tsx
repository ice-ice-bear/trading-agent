import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Signal } from '@/types'
import { getSignals } from '@/services/api'
import SignalCardNew from './signal-card-new'

type StatusFilter = 'all' | 'approved' | 'rejected' | 'pending' | 'executed'

export default function SignalsView() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    const status = filter === 'all' ? undefined : filter
    getSignals(status, 100).then(d => setSignals(d.signals)).catch(() => {})
  }, [filter])

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-xl font-bold">Signals</h2>
        <span className="text-sm text-muted-foreground">AI-generated trading signals</span>
      </div>

      <div className="flex gap-0.5 bg-muted rounded-md p-0.5 mb-5 w-fit">
        {(['all', 'approved', 'rejected', 'pending', 'executed'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded transition-colors capitalize',
              filter === f ? 'bg-surface text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {signals.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">No signals found</div>
      ) : (
        signals.map(s => <SignalCardNew key={s.id} signal={s} />)
      )}
    </div>
  )
}
