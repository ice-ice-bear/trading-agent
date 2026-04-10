import type { AgentEvent } from '@/types'
import FlowEvent from './flow-event'

const DECISION_EVENTS = ['signal.approved', 'signal.rejected', 'risk.stop_loss', 'risk.take_profit', 'signal.pending_approval']

export default function DecisionLogTab({ events }: { events: AgentEvent[] }) {
  const decisions = [...events].filter(e => DECISION_EVENTS.includes(e.event_type)).reverse()

  if (decisions.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">No decisions yet.</div>
  }

  return (
    <div className="flex flex-col">
      {decisions.map((e, i) => <FlowEvent key={`${e.timestamp}-${i}`} event={e} />)}
    </div>
  )
}
