import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { WatchlistItem } from '@/types'
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '@/services/api'

interface StockSidebarProps {
  selectedCode: string | null
  onSelect: (code: string, name: string) => void
}

export default function StockSidebar({ selectedCode, onSelect }: StockSidebarProps) {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    getWatchlist().then(d => setItems(d.items)).catch(() => {})
  }, [])

  const handleAdd = async () => {
    if (!search.trim()) return
    await addToWatchlist(search.trim())
    setSearch('')
    getWatchlist().then(d => setItems(d.items)).catch(() => {})
  }

  const handleRemove = async (code: string) => {
    await removeFromWatchlist(code)
    getWatchlist().then(d => setItems(d.items)).catch(() => {})
  }

  return (
    <div className="w-[260px] shrink-0 bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="flex gap-1.5">
          <input
            className="flex-1 px-3 py-2 text-[13px] border border-border rounded-md bg-muted text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            placeholder="Search stocks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            className="px-2.5 py-2 text-xs font-bold bg-primary text-white rounded-md hover:bg-primary/90"
          >+</button>
        </div>
      </div>
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Watchlist</div>
      <div className="flex-1 overflow-y-auto px-1">
        {items.map(item => (
          <div
            key={item.stock_code}
            onClick={() => onSelect(item.stock_code, item.stock_name)}
            className={cn(
              'flex justify-between items-center px-3 py-2.5 rounded-md cursor-pointer transition-colors',
              selectedCode === item.stock_code ? 'bg-primary-light' : 'hover:bg-muted'
            )}
          >
            <div>
              <div className="text-[13px] font-semibold">{item.stock_name}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{item.stock_code}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(item.stock_code) }}
              className="text-muted-foreground hover:text-error text-xs"
            >&times;</button>
          </div>
        ))}
      </div>
    </div>
  )
}
