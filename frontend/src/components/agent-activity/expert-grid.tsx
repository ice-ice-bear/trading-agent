import { cn } from '@/lib/utils'

interface ExpertVote {
  name: string
  stance: 'bullish' | 'bearish' | 'neutral'
}

export default function ExpertGrid({ votes }: { votes: ExpertVote[] }) {
  return (
    <div className="grid grid-cols-3 gap-1 mt-1.5">
      {votes.map((v) => (
        <div
          key={v.name}
          className={cn(
            'px-1.5 py-1 rounded text-[10px] text-center font-semibold',
            v.stance === 'bullish' && 'bg-success-light text-success',
            v.stance === 'bearish' && 'bg-error-light text-error',
            v.stance === 'neutral' && 'bg-muted text-muted-foreground',
          )}
        >
          {v.name}: {v.stance.charAt(0).toUpperCase() + v.stance.slice(1, 4)}
        </div>
      ))}
    </div>
  )
}
