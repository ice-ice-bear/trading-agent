import type { RiskConfig } from '@/types'

interface RiskConfigProps {
  config: RiskConfig | null
  onChange: (patch: Partial<RiskConfig>) => void
}

export default function RiskConfigSection({ config, onChange }: RiskConfigProps) {
  if (!config) return null

  const rows = [
    { label: 'Max Position Weight', key: 'max_position_weight_pct' as const, suffix: '%' },
    { label: 'Stop-Loss Threshold', key: 'stop_loss_pct' as const, suffix: '%' },
    { label: 'Take-Profit Threshold', key: 'take_profit_pct' as const, suffix: '%' },
    { label: 'Max Positions', key: 'max_positions' as const, suffix: '' },
  ]

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-4">
      <h3 className="text-sm font-bold mb-4 pb-2.5 border-b border-border-light">Risk Management</h3>
      {rows.map(r => (
        <div key={r.key} className="flex items-center justify-between py-2.5 border-b border-border-light last:border-0">
          <div className="text-[13px] font-medium">{r.label}</div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="1"
              className="w-20 px-2.5 py-1.5 text-[13px] border border-border rounded-md bg-muted text-foreground font-mono text-right"
              value={config[r.key] ?? 0}
              onChange={e => onChange({ [r.key]: parseFloat(e.target.value) || 0 })}
            />
            {r.suffix && <span className="text-xs text-muted-foreground">{r.suffix}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
