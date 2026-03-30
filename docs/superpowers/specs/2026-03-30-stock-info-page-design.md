# Stock Info Page — Design Spec

## Overview

사용자가 직접 종목을 검색하고 심층 리서치 데이터를 한 화면에서 조회할 수 있는 독립 뷰.
기존 에이전트 자동화(SignalPanel, ReportViewer)와는 별도로, 사용자 주도적 정보 탐색을 지원한다.

## Decisions

| 항목 | 결정 | 근거 |
|------|------|------|
| 페이지 구조 | 단일 페이지 (접이식 사이드바 + 메인 리서치) | DashboardView와 동일 패턴, 발굴→분석 흐름 자연스러움 |
| API 방식 | 섹션별 개별 엔드포인트 | 하이브리드 캐시와 궁합, 부분 로딩/실패 격리 |
| 캐시 전략 | 하이브리드 (현재가 실시간, 나머지 일일캐시 → 백그라운드 갱신) | 체감 속도 + 데이터 신선도 균형 |
| 네비게이션 위치 | IconRail 4번째 (Reports 옆) | 분석/리서치 성격이 리포트와 가까움 |
| 명칭 | Stock Info (📊) | 종목 정보 직관적 |
| 섹터 우려 대응 | 사이드바 섹터탭 + PeerSection 확장 모드 | 사이드바 공간 제약 보완, 추후 Discovery 분리 대비 |

## Page Structure

### Component Tree

```
StockInfoView                        ← App.tsx에 'stockinfo' 뷰로 등록
├── DiscoverySidebar                 ← 접이식 좌측 사이드바
│   ├── StockSearchInput             ← 종목 검색 (자동완성)
│   ├── MarketRankTabs               ← 탭: 거래량↑ | 등락률↑ | 섹터별
│   │   ├── VolumeRankList
│   │   ├── FluctuationRankList
│   │   └── SectorList               ← KOSPI200 섹터별 아코디언
│   └── CollapseToggle
│
└── ResearchPanel                    ← 우측 메인 리서치 영역
    ├── ResearchHeader               ← 종목명 + 코드 + 현재가 + 관심종목 추가
    ├── PriceChartSection            ← OHLCV 차트 + 기술적 지표
    ├── FundamentalsSection          ← 재무지표 그리드 (신뢰등급 포함)
    ├── InvestorFlowSection          ← 외국인/기관 수급 동향
    ├── NewsDisclosureSection        ← 뉴스(감성분석) + DART 공시
    ├── ValuationSection             ← DCF 적정가 + 민감도 테이블
    ├── PeerSection                  ← 동종업종 비교 (확장 모드 지원)
    ├── InsiderSection               ← 내부자 거래
    └── SignalHistorySection         ← 과거 매매신호 이력
```

### Layout

- **사이드바 펼침**: 260px 고정폭 + 나머지 메인 영역
- **사이드바 접힘**: 메인 영역 풀스크린
- **메인 그리드**: 상단 헤더 → 2fr+1fr 그리드 (차트+뉴스 좌, 재무+DCF 우) → 하단 2컬럼 (신호이력+내부자)
- **반응형**: 사이드바 접기/펼치기 토글

### Component Contracts

- `DiscoverySidebar`: props `{ onSelectStock: (code: string) => void, collapsed: boolean, onToggle: () => void }`
- `ResearchPanel`: props `{ stockCode: string | null }`
- 각 섹션 컴포넌트: props `{ stockCode: string }` — 자체 API 호출, 자체 로딩/에러 상태 관리

## API Design

### 신규 엔드포인트 (backend/app/routers/research.py)

#### 1. GET /api/research/search?q={query}

종목 검색 (자동완성용).

- **입력**: `q` — 종목명 또는 코드 (2자 이상)
- **출처**: MCP `find_stock_code` → KIS 마스터DB
- **응답**: `[{ stock_code: string, stock_name: string, market: string }]`
- **캐시**: 없음 (실시간)

#### 2. GET /api/research/{stock_code}/price

현재가 + 시세 정보.

- **출처**: `market_service.get_stock_price()`
- **응답**: `{ current_price, change, change_pct, open, high, low, volume }`
- **캐시**: 없음 (항상 실시간)

#### 3. GET /api/research/{stock_code}/analysis

종합 분석 데이터. 백엔드에서 6개 서비스 `asyncio.gather()` 병렬 호출.

- **출처 및 응답**:
  - `chart`: `market_service.get_daily_chart()` → OHLCV 90일
  - `technicals`: 차트 데이터로 계산 → RSI, MACD, BB, MA(20/50/200), 거래량 추세
  - `fundamentals`: `dart_client.fetch()` → PER, PBR, EPS YoY, 부채비율, 영업이익률, 배당수익률 + 신뢰등급
  - `investor_trend`: `market_service.get_investor_trend()` → 외국인/기관 20일 순매수
  - `insider_trades`: `dart_client.fetch_insider_trades()` → 최근 임원/대주주 매매
  - `dcf`: `valuation_service.get_or_compute_dcf()` → 적정가, 상승여력, 민감도 테이블
- **캐시**: 일일 캐시 (dart/dcf는 기존 캐시 활용, chart는 장중 갱신)

#### 4. GET /api/research/{stock_code}/news

뉴스 + 공시.

- **출처**:
  - `news_service.fetch_stock_news()` → NAVER/Google 뉴스 + Claude 감성분석
  - `calendar_service.fetch_dart_disclosures()` → DART 공시
- **응답**: `{ news: [{ title, sentiment, source, date }], disclosures: [{ title, date, type }] }`
- **캐시**: 일일 캐시 → 백그라운드 갱신

#### 5. GET /api/research/ranks

시장 랭킹 (사이드바용).

- **출처**: `market_service.get_volume_rank()` + `get_fluctuation_rank()` 병렬
- **응답**: `{ volume_rank: [{ stock_code, stock_name, change_pct, volume }], fluctuation_rank: [...] }`
- **캐시**: 5분 TTL (장중 갱신 주기)

### 기존 엔드포인트 재사용

- `GET /api/peers/{stock_code}` → 동종업종 비교
- `GET /api/signals/history/{stock_code}` → 과거 매매신호
- `GET /api/calendar?stock_code={code}` → 촉매 이벤트

## Backend Changes

### 신규 파일

- `backend/app/routers/research.py` — 리서치 라우터 (5 엔드포인트)
- `backend/app/services/technical_service.py` — 기술적 지표 계산 (market_scanner에서 RSI/MACD/BB 로직 추출)

### 수정 파일

- `backend/app/main.py` — research 라우터 등록

### technical_service.py 설계

market_scanner.py의 `_compute_indicators()` 로직을 독립 서비스로 추출:

- `compute_technicals(ohlcv_data) -> TechnicalIndicators`
  - RSI (14일)
  - MACD (12, 26, 9)
  - 볼린저 밴드 (20일, 2σ)
  - 이동평균 (20, 50, 200일)
  - 거래량 추세 (20일 평균 대비)

## Frontend Changes

### 신규 파일

| 파일 | 역할 |
|------|------|
| `components/StockInfoView.tsx` | 메인 뷰 컨테이너 |
| `components/StockInfoView.css` | 레이아웃 스타일 |
| `components/stockinfo/DiscoverySidebar.tsx` | 접이식 사이드바 |
| `components/stockinfo/ResearchPanel.tsx` | 리서치 메인 영역 |
| `components/stockinfo/ResearchHeader.tsx` | 종목 헤더 + 현재가 |
| `components/stockinfo/PriceChartSection.tsx` | 차트 + 기술적 지표 |
| `components/stockinfo/FundamentalsSection.tsx` | 재무지표 그리드 |
| `components/stockinfo/InvestorFlowSection.tsx` | 수급 동향 |
| `components/stockinfo/NewsDisclosureSection.tsx` | 뉴스 + 공시 |
| `components/stockinfo/ValuationSection.tsx` | DCF + 민감도 |
| `components/stockinfo/PeerSection.tsx` | 동종업종 (확장 모드) |
| `components/stockinfo/InsiderSection.tsx` | 내부자 거래 |
| `components/stockinfo/SignalHistorySection.tsx` | 과거 신호이력 |
| `components/stockinfo/SectionSkeleton.tsx` | 공통 로딩 스켈레톤 |
| `hooks/useStockResearch.ts` | 데이터 로딩 훅 |

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `App.tsx` | `AppView`에 `'stockinfo'` 추가, StockInfoView 렌더링 |
| `components/IconRail.tsx` | Stock Info 아이콘 + 네비게이션 추가 (4번째) |
| `services/api.ts` | research API 함수 5개 추가 |
| `types.ts` | Research 관련 타입 추가 |

### 신규 타입 (types.ts)

```typescript
interface StockPrice {
  current_price: number
  change: number
  change_pct: number
  open: number
  high: number
  low: number
  volume: number
}

interface TechnicalIndicators {
  rsi: number
  macd: { value: number; signal: number; histogram: number }
  bollinger: { upper: number; middle: number; lower: number; position_pct: number }
  ma: { ma20: number; ma50: number; ma200: number }
  volume_trend_pct: number
}

interface StockAnalysis {
  chart: OHLCVData[]
  technicals: TechnicalIndicators
  fundamentals: DartFundamentals  // 기존 타입 재사용
  investor_trend: { foreign_net: number; institutional_net: number; data: DailyFlow[] }
  insider_trades: InsiderTrade[]
  dcf: DCFValuation  // 기존 타입 재사용
}

interface StockNews {
  news: { title: string; sentiment: string; source: string; date: string }[]
  disclosures: { title: string; date: string; type: string }[]
}

interface MarketRanks {
  volume_rank: RankItem[]
  fluctuation_rank: RankItem[]
}

interface RankItem {
  stock_code: string
  stock_name: string
  change_pct: number
  volume?: number
}

interface SearchResult {
  stock_code: string
  stock_name: string
  market: string
}
```

## Data Loading Strategy

### useStockResearch(stockCode) Hook

종목 선택 시 5개 API를 동시 병렬 호출. 각 응답은 도착 순서대로 상태 업데이트.

```
Phase 1 (0ms)     — 5개 API 동시 호출
Phase 2 (~200ms)  — /price 도착 → ResearchHeader 렌더링
Phase 3 (~1-3s)   — /analysis 도착 → 차트+지표+재무+수급+DCF 렌더링
Phase 4 (~1-2s)   — /news, /peers, /signals 각각 도착 → 해당 섹션 렌더링
```

### 섹션별 상태

각 섹션은 3가지 상태를 가짐:
- **loading**: SectionSkeleton 컴포넌트 표시
- **loaded**: 데이터 렌더링
- **error**: 에러 메시지 + 재시도 버튼

### 캐시 정책 매핑

| 데이터 | 프론트 전략 | 백엔드 캐시 |
|--------|------------|------------|
| 현재가 | 항상 실시간 호출 | 없음 |
| 차트/기술적 지표 | 캐시 → 차트 갱신 시 재계산 | 장중 갱신 |
| 재무/DCF/피어 | 일일 캐시 우선 | 일일 TTL |
| 뉴스/공시 | 캐시 → 백그라운드 갱신 | 일일 TTL |
| 수급/내부자 | 캐시 → 백그라운드 갱신 | 일일 TTL |

## Sector Concern Mitigation

### 이번 구현 (Phase 1)

1. **사이드바 섹터탭**: KOSPI200 구성종목을 `kospi200_components` 테이블 + peer_service 섹터 매핑으로 그룹핑. 아코디언 UI로 섹터 펼침 → 종목 클릭.
2. **PeerSection 확장 모드**: 기본 3종목 비교 → "전체 보기" 클릭 시 섹터 전체 종목 비교 테이블 (PER, PBR, 영업이익률, 부채비율, 등락률 컬럼).

### 확장 대비 설계 원칙

- `DiscoverySidebar`는 `onSelectStock(code)` 콜백만 받음 → 부모와 느슨한 결합
- `ResearchPanel`은 `stockCode` prop만 받음 → 어디서든 재사용 가능
- Phase 2에서 Discovery 별도 페이지 분리 시 DiscoverySidebar → DiscoveryView로 승격만 필요

### 향후 확장 (구현하지 않음)

- **Phase 2**: Discovery 페이지 분리 (섹터 히트맵, 시가총액 트리맵 등)
- **Phase 3**: 멀티 종목 비교 모드 (ResearchPanel 복수 인스턴스)
