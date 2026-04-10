import { useEffect, useState } from 'react'
import type { Report } from '@/types'
import { getReports } from '@/services/api'
import ReportList from './report-list'
import ReportReader from './report-reader'

export default function ReportsView() {
  const [reports, setReports] = useState<Report[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const type = filter === 'all' ? undefined : filter
    getReports(type, 50).then(d => {
      setReports(d.reports)
      if (d.reports.length > 0 && !selectedId) setSelectedId(d.reports[0].id)
    }).catch(() => {})
  }, [filter])

  const selected = reports.find(r => r.id === selectedId)

  return (
    <div>
      <h2 className="text-xl font-bold mb-5">Reports</h2>
      <div className="flex gap-5 h-[calc(100vh-140px)]">
        <ReportList reports={reports} selectedId={selectedId} onSelect={setSelectedId} filter={filter} onFilterChange={setFilter} />
        {selected ? (
          <ReportReader report={selected} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a report</div>
        )}
      </div>
    </div>
  )
}
