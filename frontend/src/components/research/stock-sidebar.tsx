import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { WatchlistItem, SearchResult } from '@/types'
import { getWatchlist, addToWatchlist, removeFromWatchlist, searchStocks } from '@/services/api'

interface StockSidebarProps {
  selectedCode: string | null
  onSelect: (code: string, name: string) => void
}

export default function StockSidebar({ selectedCode, onSelect }: StockSidebarProps) {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const refresh = () => getWatchlist().then(d => setItems(d.items)).catch(() => {})

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const q = search.trim()
    if (q.length < 1) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      searchStocks(q)
        .then(r => setResults(r.results))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const pickStock = async (code: string, name: string) => {
    onSelect(code, name)
    if (!items.some(it => it.stock_code === code)) {
      await addToWatchlist(code, name)
      refresh()
    }
    setSearch('')
    setResults([])
  }

  const handleRemove = async (code: string) => {
    await removeFromWatchlist(code)
    refresh()
  }

  return (
    <div className="w-[260px] shrink-0 bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="p-3 border-b border-border relative">
        <input
          className="w-full px-3 py-2 text-[13px] border border-border rounded-md bg-muted text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          placeholder="종목명 또는 코드 (예: 전자, 005930)"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search.trim().length >= 1 && (
          <div className="absolute left-3 right-3 top-[calc(100%-4px)] z-10 bg-surface border border-border rounded-md shadow-lg max-h-[280px] overflow-y-auto">
            {searching && results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">검색 중...</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">결과 없음</div>
            ) : (
              results.map(r => (
                <button
                  key={r.stock_code}
                  onClick={() => pickStock(r.stock_code, r.stock_name)}
                  className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-2 border-b border-border-light last:border-0"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{r.stock_name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{r.stock_code}</div>
                  </div>
                  {r.market && <span className="text-[10px] text-muted-foreground shrink-0">{r.market}</span>}
                </button>
              ))
            )}
          </div>
        )}
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
