import { cn } from '@/lib/utils'

export interface ChainStep {
  label: string
  status: 'pass' | 'fail' | 'active' | 'pending'
}

export default function DecisionChain({ steps }: { steps: ChainStep[] }) {
  return (
    <div className="flex items-center gap-1 mt-1.5 text-[11px] flex-wrap">
      {steps.map((step, i) => (
        <span key={i} className="contents">
          {i > 0 && <span className="text-muted-foreground text-[10px]">&rarr;</span>}
          <span className={cn(
            'px-2 py-0.5 rounded font-medium border',
            step.status === 'pass' && 'bg-success-light text-success border-success/20',
            step.status === 'fail' && 'bg-error-light text-error border-error/20',
            step.status === 'active' && 'bg-primary-light text-primary border-primary/20',
            step.status === 'pending' && 'bg-muted text-muted-foreground border-border-light',
          )}>
            {step.label}
          </span>
        </span>
      ))}
    </div>
  )
}
