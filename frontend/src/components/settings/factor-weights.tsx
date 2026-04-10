import type { RiskConfig } from '@/types'

interface FactorWeightsProps {
  config: RiskConfig | null
  onChange: (patch: Partial<RiskConfig>) => void
}

const FACTORS = [
  { label: 'R/R Ratio', key: 'weight_rr_ratio' as const },
  { label: 'Expert Consensus', key: 'weight_expert_consensus' as const },
  { label: 'Fundamental', key: 'weight_fundamental' as const },
  { label: 'Technical', key: 'weight_technical' as const },
  { label: 'Institutional', key: 'weight_institutional' as const },
]

export default function FactorWeights({ config, onChange }: FactorWeightsProps) {
  if (!config) return null

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-4">
      <h3 className="text-sm font-bold mb-1 pb-2.5 border-b border-border-light">Factor Weights</h3>
      <p className="text-xs text-muted-foreground mb-3">How each factor contributes to the composite score</p>
      {FACTORS.map(f => {
        const val = (config[f.key] ?? 0.2)
        return (
          <div key={f.key} className="flex items-center gap-3 py-2">
            <span className="text-xs w-28 shrink-0">{f.label}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(val * 100)}
              onChange={e => onChange({ [f.key]: parseInt(e.target.value) / 100 })}
              className="flex-1 h-1 accent-primary"
            />
            <span className="text-xs font-mono font-semibold w-9 text-right">{val.toFixed(2)}</span>
          </div>
        )
      })}
    </div>
  )
}
