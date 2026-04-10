import { cn } from '@/lib/utils'

export default function ExpertPanel({ stances }: { stances: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {Object.entries(stances).map(([name, stance]) => {
        const s = stance.toLowerCase()
        const isBullish = s.includes('bull') || s.includes('강세')
        const isBearish = s.includes('bear') || s.includes('약세')
        return (
          <span
            key={name}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-semibold border',
              isBullish && 'bg-success-light text-success border-success/15',
              isBearish && 'bg-error-light text-error border-error/15',
              !isBullish && !isBearish && 'bg-muted text-muted-foreground border-border',
            )}
          >
            {name.replace(/[_-]/g, ' ')}: {stance}
          </span>
        )
      })}
    </div>
  )
}
