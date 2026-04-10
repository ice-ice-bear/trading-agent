import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Agent } from '@/types'
import { getAgents, runAgent, enableAgent, disableAgent } from '@/services/api'

export default function AgentStatusTab() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [runningId, setRunningId] = useState<string | null>(null)

  const fetchAgents = () => getAgents().then(d => setAgents(d.agents)).catch(() => {})

  useEffect(() => { fetchAgents(); const i = setInterval(fetchAgents, 15000); return () => clearInterval(i) }, [])

  const handleRun = async (id: string) => {
    setRunningId(id)
    try { await runAgent(id); await fetchAgents() } finally { setRunningId(null) }
  }

  const handleToggle = async (id: string, enable: boolean) => {
    if (enable) await enableAgent(id); else await disableAgent(id)
    await fetchAgents()
  }

  return (
    <div className="flex flex-col">
      {agents.map(a => (
        <div key={a.id} className="flex items-center gap-2 py-2 border-b border-border-light last:border-0">
          <span className={cn(
            'w-2 h-2 rounded-full shrink-0',
            a.status === 'idle' && 'bg-muted-foreground',
            a.status === 'running' && 'bg-blue animate-pulse',
            a.status === 'error' && 'bg-error',
            a.status === 'disabled' && 'bg-muted-foreground opacity-40',
          )} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{a.name}</div>
            <div className="text-[11px] text-muted-foreground">{a.role}</div>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono shrink-0">
            {a.last_run ? new Date(a.last_run).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
          </span>
          <button
            onClick={() => handleToggle(a.id, a.status === 'disabled')}
            className={cn(
              'text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors',
              a.status === 'disabled'
                ? 'text-muted-foreground border-border'
                : 'text-success border-success/40'
            )}
          >
            {a.status === 'disabled' ? 'OFF' : 'ON'}
          </button>
          <button
            onClick={() => handleRun(a.id)}
            disabled={runningId === a.id || a.status === 'disabled'}
            className="text-[11px] font-medium px-2 py-0.5 bg-muted border border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {runningId === a.id ? '...' : 'Run'}
          </button>
        </div>
      ))}
    </div>
  )
}
