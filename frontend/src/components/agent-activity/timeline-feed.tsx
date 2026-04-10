import type { AgentEvent } from '@/types'
import FlowEvent from './flow-event'

export default function TimelineFeed({ events }: { events: AgentEvent[] }) {
  const sorted = [...events].reverse()

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        No agent events yet. Events will appear here when agents run.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {sorted.map((event, i) => {
        const isRunning = i === 0 && (
          event.event_type === 'agent.started' ||
          event.event_type.startsWith('scanner.')
        )
        return <FlowEvent key={`${event.timestamp}-${i}`} event={event} isRunning={isRunning} />
      })}
    </div>
  )
}
