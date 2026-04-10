import { cn } from '@/lib/utils'
import type { DartFundamentals } from '@/types'

export default function FundamentalsCard({ data }: { data: DartFundamentals | null }) {
  if (!data) return null

  const kpis = [
    { label: 'PER', value: data.dart_per != null ? `${data.dart_per.toFixed(1)}x` : '--' },
    { label: 'PBR', value: data.dart_pbr != null ? `${data.dart_pbr.toFixed(2)}x` : '--' },
    { label: 'EPS YoY', value: data.dart_eps_yoy_pct != null ? `${data.dart_eps_yoy_pct >= 0 ? '+' : ''}${data.dart_eps_yoy_pct.toFixed(1)}%` : '--', color: data.dart_eps_yoy_pct != null && data.dart_eps_yoy_pct >= 0 },
    { label: 'Op. Margin', value: data.dart_operating_margin != null ? `${data.dart_operating_margin.toFixed(1)}%` : '--' },
    { label: 'Debt Ratio', value: data.dart_debt_ratio != null ? `${data.dart_debt_ratio.toFixed(1)}%` : '--' },
    { label: 'Div. Yield', value: data.dart_dividend_yield != null ? `${data.dart_dividend_yield.toFixed(1)}%` : '--' },
  ]

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Fundamentals</h3>
      </div>
      <div className="p-[18px] grid grid-cols-3 gap-2">
        {kpis.map(k => (
          <div key={k.label} className="text-center p-2.5 bg-muted rounded-md">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{k.label}</div>
            <div className={cn('text-sm font-bold font-mono', k.color === true && 'text-success', k.color === false && 'text-error')}>
              {k.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
