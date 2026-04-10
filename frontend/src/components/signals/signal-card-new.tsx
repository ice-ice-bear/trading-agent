import { cn } from '@/lib/utils'
import type { Signal } from '@/types'
import ScenarioRow from './scenario-row'
import ExpertPanel from './expert-panel'

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-success-light text-success',
  rejected: 'bg-error-light text-error',
  pending: 'bg-warning-light text-amber-700',
  executed: 'bg-blue-light text-blue',
  failed: 'bg-error-light text-error',
}

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-yellow-100 text-yellow-800',
  C: 'bg-orange-100 text-orange-900',
  D: 'bg-red-100 text-red-800',
}

export default function SignalCardNew({ signal }: { signal: Signal }) {
  const grade = signal.confidence_grades?.overall || (signal.confidence >= 0.8 ? 'A' : signal.confidence >= 0.6 ? 'B' : 'C')

  return (
    <div className="bg-surface border border-border rounded-xl p-[18px] mb-3 cursor-pointer hover:border-primary hover:shadow-md hover:shadow-primary/5 transition-all">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2.5">
          <span className={cn(
            'px-3 py-1 rounded text-xs font-bold text-white tracking-wide',
            signal.direction === 'buy' ? 'bg-error' : signal.direction === 'sell' ? 'bg-blue' : 'bg-muted-foreground'
          )}>
            {signal.direction.toUpperCase()}
          </span>
          <div>
            <div className="text-[15px] font-bold">{signal.stock_name}</div>
            <div className="text-xs text-muted-foreground font-mono">{signal.stock_code}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('px-2 py-0.5 rounded text-[11px] font-semibold', STATUS_STYLES[signal.status] || '')}>
            {signal.status.charAt(0).toUpperCase() + signal.status.slice(1)}
          </span>
          {signal.rr_score != null && (
            <span className="font-mono font-bold text-[15px]">{signal.rr_score.toFixed(2)}</span>
          )}
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', GRADE_STYLES[grade] || 'bg-muted text-muted-foreground')}>
            {grade}
          </span>
        </div>
      </div>

      {/* Scenarios */}
      {signal.scenarios && (
        <ScenarioRow
          bull={signal.scenarios.bull}
          base={signal.scenarios.base}
          bear={signal.scenarios.bear}
        />
      )}

      {/* Expert Stances */}
      {signal.expert_stances && <ExpertPanel stances={signal.expert_stances} />}

      {/* Rejection reason */}
      {signal.status === 'rejected' && signal.risk_notes && (
        <div className="px-3 py-2 bg-error-light rounded-md text-xs text-error mb-3">
          <strong>Rejection:</strong> {signal.risk_notes}
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between items-center pt-2.5 border-t border-border-light text-xs text-muted-foreground">
        <span>
          {new Date(signal.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} KST
          {signal.investment_horizon && <> &middot; {signal.investment_horizon}</>}
        </span>
      </div>
    </div>
  )
}
