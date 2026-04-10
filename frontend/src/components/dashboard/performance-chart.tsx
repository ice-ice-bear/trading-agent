import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

type Period = '1W' | '1M' | '3M'

const PERIOD_MAP: Record<Period, string> = { '1W': '7d', '1M': '30d', '3M': '90d' }

interface PerfData {
  date: string
  total_value: number
}

export default function PerformanceChart() {
  const [period, setPeriod] = useState<Period>('1W')
  const [data, setData] = useState<PerfData[]>([])
  const [returnsPct, setReturnsPct] = useState(0)
  const [maxDrawdown, setMaxDrawdown] = useState(0)
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  useEffect(() => {
    fetch(`/api/dashboard/performance?period=${PERIOD_MAP[period]}`)
      .then(r => r.ok ? r.json() : { chart_data: [], returns_pct: 0, max_drawdown: 0 })
      .then(d => {
        setData(d.chart_data || d.snapshots || [])
        setReturnsPct(d.returns_pct ?? 0)
        setMaxDrawdown(d.max_drawdown ?? 0)
      })
      .catch(() => { setData([]); setReturnsPct(0); setMaxDrawdown(0) })
  }, [period])

  const isPositive = returnsPct >= 0

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Performance</h3>
        <div className="flex gap-0.5">
          {(['1W', '1M', '3M'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                period === p ? 'bg-primary-light text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="px-[18px] py-3">
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.15} />
                <stop offset="100%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              background: isDark ? '#1a1b26' : '#fff',
              border: '1px solid',
              borderColor: isDark ? '#2d3348' : '#e5e7eb',
              color: isDark ? '#e2e8f0' : '#0f172a',
            }} />
            <Area
              type="monotone"
              dataKey="total_value"
              stroke={isPositive ? '#22c55e' : '#ef4444'}
              strokeWidth={2}
              fill="url(#perfGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-5 mt-2 text-xs">
          <span>Returns: <strong className={isPositive ? 'text-success' : 'text-error'}>{isPositive ? '+' : ''}{returnsPct.toFixed(2)}%</strong></span>
          <span>Sharpe: <strong>--</strong></span>
          <span>Max DD: <strong className="text-error">{maxDrawdown > 0 ? `-${maxDrawdown.toFixed(1)}%` : '0%'}</strong></span>
        </div>
      </div>
    </div>
  )
}
