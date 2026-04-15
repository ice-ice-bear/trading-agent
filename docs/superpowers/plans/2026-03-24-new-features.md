# 신규 기능 구현 계획 (감성 분석 제외)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레퍼런스 프로젝트(stock-analysis-agent, TradingAgents)에서 식별된 미구현 기능 10개를 추가하여 데이터 입력 폭(뉴스/매크로), 분석 깊이(DCF/피어비교), 리스크 관리(VaR/베타)를 강화한다.

**Architecture:** Phase 0(공통 인프라) → Phase 1(데이터 수집) → Phase 2(분석 에이전트) → Phase 3(고급 분석) → Phase 4(산출물) 순서로 진행. 각 Phase는 이전 Phase의 데이터를 활용한다. 기존 market_scanner 파이프라인의 data_package 확장 패턴을 따른다.

**Tech Stack:** FastAPI, Python 3.12+, anthropic SDK, SQLite, React 19, TypeScript

---

## 파일 구조

### 새로 만들 파일 (백엔드)
| 파일 | 용도 |
|------|------|
| `backend/app/services/news_service.py` | 뉴스/매크로 데이터 수집 |
| `backend/app/services/calendar_service.py` | 촉매 일정 관리 |
| `backend/app/services/peer_service.py` | 동종 업종 비교 |
| `backend/app/services/valuation_service.py` | DCF 밸류에이션 |
| `backend/app/services/portfolio_risk_service.py` | 포트폴리오 리스크 분석 |
| `backend/app/services/memo_service.py` | 투자 메모 생성 |
| `backend/app/services/signal_history_service.py` | 시그널 이력 비교 |
| `backend/app/routers/calendar.py` | 촉매 일정 API |
| `backend/app/routers/peers.py` | 피어 비교 API |
| `backend/app/routers/memos.py` | 메모 내보내기 API |

### 새로 만들 파일 (프론트엔드)
| 파일 | 용도 |
|------|------|
| `frontend/src/components/dashboard/CatalystTimeline.tsx` | 촉매 일정 타임라인 |
| `frontend/src/components/signals/PeerComparison.tsx` | 피어 비교 테이블 |
| `frontend/src/components/signals/SignalHistory.tsx` | 시그널 이력 차트 |
| `frontend/src/components/signals/ValuationView.tsx` | DCF 적정가 표시 |
| `frontend/src/components/dashboard/RiskDashboard.tsx` | VaR/베타/섹터 대시보드 |

### 수정할 파일
| 파일 | 변경 내용 |
|------|----------|
| `backend/app/models/database.py` | 신규 테이블 8개 추가 |
| `backend/app/agents/market_scanner.py` | data_package 확장 (외국인, 내부자, 뉴스, 피어) |
| `backend/app/agents/market_scanner_experts.py` | 6번째 전문가(뉴스/매크로) 추가 + 피어 데이터 주입 |
| `backend/app/agents/risk_manager.py` | VaR/베타/섹터 게이트 추가 |
| `backend/app/agents/portfolio_monitor.py` | 리스크 스냅샷 저장 추가 |
| `backend/app/agents/base.py` | AgentRole.ANALYST 추가 |
| `backend/app/services/dart_client.py` | 내부자 거래 + 현금흐름 API 추가 |
| `backend/app/services/market_service.py` | 외국인/기관 매매동향 API 추가 |
| `backend/app/main.py` | 새 라우터 등록 |
| `frontend/src/services/api.ts` | 새 API 함수 추가 |
| `frontend/src/types.ts` | 새 타입 추가 |
| `frontend/src/components/signals/SignalCard.tsx` | 새 섹션 (외국인, 내부자, 피어, DCF) |
| `frontend/src/components/DashboardView.tsx` | CatalystTimeline + RiskDashboard 통합 |

---

## Task 1: Phase 0 — DB 스키마 + AgentRole 확장

**Files:**
- Modify: `backend/app/models/database.py:160` (SCHEMA_SQL 끝에 추가)
- Modify: `backend/app/agents/base.py:16-21` (AgentRole enum)

- [ ] **Step 1: AgentRole에 ANALYST 추가**

`base.py`의 AgentRole enum에 추가:

```python
class AgentRole(str, Enum):
    MONITOR = "monitor"
    SCANNER = "scanner"
    EXECUTOR = "executor"
    RISK = "risk"
    REPORTER = "reporter"
    ANALYST = "analyst"  # NEW: 뉴스/매크로, 피어비교 에이전트용
```

- [ ] **Step 2: database.py에 신규 테이블 8개 추가**

`SCHEMA_SQL` 문자열의 `agent_events` 테이블 인덱스 뒤(159번줄 이후)에 추가:

```sql
-- Phase 1: Data Collection
CREATE TABLE IF NOT EXISTS foreign_ownership_cache (
    stock_code TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    foreign_net_buy INTEGER DEFAULT 0,
    institution_net_buy INTEGER DEFAULT 0,
    foreign_holding_pct REAL,
    cached_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (stock_code, trade_date)
);

CREATE TABLE IF NOT EXISTS insider_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT NOT NULL,
    corp_code TEXT,
    report_date TEXT,
    reporter_name TEXT,
    position TEXT,
    change_type TEXT,
    shares_before INTEGER,
    shares_after INTEGER,
    change_amount INTEGER,
    cached_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_insider_stock ON insider_trades(stock_code);

CREATE TABLE IF NOT EXISTS catalyst_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT,
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    description TEXT,
    source TEXT DEFAULT 'dart',
    impact TEXT DEFAULT 'neutral',
    cached_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalyst_date ON catalyst_events(event_date);
CREATE INDEX IF NOT EXISTS idx_catalyst_stock ON catalyst_events(stock_code);

-- Phase 2: Analysis
CREATE TABLE IF NOT EXISTS news_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT,
    title TEXT,
    summary TEXT,
    sentiment TEXT,
    source_url TEXT,
    published_at TEXT,
    cached_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_news_stock ON news_cache(stock_code);

CREATE TABLE IF NOT EXISTS signal_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT NOT NULL,
    snapshot_date TEXT DEFAULT (date('now')),
    signal_id INTEGER REFERENCES signals(id),
    direction TEXT,
    rr_score REAL,
    scenarios_json TEXT,
    expert_stances_json TEXT,
    variant_view TEXT,
    dart_fundamentals_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_snapshot_stock ON signal_snapshots(stock_code);

-- Phase 3: Advanced Analysis
CREATE TABLE IF NOT EXISTS valuation_cache (
    stock_code TEXT NOT NULL,
    cache_date TEXT NOT NULL,
    dcf_result_json TEXT,
    assumptions_json TEXT,
    PRIMARY KEY (stock_code, cache_date)
);

CREATE TABLE IF NOT EXISTS portfolio_risk_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT DEFAULT (datetime('now')),
    var_95 REAL,
    var_99 REAL,
    portfolio_beta REAL,
    sector_breakdown_json TEXT,
    correlation_matrix_json TEXT
);

-- Phase 4: Exports
CREATE TABLE IF NOT EXISTS memo_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id INTEGER REFERENCES signals(id),
    format TEXT DEFAULT 'html',
    file_path TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 3: kospi200_components에 sector 데이터 채우기**

현재 `sector` 컬럼은 존재하지만 데이터가 비어 있음. `market_service.py`의 `_fetch_kospi200_via_naver()` 함수에서 NAVER Finance 업종 정보를 함께 수집하도록 수정하거나, 별도 스크립트로 NAVER Finance에서 업종 분류를 수집하여 `kospi200_components.sector`를 채워야 함.

`market_service.py`의 `_fetch_kospi200_via_naver()` 함수(186-213번줄)에서 종목 수집 시, 각 종목의 상세 페이지에서 업종 정보를 추가로 파싱하거나, KRX 업종 분류 정적 데이터를 활용:

```python
# kospi200 upsert 시 sector도 함께 저장
await execute_insert(
    "INSERT OR REPLACE INTO kospi200_components (stock_code, stock_name, sector, updated_at) VALUES (?, ?, ?, datetime('now'))",
    (code, name, sector)
)
```

> **참고:** 이 작업은 Task 6(피어 비교)와 Task 9(섹터 집중도)의 선행 조건임. sector가 NULL이면 두 기능 모두 동작하지 않음.

- [ ] **Step 4: market_scanner.py에 metadata 변수 초기화 추가**

`_analyze_stock` 함수(173번줄)에서 DART fetch 이전에 metadata dict를 초기화하고, 최종 signal INSERT에 `metadata_json` 컬럼을 추가해야 함:

```python
# _analyze_stock 함수 초반에 추가 (data_package 구성 전)
metadata = {}

# ... 각 Task에서 metadata에 데이터 추가 ...

# 최종 signal INSERT (기존 276-304번줄)에 metadata_json 컬럼 추가:
# VALUES 절에 json.dumps(metadata, ensure_ascii=False) 추가
```

- [ ] **Step 5: 커밋**

```bash
git add backend/app/models/database.py backend/app/agents/base.py backend/app/services/market_service.py backend/app/agents/market_scanner.py
git commit -m "feat: add 8 new DB tables, ANALYST role, sector population, and metadata init"
```

---

## Task 2: 외국인/기관 보유 데이터 (Phase 1)

**Files:**
- Modify: `backend/app/services/market_service.py` (함수 추가)
- Modify: `backend/app/agents/market_scanner.py:183-207` (data_package 확장)

- [ ] **Step 1: market_service.py에 투자자 매매동향 함수 추가**

파일 끝에 추가:

**주의:** `from datetime import datetime, timedelta` import 추가 필요. MCP 호출 시 파라미터는 `"params"` 키로 감싸야 함 (기존 패턴).

```python
from datetime import datetime, timedelta

async def get_investor_trend(stock_code: str, days: int = 20) -> dict[str, Any]:
    """외국인/기관 매매동향 조회 (KIS MCP domestic_stock)"""
    try:
        raw = await mcp_manager.call_tool("domestic_stock", {
            "api_type": "inquire_investor",
            "params": {
                "fid_input_iscd": stock_code,
                "fid_input_date_1": (datetime.now() - timedelta(days=days)).strftime("%Y%m%d"),
                "fid_input_date_2": datetime.now().strftime("%Y%m%d"),
            },
        })
        data = _unwrap_mcp_response(raw)
        if not data:
            return {"foreign_net_buy": 0, "institution_net_buy": 0, "foreign_holding_pct": None}

        items = data if isinstance(data, list) else data.get("output", []) if isinstance(data, dict) else []
        foreign_total = sum(int(item.get("frgn_ntby_qty", 0)) for item in items if isinstance(item, dict))
        inst_total = sum(int(item.get("orgn_ntby_qty", 0)) for item in items if isinstance(item, dict))

        return {
            "foreign_net_buy": foreign_total,
            "institution_net_buy": inst_total,
            "foreign_holding_pct": None,  # 별도 API 필요
            "days": days,
        }
    except Exception as e:
        logger.warning(f"Investor trend fetch failed for {stock_code}: {e}")
        return {"foreign_net_buy": 0, "institution_net_buy": 0, "foreign_holding_pct": None}
```

- [ ] **Step 2: market_scanner.py의 _analyze_stock에 외국인 데이터 수집 추가**

`_analyze_stock` 함수의 DART fetch(196번줄) 이후에 추가:

```python
# Fetch foreign/institutional trend
from app.services.market_service import get_investor_trend
investor_trend = await get_investor_trend(stock_code)
```

data_package 구성(183-207번줄)에 추가:

```python
data_package["investor_trend"] = investor_trend
```

- [ ] **Step 3: 외국인 데이터를 signals 테이블 metadata에 저장**

signal DB insert(276-304번줄)의 metadata_json에 investor_trend 포함:

```python
metadata = {
    "investor_trend": investor_trend,
    # ... existing metadata
}
```

- [ ] **Step 4: 프론트엔드 — SignalCard에 외국인/기관 표시**

`SignalCard.tsx`에서 signal.metadata가 있으면 investor_trend 섹션 추가:

```tsx
{/* Expert panel 아래에 추가 */}
{signal.metadata?.investor_trend && (
  <div className="signal-section">
    <span className="section-label">수급 동향 ({signal.metadata.investor_trend.days}일)</span>
    <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', marginTop: '4px' }}>
      <span className={signal.metadata.investor_trend.foreign_net_buy >= 0 ? 'text-positive' : 'text-negative'}>
        외국인 {signal.metadata.investor_trend.foreign_net_buy >= 0 ? '+' : ''}{signal.metadata.investor_trend.foreign_net_buy.toLocaleString()}주
      </span>
      <span className={signal.metadata.investor_trend.institution_net_buy >= 0 ? 'text-positive' : 'text-negative'}>
        기관 {signal.metadata.investor_trend.institution_net_buy >= 0 ? '+' : ''}{signal.metadata.investor_trend.institution_net_buy.toLocaleString()}주
      </span>
    </div>
  </div>
)}
```

- [ ] **Step 5: types.ts에 metadata 타입 추가**

Signal 타입에 metadata 필드 추가 (기존에 없으면):

```typescript
export interface SignalMetadata {
  investor_trend?: { foreign_net_buy: number; institution_net_buy: number; foreign_holding_pct: number | null; days: number };
  insider_trades?: Array<{ reporter_name: string; change_amount: number; report_date: string }>;
  peer_comparison?: { peers: Array<{ code: string; name: string; per: number | null; pbr: number | null }>; sector: string };
  news_summary?: { headlines: string[]; sentiment: string; macro_outlook: string };
}
```

Signal 인터페이스에: `metadata?: SignalMetadata;`

- [ ] **Step 6: 빌드 확인 + 커밋**

```bash
cd frontend && npx tsc --noEmit
git add backend/app/services/market_service.py backend/app/agents/market_scanner.py frontend/src/types.ts frontend/src/components/signals/SignalCard.tsx
git commit -m "feat: add foreign/institutional investor trend to signal pipeline"
```

---

## Task 3: 내부자 거래 데이터 — DART (Phase 1)

**Files:**
- Modify: `backend/app/services/dart_client.py` (함수 추가)
- Modify: `backend/app/agents/market_scanner.py` (data_package 확장)

- [ ] **Step 1: dart_client.py에 내부자 거래 조회 함수 추가**

DartClient 클래스의 `_fetch_share_count` 함수 뒤(326번줄 이후)에 추가:

```python
async def fetch_insider_trades(self, stock_code: str, limit: int = 5) -> list[dict]:
    """DART 임원 주요주주 특정증권등 소유상황 보고서 조회"""
    if not self.enabled:
        return []

    corp_code = await self._get_corp_code(stock_code)
    if not corp_code:
        return []

    try:
        params = {
            "crtfc_key": self._api_key,
            "corp_code": corp_code,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://opendart.fss.or.kr/api/elestock.json",
                params=params,
                timeout=10,
            )
            data = resp.json()

        if data.get("status") != "000":
            return []

        trades = []
        for item in data.get("list", [])[:limit]:
            trades.append({
                "reporter_name": item.get("repror", ""),
                "position": item.get("isu_exctv_rgist_at", ""),
                "change_type": item.get("rcv_dl_srtnm", ""),
                "shares_before": int(item.get("sp_stock_lmp_cnt", 0) or 0),
                "shares_after": int(item.get("sp_stock_lmp_irds_cnt", 0) or 0),
                "change_amount": int(item.get("sp_stock_lmp_irds_cnt", 0) or 0) - int(item.get("sp_stock_lmp_cnt", 0) or 0),
                "report_date": item.get("rcept_dt", ""),
            })
        return trades
    except Exception as e:
        logger.warning(f"Insider trades fetch failed for {stock_code}: {e}")
        return []
```

- [ ] **Step 2: market_scanner.py에서 내부자 데이터 수집 + metadata 저장**

`_analyze_stock`에서 investor_trend 수집 이후에 추가:

```python
insider_trades = await dart_client.fetch_insider_trades(stock_code)
data_package["insider_trades"] = insider_trades
```

metadata에도 추가:

```python
metadata["insider_trades"] = insider_trades[:3]  # 최근 3건만 metadata에
```

- [ ] **Step 3: 프론트엔드 — SignalCard에 내부자 거래 표시**

```tsx
{signal.metadata?.insider_trades && signal.metadata.insider_trades.length > 0 && (
  <div className="signal-section">
    <span className="section-label">내부자 거래</span>
    <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
      {signal.metadata.insider_trades.map((t, i) => (
        <div key={i} className="text-muted">
          {t.reporter_name}: <span className={t.change_amount >= 0 ? 'text-positive' : 'text-negative'}>
            {t.change_amount >= 0 ? '+' : ''}{t.change_amount.toLocaleString()}주
          </span> ({t.report_date})
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: 빌드 확인 + 커밋**

```bash
cd frontend && npx tsc --noEmit
git add backend/app/services/dart_client.py backend/app/agents/market_scanner.py frontend/src/components/signals/SignalCard.tsx
git commit -m "feat: add DART insider trading data to signal pipeline"
```

---

## Task 4: 촉매 일정 — DART 공시 + KRX (Phase 1)

**Files:**
- Create: `backend/app/services/calendar_service.py`
- Create: `backend/app/routers/calendar.py`
- Modify: `backend/app/main.py` (라우터 등록)
- Create: `frontend/src/components/dashboard/CatalystTimeline.tsx`
- Modify: `frontend/src/components/DashboardView.tsx` (통합)
- Modify: `frontend/src/services/api.ts` (API 함수 추가)

- [ ] **Step 1: calendar_service.py 생성**

```python
"""촉매 일정 서비스 — DART 공시 + 정기 이벤트"""
import logging
import httpx
from datetime import datetime, timedelta
from app.models.db import execute_query, execute_insert
from app.services.dart_client import dart_client

logger = logging.getLogger(__name__)

# 한국 주요 경제 일정 (정적)
REGULAR_EVENTS = [
    {"event_type": "earnings", "description": "1분기 실적 공시 마감", "month": 5, "day": 15},
    {"event_type": "earnings", "description": "반기 실적 공시 마감", "month": 8, "day": 14},
    {"event_type": "earnings", "description": "3분기 실적 공시 마감", "month": 11, "day": 14},
    {"event_type": "earnings", "description": "연간 실적 공시 마감", "month": 3, "day": 31},
]


async def get_catalyst_events(stock_code: str | None = None, days_ahead: int = 30) -> list[dict]:
    """촉매 일정 조회 — DB 캐시 + DART 공시 + 정기 이벤트"""
    events = []

    # 1. DB 캐시된 이벤트
    if stock_code:
        rows = await execute_query(
            "SELECT * FROM catalyst_events WHERE stock_code = ? AND event_date >= date('now') ORDER BY event_date",
            (stock_code,)
        )
    else:
        rows = await execute_query(
            "SELECT * FROM catalyst_events WHERE event_date >= date('now') AND event_date <= date('now', ?) ORDER BY event_date",
            (f"+{days_ahead} days",)
        )
    events.extend([dict(r) for r in (rows or [])])

    # 2. 정기 이벤트 (향후 days_ahead 이내)
    today = datetime.now()
    for ev in REGULAR_EVENTS:
        try:
            ev_date = datetime(today.year, ev["month"], ev["day"])
            if ev_date < today:
                ev_date = datetime(today.year + 1, ev["month"], ev["day"])
            if (ev_date - today).days <= days_ahead:
                events.append({
                    "stock_code": None,
                    "event_type": ev["event_type"],
                    "event_date": ev_date.strftime("%Y-%m-%d"),
                    "description": ev["description"],
                    "source": "calendar",
                })
        except ValueError:
            pass

    events.sort(key=lambda e: e.get("event_date", ""))
    return events


async def fetch_dart_disclosures(stock_code: str, days_back: int = 30) -> list[dict]:
    """DART 공시 검색으로 최근 공시 목록 수집 → catalyst_events에 캐시"""
    if not dart_client.enabled:
        return []

    # 참고: _get_corp_code는 private 메서드. 이 Task 실행 시 dart_client.py에
    # public 래퍼 `get_corp_code(stock_code)` 추가 필요 (또는 직접 호출 허용)
    corp_code = await dart_client._get_corp_code(stock_code)
    if not corp_code:
        return []

    try:
        params = {
            "crtfc_key": dart_client._api_key,
            "corp_code": corp_code,
            "bgn_de": (datetime.now() - timedelta(days=days_back)).strftime("%Y%m%d"),
            "end_de": datetime.now().strftime("%Y%m%d"),
            "page_count": "10",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://opendart.fss.or.kr/api/list.json", params=params, timeout=10)
            data = resp.json()

        if data.get("status") != "000":
            return []

        results = []
        for item in data.get("list", []):
            event = {
                "stock_code": stock_code,
                "event_type": "disclosure",
                "event_date": f"{item['rcept_dt'][:4]}-{item['rcept_dt'][4:6]}-{item['rcept_dt'][6:8]}",
                "description": item.get("report_nm", ""),
                "source": "dart",
            }
            results.append(event)
            # 캐시
            await execute_insert(
                "INSERT OR IGNORE INTO catalyst_events (stock_code, event_type, event_date, description, source) VALUES (?, ?, ?, ?, ?)",
                (stock_code, "disclosure", event["event_date"], event["description"], "dart")
            )
        return results
    except Exception as e:
        logger.warning(f"DART disclosure fetch failed for {stock_code}: {e}")
        return []
```

- [ ] **Step 2: calendar.py 라우터 생성**

```python
from fastapi import APIRouter
from app.services.calendar_service import get_catalyst_events, fetch_dart_disclosures

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("")
async def list_events(stock_code: str | None = None, days: int = 30):
    events = await get_catalyst_events(stock_code, days)
    return {"events": events}


@router.post("/refresh/{stock_code}")
async def refresh_disclosures(stock_code: str):
    disclosures = await fetch_dart_disclosures(stock_code)
    return {"refreshed": len(disclosures)}
```

- [ ] **Step 3: main.py에 라우터 등록**

```python
from app.routers import calendar
app.include_router(calendar.router)
```

- [ ] **Step 4: 프론트엔드 — API 함수 + CatalystTimeline 컴포넌트**

`api.ts`에 추가:

```typescript
export async function getCatalystEvents(stockCode?: string, days: number = 30): Promise<{ events: Array<{ stock_code: string | null; event_type: string; event_date: string; description: string; source: string }> }> {
  const params = new URLSearchParams();
  if (stockCode) params.set('stock_code', stockCode);
  params.set('days', String(days));
  const res = await fetch(`/api/calendar?${params}`);
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
}
```

`CatalystTimeline.tsx` 생성:

```tsx
import { useState, useEffect } from 'react';
import { getCatalystEvents } from '../../services/api';

export default function CatalystTimeline() {
  const [events, setEvents] = useState<Array<{ stock_code: string | null; event_type: string; event_date: string; description: string; source: string }>>([]);

  useEffect(() => {
    getCatalystEvents(undefined, 60).then(res => setEvents(res.events)).catch(() => {});
  }, []);

  if (events.length === 0) return null;

  const typeColor: Record<string, string> = {
    earnings: '#f59e0b',
    disclosure: '#3b82f6',
    calendar: '#6b7280',
  };

  return (
    <div className="card">
      <div className="card-header"><h3>촉매 일정</h3></div>
      <div className="card-body" style={{ maxHeight: '200px', overflow: 'auto' }}>
        {events.map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', padding: '4px 0', fontSize: '0.8rem', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: typeColor[ev.event_type] || '#6b7280', fontWeight: 600, minWidth: '80px' }}>{ev.event_date}</span>
            <span>{ev.description}</span>
            {ev.stock_code && <span className="text-muted mono">{ev.stock_code}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: DashboardView에 CatalystTimeline 통합**

사이드바(Watchlist 위)에 추가.

- [ ] **Step 6: 빌드 확인 + 커밋**

```bash
cd frontend && npx tsc --noEmit
git add backend/app/services/calendar_service.py backend/app/routers/calendar.py backend/app/main.py frontend/src/components/dashboard/CatalystTimeline.tsx frontend/src/components/DashboardView.tsx frontend/src/services/api.ts
git commit -m "feat: add catalyst calendar with DART disclosures and timeline UI"
```

---

## Task 5: 뉴스/매크로 분석 — 6번째 전문가 (Phase 2)

**Files:**
- Create: `backend/app/services/news_service.py`
- Modify: `backend/app/agents/market_scanner_experts.py:95-174` (전문가 패널 확장)
- Modify: `backend/app/agents/market_scanner.py` (data_package 확장)

- [ ] **Step 1: news_service.py 생성**

NAVER 뉴스 검색을 활용한 뉴스 수집 서비스. Claude로 요약 + 감성 분석:

```python
"""뉴스/매크로 데이터 수집 서비스"""
import logging
import httpx
import anthropic
from datetime import datetime, timedelta
from app.config import settings
from app.models.db import execute_query, execute_insert

logger = logging.getLogger(__name__)


async def fetch_stock_news(stock_name: str, stock_code: str, max_items: int = 5) -> dict:
    """종목 관련 뉴스 수집 + Claude 요약"""
    # 1. 캐시 확인 (당일)
    cached = await execute_query(
        "SELECT title, summary, sentiment FROM news_cache WHERE stock_code = ? AND cached_at >= date('now') LIMIT ?",
        (stock_code, max_items)
    )
    if cached and len(cached) >= 3:
        headlines = [r["title"] for r in cached]
        sentiments = [r["sentiment"] for r in cached if r["sentiment"]]
        return {
            "headlines": headlines,
            "sentiment": _aggregate_sentiment(sentiments),
            "source": "cache",
        }

    # 2. NAVER 뉴스 검색 (API 키 불요)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://search.naver.com/search.naver",
                params={"where": "news", "query": f"{stock_name} 주가", "sort": 1},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=10,
            )
            # 간단한 제목 추출 (HTML 파싱)
            import re
            titles = re.findall(r'class="news_tit"[^>]*title="([^"]+)"', resp.text)[:max_items]
    except Exception as e:
        logger.warning(f"News fetch failed for {stock_name}: {e}")
        titles = []

    if not titles:
        return {"headlines": [], "sentiment": "neutral", "source": "empty"}

    # 3. Claude로 뉴스 감성 분석
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": f"""다음 {stock_name}({stock_code}) 관련 뉴스 헤드라인의 종합 감성을 분석해주세요.

헤드라인:
{chr(10).join(f'- {t}' for t in titles)}

JSON으로 응답: {{"sentiment": "positive|negative|neutral", "summary": "한 줄 요약"}}"""}],
        )
        import json
        result = json.loads(resp.content[0].text.strip().strip("```json").strip("```"))
        sentiment = result.get("sentiment", "neutral")
        summary = result.get("summary", "")
    except Exception:
        sentiment = "neutral"
        summary = ""

    # 4. 캐시 저장
    for title in titles:
        await execute_insert(
            "INSERT INTO news_cache (stock_code, title, summary, sentiment) VALUES (?, ?, ?, ?)",
            (stock_code, title, summary, sentiment)
        )

    return {"headlines": titles, "sentiment": sentiment, "summary": summary, "source": "naver"}


async def fetch_macro_indicators() -> dict:
    """주요 매크로 지표 — 간략 버전 (향후 API 확장 가능)"""
    return {
        "note": "매크로 지표는 뉴스 분석으로 대체",
    }


def _aggregate_sentiment(sentiments: list[str]) -> str:
    if not sentiments:
        return "neutral"
    pos = sentiments.count("positive")
    neg = sentiments.count("negative")
    if pos > neg:
        return "positive"
    elif neg > pos:
        return "negative"
    return "neutral"
```

- [ ] **Step 2: market_scanner_experts.py에 6번째 전문가 추가**

`run_expert_panel` 함수의 `fundamental_analyst` 정의 뒤(161번줄 이후)에 새 전문가 함수 추가:

```python
async def news_macro_analyst():
    """뉴스/매크로 분석가"""
    from app.services.news_service import fetch_stock_news
    stock_info = data_package["stock"]
    news_data = await fetch_stock_news(stock_info["name"], stock_info["code"])
    data_package["news_summary"] = news_data  # 다른 전문가도 참조 가능

    if not news_data.get("headlines"):
        return {
            "persona": "뉴스/매크로 분석가",
            "view": "neutral",
            "key_signals": ["뉴스 데이터 없음"],
            "confidence": 0.3,
            "concern": "뉴스 수집 실패",
        }

    prompt = f"""당신은 뉴스/매크로 분석 전문가입니다. {stock_info['name']}({stock_info['code']}) 관련 뉴스를 분석하세요.

최근 뉴스 헤드라인:
{chr(10).join(f'- {h}' for h in news_data['headlines'])}
감성: {news_data['sentiment']}

JSON으로 응답:
{{"persona": "뉴스/매크로 분석가", "view": "bullish|bearish|neutral", "key_signals": ["signal1", "signal2"], "confidence": 0.0~1.0, "concern": "우려사항"}}"""

    model, max_tokens = _get_model()
    client = _get_claude_client()
    resp = await client.messages.create(model=model, max_tokens=max_tokens, messages=[{"role": "user", "content": prompt}])
    parsed = _parse_json_response(resp.content[0].text)
    return parsed or {"persona": "뉴스/매크로 분석가", "view": "neutral", "key_signals": [], "confidence": 0.3, "concern": "분석 실패"}
```

tasks 리스트(163-164번줄)에 추가:

```python
tasks = [
    _call_expert("기술분석가", ..., data_package),
    _call_expert("모멘텀 트레이더", ..., data_package),
    _call_expert("리스크 평가자", ..., data_package),
    _call_expert("포트폴리오 전략가", ..., data_package),
    fundamental_analyst(),
    news_macro_analyst(),  # NEW
]
```

- [ ] **Step 3: market_scanner.py에서 뉴스 데이터를 metadata에 저장**

```python
metadata["news_summary"] = data_package.get("news_summary", {})
```

- [ ] **Step 4: 프론트엔드 — SignalCard에 뉴스 요약 섹션**

```tsx
{signal.metadata?.news_summary && signal.metadata.news_summary.headlines?.length > 0 && (
  <div className="signal-section">
    <span className="section-label">뉴스 동향 ({signal.metadata.news_summary.sentiment})</span>
    <ul style={{ fontSize: '0.75rem', margin: '4px 0 0 16px', padding: 0 }}>
      {signal.metadata.news_summary.headlines.slice(0, 3).map((h: string, i: number) => (
        <li key={i} className="text-muted">{h}</li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 5: 빌드 확인 + 커밋**

```bash
cd frontend && npx tsc --noEmit
git add backend/app/services/news_service.py backend/app/agents/market_scanner_experts.py backend/app/agents/market_scanner.py frontend/src/components/signals/SignalCard.tsx
git commit -m "feat: add news/macro analyst as 6th expert in signal pipeline"
```

---

## Task 6: 동종 업종 비교 (Phase 2)

**Files:**
- Create: `backend/app/services/peer_service.py`
- Create: `backend/app/routers/peers.py`
- Modify: `backend/app/agents/market_scanner.py` (data_package에 peer 추가)
- Modify: `backend/app/main.py` (라우터 등록)
- Create: `frontend/src/components/signals/PeerComparison.tsx`

- [ ] **Step 1: peer_service.py 생성**

```python
"""동종 업종 비교 서비스"""
import logging
from app.models.db import execute_query
from app.services.dart_client import dart_client

logger = logging.getLogger(__name__)


async def get_sector_peers(stock_code: str, max_peers: int = 5) -> dict:
    """동일 섹터 종목 조회 + DART 재무 비교"""
    # 1. 현재 종목의 섹터 확인
    row = await execute_query(
        "SELECT sector, stock_name FROM kospi200_components WHERE stock_code = ?",
        (stock_code,)
    )
    if not row or not row[0].get("sector"):
        return {"sector": None, "peers": [], "error": "섹터 정보 없음"}

    sector = row[0]["sector"]
    stock_name = row[0]["stock_name"]

    # 2. 동일 섹터 종목 조회 (자기 자신 제외)
    peers_rows = await execute_query(
        "SELECT stock_code, stock_name FROM kospi200_components WHERE sector = ? AND stock_code != ? LIMIT ?",
        (sector, stock_code, max_peers)
    )
    if not peers_rows:
        return {"sector": sector, "peers": [], "target": {"code": stock_code, "name": stock_name}}

    # 3. 각 피어의 DART 재무 데이터 수집
    peers = []
    for pr in peers_rows:
        try:
            dart_result = await dart_client.fetch(pr["stock_code"])
            fin = dart_result.get("financials") or {}
            peers.append({
                "code": pr["stock_code"],
                "name": pr["stock_name"],
                "per": fin.get("dart_per"),
                "pbr": fin.get("dart_pbr"),
                "operating_margin": fin.get("dart_operating_margin"),
                "debt_ratio": fin.get("dart_debt_ratio"),
            })
        except Exception:
            peers.append({"code": pr["stock_code"], "name": pr["stock_name"], "per": None, "pbr": None})

    # 4. 타겟 종목의 DART 데이터
    target_dart = await dart_client.fetch(stock_code)
    target_fin = target_dart.get("financials") or {}

    return {
        "sector": sector,
        "target": {
            "code": stock_code,
            "name": stock_name,
            "per": target_fin.get("dart_per"),
            "pbr": target_fin.get("dart_pbr"),
            "operating_margin": target_fin.get("dart_operating_margin"),
            "debt_ratio": target_fin.get("dart_debt_ratio"),
        },
        "peers": peers,
    }
```

- [ ] **Step 2: peers.py 라우터 생성**

```python
from fastapi import APIRouter
from app.services.peer_service import get_sector_peers

router = APIRouter(prefix="/api/peers", tags=["peers"])

@router.get("/{stock_code}")
async def peer_comparison(stock_code: str, max_peers: int = 5):
    return await get_sector_peers(stock_code, max_peers)
```

- [ ] **Step 3: main.py에 라우터 등록**

- [ ] **Step 4: market_scanner.py에서 피어 데이터 수집 + metadata 저장**

`_analyze_stock`에서 DART fetch 이후:

```python
from app.services.peer_service import get_sector_peers
peer_data = await get_sector_peers(stock_code, max_peers=3)
data_package["peer_comparison"] = peer_data
metadata["peer_comparison"] = {
    "sector": peer_data.get("sector"),
    "peers": [{"code": p["code"], "name": p["name"], "per": p.get("per"), "pbr": p.get("pbr")} for p in peer_data.get("peers", [])[:3]],
}
```

- [ ] **Step 5: 프론트엔드 — PeerComparison + API + SignalCard 통합**

`PeerComparison.tsx`:

```tsx
interface PeerData {
  sector: string;
  target: { code: string; name: string; per: number | null; pbr: number | null };
  peers: Array<{ code: string; name: string; per: number | null; pbr: number | null }>;
}

export default function PeerComparison({ data }: { data: PeerData }) {
  const all = [{ ...data.target, isTarget: true }, ...data.peers.map(p => ({ ...p, isTarget: false }))];

  return (
    <div className="signal-section">
      <span className="section-label">동종 업종 비교 ({data.sector})</span>
      <table style={{ width: '100%', fontSize: '0.75rem', marginTop: '4px' }}>
        <thead><tr><th>종목</th><th className="text-right">PER</th><th className="text-right">PBR</th></tr></thead>
        <tbody>
          {all.map((p, i) => (
            <tr key={i} style={p.isTarget ? { fontWeight: 600, background: 'var(--bg-secondary)' } : {}}>
              <td>{p.name} <span className="mono text-muted">{p.code}</span></td>
              <td className="text-right">{p.per?.toFixed(1) ?? '-'}</td>
              <td className="text-right">{p.pbr?.toFixed(2) ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

SignalCard에서 metadata.peer_comparison이 있으면 PeerComparison 렌더링.

- [ ] **Step 6: 빌드 확인 + 커밋**

```bash
git add backend/app/services/peer_service.py backend/app/routers/peers.py backend/app/main.py backend/app/agents/market_scanner.py frontend/src/components/signals/PeerComparison.tsx frontend/src/components/signals/SignalCard.tsx frontend/src/services/api.ts
git commit -m "feat: add peer comparison with sector-based DART valuation"
```

---

## Task 7: 시그널 이력 비교 (Phase 2)

**Files:**
- Create: `backend/app/services/signal_history_service.py`
- Modify: `backend/app/agents/market_scanner.py` (스냅샷 자동 저장)
- Modify: `backend/app/routers/signals.py` (이력 엔드포인트 추가)
- Create: `frontend/src/components/signals/SignalHistory.tsx`

- [ ] **Step 1: signal_history_service.py 생성**

```python
"""시그널 이력 서비스 — 동일 종목 시그널 시계열 비교"""
import json
from app.models.db import execute_query


async def save_signal_snapshot(signal_id: int, stock_code: str, direction: str, rr_score: float,
                                scenarios_json: str, expert_stances_json: str, variant_view: str, dart_json: str):
    """시그널 생성 시 자동 스냅샷 저장"""
    from app.models.db import execute_insert
    await execute_insert(
        """INSERT INTO signal_snapshots (stock_code, signal_id, direction, rr_score,
           scenarios_json, expert_stances_json, variant_view, dart_fundamentals_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (stock_code, signal_id, direction, rr_score, scenarios_json, expert_stances_json, variant_view, dart_json)
    )


async def get_signal_history(stock_code: str, limit: int = 10) -> list[dict]:
    """특정 종목의 과거 시그널 이력"""
    rows = await execute_query(
        """SELECT ss.*, s.status, s.timestamp as signal_timestamp
           FROM signal_snapshots ss
           LEFT JOIN signals s ON ss.signal_id = s.id
           WHERE ss.stock_code = ?
           ORDER BY ss.snapshot_date DESC LIMIT ?""",
        (stock_code, limit)
    )
    results = []
    for r in (rows or []):
        d = dict(r)
        d["scenarios"] = json.loads(d.get("scenarios_json") or "null")
        d["expert_stances"] = json.loads(d.get("expert_stances_json") or "null")
        results.append(d)
    return results
```

- [ ] **Step 2: market_scanner.py에서 시그널 저장 후 스냅샷 자동 생성**

signal DB insert(276-304번줄) 이후, emit 전에 추가:

```python
from app.services.signal_history_service import save_signal_snapshot
await save_signal_snapshot(
    signal_id=signal_id, stock_code=stock_code,
    direction=analysis.direction, rr_score=analysis.rr_score,
    scenarios_json=scenarios_json_str, expert_stances_json=expert_stances_json_str,
    variant_view=analysis.variant_view or "", dart_json=dart_json_str,
)
```

- [ ] **Step 3: signals.py 라우터에 이력 엔드포인트 추가**

```python
@router.get("/history/{stock_code}")
async def signal_history(stock_code: str, limit: int = 10):
    from app.services.signal_history_service import get_signal_history
    history = await get_signal_history(stock_code, limit)
    return {"history": history}
```

- [ ] **Step 4: 프론트엔드 — SignalHistory 컴포넌트 + API**

`api.ts`에 추가:

```typescript
export async function getSignalHistory(stockCode: string): Promise<{ history: Array<Record<string, unknown>> }> {
  const res = await fetch(`/api/signals/history/${stockCode}`);
  if (!res.ok) throw new Error('Failed to fetch signal history');
  return res.json();
}
```

`SignalHistory.tsx` — 간단한 시계열 테이블:

```tsx
import { useState, useEffect } from 'react';
import { getSignalHistory } from '../../services/api';

export default function SignalHistory({ stockCode }: { stockCode: string }) {
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    getSignalHistory(stockCode).then(res => setHistory(res.history)).catch(() => {});
  }, [stockCode]);

  if (history.length === 0) return null;

  return (
    <div style={{ marginTop: '12px' }}>
      <h4>시그널 이력 ({stockCode})</h4>
      <table className="table" style={{ fontSize: '0.8rem' }}>
        <thead><tr><th>날짜</th><th>방향</th><th>R/R</th><th>상태</th></tr></thead>
        <tbody>
          {history.map((h, i) => (
            <tr key={i}>
              <td>{String(h.snapshot_date)}</td>
              <td><span className={`badge badge-${h.direction === 'buy' ? 'long' : h.direction === 'sell' ? 'short' : 'neutral'}`}>{String(h.direction).toUpperCase()}</span></td>
              <td>{Number(h.rr_score).toFixed(1)}</td>
              <td>{String(h.status || '-')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

SignalDetailModal에서 signal.stock_code를 사용하여 SignalHistory 렌더링.

- [ ] **Step 5: 빌드 확인 + 커밋**

```bash
git add backend/app/services/signal_history_service.py backend/app/agents/market_scanner.py backend/app/routers/signals.py frontend/src/components/signals/SignalHistory.tsx frontend/src/components/signals/SignalDetailModal.tsx frontend/src/services/api.ts
git commit -m "feat: add signal history snapshots and timeline comparison"
```

---

## Task 8: DCF 밸류에이션 (Phase 3)

**Files:**
- Modify: `backend/app/services/dart_client.py` (현금흐름 API 추가)
- Create: `backend/app/services/valuation_service.py`
- Modify: `backend/app/agents/market_scanner.py` (DCF 결과를 metadata에 저장)
- Create: `frontend/src/components/signals/ValuationView.tsx`

- [ ] **Step 1: dart_client.py에 현금흐름표 조회 추가**

`_fetch_share_count` 뒤에 추가:

```python
async def fetch_cash_flow(self, stock_code: str) -> dict | None:
    """DART 현금흐름표 조회"""
    if not self.enabled:
        return None
    corp_code = await self._get_corp_code(stock_code)
    if not corp_code:
        return None

    year = str(datetime.now().year - 1)
    try:
        params = {
            "crtfc_key": self._api_key,
            "corp_code": corp_code,
            "bsns_year": year,
            "reprt_code": "11011",
            "fs_div": "CFS",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json", params=params, timeout=15)
            data = resp.json()

        if data.get("status") != "000":
            return None

        items = {}
        for item in data.get("list", []):
            nm = item.get("account_nm", "")
            if nm not in items:
                items[nm] = item

        def parse_amt(name):
            item = items.get(name)
            if not item:
                return None
            val = item.get("thstrm_amount", "").replace(",", "")
            try:
                return float(val)
            except (ValueError, TypeError):
                return None

        op_cf = parse_amt("영업활동현금흐름") or parse_amt("영업활동으로인한현금흐름")
        capex = abs(parse_amt("유형자산의 취득") or parse_amt("유형자산취득") or 0)

        return {
            "operating_cash_flow": op_cf,
            "capex": capex,
            "free_cash_flow": (op_cf - capex) if op_cf else None,
            "year": year,
        }
    except Exception as e:
        logger.warning(f"Cash flow fetch failed for {stock_code}: {e}")
        return None
```

- [ ] **Step 2: valuation_service.py 생성**

```python
"""DCF 밸류에이션 서비스"""
import json
import logging
from app.models.db import execute_query, execute_insert

logger = logging.getLogger(__name__)

DEFAULT_WACC = 0.10  # 10%
DEFAULT_GROWTH = 0.03  # 3%
PROJECTION_YEARS = 5


def compute_dcf(
    free_cash_flow: float,
    shares_outstanding: int,
    wacc: float = DEFAULT_WACC,
    growth_rate: float = DEFAULT_GROWTH,
    terminal_growth: float = 0.02,
) -> dict:
    """단순 DCF 적정가 산출"""
    if not free_cash_flow or free_cash_flow <= 0 or not shares_outstanding:
        return {"error": "FCF 또는 주식수 데이터 부족", "fair_value": None}

    # 향후 5년 FCF 추정 + 할인
    projected_fcf = []
    fcf = free_cash_flow
    total_pv = 0
    for yr in range(1, PROJECTION_YEARS + 1):
        fcf *= (1 + growth_rate)
        pv = fcf / ((1 + wacc) ** yr)
        projected_fcf.append({"year": yr, "fcf": round(fcf), "pv": round(pv)})
        total_pv += pv

    # 터미널 밸류
    terminal_fcf = fcf * (1 + terminal_growth)
    terminal_value = terminal_fcf / (wacc - terminal_growth)
    terminal_pv = terminal_value / ((1 + wacc) ** PROJECTION_YEARS)

    enterprise_value = total_pv + terminal_pv
    fair_value_per_share = enterprise_value / shares_outstanding

    return {
        "fair_value": round(fair_value_per_share),
        "enterprise_value": round(enterprise_value),
        "terminal_pv": round(terminal_pv),
        "fcf_pv_total": round(total_pv),
        "assumptions": {
            "wacc": wacc,
            "growth_rate": growth_rate,
            "terminal_growth": terminal_growth,
            "projection_years": PROJECTION_YEARS,
        },
        "projected_fcf": projected_fcf,
    }


def compute_sensitivity_table(
    free_cash_flow: float,
    shares_outstanding: int,
    wacc_range: list[float] | None = None,
    growth_range: list[float] | None = None,
) -> list[list]:
    """3x3 민감도 테이블 (WACC x Growth Rate)"""
    if wacc_range is None:
        wacc_range = [0.08, 0.10, 0.12]
    if growth_range is None:
        growth_range = [0.02, 0.03, 0.05]

    table = []
    for w in wacc_range:
        row = []
        for g in growth_range:
            result = compute_dcf(free_cash_flow, shares_outstanding, wacc=w, growth_rate=g)
            row.append(result.get("fair_value"))
        table.append(row)
    return table


async def get_or_compute_dcf(stock_code: str, dart_client) -> dict | None:
    """DCF 적정가 조회 (캐시 우선) 또는 계산"""
    # 캐시 확인
    cached = await execute_query(
        "SELECT dcf_result_json FROM valuation_cache WHERE stock_code = ? AND cache_date = date('now')",
        (stock_code,)
    )
    if cached:
        return json.loads(cached[0]["dcf_result_json"])

    # 데이터 수집
    cf_data = await dart_client.fetch_cash_flow(stock_code)
    if not cf_data or not cf_data.get("free_cash_flow"):
        return None

    corp_code = await dart_client._get_corp_code(stock_code)
    shares = await dart_client._fetch_share_count(corp_code, cf_data["year"]) if corp_code else None
    if not shares:
        return None

    # DCF 계산
    result = compute_dcf(cf_data["free_cash_flow"], shares)
    result["sensitivity"] = compute_sensitivity_table(cf_data["free_cash_flow"], shares)
    result["cash_flow_data"] = cf_data

    # 캐시 저장
    await execute_insert(
        "INSERT OR REPLACE INTO valuation_cache (stock_code, cache_date, dcf_result_json) VALUES (?, date('now'), ?)",
        (stock_code, json.dumps(result, ensure_ascii=False))
    )

    return result
```

- [ ] **Step 3: market_scanner.py에서 DCF 계산 + metadata 저장**

`_analyze_stock`에서 peer_data 수집 이후:

```python
from app.services.valuation_service import get_or_compute_dcf
dcf_result = await get_or_compute_dcf(stock_code, dart_client)
if dcf_result and dcf_result.get("fair_value"):
    data_package["dcf_valuation"] = dcf_result
    metadata["dcf_valuation"] = {
        "fair_value": dcf_result["fair_value"],
        "current_price": current_price,
        "upside_pct": round((dcf_result["fair_value"] - current_price) / current_price * 100, 1) if current_price else None,
    }
```

- [ ] **Step 4: 프론트엔드 — ValuationView 컴포넌트**

```tsx
export default function ValuationView({ dcf }: { dcf: { fair_value: number; current_price: number; upside_pct: number | null } }) {
  const upside = dcf.upside_pct;
  return (
    <div className="signal-section">
      <span className="section-label">DCF 적정가</span>
      <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', marginTop: '4px' }}>
        <span>적정가 <strong>{dcf.fair_value.toLocaleString()}원</strong></span>
        <span className="text-muted">현재가 {dcf.current_price.toLocaleString()}원</span>
        {upside !== null && (
          <span className={upside >= 0 ? 'text-positive' : 'text-negative'}>
            {upside >= 0 ? '+' : ''}{upside.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
```

SignalCard에서 metadata.dcf_valuation이 있으면 ValuationView 렌더링.

- [ ] **Step 5: 빌드 확인 + 커밋**

```bash
git add backend/app/services/dart_client.py backend/app/services/valuation_service.py backend/app/agents/market_scanner.py frontend/src/components/signals/ValuationView.tsx frontend/src/components/signals/SignalCard.tsx
git commit -m "feat: add DCF valuation with sensitivity table"
```

---

## Task 9: 강화된 리스크 관리 — VaR/베타/섹터 (Phase 3)

**Files:**
- Create: `backend/app/services/portfolio_risk_service.py`
- Modify: `backend/app/agents/risk_manager.py` (새 게이트 추가)
- Modify: `backend/app/routers/dashboard.py` (리스크 엔드포인트 추가)
- Create: `frontend/src/components/dashboard/RiskDashboard.tsx`
- Modify: `frontend/src/components/DashboardView.tsx` (통합)

- [ ] **Step 1: portfolio_risk_service.py 생성**

```python
"""포트폴리오 리스크 분석 서비스"""
import math
import json
import logging
from app.models.db import execute_query, execute_insert
from app.services.market_service import get_daily_chart, parse_ohlcv_from_chart

logger = logging.getLogger(__name__)


def calculate_historical_var(returns: list[float], confidence: float = 0.95) -> float:
    """Historical VaR (백분위 기반)"""
    if len(returns) < 10:
        return 0.0
    sorted_returns = sorted(returns)
    idx = int(len(sorted_returns) * (1 - confidence))
    return abs(sorted_returns[idx])


def calculate_beta(stock_returns: list[float], market_returns: list[float]) -> float:
    """종목 베타 = Cov(stock, market) / Var(market)"""
    if len(stock_returns) != len(market_returns) or len(stock_returns) < 10:
        return 1.0

    n = len(stock_returns)
    mean_s = sum(stock_returns) / n
    mean_m = sum(market_returns) / n

    cov = sum((stock_returns[i] - mean_s) * (market_returns[i] - mean_m) for i in range(n)) / n
    var_m = sum((market_returns[i] - mean_m) ** 2 for i in range(n)) / n

    if var_m == 0:
        return 1.0
    return cov / var_m


def _compute_returns(closes: list[float]) -> list[float]:
    """종가 배열 → 일일 수익률"""
    return [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes)) if closes[i - 1] > 0]


async def compute_portfolio_risk(positions: list[dict]) -> dict:
    """포트폴리오 종합 리스크 분석"""
    if not positions:
        return {"var_95": 0, "var_99": 0, "portfolio_beta": 0, "sector_breakdown": {}}

    # 각 포지션의 차트 데이터 수집
    stock_returns_map = {}
    for pos in positions:
        try:
            chart = await get_daily_chart(pos["stock_code"])
            ohlcv = parse_ohlcv_from_chart(chart)
            if ohlcv and ohlcv.get("closes"):
                stock_returns_map[pos["stock_code"]] = _compute_returns(ohlcv["closes"])
        except Exception:
            pass

    # 포트폴리오 가중 수익률
    total_value = sum(pos.get("market_value", 0) or (pos.get("current_price", 0) * pos.get("quantity", 0)) for pos in positions)
    if total_value == 0:
        return {"var_95": 0, "var_99": 0, "portfolio_beta": 0, "sector_breakdown": {}}

    # 가중 일일 수익률
    min_len = min((len(r) for r in stock_returns_map.values()), default=0)
    if min_len < 10:
        return {"var_95": 0, "var_99": 0, "portfolio_beta": 1.0, "sector_breakdown": {}}

    portfolio_returns = []
    for i in range(min_len):
        daily = 0
        for pos in positions:
            code = pos["stock_code"]
            if code in stock_returns_map and i < len(stock_returns_map[code]):
                weight = (pos.get("market_value", 0) or 0) / total_value
                daily += stock_returns_map[code][i] * weight
        portfolio_returns.append(daily)

    # VaR
    var_95 = calculate_historical_var(portfolio_returns, 0.95)
    var_99 = calculate_historical_var(portfolio_returns, 0.99)

    # 포트폴리오 베타 (KOSPI 대용: 가중 평균 베타)
    avg_beta = 1.0  # 시장 지수 차트가 없으므로 기본값

    # 섹터 집중도
    sector_breakdown = {}
    for pos in positions:
        from app.models.db import execute_query as eq
        row = await eq("SELECT sector FROM kospi200_components WHERE stock_code = ?", (pos["stock_code"],))
        sector = row[0]["sector"] if row and row[0].get("sector") else "기타"
        weight = (pos.get("market_value", 0) or 0) / total_value * 100
        sector_breakdown[sector] = sector_breakdown.get(sector, 0) + weight

    return {
        "var_95": round(var_95 * 100, 2),
        "var_99": round(var_99 * 100, 2),
        "portfolio_beta": round(avg_beta, 2),
        "sector_breakdown": sector_breakdown,
        "total_value": total_value,
    }
```

- [ ] **Step 2: dashboard.py에 리스크 분석 엔드포인트 추가**

```python
@router.get("/risk-analysis")  # 주의: router prefix가 /api/dashboard이므로 여기선 /risk-analysis만
async def risk_analysis():
    from app.services.portfolio_risk_service import compute_portfolio_risk
    positions = await portfolio_service.get_latest_positions()
    risk = await compute_portfolio_risk(positions)
    return risk
```

- [ ] **Step 3: risk_manager.py에 섹터 집중도 게이트 추가**

`_validate_signal` 함수(182-227번줄)에 새 게이트 추가:

```python
# 섹터 집중도 게이트 (매수 시)
if signal.get("direction") == "buy" and portfolio:
    from app.models.db import execute_query
    row = await execute_query("SELECT sector FROM kospi200_components WHERE stock_code = ?", (signal["stock_code"],))
    if row and row[0].get("sector"):
        signal_sector = row[0]["sector"]
        sector_weight = 0
        total_val = portfolio.get("total_value", 0)
        for pos in portfolio.get("positions", []):
            pos_row = await execute_query("SELECT sector FROM kospi200_components WHERE stock_code = ?", (pos["stock_code"],))
            if pos_row and pos_row[0].get("sector") == signal_sector:
                sector_weight += (pos.get("market_value", 0) or 0)
        if total_val > 0 and (sector_weight / total_val * 100) > 40:
            return f"섹터 집중도 초과: {signal_sector} ({sector_weight / total_val * 100:.0f}% > 40%)"
```

- [ ] **Step 4: 프론트엔드 — RiskDashboard 컴포넌트**

```tsx
import { useState, useEffect } from 'react';

export default function RiskDashboard() {
  const [risk, setRisk] = useState<{ var_95: number; var_99: number; portfolio_beta: number; sector_breakdown: Record<string, number> } | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/risk-analysis').then(r => r.json()).then(setRisk).catch(() => {});
  }, []);

  if (!risk) return null;

  return (
    <div className="card">
      <div className="card-header"><h3>리스크 분석</h3></div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', marginBottom: '12px' }}>
          <div><span className="text-muted">VaR(95%)</span> <strong className="text-negative">{risk.var_95.toFixed(2)}%</strong></div>
          <div><span className="text-muted">VaR(99%)</span> <strong className="text-negative">{risk.var_99.toFixed(2)}%</strong></div>
          <div><span className="text-muted">베타</span> <strong>{risk.portfolio_beta.toFixed(2)}</strong></div>
        </div>
        {Object.keys(risk.sector_breakdown).length > 0 && (
          <div>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>섹터 비중</span>
            {Object.entries(risk.sector_breakdown).sort((a, b) => b[1] - a[1]).map(([sector, pct]) => (
              <div key={sector} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '2px 0' }}>
                <span>{sector}</span>
                <span>{pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

DashboardView 사이드바에 통합.

- [ ] **Step 5: 빌드 확인 + 커밋**

```bash
git add backend/app/services/portfolio_risk_service.py backend/app/routers/dashboard.py backend/app/agents/risk_manager.py frontend/src/components/dashboard/RiskDashboard.tsx frontend/src/components/DashboardView.tsx
git commit -m "feat: add VaR, beta, sector concentration risk analysis"
```

---

## Task 10: 투자 메모 내보내기 (Phase 4)

**Files:**
- Create: `backend/app/services/memo_service.py`
- Create: `backend/app/routers/memos.py`
- Modify: `backend/app/main.py` (라우터 등록)
- Modify: `frontend/src/components/signals/SignalDetailModal.tsx` (다운로드 버튼)
- Modify: `frontend/src/services/api.ts` (API 함수)

- [ ] **Step 1: memo_service.py 생성**

HTML 기반 투자 메모 생성:

```python
"""투자 메모 생성 서비스"""
import json
import logging
from datetime import datetime
from app.models.db import execute_query, execute_insert

logger = logging.getLogger(__name__)


async def generate_memo_html(signal_id: int) -> str | None:
    """시그널 데이터 기반 HTML 투자 메모 생성"""
    rows = await execute_query("SELECT * FROM signals WHERE id = ?", (signal_id,))
    if not rows:
        return None

    signal = dict(rows[0])
    scenarios = json.loads(signal.get("scenarios_json") or "{}")
    dart = json.loads(signal.get("dart_fundamentals_json") or "{}")
    expert_stances = json.loads(signal.get("expert_stances_json") or "{}")
    metadata = json.loads(signal.get("metadata_json") or "{}")
    grades = json.loads(signal.get("confidence_grades_json") or "{}")

    direction_kr = {"buy": "매수", "sell": "매도", "hold": "보유"}.get(signal["direction"], signal["direction"])
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>{signal['stock_name']} ({signal['stock_code']}) 투자 메모</title>
<style>
  body {{ font-family: 'Noto Sans KR', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }}
  h1 {{ border-bottom: 2px solid #333; padding-bottom: 8px; }}
  .meta {{ color: #666; font-size: 0.9em; }}
  .section {{ margin: 24px 0; }}
  .section h2 {{ color: #1a1a1a; font-size: 1.2em; border-left: 4px solid #007bff; padding-left: 12px; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
  th {{ background: #f5f5f5; }}
  .positive {{ color: #22c55e; }}
  .negative {{ color: #ef4444; }}
  .badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 600; }}
  .badge-buy {{ background: #dcfce7; color: #166534; }}
  .badge-sell {{ background: #fecaca; color: #991b1b; }}
  .badge-hold {{ background: #f3f4f6; color: #374151; }}
</style>
</head>
<body>
<h1>{signal['stock_name']} ({signal['stock_code']})</h1>
<p class="meta">생성일: {generated_at} | 시그널 #{signal_id} | R/R Score: {signal.get('rr_score', 0):.1f}</p>

<div class="section">
<h2>투자 의견</h2>
<p><span class="badge badge-{signal['direction']}">{direction_kr}</span></p>
{f'<p><strong>시장 오해:</strong> {signal.get("variant_view", "")}</p>' if signal.get("variant_view") else ''}
</div>
"""

    # 시나리오
    if scenarios:
        html += '<div class="section"><h2>시나리오 분석</h2><table><tr><th>시나리오</th><th>목표가</th><th>상승률</th><th>확률</th></tr>'
        for key in ["bull", "base", "bear"]:
            s = scenarios.get(key, {})
            if s:
                html += f'<tr><td>{s.get("label", key)}</td><td>{s.get("price_target", 0):,.0f}원</td><td class="{"positive" if s.get("upside_pct", 0) >= 0 else "negative"}">{s.get("upside_pct", 0):+.1f}%</td><td>{s.get("probability", 0) * 100:.0f}%</td></tr>'
        html += '</table></div>'

    # DART 펀더멘탈
    if dart:
        html += '<div class="section"><h2>펀더멘탈 (DART)</h2><table><tr><th>지표</th><th>값</th></tr>'
        labels = {"dart_per": "PER", "dart_pbr": "PBR", "dart_operating_margin": "영업이익률", "dart_debt_ratio": "부채비율", "dart_eps_yoy_pct": "EPS 성장률", "dart_dividend_yield": "배당수익률"}
        for key, label in labels.items():
            val = dart.get(key)
            if val is not None:
                html += f'<tr><td>{label}</td><td>{val if isinstance(val, str) else f"{val:.1f}" if isinstance(val, float) else val}</td></tr>'
        html += '</table></div>'

    # 전문가 패널
    if expert_stances:
        html += '<div class="section"><h2>전문가 패널</h2><table><tr><th>전문가</th><th>의견</th></tr>'
        for name, stance in expert_stances.items():
            html += f'<tr><td>{name}</td><td>{stance}</td></tr>'
        html += '</table></div>'

    html += '<hr><p class="meta">본 메모는 AI 분석 시스템에 의해 자동 생성되었습니다. 투자 판단의 참고 자료로만 활용하세요.</p>'
    html += '</body></html>'

    # DB 저장
    await execute_insert(
        "INSERT INTO memo_exports (signal_id, format, file_path) VALUES (?, 'html', ?)",
        (signal_id, f"memo_{signal_id}_{datetime.now().strftime('%Y%m%d')}.html")
    )

    return html
```

- [ ] **Step 2: memos.py 라우터 생성**

```python
from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from app.services.memo_service import generate_memo_html

router = APIRouter(prefix="/api/memos", tags=["memos"])

@router.get("/{signal_id}/html", response_class=HTMLResponse)
async def export_memo_html(signal_id: int):
    html = await generate_memo_html(signal_id)
    if not html:
        return HTMLResponse("<p>시그널을 찾을 수 없습니다</p>", status_code=404)
    return HTMLResponse(html, headers={"Content-Disposition": f"attachment; filename=memo_{signal_id}.html"})
```

- [ ] **Step 3: main.py에 라우터 등록**

- [ ] **Step 4: SignalDetailModal에 다운로드 버튼 추가**

```tsx
{/* 모달 헤더에 버튼 추가 */}
<a
  href={`/api/memos/${signal.id}/html`}
  target="_blank"
  className="btn btn-sm btn-primary"
  style={{ marginRight: '8px' }}
>
  메모 내보내기
</a>
```

- [ ] **Step 5: 빌드 확인 + 커밋**

```bash
git add backend/app/services/memo_service.py backend/app/routers/memos.py backend/app/main.py frontend/src/components/signals/SignalDetailModal.tsx
git commit -m "feat: add investment memo HTML export from signal data"
```

---

## Task 11: 최종 통합 빌드 + 린트 검증

- [ ] **Step 1: TypeScript 검증**
Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 2: ESLint 검증**
Run: `cd frontend && npm run lint`

- [ ] **Step 3: Vite 빌드**
Run: `cd frontend && npx vite build`

- [ ] **Step 4: Python 문법 검증**
Run: `cd backend && python -c "from app.main import app; print('OK')"`

- [ ] **Step 5: 오류 수정 후 커밋**

```bash
git add -A
git commit -m "fix: resolve build and lint errors from new features"
```

---

## 요약

| Task | Phase | 설명 | 백엔드 | 프론트엔드 |
|------|-------|------|--------|-----------|
| 1 | 0 | DB 스키마 8테이블 + AgentRole | database.py, base.py | - |
| 2 | 1 | 외국인/기관 매매동향 | market_service, scanner | SignalCard |
| 3 | 1 | 내부자 거래 (DART) | dart_client, scanner | SignalCard |
| 4 | 1 | 촉매 일정 (DART + KRX) | calendar_service, router | CatalystTimeline |
| 5 | 2 | 뉴스/매크로 6번째 전문가 | news_service, experts | SignalCard |
| 6 | 2 | 동종 업종 비교 | peer_service, router, scanner | PeerComparison |
| 7 | 2 | 시그널 이력 비교 | signal_history_service, scanner | SignalHistory |
| 8 | 3 | DCF 밸류에이션 | dart_client, valuation_service | ValuationView |
| 9 | 3 | VaR/베타/섹터 리스크 | portfolio_risk_service, risk_manager | RiskDashboard |
| 10 | 4 | 투자 메모 HTML 내보내기 | memo_service, router | SignalDetailModal |
| 11 | - | 최종 빌드 검증 | all | all |
