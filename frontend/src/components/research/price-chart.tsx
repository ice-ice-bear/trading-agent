import { useEffect, useRef } from 'react'
import { createChart, type IChartApi } from 'lightweight-charts'

interface PriceChartProps {
  stockCode: string
}

export default function PriceChart({ stockCode }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 240,
      layout: {
        background: { color: 'transparent' },
        textColor: isDark ? '#94a3b8' : '#64748b',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
      },
      timeScale: { borderColor: isDark ? '#2d3348' : '#e5e7eb' },
      rightPriceScale: { borderColor: isDark ? '#2d3348' : '#e5e7eb' },
    })
    chartRef.current = chart

    const series = chart.addAreaSeries({
      lineColor: '#4f46e5',
      topColor: 'rgba(79, 70, 229, 0.15)',
      bottomColor: 'rgba(79, 70, 229, 0)',
      lineWidth: 2,
    })

    // Placeholder data — in production, fetch from API
    const now = Math.floor(Date.now() / 1000)
    const data = Array.from({ length: 30 }, (_, i) => ({
      time: (now - (30 - i) * 86400) as unknown as string,
      value: 70000 + Math.random() * 5000,
    }))
    series.setData(data)
    chart.timeScale().fitContent()

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [stockCode])

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-border-light">
        <h3 className="text-[13px] font-bold uppercase tracking-wider">Price Chart</h3>
      </div>
      <div className="p-[18px]" ref={containerRef} />
    </div>
  )
}
