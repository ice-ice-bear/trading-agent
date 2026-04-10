import { useEffect, useState } from 'react'

interface ScheduledTask {
  task_id: string
  agent_id: string
  cron: string
  enabled: boolean
  description: string
}

export default function SchedulerTable() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])

  useEffect(() => {
    fetch('/api/scheduler/tasks')
      .then(r => r.ok ? r.json() : { tasks: [] })
      .then(d => setTasks(d.tasks || []))
      .catch(() => {})
  }, [])

  const toggleTask = async (taskId: string, enabled: boolean) => {
    await fetch(`/api/scheduler/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).catch(() => {})
    setTasks(prev => prev.map(t => t.task_id === taskId ? { ...t, enabled } : t))
  }

  if (tasks.length === 0) return null

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-3.5 border-b border-border-light">
        <h3 className="text-sm font-bold">Scheduler</h3>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Task</th>
            <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Agent</th>
            <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Cron</th>
            <th className="text-center px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border">Enabled</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.task_id}>
              <td className="px-3 py-2.5 border-b border-border-light">{t.description || t.task_id}</td>
              <td className="px-3 py-2.5 border-b border-border-light text-muted-foreground">{t.agent_id}</td>
              <td className="px-3 py-2.5 border-b border-border-light font-mono text-xs">{t.cron}</td>
              <td className="px-3 py-2.5 border-b border-border-light text-center">
                <button
                  onClick={() => toggleTask(t.task_id, !t.enabled)}
                  className={`w-10 h-[22px] rounded-full relative transition-colors ${t.enabled ? 'bg-primary' : 'bg-border'}`}
                >
                  <span className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${t.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
