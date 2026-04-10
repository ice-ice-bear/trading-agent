import { useEffect, useState, useCallback } from 'react'
import type { PortfolioData } from '@/types'
import { getPortfolio } from '@/services/api'
import HeroCard from './hero-card'
import PositionsTable from './positions-table'
import PerformanceChart from './performance-chart'
import RecentOrders from './recent-orders'

export default function DashboardView() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)

  const fetchData = useCallback(async () => {
    try { setPortfolio(await getPortfolio()) } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i) }, [fetchData])

  return (
    <div>
      <HeroCard data={portfolio} />
      <PositionsTable positions={portfolio?.positions ?? []} />
      <div className="grid grid-cols-2 gap-4">
        <PerformanceChart />
        <RecentOrders />
      </div>
    </div>
  )
}
