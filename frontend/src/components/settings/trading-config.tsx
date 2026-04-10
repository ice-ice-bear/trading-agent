import type { AppSettings, RiskConfig } from '@/types'

interface TradingConfigProps {
  settings: AppSettings
  riskConfig: RiskConfig | null
  onSettingsChange: (patch: Partial<AppSettings>) => void
  onRiskChange: (patch: Partial<RiskConfig>) => void
}

export default function TradingConfig({ settings, riskConfig, onSettingsChange, onRiskChange }: TradingConfigProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-4">
      <h3 className="text-sm font-bold mb-4 pb-2.5 border-b border-border-light">Trading Configuration</h3>

      <div className="flex items-center justify-between py-2.5 border-b border-border-light">
        <div><div className="text-[13px] font-medium">Trading Mode</div><div className="text-xs text-muted-foreground mt-0.5">Paper trading or live</div></div>
        <select
          className="px-2.5 py-1.5 text-[13px] border border-border rounded-md bg-surface text-foreground"
          value={settings.trading_mode}
          onChange={e => onSettingsChange({ trading_mode: e.target.value as 'demo' | 'real' })}
        >
          <option value="demo">Demo (Paper)</option>
          <option value="real">Real</option>
        </select>
      </div>

      <div className="flex items-center justify-between py-2.5 border-b border-border-light">
        <div><div className="text-[13px] font-medium">Signal Approval</div><div className="text-xs text-muted-foreground mt-0.5">Auto-approve or manual</div></div>
        <select
          className="px-2.5 py-1.5 text-[13px] border border-border rounded-md bg-surface text-foreground"
          value={riskConfig?.signal_approval_mode || 'auto'}
          onChange={e => onRiskChange({ signal_approval_mode: e.target.value as 'auto' | 'manual' })}
        >
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <div className="flex items-center justify-between py-2.5">
        <div><div className="text-[13px] font-medium">Min Composite Score</div></div>
        <input
          type="number"
          step="0.1"
          className="w-20 px-2.5 py-1.5 text-[13px] border border-border rounded-md bg-muted text-foreground font-mono text-right"
          value={riskConfig?.min_composite_score ?? 1.5}
          onChange={e => onRiskChange({ min_composite_score: parseFloat(e.target.value) || 1.5 })}
        />
      </div>
    </div>
  )
}
