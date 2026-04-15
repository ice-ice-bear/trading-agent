import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'

interface ChartRow {
  stck_bsop_date: string
  stck_clpr: string
  stck_oprc: string
  stck_hgpr: string
  stck_lwpr: string
  acml_vol: string
}

interface PriceChartProps {
  stockCode: string
  chart: ChartRow[]
  ma?: { ma20?: number | null; ma50?: number | null; ma200?: number | null }
  bollinger?: { upper: number; middle: number; lower: number } | null
}

function toTs(ymd: string): UTCTimestamp {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(4, 6)) - 1
  const d = Number(ymd.slice(6, 8))
  return Math.floor(Date.UTC(y, m, d) / 1000) as UTCTimestamp
}

function rollingMA(values: { time: UTCTimestamp; close: number }[], period: number) {
  const out: { time: UTCTimestamp; value: number }[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i].close
    if (i >= period) sum -= values[i - period].close
    if (i >= period - 1) out.push({ time: values[i].time, value: sum / period })
  }
  return out
}

export default function PriceChart({ stockCode, chart, ma, bollinger }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current || chart.length === 0) return
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

    const c = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 360,
      layout: { background: { color: 'transparent' }, textColor: isDark ? '#94a3b8' : '#64748b', fontSize: 11 },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
      },
      timeScale: { borderColor: isDark ? '#2d3348' : '#e5e7eb' },
      rightPriceScale: { borderColor: isDark ? '#2d3348' : '#e5e7eb' },
    })
    chartRef.current = c

    const sorted = [...chart].sort((a, b) => a.stck_bsop_date.localeCompare(b.stck_bsop_date))
    const candles = sorted.map(r => ({
      time: toTs(r.stck_bsop_date),
      open: Number(r.stck_oprc),
      high: Number(r.stck_hgpr),
      low: Number(r.stck_lwpr),
      close: Number(r.stck_clpr),
    }))
    const volumes = sorted.map(r => ({
      time: toTs(r.stck_bsop_date),
      value: Number(r.acml_vol),
      color: Number(r.stck_clpr) >= Number(r.stck_oprc) ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)',
    }))

    const candleSeries = c.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
      borderVisible: false,
    })
    candleSeries.setData(candles)

    const volSeries = c.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
    })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    volSeries.setData(volumes)

    const ma20 = rollingMA(candles, 20)
    const ma50 = rollingMA(candles, 50)
    if (ma20.length) {
      const s = c.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s.setData(ma20)
    }
    if (ma50.length) {
      const s = c.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      s.setData(ma50)
    }

    if (bollinger && candles.length) {
      const last = candles[candles.length - 1].time
      const first = candles[0].time
      const add = (value: number, color: string) => {
        const s = c.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
        s.setData([{ time: first, value }, { time: last, value }])
      }
      add(bollinger.upper, 'rgba(148,163,184,0.6)')
      add(bollinger.lower, 'rgba(148,163,184,0.6)')
    }

    c.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) c.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)

    return () => { ro.disconnect(); c.remove() }
  }, [stockCode, chart, bollinger])

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-border-light flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Price Chart (Candles + Volume + MA20/MA50)</h3>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          {ma?.ma20 && <span><span className="inline-block w-2 h-2 bg-amber-500 rounded-full mr-1" />MA20 {ma.ma20.toLocaleString()}</span>}
          {ma?.ma50 && <span><span className="inline-block w-2 h-2 bg-violet-500 rounded-full mr-1" />MA50 {ma.ma50.toLocaleString()}</span>}
        </div>
      </div>
      <div className="p-[18px]" ref={containerRef} />
    </div>
  )
}
