import { cn } from '@/lib/utils'
import type { Report } from '@/types'

interface ReportListProps {
  reports: Report[]
  selectedId: number | null
  onSelect: (id: number) => void
  filter: string
  onFilterChange: (f: string) => void
}

export default function ReportList({ reports, selectedId, onSelect, filter, onFilterChange }: ReportListProps) {
  return (
    <div className="w-[280px] shrink-0 flex flex-col">
      <div className="flex gap-0.5 bg-muted rounded-md p-0.5 mb-3">
        {['all', 'daily', 'weekly'].map(f => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded text-center capitalize transition-colors',
              filter === f ? 'bg-surface text-foreground shadow-sm font-semibold' : 'text-muted-foreground'
            )}
          >{f}</button>
        ))}
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto flex-1">
        {reports.map(r => (
          <div
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={cn(
              'px-3.5 py-3 rounded-lg cursor-pointer transition-colors',
              selectedId === r.id ? 'bg-primary-light border border-primary/15' : 'hover:bg-muted'
            )}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                r.report_type === 'daily' ? 'bg-blue-light text-blue' : 'bg-purple-light text-purple'
              )}>
                {r.report_type}
              </span>
              <span className="text-[13px] font-semibold truncate">{r.title || `${r.report_type} Report`}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {new Date(r.timestamp).toLocaleDateString('ko-KR')} &middot; {new Date(r.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
