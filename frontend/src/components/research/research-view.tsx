import { useState } from 'react'
import StockSidebar from './stock-sidebar'
import StockDetail from './stock-detail'

export default function ResearchView() {
  const [selected, setSelected] = useState<{ code: string; name: string } | null>(null)

  return (
    <div className="flex gap-5 h-[calc(100vh-92px)]">
      <StockSidebar
        selectedCode={selected?.code ?? null}
        onSelect={(code, name) => setSelected({ code, name })}
      />
      {selected ? (
        <StockDetail stockCode={selected.code} stockName={selected.name} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a stock from the watchlist to view research
        </div>
      )}
    </div>
  )
}
