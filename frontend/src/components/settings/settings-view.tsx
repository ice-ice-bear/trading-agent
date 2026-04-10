import { useEffect, useState, useCallback } from 'react'
import type { AppSettings, RiskConfig } from '@/types'
import { getSettings, updateSettings, getRiskConfig, updateRiskConfig } from '@/services/api'
import TradingConfig from './trading-config'
import RiskConfigSection from './risk-config'
import FactorWeights from './factor-weights'
import SchedulerTable from './scheduler-table'

export default function SettingsView() {
  const [settings, setSettings] = useState<AppSettings>({ trading_mode: 'demo', claude_model: '', claude_max_tokens: 4096 })
  const [riskConfig, setRiskConfig] = useState<RiskConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
    getRiskConfig().then(setRiskConfig).catch(() => {})
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await updateSettings(settings)
      if (riskConfig) await updateRiskConfig(riskConfig)
    } finally {
      setSaving(false)
    }
  }, [settings, riskConfig])

  return (
    <div className="max-w-[720px]">
      <h2 className="text-xl font-bold mb-5">Settings</h2>
      <TradingConfig
        settings={settings}
        riskConfig={riskConfig}
        onSettingsChange={patch => setSettings(prev => ({ ...prev, ...patch }))}
        onRiskChange={patch => setRiskConfig(prev => prev ? { ...prev, ...patch } : null)}
      />
      <RiskConfigSection config={riskConfig} onChange={patch => setRiskConfig(prev => prev ? { ...prev, ...patch } : null)} />
      <FactorWeights config={riskConfig} onChange={patch => setRiskConfig(prev => prev ? { ...prev, ...patch } : null)} />
      <SchedulerTable />
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-[13px] font-medium bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
