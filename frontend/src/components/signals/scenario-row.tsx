import { cn } from '@/lib/utils'
import type { Scenario } from '@/types'

interface ScenarioRowProps {
  bull?: Scenario
  base?: Scenario
  bear?: Scenario
}

function ScenarioCard({ scenario, variant }: { scenario: Scenario; variant: 'bull' | 'base' | 'bear' }) {
  return (
    <div className={cn(
      'flex-1 p-2.5 rounded-lg text-center border',
      variant === 'bull' && 'bg-success/5 border-success/12',
      variant === 'base' && 'bg-muted-foreground/5 border-muted-foreground/12',
      variant === 'bear' && 'bg-error/5 border-error/12',
    )}>
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{scenario.label || variant}</div>
      <div className={cn(
        'text-lg font-extrabold font-mono mt-1',
        variant === 'bull' && 'text-success',
        variant === 'base' && 'text-foreground',
        variant === 'bear' && 'text-error',
      )}>
        {scenario.upside_pct >= 0 ? '+' : ''}{scenario.upside_pct.toFixed(1)}%
      </div>
      <div className="text-[11px] text-muted-foreground">{(scenario.probability * 100).toFixed(0)}% probability</div>
      <div className="text-[11px] text-muted-foreground opacity-70 mt-0.5">&#8361;{scenario.price_target.toLocaleString()}</div>
    </div>
  )
}

export default function ScenarioRow({ bull, base, bear }: ScenarioRowProps) {
  if (!bull && !base && !bear) return null
  return (
    <div className="flex gap-2 mb-3">
      {bull && <ScenarioCard scenario={bull} variant="bull" />}
      {base && <ScenarioCard scenario={base} variant="base" />}
      {bear && <ScenarioCard scenario={bear} variant="bear" />}
    </div>
  )
}
