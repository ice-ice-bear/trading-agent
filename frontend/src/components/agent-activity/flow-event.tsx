import { cn } from '@/lib/utils'
import type { AgentEvent } from '@/types'
import DecisionChain, { type ChainStep } from './decision-chain'
import ExpertGrid from './expert-grid'

const AGENT_ICONS: Record<string, { icon: string; bg: string; text: string }> = {
  market_scanner: { icon: '\uD83D\uDD0D', bg: 'bg-primary-light', text: 'text-primary' },
  risk_manager: { icon: '\uD83D\uDEE1', bg: 'bg-error-light', text: 'text-error' },
  trading_executor: { icon: '\uD83D\uDCB9', bg: 'bg-blue-light', text: 'text-blue' },
  portfolio_monitor: { icon: '\uD83D\uDCCA', bg: 'bg-success-light', text: 'text-success' },
  report_generator: { icon: '\uD83D\uDCDD', bg: 'bg-purple-light', text: 'text-purple' },
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

function getDecisionChain(event: AgentEvent): ChainStep[] | null {
  if (event.event_type === 'signal.approved') {
    return [
      { label: 'R/R', status: 'pass' },
      { label: 'Size', status: 'pass' },
      { label: 'Sector', status: 'pass' },
      { label: 'OK', status: 'pass' },
    ]
  }
  if (event.event_type === 'signal.rejected') {
    const d = event.data || {}
    const reason = String(d.reason || '')
    const rrFail = reason.toLowerCase().includes('score') || reason.toLowerCase().includes('rr')
    return [
      { label: 'R/R', status: rrFail ? 'fail' : 'pass' },
      { label: 'Size', status: rrFail ? 'pending' : 'pass' },
      { label: 'Sector', status: 'pending' },
      { label: 'Rejected', status: 'fail' },
    ]
  }
  return null
}

function getExpertVotes(event: AgentEvent) {
  const stances = event.data?.expert_stances as Record<string, string> | undefined
  if (!stances) return null
  return Object.entries(stances).map(([name, stance]) => ({
    name: name.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    stance: (stance.toLowerCase().includes('bull') ? 'bullish' :
             stance.toLowerCase().includes('bear') ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
  }))
}

export default function FlowEvent({ event, isRunning = false }: { event: AgentEvent; isRunning?: boolean }) {
  const agentStyle = AGENT_ICONS[event.agent_id] || { icon: '\u26A1', bg: 'bg-muted', text: 'text-muted-foreground' }
  const chain = getDecisionChain(event)
  const votes = getExpertVotes(event)
  const d = event.data || {}

  return (
    <div className="flex gap-3 py-2.5 relative">
      {/* Timeline line */}
      <div className="absolute left-[15px] top-[40px] bottom-[-4px] w-0.5 bg-border-light" />

      {/* Icon */}
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 relative z-10',
        agentStyle.bg, agentStyle.text,
        isRunning && 'animate-pulse',
      )}>
        {event.event_type === 'signal.approved' ? '\u2714' :
         event.event_type === 'signal.rejected' ? '\u2718' :
         agentStyle.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">
            {(d.agent_name as string) || event.agent_id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            {isRunning && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue ml-1.5 animate-pulse" />}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(event.timestamp)}</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{event.event_type}</div>

        {/* Detail box */}
        <div className="mt-1.5 px-2.5 py-2 bg-muted rounded-md text-xs text-muted-foreground leading-relaxed">
          {event.event_type === 'signal.generated' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}{(d.direction as string)?.toUpperCase()}
              {d.rr_score != null && <> &middot; R/R: <span className="font-semibold text-foreground">{Number(d.rr_score).toFixed(2)}</span></>}
            </div>
          )}
          {event.event_type === 'signal.approved' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}{(d.direction as string)?.toUpperCase()} approved
              {d.rr_score != null && <><br />R/R: <span className="font-semibold text-foreground">{Number(d.rr_score).toFixed(2)}</span></>}
            </div>
          )}
          {event.event_type === 'signal.rejected' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}{(d.direction as string)?.toUpperCase()} rejected
              <br /><span className="text-error">{d.reason as string}</span>
            </div>
          )}
          {event.event_type === 'order.filled' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}{(d.side as string)?.toUpperCase()} {d.quantity as number}
              {d.fill_price != null && <> @ \u20A9{Number(d.fill_price).toLocaleString()}</>}
            </div>
          )}
          {event.event_type === 'order.failed' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}order failed: <span className="text-error">{d.reason as string}</span>
            </div>
          )}
          {event.event_type === 'portfolio.updated' && (
            <div>
              {d.positions && <>{(d.positions as unknown[]).length} positions</>}
              {d.total_pnl != null && <> &middot; P/L: <span className={cn('font-semibold', Number(d.total_pnl) >= 0 ? 'text-success' : 'text-error')}>
                {Number(d.total_pnl) >= 0 ? '+' : ''}{Number(d.total_pnl).toLocaleString()}
              </span></>}
            </div>
          )}
          {event.event_type === 'risk.stop_loss' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}stop-loss triggered &middot; P/L: <span className="text-error">{d.current_pnl_pct as number}%</span>
            </div>
          )}
          {event.event_type === 'risk.take_profit' && (
            <div>
              <span className="font-semibold text-foreground">{d.stock_name as string}</span>
              {' '}take-profit triggered &middot; P/L: <span className="text-success">{d.current_pnl_pct as number}%</span>
            </div>
          )}
          {event.event_type === 'report.generated' && (
            <div>Report generated: {d.report_type as string}</div>
          )}
          {!['signal.generated','signal.approved','signal.rejected','order.filled','order.failed',
             'portfolio.updated','risk.stop_loss','risk.take_profit','report.generated',
             'agent.started','agent.completed','agent.failed'].includes(event.event_type) && (
            <div>{JSON.stringify(d).slice(0, 200)}</div>
          )}
          {(event.event_type === 'agent.started') && (
            <div>{(d.agent_name as string)} ({d.role as string}) started — trigger: {d.trigger as string}</div>
          )}
          {(event.event_type === 'agent.completed') && (
            <div>{(d.agent_name as string)} completed in {d.duration_ms as number}ms{d.summary ? ` — ${(d.summary as string).slice(0, 100)}` : ''}</div>
          )}
          {(event.event_type === 'agent.failed') && (
            <div className="text-error">{(d.agent_name as string)} failed: {(d.error as string)?.slice(0, 150)}</div>
          )}
        </div>

        {chain && <DecisionChain steps={chain} />}
        {votes && <ExpertGrid votes={votes} />}
      </div>
    </div>
  )
}
