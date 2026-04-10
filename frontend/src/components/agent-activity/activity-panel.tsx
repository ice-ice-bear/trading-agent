import type { AgentEvent } from '@/types'

interface ActivityPanelProps {
  events: AgentEvent[]
  wsConnected: boolean
}

export default function ActivityPanel({ events, wsConnected }: ActivityPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-[13px] font-bold uppercase tracking-wider flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-success animate-pulse' : 'bg-error'}`} />
          Agent Activity
        </h3>
        <span className="text-[11px] text-muted-foreground">Live</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm text-muted-foreground">
        {events.length === 0 ? 'No events yet...' : `${events.length} events`}
      </div>
    </div>
  )
}
