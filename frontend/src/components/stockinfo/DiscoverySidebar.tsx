import { useState, useEffect, useCallback } from 'react';
import { searchStocks, getMarketRanks } from '../../services/api';
import type { SearchResult, MarketRanks } from '../../types';

interface DiscoverySidebarProps {
  onSelectStock: (code: string, name: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

type TabKey = 'volume' | 'fluctuation' | 'sector';

export default function DiscoverySidebar({ onSelectStock, collapsed, onToggle }: DiscoverySidebarProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [ranks, setRanks] = useState<MarketRanks | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('volume');

  // Fetch ranks on mount and every 5 minutes
  const fetchRanks = useCallback(() => {
    getMarketRanks().then(setRanks).catch(console.error);
  }, []);

  useEffect(() => {
    fetchRanks();
    const interval = setInterval(fetchRanks, 300000);
    return () => clearInterval(interval);
  }, [fetchRanks]);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      // Use functional updates via setTimeout to avoid sync setState in effect
      const t = setTimeout(() => { setSearchResults([]); setSearching(false); }, 0);
      return () => clearTimeout(t);
    }
    const timer = setTimeout(() => {
      setSearching(true);
      searchStocks(query)
        .then(res => setSearchResults(res.results))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (collapsed) {
    return (
      <div className="discovery-sidebar collapsed">
        <button className="sidebar-toggle" onClick={onToggle} title="사이드바 펼치기">▶</button>
      </div>
    );
  }

  const currentList = activeTab === 'volume'
    ? ranks?.volume_rank ?? []
    : ranks?.fluctuation_rank ?? [];

  return (
    <div className="discovery-sidebar">
      {/* Search */}
      <div className="sidebar-search">
        <input
          className="sidebar-search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="종목명 또는 코드..."
        />
      </div>

      {/* Search results dropdown */}
      {query.length >= 2 && (
        <div className="search-results">
          {searching ? (
            <div className="search-item text-muted">검색 중...</div>
          ) : searchResults.length > 0 ? (
            searchResults.map(r => (
              <div
                key={r.stock_code}
                className="search-item"
                onClick={() => { onSelectStock(r.stock_code, r.stock_name); setQuery(''); }}
              >
                <span className="search-name">{r.stock_name}</span>
                <span className="search-code">{r.stock_code}</span>
              </div>
            ))
          ) : (
            <div className="search-item text-muted">검색 결과 없음</div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="sidebar-tabs">
        {(['volume', 'fluctuation'] as TabKey[]).map(tab => (
          <button
            key={tab}
            className={`sidebar-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'volume' ? '거래량↑' : '등락률↑'}
          </button>
        ))}
      </div>

      {/* Rank list */}
      <div className="sidebar-rank-list">
        {currentList.map((item, i) => {
          const code = String(item.mksc_shrn_iscd || item.stck_shrn_iscd || item.stock_code || '');
          const name = String(item.hts_kor_isnm || item.stock_name || code);
          const pct = Number(item.prdy_ctrt || item.change_pct || 0);
          return (
            <div
              key={code + i}
              className="rank-item"
              onClick={() => onSelectStock(code, name)}
            >
              <span className="rank-name">{name} <span className="rank-code">{code}</span></span>
              <span className={`rank-change ${pct > 0 ? 'positive' : pct < 0 ? 'negative' : ''}`}>
                {pct > 0 ? '+' : ''}{pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Collapse toggle */}
      <div className="sidebar-collapse">
        <button className="sidebar-toggle" onClick={onToggle}>◀ 접기</button>
      </div>
    </div>
  );
}
