import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { AgentEvent } from '@/types'
import TimelineFeed from './timeline-feed'
import AgentStatusTab from './agent-status-tab'
import DecisionLogTab from './decision-log-tab'

type PanelTab = 'timeline' | 'agents' | 'decisions'

interface ActivityPanelProps {
  events: AgentEvent[]
  wsConnected: boolean
}

export default function ActivityPanel({ events, wsConnected }: ActivityPanelProps) {
  const [tab, setTab] = useState<PanelTab>('timeline')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-[13px] font-bold uppercase tracking-wider flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', wsConnected ? 'bg-success animate-pulse' : 'bg-error')} />
          Agent Activity
        </h3>
        <span className="text-[11px] text-muted-foreground">Live</span>
      </div>
      <div className="flex px-4 border-b border-border shrink-0">
        {(['timeline', 'agents', 'decisions'] as PanelTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize',
              tab === t ? 'text-primary border-primary font-semibold' : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'timeline' && <TimelineFeed events={events} />}
        {tab === 'agents' && <AgentStatusTab />}
        {tab === 'decisions' && <DecisionLogTab events={events} />}
      </div>
    </div>
  )
}
