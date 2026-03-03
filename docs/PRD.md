# PRD: KIS 자동 트레이딩 플랫폼

**Version:** 1.0
**Date:** 2026-03-03
**Status:** Phase 1 구현 중

---

## 1. 제품 비전

채팅 전용 KIS 트레이딩 어시스턴트를 **5개 AI 에이전트가 협업하는 자동 모의투자 플랫폼**으로 확장한다. 사용자는 대시보드에서 포트폴리오를 실시간 모니터링하고, AI 에이전트가 시장을 스캔하여 자동으로 매수/매도를 실행하며, 리스크 관리와 성과 리포트를 자동으로 생성받는다.

### 핵심 목표

- **G1:** 자동 포트폴리오 모니터링 (실시간 잔고/손익 추적)
- **G2:** 시장 스캔 및 매매 신호 생성
- **G3:** 규칙 기반 자동 매매 (손절/익절/리밸런싱) — 모의투자
- **G4:** 시각적 대시보드 (포트폴리오, 포지션, 주문, 에이전트 활동)
- **G5:** 스케줄 기반 반복 작업 (잔고 체크, 스캔, 리포트)
- **G6:** 기존 채팅 인터페이스 유지
- **G7:** 모든 매매는 demo(모의투자) 모드 강제

---

## 2. 사용자 페르소나

### 페르소나 1: 적극적 모의투자자 (주요)

- 채팅으로 종목 탐색, 시세 확인, 모의 주문 실행
- 대시보드로 포지션과 손익을 한눈에 확인
- 손절/익절 자동화로 상시 모니터링 부담 해소

### 페르소나 2: 전략 실험자

- 다양한 전략(모멘텀, 평균회귀)으로 에이전트 설정
- 장 시작 스캔, 정기 리밸런싱 활용
- 에이전트 리포트로 전략 개선

### 페르소나 3: 수동 관찰자

- 대시보드 중심 사용
- 워치리스트로 실시간 가격 모니터링
- 일일/주간 성과 리포트 확인

---

## 3. 시스템 아키텍처

### 현재 (As-Is)

```
React (Vite :5173) → FastAPI (:8000) → Claude API
                           ↕
                     MCP Client (fastmcp)
                           ↕
                  KIS MCP Server (SSE :3000)
                           ↕
                     KIS OpenAPI (demo)
```

### 목표 (To-Be)

```
                    React Frontend (:5173)
                    ├── Chat View (기존)
                    ├── Dashboard View (신규)
                    └── Agent Panel (신규)
                           │
                    HTTP + WebSocket (/ws)
                           │
                    FastAPI Backend (:8000)
                    ├── Routers
                    │   ├── chat (기존)
                    │   ├── health (확장)
                    │   ├── settings (기존)
                    │   ├── dashboard (신규)
                    │   ├── agents (신규)
                    │   ├── tasks (신규)
                    │   ├── watchlist (신규)
                    │   ├── signals (신규)
                    │   └── ws (신규, WebSocket)
                    ├── Agent Engine (Orchestrator)
                    │   ├── Portfolio Monitor Agent
                    │   ├── Market Scanner Agent
                    │   ├── Trading Executor Agent
                    │   ├── Risk Manager Agent
                    │   └── Report Generator Agent
                    ├── EventBus (에이전트 간 pub/sub 통신)
                    ├── Services
                    │   ├── claude_service (기존)
                    │   ├── mcp_client (기존)
                    │   ├── runtime_settings (기존)
                    │   ├── portfolio_service (신규)
                    │   ├── market_service (신규)
                    │   ├── order_service (신규)
                    │   ├── scheduler (신규, APScheduler)
                    │   ├── ws_manager (신규, Frontend 푸시)
                    │   └── kis_websocket (신규, KIS 실시간 시세)
                    └── SQLite (aiosqlite, 영속 저장소)
                           │
                    MCP SSE + KIS WebSocket
                           │
                    KIS MCP Server (:3000)
                    KIS OpenAPI (demo)
                    KIS WebSocket (demo :31000)
```

---

## 4. Agent Team 설계

### 4.1 에이전트 역할

#### Portfolio Monitor Agent (잔고 모니터링 에이전트)

- **목적:** 포지션, 잔고, 손익을 지속적으로 추적
- **MCP 도구:** `domestic_stock.inquire_balance`, `domestic_stock.inquire_present_balance`, `domestic_stock.inquire_balance_rlz_pl`, `domestic_stock.inquire_period_profit`
- **트리거:** 장중 5분마다 스케줄, 수동 실행
- **출력:** PortfolioSnapshot DB 저장, `portfolio.updated` 이벤트 발행
- **이벤트:** `portfolio.updated`, `position.threshold_breach`

#### Market Scanner Agent (시장 스캐너 에이전트)

- **목적:** 시장 스캔 → 거래량, 등락률 기반 매매 신호 생성
- **MCP 도구:** `domestic_stock.volume_rank`, `domestic_stock.fluctuation`, `domestic_stock.market_cap`, `domestic_stock.inquire_price`, `domestic_stock.inquire_daily_itemchartprice`, `domestic_stock.inquire_investor`
- **트리거:** 09:05, 12:00 스케줄, 수동 실행
- **출력:** Claude API로 시장 데이터 분석 → 신호 생성 (종목, 방향, 신뢰도)
- **이벤트:** `signal.generated`, `watchlist.updated`

#### Trading Executor Agent (매매 실행 에이전트)

- **목적:** 승인된 신호에 따라 주문 실행
- **MCP 도구:** `domestic_stock.order_cash`, `domestic_stock.order_rvsecncl`, `domestic_stock.inquire_psbl_order`, `domestic_stock.inquire_psbl_sell`
- **트리거:** `signal.approved` 또는 `risk.stop_loss` 이벤트
- **출력:** 주문 결과 DB 저장
- **이벤트:** `order.submitted`, `order.filled`, `order.failed`
- **안전:** 기존 demo 모드 2중 보호 위에 에이전트 엔진 3중 보호 추가

#### Risk Manager Agent (리스크 관리 에이전트)

- **목적:** 모든 매매 결정 검증, 손절/익절 감지
- **MCP 도구:** `domestic_stock.inquire_balance`, `domestic_stock.inquire_psbl_order`
- **트리거:** `signal.generated` (신호 검증), `portfolio.updated` (임계값 체크)
- **규칙 (설정 가능):**
  - 손절: 종목별 -3% (기본값)
  - 익절: 종목별 +5% (기본값)
  - 최대 포지션 수: 5개
  - 종목별 최대 비중: 포트폴리오의 20%
  - 일일 최대 손실: 설정 가능
- **이벤트:** `signal.approved`, `signal.rejected`, `risk.stop_loss`, `risk.take_profit`, `risk.alert`
- **우선순위:** 최고 — 모든 매매 행위를 거부할 수 있음

#### Report Generator Agent (리포트 생성 에이전트)

- **목적:** 일일/주간 성과 리포트 생성
- **MCP 도구:** `domestic_stock.inquire_period_profit`, `domestic_stock.inquire_balance_rlz_pl`, `domestic_stock.inquire_daily_ccld`
- **트리거:** 16:00 일일, 금요일 17:00 주간
- **출력:** Claude API로 성과 데이터 분석 → 자연어 리포트 생성
- **이벤트:** `report.generated`

### 4.2 매매 승인 모드

`RiskConfig`의 `signal_approval_mode` 설정:

| 모드 | 동작 | 손절매 |
|------|------|--------|
| `auto` (기본) | RiskManager 승인 → 즉시 TradingExecutor 실행 | 자동 |
| `manual` | RiskManager 승인 → 대시보드 알림 → 사용자 수동 승인/거부 | 자동 (긴급 보호) |

### 4.3 이벤트 흐름

```
PortfolioMonitor ─→ portfolio.updated ─→ RiskManager
                                          ├── risk.stop_loss ─→ TradingExecutor → order.submitted
                                          └── risk.take_profit ─→ TradingExecutor → order.submitted

MarketScanner ─→ signal.generated ─→ RiskManager
                                      ├── signal.approved ─→ [auto mode] TradingExecutor → order.submitted
                                      │                   ─→ [manual mode] Dashboard 알림 → 사용자 승인 → Executor
                                      └── signal.rejected (로그 기록)

모든 이벤트 → EventBus → WebSocket Manager → Frontend Dashboard (실시간)
```

### 4.4 핵심 시나리오

**시나리오 1: 자동 손절매**

1. Scheduler가 5분마다 PortfolioMonitor 실행
2. MCP `inquire_balance` 호출 → 포지션별 손익 계산
3. PortfolioSnapshot DB 저장
4. `portfolio.updated` 이벤트 발행
5. RiskManager가 각 포지션 임계값 확인
6. 삼성전자 -3.5% → `risk.stop_loss` 이벤트 발행 (모드 무관 자동)
7. TradingExecutor가 `order_cash` 매도 주문 실행 (env_dv=demo)
8. 주문 결과 DB 저장, `order.submitted` 이벤트 → 대시보드 실시간 반영

**시나리오 2: 장 시작 스캔 → 매수**

1. 09:05 Scheduler가 MarketScanner 실행
2. MCP `volume_rank` + `fluctuation` 호출
3. Claude API에 시장 데이터 분석 요청
4. Claude 응답: `[{stock: "005930", direction: "buy", confidence: 0.85}]`
5. `signal.generated` 이벤트 발행
6. RiskManager 검증: 포지션 한도, 비중 한도, 일일 손실 한도
7. [auto 모드] `signal.approved` → TradingExecutor가 `inquire_psbl_order` → `order_cash` 매수
8. [manual 모드] 대시보드에 신호 표시 → 사용자 승인 → 실행

**시나리오 3: 정기 리밸런싱**

1. 14:00 Scheduler가 PortfolioMonitor 실행 (rebalance 플래그)
2. 현재 포지션 대비 목표 배분 비교
3. Claude API에 조정 주문 생성 요청
4. 신호 일괄 생성 → RiskManager 일괄 검증
5. 승인된 주문 순차 실행

---

## 5. 기능 명세

### P0 (Must Have — Phase 1)

| ID | 기능 | 설명 |
|----|------|------|
| F1 | SQLite 데이터베이스 | 포트폴리오, 주문, 에이전트 로그, 스냅샷 영속 저장 |
| F2 | Portfolio Service | MCP 잔고/포지션 조회 래핑 서비스 |
| F3 | Agent 기반 프레임워크 | BaseAgent, AgentEngine, EventBus, SharedState |
| F4 | Portfolio Monitor Agent | 정기 잔고 체크 및 손익 계산 |
| F5 | Risk Manager Agent | 임계값 체크, 손절/익절 감지 |
| F6 | Backend WebSocket | 백엔드→프론트엔드 이벤트 푸시 |
| F7 | Dashboard — 포트폴리오 뷰 | 총자산, 현금, 포지션 테이블, 손익 |
| F8 | Scheduler | APScheduler 시장 시간 인식 스케줄링 |
| F9 | Agent 설정 API | 에이전트 설정 CRUD (임계값, 간격) |

### P1 (Should Have — Phase 2)

| ID | 기능 | 설명 |
|----|------|------|
| F10 | Market Scanner Agent | 거래량/등락률 스캔 + Claude 분석 신호 생성 |
| F11 | Trading Executor Agent | 승인된 신호 자동 주문 실행 |
| F12 | KIS WebSocket Client | 실시간 시세 수신 (ws://ops.koreainvestment.com:31000) |
| F13 | Dashboard — 워치리스트 | 실시간 가격 모니터링 |
| F14 | Dashboard — 주문 내역 | 주문 상태, 거래별 손익 |
| F15 | Dashboard — Agent Panel | 에이전트 상태, 활성/비활성, 수동 실행 |
| F16 | Report Generator Agent | 일일/주간 성과 리포트 (Claude 분석) |

### P2 (Nice to Have — Phase 3)

| ID | 기능 | 설명 |
|----|------|------|
| F17 | 리밸런싱 전략 | 목표 배분 기반 정기 리밸런싱 |
| F18 | 성과 지표 | Sharpe ratio, max drawdown, win rate, 수익률 차트 |
| F19 | 알림 시스템 | 브라우저 알림, 선택적 Slack/이메일 |
| F20 | 전략 백테스팅 | 과거 데이터 에이전트 파이프라인 리플레이 |

---

## 6. 데이터 모델

### SQLite (aiosqlite)

```sql
-- 포트폴리오 스냅샷
CREATE TABLE portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    total_value REAL NOT NULL,
    cash_balance REAL NOT NULL,
    total_pnl REAL NOT NULL,
    total_pnl_pct REAL NOT NULL,
    positions_json TEXT NOT NULL
);

-- 포지션 (스냅샷 내 개별 종목)
CREATE TABLE positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER REFERENCES portfolio_snapshots(id),
    stock_code TEXT NOT NULL,
    stock_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    avg_buy_price REAL NOT NULL,
    current_price REAL NOT NULL,
    market_value REAL NOT NULL,
    unrealized_pnl REAL NOT NULL,
    unrealized_pnl_pct REAL NOT NULL
);

-- 주문
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    stock_code TEXT NOT NULL,
    stock_name TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
    order_type TEXT NOT NULL CHECK(order_type IN ('market', 'limit')),
    quantity INTEGER NOT NULL,
    price REAL,
    status TEXT NOT NULL CHECK(status IN ('submitted', 'filled', 'rejected', 'cancelled')),
    fill_price REAL,
    fill_quantity INTEGER,
    reason TEXT,
    mcp_result_json TEXT,
    signal_id INTEGER REFERENCES signals(id)
);

-- 매매 신호
CREATE TABLE signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    stock_code TEXT NOT NULL,
    stock_name TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('buy', 'sell')),
    confidence REAL NOT NULL,
    reason TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected', 'executed')),
    risk_notes TEXT
);

-- 에이전트 실행 로그
CREATE TABLE agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_role TEXT NOT NULL,
    action TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    success INTEGER NOT NULL,
    result_summary TEXT,
    error_message TEXT,
    events_emitted_json TEXT
);

-- 워치리스트
CREATE TABLE watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT NOT NULL UNIQUE,
    stock_name TEXT NOT NULL,
    added_at TEXT NOT NULL,
    added_by TEXT NOT NULL,
    last_price REAL,
    last_updated TEXT
);

-- 리스크 설정
CREATE TABLE risk_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 스케줄 태스크
CREATE TABLE scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run TEXT,
    next_run TEXT,
    last_status TEXT,
    config_json TEXT
);
```

---

## 7. API 명세

### Dashboard

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/dashboard/portfolio` | — | `{total_value, cash_balance, total_pnl, total_pnl_pct, positions: [...]}` |
| GET | `/api/dashboard/portfolio/history?hours=24` | — | `{snapshots: [{timestamp, total_value, cash_balance, total_pnl}...]}` |
| GET | `/api/dashboard/positions` | — | `{positions: [{stock_code, stock_name, quantity, avg_buy_price, current_price, pnl, pnl_pct}...]}` |
| GET | `/api/dashboard/orders?limit=50&offset=0` | — | `{orders: [...], total_count}` |
| GET | `/api/dashboard/performance?period=7d` | — | `{returns_pct, max_drawdown, win_rate, trade_count, chart_data: [...]}` |

### Agents

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/agents` | — | `{agents: [{id, name, role, status, last_run, config}...]}` |
| GET | `/api/agents/{id}` | — | `{id, name, role, status, config, recent_logs: [...]}` |
| PUT | `/api/agents/{id}/config` | `{config: {...}}` | `{agent_id, config}` |
| POST | `/api/agents/{id}/enable` | — | `{agent_id, status}` |
| POST | `/api/agents/{id}/disable` | — | `{agent_id, status}` |
| POST | `/api/agents/{id}/run` | — | `{execution_id, status}` |
| GET | `/api/agents/logs?agent_id=&limit=50` | — | `{logs: [...]}` |
| GET | `/api/agents/events?limit=100` | — | `{events: [...]}` |

### Tasks

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/tasks` | — | `{tasks: [{id, name, agent_id, cron, enabled, last_run, next_run}...]}` |
| PUT | `/api/tasks/{id}` | `{cron_expression, enabled}` | `{task}` |
| POST | `/api/tasks/{id}/run-now` | — | `{execution_id}` |

### Watchlist

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/watchlist` | — | `{items: [{stock_code, stock_name, last_price, change_pct}...]}` |
| POST | `/api/watchlist` | `{stock_code}` | `{item}` |
| DELETE | `/api/watchlist/{stock_code}` | — | `{status}` |

### Signals

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/signals?status=all&limit=50` | — | `{signals: [...], total_count}` |
| POST | `/api/signals/{id}/approve` | — | `{signal_id, status}` |
| POST | `/api/signals/{id}/reject` | — | `{signal_id, status}` |

### WebSocket

```
WS /ws

Server → Client:
  {"type": "portfolio_update", "data": {total_value, positions: [...]}}
  {"type": "price_update", "data": {stock_code, price, change_pct}}
  {"type": "order_executed", "data": {order_id, stock_code, side, status}}
  {"type": "agent_event", "data": {agent_id, event_type, data}}
  {"type": "alert", "data": {level, message}}

Client → Server:
  {"action": "subscribe_watchlist", "stock_codes": ["005930"]}
  {"action": "unsubscribe_watchlist", "stock_codes": ["005930"]}
```

---

## 8. Cron 스케줄

| 태스크 | 에이전트 | Cron 식 | 설명 |
|--------|---------|---------|------|
| portfolio_check | Portfolio Monitor | `*/5 9-15 * * 1-5` | 5분마다 (장중, 평일) |
| morning_scan | Market Scanner | `5 9 * * 1-5` | 09:05 KST |
| midday_scan | Market Scanner | `0 12 * * 1-5` | 12:00 KST |
| closing_check | Portfolio Monitor | `20 15 * * 1-5` | 15:20 (마감 10분 전) |
| daily_report | Report Generator | `0 16 * * 1-5` | 16:00 KST |
| weekly_report | Report Generator | `0 17 * * 5` | 금 17:00 KST |

---

## 9. 안전 및 보안

### 3중 Demo 모드 보호

1. **시스템 프롬프트** — Claude에게 `env_dv="demo"` 사용 지시
2. **MCP Client** — `mcp_client.py`에서 `env_dv="real"` → `"demo"` 자동 오버라이드
3. **Agent Engine** — `trading_mode != "demo"` 시 TradingExecutor 인스턴스화 거부

### 에이전트 격리

- 각 에이전트는 `allowed_tools` 목록 내 MCP 도구만 호출 가능
- RiskManager가 최고 우선순위로 모든 매매 신호 검증
- 에이전트 오류는 다른 에이전트에 전파되지 않음

### 자격증명

- API 키는 DB에 저장하지 않음 (항상 `.env`에서 읽기)
- WebSocket 인증키는 메모리에서만 관리

---

## 10. 비기능 요구사항

| 항목 | 요구사항 |
|------|---------|
| WebSocket 지연 | 데이터 수신 후 100ms 이내 프론트엔드 전달 |
| 에이전트 실행 시간 | 단일 에이전트 30초 이내 완료 |
| 대시보드 갱신 | 장중 포트폴리오 데이터 5분 이내 |
| KIS WebSocket 재연결 | 지수 백오프 (1s→2s→4s→8s, 최대 60s) |
| 에이전트 오류 격리 | 개별 에이전트 실패 시 다른 에이전트 영향 없음 |
| 정상 종료 | lifespan 컨텍스트에서 모든 서비스 순차 종료 |

---

## 11. 구현 Phase

### Phase 1: Foundation

- SQLite DB + 스키마 초기화
- Agent Framework (BaseAgent, EventBus, AgentEngine)
- Portfolio Monitor + Risk Manager Agent
- Portfolio Service (MCP 잔고 조회 래핑)
- APScheduler 통합
- Backend WebSocket Manager
- Dashboard 기본 뷰 (포트폴리오 요약, 포지션, 알림)
- 신규 API 라우터 (dashboard, agents, tasks, watchlist, ws)

### Phase 2: Trading Automation

- Market Scanner Agent (Claude 기반 분석)
- Trading Executor Agent
- KIS WebSocket Client (실시간 시세)
- Market/Order Service
- Signals API + 수동 승인 UI
- Dashboard 확장 (워치리스트, 주문 내역, 에이전트 패널)

### Phase 3: Reporting & Polish

- Report Generator Agent (Claude 성과 분석)
- 성과 지표 (수익률, 드로다운, Sharpe ratio)
- 수익률 차트
- UX 개선 및 반응형 대시보드

---

## 12. 의존성

### Backend (추가)

- `aiosqlite>=0.20.0` — 비동기 SQLite
- `apscheduler>=3.10.0` — 스케줄러
- `websockets>=12.0` — KIS WebSocket 클라이언트
- `pycryptodome>=3.20.0` — KIS WebSocket AES256 복호화

### Frontend (추가)

- `recharts>=2.12.0` — 차트 라이브러리
