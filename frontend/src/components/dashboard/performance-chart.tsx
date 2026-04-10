import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

type Period = '1W' | '1M' | '3M'

interface PerfData {
  date: string
  value: number
  returns_pct: number
}

export default function PerformanceChart() {
  const [period, setPeriod] = useState<Period>('1W')
  const [data, setData] = useState<PerfData[]>([])

  useEffect(() => {
    fetch(`/api/dashboard/performance?period=${period.toLowerCase()}`)
      .then(r => r.ok ? r.json() : { snapshots: [] })
      .then(d => setData(d.snapshots || []))
      .catch(() => setData([]))
  }, [period])

  const lastReturns = data.length > 0 ? data[data.length - 1].returns_pct : 0
  const isPositive = lastReturns >= 0

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
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isPositive ? '#22c55e' : '#ef4444'}
              strokeWidth={2}
              fill="url(#perfGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-5 mt-2 text-xs">
          <span>Returns: <strong className={isPositive ? 'text-success' : 'text-error'}>{isPositive ? '+' : ''}{lastReturns.toFixed(2)}%</strong></span>
        </div>
      </div>
    </div>
  )
}
