# Stock Info Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-driven stock research page ("Stock Info") that lets users search for stocks and view comprehensive analysis data (price, chart, technicals, fundamentals, news, DCF, peers, insider trades) in one screen.

**Architecture:** Single-page view with collapsible discovery sidebar (market rankings, sector browsing) + main research panel. Backend serves 5 new REST endpoints that aggregate existing services (market_service, dart_client, valuation_service, news_service). Frontend loads sections independently with skeleton placeholders, using hybrid caching (realtime for price, daily cache for fundamentals).

**Tech Stack:** FastAPI (backend router), React + TypeScript (frontend), existing services (market_service, dart_client, valuation_service, news_service, calendar_service, peer_service), SVG charts, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-03-30-stock-info-page-design.md`

---

## File Structure

### Backend

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/services/technical_service.py` | Create | Extract RSI/MACD/BB computation from market_scanner_indicators.py into reusable service |
| `backend/app/routers/research.py` | Create | 5 endpoints: search, price, analysis, news, ranks |
| `backend/app/main.py` | Modify | Register research router |

### Frontend

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/types.ts` | Modify | Add StockPrice, TechnicalIndicators, StockAnalysis, StockNews, MarketRanks, SearchResult types |
| `frontend/src/services/api.ts` | Modify | Add 5 research API functions |
| `frontend/src/components/stockinfo/SectionSkeleton.tsx` | Create | Reusable loading skeleton for research sections |
| `frontend/src/components/stockinfo/DiscoverySidebar.tsx` | Create | Collapsible sidebar with search + rank tabs + sector list |
| `frontend/src/components/stockinfo/ResearchHeader.tsx` | Create | Stock name + price + watchlist button |
| `frontend/src/components/stockinfo/PriceChartSection.tsx` | Create | OHLCV line chart + technical indicators display |
| `frontend/src/components/stockinfo/FundamentalsSection.tsx` | Create | Financial metrics grid with confidence grades |
| `frontend/src/components/stockinfo/InvestorFlowSection.tsx` | Create | Foreign/institutional flow bars |
| `frontend/src/components/stockinfo/NewsDisclosureSection.tsx` | Create | News list with sentiment + DART disclosures |
| `frontend/src/components/stockinfo/ValuationSection.tsx` | Create | DCF fair value + sensitivity table |
| `frontend/src/components/stockinfo/PeerSection.tsx` | Create | Peer comparison table with expand mode |
| `frontend/src/components/stockinfo/InsiderSection.tsx` | Create | Insider trade list |
| `frontend/src/components/stockinfo/SignalHistorySection.tsx` | Create | Past signal history for the stock |
| `frontend/src/components/stockinfo/ResearchPanel.tsx` | Create | Orchestrates all research sections |
| `frontend/src/components/StockInfoView.tsx` | Create | Top-level view: sidebar + research panel |
| `frontend/src/components/StockInfoView.css` | Create | Layout styles for the view |
| `frontend/src/components/IconRail.tsx` | Modify | Add Stock Info navigation button (4th position) |
| `frontend/src/App.tsx` | Modify | Register 'stockinfo' view |

---

### Task 1: Backend — technical_service.py

**Files:**
- Create: `backend/app/services/technical_service.py`
- Reference: `backend/app/agents/market_scanner_indicators.py` (existing RSI/MACD/BB code)

- [ ] **Step 1: Create technical_service.py**

This extracts the indicator calculation functions from `market_scanner_indicators.py` and re-exports them under a clean interface. We import from the existing module to avoid duplication.

```python
"""Reusable technical indicator computation for the research API.

Delegates to market_scanner_indicators for the actual math so we have
a single source of truth.
"""

from __future__ import annotations

from typing import Any

from app.agents.market_scanner_indicators import (
    calculate_bollinger_bands,
    calculate_macd,
    calculate_rsi,
    calculate_ma,
)


def compute_technicals(ohlcv_rows: list[dict]) -> dict[str, Any] | None:
    """Compute technical indicators from a list of OHLCV dicts.

    Args:
        ohlcv_rows: list of dicts with keys like
            stck_clpr (close), stck_hgpr (high), stck_lwpr (low),
            acml_vol (volume), stck_bsop_date (date).
            Rows should be sorted oldest-first.

    Returns:
        Dict with rsi, macd, bollinger, ma, volume_trend_pct or None if
        insufficient data.
    """
    if not ohlcv_rows or len(ohlcv_rows) < 26:
        return None

    closes: list[float] = []
    highs: list[float] = []
    lows: list[float] = []
    volumes: list[float] = []

    for row in ohlcv_rows:
        closes.append(float(row.get("stck_clpr", 0)))
        highs.append(float(row.get("stck_hgpr", 0)))
        lows.append(float(row.get("stck_lwpr", 0)))
        volumes.append(float(row.get("acml_vol", 0)))

    rsi = calculate_rsi(closes, 14)
    macd = calculate_macd(closes)
    bollinger = calculate_bollinger_bands(closes)
    ma20 = calculate_ma(closes, 20)
    ma50 = calculate_ma(closes, 50)
    ma200 = calculate_ma(closes, 200)

    # Volume trend: current 5-day avg vs 20-day avg
    volume_trend_pct: float | None = None
    if len(volumes) >= 20:
        avg_5 = sum(volumes[-5:]) / 5
        avg_20 = sum(volumes[-20:]) / 20
        if avg_20 > 0:
            volume_trend_pct = round((avg_5 / avg_20 - 1) * 100, 1)

    return {
        "rsi": rsi,
        "macd": macd,
        "bollinger": bollinger,
        "ma": {"ma20": ma20, "ma50": ma50, "ma200": ma200},
        "volume_trend_pct": volume_trend_pct,
    }
```

- [ ] **Step 2: Verify import works**

Run: `cd backend && uv run python -c "from app.services.technical_service import compute_technicals; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/technical_service.py
git commit -m "feat: add technical_service for reusable indicator computation"
```

---

### Task 2: Backend — research router

**Files:**
- Create: `backend/app/routers/research.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create research.py router**

```python
"""Stock research API — user-driven stock information lookup."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.services.market_service import (
    get_daily_chart,
    get_fluctuation_rank,
    get_investor_trend,
    get_stock_price,
    get_volume_rank,
)
from app.services.mcp_client import mcp_manager
from app.services.technical_service import compute_technicals

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/research", tags=["research"])

# ── simple in-memory cache for ranks (5-min TTL) ───────────────────────
_ranks_cache: dict[str, Any] = {"data": None, "ts": 0.0}
_RANKS_TTL = 300  # seconds


@router.get("/search")
async def search_stocks(q: str = Query(..., min_length=2)):
    """Search stocks by name or code via MCP find_stock_code."""
    try:
        raw = await mcp_manager.call_tool(
            "domestic_stock",
            {"api_type": "find_stock_code", "params": {"query": q}},
        )
        # raw may be text content from MCP; parse if needed
        import json as _json

        if hasattr(raw, "content"):
            text = raw.content if isinstance(raw.content, str) else raw.content[0].text
            try:
                data = _json.loads(text)
            except (_json.JSONDecodeError, TypeError):
                data = []
        elif isinstance(raw, list):
            data = raw
        elif isinstance(raw, dict):
            data = raw.get("results", raw.get("output", []))
        else:
            data = []

        results = []
        if isinstance(data, list):
            for item in data[:20]:
                if isinstance(item, dict):
                    results.append({
                        "stock_code": item.get("stock_code", item.get("code", "")),
                        "stock_name": item.get("stock_name", item.get("name", "")),
                        "market": item.get("market", ""),
                    })
        return {"results": results}
    except Exception as e:
        logger.warning(f"Stock search failed for q={q}: {e}")
        return {"results": []}


@router.get("/ranks")
async def get_market_ranks():
    """Market rankings for discovery sidebar (5-min cache)."""
    now = time.time()
    if _ranks_cache["data"] and now - _ranks_cache["ts"] < _RANKS_TTL:
        return _ranks_cache["data"]

    volume, fluctuation = await asyncio.gather(
        get_volume_rank(20),
        get_fluctuation_rank(20),
    )
    result = {"volume_rank": volume, "fluctuation_rank": fluctuation}
    _ranks_cache["data"] = result
    _ranks_cache["ts"] = now
    return result


@router.get("/{stock_code}/price")
async def get_price(stock_code: str):
    """Realtime price for a stock."""
    data = await get_stock_price(stock_code)
    if not data:
        raise HTTPException(status_code=404, detail="Price data not found")
    return data


@router.get("/{stock_code}/analysis")
async def get_analysis(stock_code: str):
    """Comprehensive analysis: chart + technicals + fundamentals + investor + insider + DCF.

    Runs all service calls in parallel via asyncio.gather.
    """
    from app.services.dart_client import dart_client
    from app.services.valuation_service import get_or_compute_dcf

    # Get price first (needed for DART PBR calculation)
    price_data = await get_stock_price(stock_code)
    current_price = float(price_data.get("stck_prpr", 0)) if price_data else 0

    chart_task = get_daily_chart(stock_code)
    dart_task = dart_client.fetch(stock_code, current_price)
    investor_task = get_investor_trend(stock_code)
    insider_task = dart_client.fetch_insider_trades(stock_code)
    dcf_task = get_or_compute_dcf(stock_code, dart_client)

    chart, dart_result, investor, insider, dcf = await asyncio.gather(
        chart_task, dart_task, investor_task, insider_task, dcf_task,
        return_exceptions=True,
    )

    # Process chart → technicals
    chart_data = chart if isinstance(chart, list) else []
    # Reverse so oldest-first for indicator calculation
    sorted_chart = list(reversed(chart_data)) if chart_data else []
    technicals = compute_technicals(sorted_chart)

    # Process DART result
    dart_dict = dart_result if isinstance(dart_result, dict) else {}
    fundamentals = dart_dict.get("financials")
    confidence_grades = dart_dict.get("confidence_grades", {})

    return {
        "chart": chart_data,
        "technicals": technicals,
        "fundamentals": fundamentals,
        "confidence_grades": confidence_grades,
        "investor_trend": investor if isinstance(investor, dict) else {},
        "insider_trades": insider if isinstance(insider, list) else [],
        "dcf": dcf if isinstance(dcf, dict) else None,
    }


@router.get("/{stock_code}/news")
async def get_news(stock_code: str, stock_name: str = Query("", description="Stock name for news search")):
    """News headlines + DART disclosures."""
    from app.services.calendar_service import fetch_dart_disclosures
    from app.services.news_service import fetch_stock_news

    search_name = stock_name or stock_code

    news_result, disclosures = await asyncio.gather(
        fetch_stock_news(search_name, stock_code),
        fetch_dart_disclosures(stock_code),
        return_exceptions=True,
    )

    return {
        "news": news_result if isinstance(news_result, dict) else {"headlines": [], "sentiment": "neutral"},
        "disclosures": disclosures if isinstance(disclosures, list) else [],
    }
```

- [ ] **Step 2: Register router in main.py**

In `backend/app/main.py`, add the import and router registration.

Add to the import line (line 7):
```python
from app.routers import agents, calendar, chat, dashboard, health, memos, peers, reports, research, settings, signals, tasks, watchlist, ws
```

Add after the memos router registration (around line 141):
```python
app.include_router(research.router)
```

- [ ] **Step 3: Verify router loads**

Run: `cd backend && ENV_FILE=../.env uv run python -c "from app.routers.research import router; print(f'{len(router.routes)} routes OK')"`
Expected: `5 routes OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/research.py backend/app/main.py
git commit -m "feat: add /api/research router with 5 endpoints"
```

---

### Task 3: Frontend — Types & API functions

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add types to types.ts**

Append these types at the end of `frontend/src/types.ts`, before any closing export (the file uses individual exports, so just append):

```typescript
// ── Stock Info / Research types ──────────────────────────────────────

export interface StockPrice {
  stck_prpr: string;       // 현재가
  prdy_vrss: string;       // 전일대비
  prdy_ctrt: string;       // 전일대비율
  stck_oprc: string;       // 시가
  stck_hgpr: string;       // 고가
  stck_lwpr: string;       // 저가
  acml_vol: string;        // 누적거래량
  [key: string]: unknown;
}

export interface TechnicalIndicators {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number; cross: string } | null;
  bollinger: { upper: number; middle: number; lower: number; bandwidth: number; position: string } | null;
  ma: { ma20: number | null; ma50: number | null; ma200: number | null };
  volume_trend_pct: number | null;
}

export interface StockAnalysis {
  chart: Record<string, string>[];
  technicals: TechnicalIndicators | null;
  fundamentals: DartFundamentals | null;
  confidence_grades: Record<string, string>;
  investor_trend: { foreign_net_buy: number; institution_net_buy: number; days?: number };
  insider_trades: InsiderTrade[];
  dcf: DCFResult | null;
}

export interface InsiderTrade {
  reporter_name: string;
  position: string;
  change_type: string;
  shares_before: number;
  shares_after: number;
  change_amount: number;
  report_date: string;
}

export interface DCFResult {
  fair_value: number;
  enterprise_value?: number;
  assumptions?: { wacc: number; growth_rate: number; terminal_growth: number };
  projected_fcf?: number[];
  sensitivity?: number[][];
  cash_flow_data?: Record<string, unknown>;
}

export interface StockNews {
  news: { headlines: string[]; sentiment: string; summary?: string; source?: string };
  disclosures: { stock_code?: string; event_type: string; event_date: string; description: string; source: string }[];
}

export interface MarketRanks {
  volume_rank: RankItem[];
  fluctuation_rank: RankItem[];
}

export interface RankItem {
  [key: string]: unknown;
}

export interface SearchResult {
  stock_code: string;
  stock_name: string;
  market: string;
}
```

- [ ] **Step 2: Add API functions to api.ts**

Append these functions at the end of `frontend/src/services/api.ts`:

```typescript
// ── Research API ─────────────────────────────────────────────────────

export async function searchStocks(query: string): Promise<{ results: import('../types').SearchResult[] }> {
  const res = await fetch(`/api/research/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function getMarketRanks(): Promise<import('../types').MarketRanks> {
  const res = await fetch('/api/research/ranks');
  if (!res.ok) throw new Error('Failed to fetch ranks');
  return res.json();
}

export async function getStockPrice(stockCode: string): Promise<import('../types').StockPrice> {
  const res = await fetch(`/api/research/${stockCode}/price`);
  if (!res.ok) throw new Error('Failed to fetch price');
  return res.json();
}

export async function getStockAnalysis(stockCode: string): Promise<import('../types').StockAnalysis> {
  const res = await fetch(`/api/research/${stockCode}/analysis`);
  if (!res.ok) throw new Error('Failed to fetch analysis');
  return res.json();
}

export async function getStockNews(stockCode: string, stockName = ''): Promise<import('../types').StockNews> {
  const params = new URLSearchParams({ stock_name: stockName });
  const res = await fetch(`/api/research/${stockCode}/news?${params}`);
  if (!res.ok) throw new Error('Failed to fetch news');
  return res.json();
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors (existing errors are OK)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/services/api.ts
git commit -m "feat: add research types and API functions"
```

---

### Task 4: Frontend — SectionSkeleton + ResearchHeader

**Files:**
- Create: `frontend/src/components/stockinfo/SectionSkeleton.tsx`
- Create: `frontend/src/components/stockinfo/ResearchHeader.tsx`

- [ ] **Step 1: Create SectionSkeleton.tsx**

```typescript
import { ReactNode } from 'react';

interface SectionSkeletonProps {
  title: string;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  children: ReactNode;
}

export default function SectionSkeleton({ title, loading, error, onRetry, children }: SectionSkeletonProps) {
  return (
    <div className="research-section">
      <div className="research-section-header">{title}</div>
      {loading ? (
        <div className="research-skeleton">
          <div className="skeleton-bar" style={{ width: '80%' }} />
          <div className="skeleton-bar" style={{ width: '60%' }} />
          <div className="skeleton-bar" style={{ width: '70%' }} />
        </div>
      ) : error ? (
        <div className="research-error">
          <span className="text-muted">{error}</span>
          {onRetry && <button className="retry-btn" onClick={onRetry}>재시도</button>}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ResearchHeader.tsx**

```typescript
import { StockPrice } from '../../types';
import { addToWatchlist } from '../../services/api';

interface ResearchHeaderProps {
  stockCode: string;
  stockName: string;
  price: StockPrice | null;
  loading: boolean;
}

export default function ResearchHeader({ stockCode, stockName, price, loading }: ResearchHeaderProps) {
  const currentPrice = price ? Number(price.stck_prpr) : 0;
  const change = price ? Number(price.prdy_vrss) : 0;
  const changePct = price ? Number(price.prdy_ctrt) : 0;
  const isPositive = change > 0;
  const isNegative = change < 0;

  const handleAddWatchlist = () => {
    addToWatchlist(stockCode, stockName).catch(console.error);
  };

  return (
    <div className="research-header">
      <div className="research-header-left">
        <span className="research-stock-name">{stockName || stockCode}</span>
        <span className="research-stock-code">{stockCode}</span>
        {loading ? (
          <span className="text-muted" style={{ marginLeft: 16 }}>로딩 중...</span>
        ) : price ? (
          <>
            <span className="research-price">₩{currentPrice.toLocaleString()}</span>
            <span className={`research-change ${isPositive ? 'positive' : isNegative ? 'negative' : ''}`}>
              {isPositive ? '▲' : isNegative ? '▼' : ''} {Math.abs(change).toLocaleString()} ({changePct > 0 ? '+' : ''}{changePct}%)
            </span>
          </>
        ) : null}
      </div>
      <div className="research-header-right">
        <button className="research-btn" onClick={handleAddWatchlist}>+ 관심종목</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
mkdir -p frontend/src/components/stockinfo
git add frontend/src/components/stockinfo/SectionSkeleton.tsx frontend/src/components/stockinfo/ResearchHeader.tsx
git commit -m "feat: add SectionSkeleton and ResearchHeader components"
```

---

### Task 5: Frontend — PriceChartSection + FundamentalsSection

**Files:**
- Create: `frontend/src/components/stockinfo/PriceChartSection.tsx`
- Create: `frontend/src/components/stockinfo/FundamentalsSection.tsx`

- [ ] **Step 1: Create PriceChartSection.tsx**

```typescript
import { TechnicalIndicators } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface PriceChartSectionProps {
  chart: Record<string, string>[] | null;
  technicals: TechnicalIndicators | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function PriceChartSection({ chart, technicals, loading, error, onRetry }: PriceChartSectionProps) {
  return (
    <SectionSkeleton title="📈 일봉 차트 + 기술적 지표" loading={loading} error={error} onRetry={onRetry}>
      <div className="chart-container">
        {chart && chart.length > 0 ? (
          <svg viewBox={`0 0 ${chart.length * 4} 200`} className="price-chart-svg" preserveAspectRatio="none">
            {(() => {
              const closes = chart.map(r => Number(r.stck_clpr || 0));
              const min = Math.min(...closes);
              const max = Math.max(...closes);
              const range = max - min || 1;
              const points = closes.map((c, i) =>
                `${i * 4},${200 - ((c - min) / range) * 180 - 10}`
              ).join(' ');
              return <polyline points={points} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" />;
            })()}
          </svg>
        ) : (
          <div className="text-muted" style={{ padding: 20, textAlign: 'center' }}>차트 데이터 없음</div>
        )}
      </div>
      {technicals && (
        <div className="technicals-row">
          <div className="tech-item">
            <span className="tech-label">RSI (14)</span>
            <span className={`tech-value ${(technicals.rsi ?? 50) > 70 ? 'negative' : (technicals.rsi ?? 50) < 30 ? 'positive' : ''}`}>
              {technicals.rsi?.toFixed(1) ?? '—'}
            </span>
          </div>
          <div className="tech-item">
            <span className="tech-label">MACD</span>
            <span className={`tech-value ${(technicals.macd?.histogram ?? 0) > 0 ? 'positive' : 'negative'}`}>
              {technicals.macd?.macd.toFixed(0) ?? '—'}
            </span>
          </div>
          <div className="tech-item">
            <span className="tech-label">볼린저</span>
            <span className="tech-value">{technicals.bollinger?.position ?? '—'}</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">거래량 추세</span>
            <span className={`tech-value ${(technicals.volume_trend_pct ?? 0) > 0 ? 'positive' : 'negative'}`}>
              {technicals.volume_trend_pct != null ? `${technicals.volume_trend_pct > 0 ? '+' : ''}${technicals.volume_trend_pct}%` : '—'}
            </span>
          </div>
        </div>
      )}
    </SectionSkeleton>
  );
}
```

- [ ] **Step 2: Create FundamentalsSection.tsx**

```typescript
import { DartFundamentals } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface FundamentalsSectionProps {
  fundamentals: DartFundamentals | null;
  confidenceGrades: Record<string, string>;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const TILES = [
  { label: 'PER', field: 'dart_per' as const, format: (v: number) => `${v.toFixed(1)}x` },
  { label: 'PBR', field: 'dart_pbr' as const, format: (v: number) => `${v.toFixed(2)}x` },
  { label: 'EPS YoY', field: 'dart_eps_yoy_pct' as const, format: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%` },
  { label: '부채비율', field: 'dart_debt_ratio' as const, format: (v: number) => `${v.toFixed(0)}%` },
  { label: '영업이익률', field: 'dart_operating_margin' as const, format: (v: number) => `${v.toFixed(1)}%` },
  { label: '배당수익률', field: 'dart_dividend_yield' as const, format: (v: number) => `${v.toFixed(1)}%` },
];

function gradeColor(grade: string): string {
  if (grade === 'A') return 'var(--color-success)';
  if (grade === 'B') return 'var(--color-primary)';
  if (grade === 'C') return 'var(--color-warning)';
  return 'var(--color-muted)';
}

export default function FundamentalsSection({ fundamentals, confidenceGrades, loading, error, onRetry }: FundamentalsSectionProps) {
  return (
    <SectionSkeleton title="📋 재무지표" loading={loading} error={error} onRetry={onRetry}>
      {fundamentals ? (
        <div className="fundamentals-grid">
          {TILES.map(({ label, field, format }) => {
            const val = fundamentals[field];
            const grade = confidenceGrades[field] || 'D';
            return (
              <div className="fundamental-tile" key={label}>
                <div className="fund-label">{label}</div>
                <div className="fund-value">{val != null ? format(val) : '—'}</div>
                <span className="fund-grade" style={{ color: gradeColor(grade) }}>{grade}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-muted">재무 데이터 없음</div>
      )}
    </SectionSkeleton>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/stockinfo/PriceChartSection.tsx frontend/src/components/stockinfo/FundamentalsSection.tsx
git commit -m "feat: add PriceChartSection and FundamentalsSection"
```

---

### Task 6: Frontend — InvestorFlowSection + NewsDisclosureSection

**Files:**
- Create: `frontend/src/components/stockinfo/InvestorFlowSection.tsx`
- Create: `frontend/src/components/stockinfo/NewsDisclosureSection.tsx`

- [ ] **Step 1: Create InvestorFlowSection.tsx**

```typescript
import SectionSkeleton from './SectionSkeleton';

interface InvestorFlowSectionProps {
  investorTrend: { foreign_net_buy: number; institution_net_buy: number; days?: number } | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function formatBillion(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 100000000) return `${(val / 100000000).toFixed(0)}억`;
  if (abs >= 10000) return `${(val / 10000).toFixed(0)}만`;
  return val.toLocaleString();
}

export default function InvestorFlowSection({ investorTrend, loading, error, onRetry }: InvestorFlowSectionProps) {
  return (
    <SectionSkeleton title={`📊 수급 동향 (${investorTrend?.days ?? 20}일)`} loading={loading} error={error} onRetry={onRetry}>
      {investorTrend ? (
        <div className="investor-flow-row">
          <div className="flow-item">
            <div className="flow-label">외국인</div>
            <div className={`flow-value ${investorTrend.foreign_net_buy > 0 ? 'positive' : 'negative'}`}>
              {investorTrend.foreign_net_buy > 0 ? '+' : ''}{formatBillion(investorTrend.foreign_net_buy)}주
            </div>
          </div>
          <div className="flow-item">
            <div className="flow-label">기관</div>
            <div className={`flow-value ${investorTrend.institution_net_buy > 0 ? 'positive' : 'negative'}`}>
              {investorTrend.institution_net_buy > 0 ? '+' : ''}{formatBillion(investorTrend.institution_net_buy)}주
            </div>
          </div>
        </div>
      ) : (
        <div className="text-muted">수급 데이터 없음</div>
      )}
    </SectionSkeleton>
  );
}
```

- [ ] **Step 2: Create NewsDisclosureSection.tsx**

```typescript
import { StockNews } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface NewsDisclosureSectionProps {
  newsData: StockNews | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function sentimentBadge(sentiment: string) {
  const map: Record<string, { label: string; cls: string }> = {
    positive: { label: '긍정', cls: 'badge-positive' },
    negative: { label: '부정', cls: 'badge-negative' },
    neutral: { label: '중립', cls: 'badge-neutral' },
  };
  const s = map[sentiment] || map.neutral;
  return <span className={`news-badge ${s.cls}`}>{s.label}</span>;
}

export default function NewsDisclosureSection({ newsData, loading, error, onRetry }: NewsDisclosureSectionProps) {
  const headlines = newsData?.news?.headlines ?? [];
  const sentiment = newsData?.news?.sentiment ?? 'neutral';
  const disclosures = newsData?.disclosures ?? [];

  return (
    <SectionSkeleton title="📰 뉴스 & 공시" loading={loading} error={error} onRetry={onRetry}>
      <div className="news-disclosure-container">
        <div className="news-list">
          <div className="news-sentiment-header">
            종합 감성: {sentimentBadge(sentiment)}
          </div>
          {headlines.length > 0 ? (
            headlines.map((title, i) => (
              <div className="news-item" key={i}>{title}</div>
            ))
          ) : (
            <div className="text-muted">뉴스 없음</div>
          )}
        </div>
        {disclosures.length > 0 && (
          <div className="disclosure-list">
            <div className="disclosure-header">DART 공시</div>
            {disclosures.map((d, i) => (
              <div className="disclosure-item" key={i}>
                <span className="disclosure-date">{d.event_date}</span>
                <span className="disclosure-desc">{d.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionSkeleton>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/stockinfo/InvestorFlowSection.tsx frontend/src/components/stockinfo/NewsDisclosureSection.tsx
git commit -m "feat: add InvestorFlowSection and NewsDisclosureSection"
```

---

### Task 7: Frontend — ValuationSection + PeerSection + InsiderSection + SignalHistorySection

**Files:**
- Create: `frontend/src/components/stockinfo/ValuationSection.tsx`
- Create: `frontend/src/components/stockinfo/PeerSection.tsx`
- Create: `frontend/src/components/stockinfo/InsiderSection.tsx`
- Create: `frontend/src/components/stockinfo/SignalHistorySection.tsx`

- [ ] **Step 1: Create ValuationSection.tsx**

```typescript
import { DCFResult } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface ValuationSectionProps {
  dcf: DCFResult | null;
  currentPrice: number;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function ValuationSection({ dcf, currentPrice, loading, error, onRetry }: ValuationSectionProps) {
  const upside = dcf && currentPrice > 0 ? ((dcf.fair_value / currentPrice - 1) * 100) : null;

  return (
    <SectionSkeleton title="💰 DCF 적정가" loading={loading} error={error} onRetry={onRetry}>
      {dcf ? (
        <div className="valuation-container">
          <div className="valuation-summary">
            <span className="valuation-fair-value">₩{dcf.fair_value.toLocaleString()}</span>
            {upside != null && (
              <span className={`valuation-upside ${upside > 0 ? 'positive' : 'negative'}`}>
                {upside > 0 ? '▲' : '▼'} {Math.abs(upside).toFixed(1)}%
              </span>
            )}
          </div>
          {dcf.sensitivity && dcf.sensitivity.length > 0 && (
            <table className="sensitivity-table">
              <thead>
                <tr>
                  <th></th>
                  <th>G=2%</th>
                  <th>G=3%</th>
                  <th>G=5%</th>
                </tr>
              </thead>
              <tbody>
                {['WACC 8%', 'WACC 10%', 'WACC 12%'].map((label, ri) => (
                  <tr key={label}>
                    <td className="sensitivity-label">{label}</td>
                    {(dcf.sensitivity![ri] || []).map((val, ci) => {
                      const cellUpside = val && currentPrice > 0 ? ((val / currentPrice - 1) * 100) : 0;
                      return (
                        <td key={ci} className={cellUpside > 5 ? 'positive' : cellUpside < -5 ? 'negative' : ''}>
                          {val ? `₩${val.toLocaleString()}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="text-muted">DCF 데이터 없음</div>
      )}
    </SectionSkeleton>
  );
}
```

- [ ] **Step 2: Create PeerSection.tsx**

```typescript
import { useState, useEffect } from 'react';
import { getPeerComparison } from '../../services/api';
import SectionSkeleton from './SectionSkeleton';

interface PeerSectionProps {
  stockCode: string;
}

export default function PeerSection({ stockCode }: PeerSectionProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    getPeerComparison(stockCode)
      .then(setData)
      .catch(() => setError('동종업종 데이터를 불러올 수 없습니다'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [stockCode]);

  const peers = (data as { peers?: Record<string, unknown>[] })?.peers ?? [];
  const target = (data as { target?: Record<string, unknown> })?.target;
  const sector = (data as { sector?: string })?.sector ?? '';

  return (
    <SectionSkeleton title={`🏢 동종업종 비교${sector ? ` — ${sector}` : ''}`} loading={loading} error={error} onRetry={fetchData}>
      <div className="peer-container">
        <div className="peer-header-row">
          <button className="research-btn-sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? '축소' : '전체 보기'}
          </button>
        </div>
        <table className="peer-table">
          <thead>
            <tr>
              <th>종목</th>
              <th>PER</th>
              <th>PBR</th>
              {expanded && <th>영업이익률</th>}
              {expanded && <th>부채비율</th>}
            </tr>
          </thead>
          <tbody>
            {target && (
              <tr className="peer-target-row">
                <td>{(target as { name?: string }).name}</td>
                <td>{(target as { per?: number }).per?.toFixed(1) ?? '—'}x</td>
                <td>{(target as { pbr?: number }).pbr?.toFixed(2) ?? '—'}x</td>
                {expanded && <td>—</td>}
                {expanded && <td>—</td>}
              </tr>
            )}
            {(expanded ? peers : peers.slice(0, 3)).map((p, i) => (
              <tr key={i}>
                <td>{(p as { name?: string }).name}</td>
                <td>{(p as { per?: number }).per?.toFixed(1) ?? '—'}x</td>
                <td>{(p as { pbr?: number }).pbr?.toFixed(2) ?? '—'}x</td>
                {expanded && <td>—</td>}
                {expanded && <td>—</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionSkeleton>
  );
}
```

- [ ] **Step 3: Create InsiderSection.tsx**

```typescript
import { InsiderTrade } from '../../types';
import SectionSkeleton from './SectionSkeleton';

interface InsiderSectionProps {
  insiderTrades: InsiderTrade[] | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function InsiderSection({ insiderTrades, loading, error, onRetry }: InsiderSectionProps) {
  return (
    <SectionSkeleton title="👤 내부자 거래" loading={loading} error={error} onRetry={onRetry}>
      {insiderTrades && insiderTrades.length > 0 ? (
        <div className="insider-list">
          {insiderTrades.map((t, i) => (
            <div className="insider-item" key={i}>
              <span className="insider-name">{t.reporter_name} ({t.position || '임원'})</span>
              <span className={`insider-change ${t.change_amount > 0 ? 'positive' : 'negative'}`}>
                {t.change_amount > 0 ? '+' : ''}{t.change_amount.toLocaleString()}주
              </span>
              <span className="insider-date">{t.report_date}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted">내부자 거래 내역 없음</div>
      )}
    </SectionSkeleton>
  );
}
```

- [ ] **Step 4: Create SignalHistorySection.tsx**

```typescript
import { useState, useEffect } from 'react';
import { getSignalHistory } from '../../services/api';
import SectionSkeleton from './SectionSkeleton';

interface SignalHistorySectionProps {
  stockCode: string;
}

export default function SignalHistorySection({ stockCode }: SignalHistorySectionProps) {
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    getSignalHistory(stockCode)
      .then(res => setHistory(res.history || []))
      .catch(() => setError('신호 이력을 불러올 수 없습니다'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [stockCode]);

  return (
    <SectionSkeleton title="📊 과거 매매신호" loading={loading} error={error} onRetry={fetchData}>
      {history.length > 0 ? (
        <table className="signal-history-table">
          <thead>
            <tr><th>일시</th><th>방향</th><th>R/R</th><th>상태</th></tr>
          </thead>
          <tbody>
            {history.map((s, i) => (
              <tr key={i}>
                <td>{String(s.timestamp ?? s.snapshot_date ?? '').slice(0, 10)}</td>
                <td>
                  <span className={`badge ${s.direction === 'buy' ? 'badge-long' : s.direction === 'sell' ? 'badge-short' : 'badge-neutral'}`}>
                    {String(s.direction ?? '').toUpperCase()}
                  </span>
                </td>
                <td>{s.rr_score != null ? Number(s.rr_score).toFixed(1) : '—'}</td>
                <td>{String(s.status ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-muted">매매신호 이력 없음</div>
      )}
    </SectionSkeleton>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/stockinfo/ValuationSection.tsx frontend/src/components/stockinfo/PeerSection.tsx frontend/src/components/stockinfo/InsiderSection.tsx frontend/src/components/stockinfo/SignalHistorySection.tsx
git commit -m "feat: add ValuationSection, PeerSection, InsiderSection, SignalHistorySection"
```

---

### Task 8: Frontend — DiscoverySidebar

**Files:**
- Create: `frontend/src/components/stockinfo/DiscoverySidebar.tsx`

- [ ] **Step 1: Create DiscoverySidebar.tsx**

```typescript
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
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/stockinfo/DiscoverySidebar.tsx
git commit -m "feat: add DiscoverySidebar with search and market ranks"
```

---

### Task 9: Frontend — ResearchPanel + StockInfoView + CSS

**Files:**
- Create: `frontend/src/components/stockinfo/ResearchPanel.tsx`
- Create: `frontend/src/components/StockInfoView.tsx`
- Create: `frontend/src/components/StockInfoView.css`

- [ ] **Step 1: Create ResearchPanel.tsx**

```typescript
import { useState, useEffect } from 'react';
import { getStockPrice, getStockAnalysis, getStockNews } from '../../services/api';
import type { StockPrice, StockAnalysis, StockNews } from '../../types';
import ResearchHeader from './ResearchHeader';
import PriceChartSection from './PriceChartSection';
import FundamentalsSection from './FundamentalsSection';
import InvestorFlowSection from './InvestorFlowSection';
import NewsDisclosureSection from './NewsDisclosureSection';
import ValuationSection from './ValuationSection';
import PeerSection from './PeerSection';
import InsiderSection from './InsiderSection';
import SignalHistorySection from './SignalHistorySection';

interface ResearchPanelProps {
  stockCode: string | null;
  stockName: string;
}

export default function ResearchPanel({ stockCode, stockName }: ResearchPanelProps) {
  const [price, setPrice] = useState<StockPrice | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [news, setNews] = useState<StockNews | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  useEffect(() => {
    if (!stockCode) return;

    // Reset all state
    setPrice(null);
    setAnalysis(null);
    setNews(null);
    setAnalysisError(null);
    setNewsError(null);

    // Phase 1: fire all requests in parallel
    setPriceLoading(true);
    getStockPrice(stockCode)
      .then(setPrice)
      .catch(() => {})
      .finally(() => setPriceLoading(false));

    setAnalysisLoading(true);
    getStockAnalysis(stockCode)
      .then(setAnalysis)
      .catch(() => setAnalysisError('분석 데이터를 불러올 수 없습니다'))
      .finally(() => setAnalysisLoading(false));

    setNewsLoading(true);
    getStockNews(stockCode, stockName)
      .then(setNews)
      .catch(() => setNewsError('뉴스를 불러올 수 없습니다'))
      .finally(() => setNewsLoading(false));
  }, [stockCode, stockName]);

  if (!stockCode) {
    return (
      <div className="research-panel-empty">
        <div className="empty-icon">📊</div>
        <div className="empty-title">종목을 선택해주세요</div>
        <div className="empty-desc">좌측에서 종목을 검색하거나 랭킹에서 선택하세요</div>
      </div>
    );
  }

  const currentPrice = price ? Number(price.stck_prpr) : 0;

  return (
    <div className="research-panel">
      <ResearchHeader stockCode={stockCode} stockName={stockName} price={price} loading={priceLoading} />

      <div className="research-grid">
        <div className="research-main-col">
          <PriceChartSection
            chart={analysis?.chart ?? null}
            technicals={analysis?.technicals ?? null}
            loading={analysisLoading}
            error={analysisError}
            onRetry={() => { setAnalysisLoading(true); setAnalysisError(null); getStockAnalysis(stockCode).then(setAnalysis).catch(() => setAnalysisError('재시도 실패')).finally(() => setAnalysisLoading(false)); }}
          />
          <NewsDisclosureSection newsData={news} loading={newsLoading} error={newsError} onRetry={() => { setNewsLoading(true); setNewsError(null); getStockNews(stockCode, stockName).then(setNews).catch(() => setNewsError('재시도 실패')).finally(() => setNewsLoading(false)); }} />
        </div>

        <div className="research-side-col">
          <FundamentalsSection
            fundamentals={analysis?.fundamentals ?? null}
            confidenceGrades={analysis?.confidence_grades ?? {}}
            loading={analysisLoading}
            error={analysisError}
          />
          <ValuationSection dcf={analysis?.dcf ?? null} currentPrice={currentPrice} loading={analysisLoading} error={analysisError} />
          <InvestorFlowSection investorTrend={analysis?.investor_trend ?? null} loading={analysisLoading} error={analysisError} />
        </div>
      </div>

      <div className="research-bottom-row">
        <PeerSection stockCode={stockCode} />
        <InsiderSection insiderTrades={analysis?.insider_trades ?? null} loading={analysisLoading} error={analysisError} />
        <SignalHistorySection stockCode={stockCode} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create StockInfoView.tsx**

```typescript
import { useState } from 'react';
import DiscoverySidebar from './stockinfo/DiscoverySidebar';
import ResearchPanel from './stockinfo/ResearchPanel';
import './StockInfoView.css';

export default function StockInfoView() {
  const [selectedStock, setSelectedStock] = useState<{ code: string; name: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleSelectStock = (code: string, name: string) => {
    setSelectedStock({ code, name });
  };

  return (
    <div className={`stockinfo-view ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <DiscoverySidebar
        onSelectStock={handleSelectStock}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <ResearchPanel
        stockCode={selectedStock?.code ?? null}
        stockName={selectedStock?.name ?? ''}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create StockInfoView.css**

```css
/* ── StockInfoView Layout ─────────────────────────────────────────── */
.stockinfo-view {
  display: flex;
  height: 100%;
  gap: var(--space-3);
  overflow: hidden;
}

/* ── Discovery Sidebar ────────────────────────────────────────────── */
.discovery-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  overflow-y: auto;
}
.discovery-sidebar.collapsed {
  width: 36px;
  align-items: center;
  padding-top: var(--space-2);
}
.sidebar-search-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-sm);
}
.sidebar-search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}
.search-results {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  max-height: 200px;
  overflow-y: auto;
}
.search-item {
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
}
.search-item:hover { background: var(--bg-hover); }
.search-name { color: var(--text-primary); }
.search-code { color: var(--text-muted); font-family: var(--font-mono); }
.sidebar-tabs {
  display: flex;
  gap: 2px;
}
.sidebar-tab {
  flex: 1;
  padding: var(--space-1) var(--space-2);
  background: var(--bg-secondary);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
}
.sidebar-tab.active {
  background: var(--color-primary);
  color: white;
}
.sidebar-rank-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rank-item {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-sm);
  background: var(--bg-secondary);
}
.rank-item:hover { background: var(--bg-hover); }
.rank-name { color: var(--text-secondary); }
.rank-code { color: var(--text-muted); font-size: var(--text-xs); margin-left: 4px; }
.rank-change { font-size: var(--text-sm); }
.rank-change.positive { color: var(--color-success); }
.rank-change.negative { color: var(--color-error); }
.sidebar-collapse {
  text-align: center;
  padding: var(--space-1) 0;
}
.sidebar-toggle {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--text-xs);
}

/* ── Research Panel ───────────────────────────────────────────────── */
.research-panel {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.research-panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--text-muted);
}
.empty-icon { font-size: 48px; opacity: 0.3; }
.empty-title { font-size: var(--text-lg); color: var(--text-secondary); }
.empty-desc { font-size: var(--text-sm); }

/* Research Header */
.research-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}
.research-header-left { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
.research-stock-name { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
.research-stock-code { font-size: var(--text-sm); color: var(--text-muted); font-family: var(--font-mono); }
.research-price { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin-left: var(--space-3); }
.research-change { font-size: var(--text-sm); }
.research-change.positive { color: var(--color-success); }
.research-change.negative { color: var(--color-error); }
.research-btn {
  padding: var(--space-1) var(--space-3);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--text-xs);
}
.research-btn:hover { background: var(--bg-hover); }
.research-btn-sm {
  padding: 2px var(--space-2);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--text-xs);
}

/* Research Grid */
.research-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-3);
}
.research-main-col, .research-side-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.research-bottom-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-3);
}

/* Section shared */
.research-section {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}
.research-section-header {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin-bottom: var(--space-2);
}

/* Skeleton */
.research-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.skeleton-bar {
  height: 12px;
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.research-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.retry-btn {
  padding: 2px var(--space-2);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-xs);
}

/* Chart */
.chart-container { overflow: hidden; }
.price-chart-svg { width: 100%; height: 160px; }
.technicals-row {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-2);
}
.tech-item { display: flex; gap: var(--space-1); align-items: baseline; }
.tech-label { font-size: var(--text-xs); color: var(--text-muted); }
.tech-value { font-size: var(--text-sm); color: var(--text-secondary); }
.tech-value.positive { color: var(--color-success); }
.tech-value.negative { color: var(--color-error); }

/* Fundamentals */
.fundamentals-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}
.fundamental-tile {
  background: var(--bg-primary);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
}
.fund-label { font-size: var(--text-xs); color: var(--text-muted); }
.fund-value { font-size: var(--text-md); color: var(--text-primary); font-weight: 600; }
.fund-grade { font-size: var(--text-xs); margin-left: var(--space-1); }

/* Investor flow */
.investor-flow-row { display: flex; gap: var(--space-4); }
.flow-item { flex: 1; }
.flow-label { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 2px; }
.flow-value { font-size: var(--text-md); font-weight: 600; }
.flow-value.positive { color: var(--color-success); }
.flow-value.negative { color: var(--color-error); }

/* News */
.news-disclosure-container { display: flex; flex-direction: column; gap: var(--space-3); }
.news-sentiment-header { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-1); }
.news-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}
.badge-positive { background: rgba(22, 163, 74, 0.15); color: var(--color-success); }
.badge-negative { background: rgba(239, 68, 68, 0.15); color: var(--color-error); }
.badge-neutral { background: rgba(107, 114, 128, 0.15); color: var(--text-muted); }
.news-item {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--border-color);
}
.disclosure-header { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-1); font-weight: 600; }
.disclosure-item { display: flex; gap: var(--space-2); font-size: var(--text-sm); padding: var(--space-1) 0; }
.disclosure-date { color: var(--text-muted); white-space: nowrap; }
.disclosure-desc { color: var(--text-secondary); }

/* Valuation */
.valuation-container { display: flex; flex-direction: column; gap: var(--space-2); }
.valuation-summary { display: flex; align-items: baseline; gap: var(--space-2); }
.valuation-fair-value { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); }
.valuation-upside { font-size: var(--text-sm); }
.valuation-upside.positive { color: var(--color-success); }
.valuation-upside.negative { color: var(--color-error); }
.sensitivity-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
}
.sensitivity-table th, .sensitivity-table td {
  padding: var(--space-1);
  text-align: center;
  color: var(--text-secondary);
}
.sensitivity-table th { color: var(--text-muted); }
.sensitivity-label { text-align: left; color: var(--text-muted); }

/* Peers */
.peer-container { display: flex; flex-direction: column; gap: var(--space-2); }
.peer-header-row { display: flex; justify-content: flex-end; }
.peer-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.peer-table th, .peer-table td {
  padding: var(--space-1) var(--space-2);
  text-align: right;
  color: var(--text-secondary);
}
.peer-table th { color: var(--text-muted); font-size: var(--text-xs); }
.peer-table td:first-child, .peer-table th:first-child { text-align: left; }
.peer-target-row { background: rgba(79, 70, 229, 0.08); }

/* Insider */
.insider-list { display: flex; flex-direction: column; gap: var(--space-1); }
.insider-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-sm);
  gap: var(--space-2);
}
.insider-name { color: var(--text-secondary); }
.insider-change { font-weight: 600; }
.insider-change.positive { color: var(--color-success); }
.insider-change.negative { color: var(--color-error); }
.insider-date { color: var(--text-muted); font-size: var(--text-xs); }

/* Signal history */
.signal-history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.signal-history-table th, .signal-history-table td {
  padding: var(--space-1) var(--space-2);
  text-align: left;
  color: var(--text-secondary);
}
.signal-history-table th { color: var(--text-muted); font-size: var(--text-xs); }

/* Shared */
.text-muted { color: var(--text-muted); font-size: var(--text-sm); }
.positive { color: var(--color-success); }
.negative { color: var(--color-error); }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/stockinfo/ResearchPanel.tsx frontend/src/components/StockInfoView.tsx frontend/src/components/StockInfoView.css
git commit -m "feat: add ResearchPanel and StockInfoView with full layout"
```

---

### Task 10: Frontend — Wire into App.tsx + IconRail

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/IconRail.tsx`

- [ ] **Step 1: Update App.tsx**

Add `'stockinfo'` to the AppView type. Find the line:
```typescript
export type AppView = 'settings' | 'dashboard' | 'agents' | 'reports';
```
Change to:
```typescript
export type AppView = 'settings' | 'dashboard' | 'agents' | 'reports' | 'stockinfo';
```

Add import at the top (near other component imports):
```typescript
import StockInfoView from './components/StockInfoView';
```

In the view rendering block, find:
```typescript
) : currentView === 'agents' ? (
    <AgentWorkflow />
  ) : null}
```
Add before the `) : null}`:
```typescript
) : currentView === 'stockinfo' ? (
    <StockInfoView />
```

- [ ] **Step 2: Update IconRail.tsx**

Find the Reports button (the last button in `icon-rail-top`). Add a new button after it, before the closing `</div>` of `icon-rail-top`:

```typescript
<button
  className={`icon-rail-btn ${currentView === 'stockinfo' ? 'active' : ''}`}
  onClick={() => onViewChange('stockinfo')}
  title="종목 정보"
>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M7 16l4-8 4 4 4-6" />
  </svg>
</button>
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/IconRail.tsx
git commit -m "feat: wire StockInfoView into app navigation"
```

---

### Task 11: Integration verification

- [ ] **Step 1: Start backend and verify research endpoints**

Run: `cd backend && ENV_FILE=../.env uv run uvicorn app.main:app --port 8001 &`
Then: `sleep 3 && curl -s http://localhost:8001/api/research/ranks | python3 -m json.tool | head -20`
Expected: JSON with `volume_rank` and `fluctuation_rank` arrays

- [ ] **Step 2: Start frontend and verify page loads**

Run: `cd frontend && npx vite --port 5174 &`
Then open http://localhost:5174 in browser.
Expected: New chart icon visible in IconRail (4th position). Clicking it shows Stock Info page with empty state "종목을 선택해주세요".

- [ ] **Step 3: Test stock search and research flow**

In the browser:
1. Type "삼성" in the sidebar search → should show search results
2. Click a result → ResearchHeader should show price, sections should load with skeletons → data
3. Click a rank item → should switch to that stock

- [ ] **Step 4: Stop test servers and commit any fixes**

```bash
kill %1 %2 2>/dev/null
```

If any fixes were needed, commit them:
```bash
git add -A && git commit -m "fix: integration fixes for StockInfoView"
```
