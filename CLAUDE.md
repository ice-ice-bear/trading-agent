# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM-based stock trading assistant using Korea Investment & Securities (KIS) OpenAPI. A React dashboard + chat UI communicates with a FastAPI backend that orchestrates a multi-agent system with Claude API calls and MCP tool execution for market scanning, signal generation, risk management, and paper trading.

## Architecture

```
React (Vite, :5174)  →  FastAPI (:8001)  →  Claude API
                              ↕
                     MCP Client (fastmcp)
                              ↕
                  KIS Trading MCP Server (SSE, :3001)
                              ↕
                      KIS OpenAPI (paper trading)
```

**Request flow:** User message → POST `/api/chat` (SSE stream) → Claude API with MCP tool definitions → Claude returns tool_use blocks → backend executes via MCP client → results fed back to Claude → Claude streams natural language response → SSE events to React UI.

**SSE event types:** `text_delta`, `tool_start`, `tool_executing`, `tool_result`, `done`, `error`

**Session management:** In-memory Python dict keyed by session_id (UUID). Message history is lost on backend restart.

## Commands

```bash
make install          # Install all dependencies (backend uv sync + frontend npm install)
make start            # Start all 3 services (stops existing first)
make stop             # Stop all services (kills ports 3001, 8001, 5174)
make status           # Show running/stopped status
make health           # curl /health endpoint
make logs             # Tail all service logs from .logs/
make clean            # Stop + remove dist, .vite cache, .logs, MCP tmp files
```

Individual services:
```bash
make mcp              # MCP server only (:3001)
make backend          # Backend only (:8001)
make frontend         # Frontend only (:5174)
```

Direct commands (for development/debugging):
```bash
# Backend
cd backend && ENV_FILE=../.env uv run uvicorn app.main:app --reload --port 8001

# Frontend
cd frontend && npx vite

# MCP Server
cd "open-trading-api/MCP/Kis Trading MCP" && ENV_FILE=../../.env uv run python server.py

# Frontend lint
cd frontend && npm run lint
```

## Multi-Agent System

### Agents (`backend/app/agents/`)

| Agent | ID | Role | Description |
|-------|----|------|-------------|
| `PortfolioMonitorAgent` | `portfolio_monitor` | MONITOR | KIS 잔고 조회 → 포트폴리오 스냅샷 저장 |
| `MarketScannerAgent` | `market_scanner` | SCANNER | KOSPI200 후보 스캔 → 지표 계산 → 전문가 패널 → 신호 생성 |
| `RiskManagerAgent` | `risk_manager` | RISK | 신호/포트폴리오 검증, 손절/익절 판단 |
| `TradingExecutorAgent` | `trading_executor` | EXECUTOR | 승인된 신호 → 주문 실행 |
| `ReportGeneratorAgent` | `report_generator` | REPORTER | 일일/주간 리포트 생성 |

### Event-Driven Flow

```
portfolio_monitor → portfolio.updated → risk_manager
market_scanner → signal.generated → risk_manager → signal.approved → trading_executor
                                                  → signal.rejected
trading_executor → order.filled/order.failed → risk_manager
risk_manager → risk.stop_loss/risk.take_profit → trading_executor
report_generator → report.generated
```

### Scheduler (`backend/app/services/scheduler.py`)

APScheduler, Asia/Seoul timezone. Tasks stored in DB (`scheduled_tasks` table).

Key scheduled tasks:
- `portfolio_check` → `portfolio_monitor` (*/5 9-15 * * 1-5)
- `morning_scan` → `market_scanner` (5 9 * * 1-5)
- `midday_scan` → `market_scanner` (0 12 * * 1-5)
- `afternoon_scan` → `market_scanner` (0 14 * * 1-5)
- `closing_check` → `portfolio_monitor` (20 15 * * 1-5)
- `daily_report` → `report_generator` (0 16 * * 1-5)
- `weekly_report` → `report_generator` (0 17 * * 5)

### Market Scanner Expert Panel (`backend/app/agents/market_scanner_experts.py`)

5명 전문가 (Momentum, Value, Technical, Macro, Sentiment) → Chief Analyst 종합 → Critic 검증 → 신호 생성

## Key Entry Points

- **Backend app:** `backend/app/main.py` — FastAPI app with lifespan (MCP connect/disconnect)
- **Chat endpoint:** `backend/app/routers/chat.py` — POST `/api/chat`, SSE event generator
- **Agentic loop:** `backend/app/services/claude_service.py` — `stream_chat()` async generator
- **MCP client:** `backend/app/services/mcp_client.py` — `mcp_manager` singleton (auto-reconnect on failure)
- **Agent engine:** `backend/app/agents/engine.py` — `AgentEngine` orchestrator
- **Event bus:** `backend/app/agents/event_bus.py` — `EventBus` pub/sub
- **Signal models:** `backend/app/models/signal.py` — `Scenario`, `SignalAnalysis`, `compute_rr_score()`
- **Config:** `backend/app/config.py` — Pydantic BaseSettings, loads from `.env` via `ENV_FILE` env var
- **Frontend:** `frontend/src/` — React dashboard with chat, signals, portfolio, agent monitoring
- **MCP server:** `open-trading-api/MCP/Kis Trading MCP/server.py` — FastMCP entry point
- **MCP tools base:** `open-trading-api/MCP/Kis Trading MCP/tools/base.py` — BaseTool with ApiExecutor

## MCP Tool System

The MCP server exposes 8 tool classes covering 166 KIS APIs. Each tool's `_run()` method handles three call types:
1. `find_stock_code` — stock lookup from master database
2. `find_api_detail` — API metadata lookup
3. Regular API calls — download Python code from GitHub, modify for demo mode, inject auth credentials, execute via subprocess

## Configuration

All services read from a single `.env` file at project root (passed via `ENV_FILE` env var). Required: `ANTHROPIC_API_KEY`, `KIS_PAPER_APP_KEY`, `KIS_PAPER_APP_SECRET`, `KIS_PAPER_STOCK`

Frontend dev server proxies `/api` and `/health` to `localhost:8001` (configured in `frontend/vite.config.ts`).

## Tech Stack

- **Backend:** FastAPI, uvicorn, anthropic SDK, fastmcp, sse-starlette, pydantic-settings, APScheduler. Package manager: uv
- **Frontend:** React 19, Vite 7, TypeScript, react-markdown + rehype-highlight. Package manager: npm
- **MCP Server:** FastMCP (Python), SSE transport
- **Prerequisites:** Python 3.12+, Node.js 22+, uv, nvm

## Language

The system prompt in `claude_service.py` is in Korean. The UI is bilingual (Korean/English).

## Session Start Routine

장 운영일(평일) 세션 시작 시:
1. `make start` → `make health`로 서비스 정상 확인
2. `/loop 5m server log를 확인하고 오류가 생성된다면 그게 코드베이스인지 아닌지 검토해서 보고자료를 만들어줘 이를 바탕으로 코드 내 에러를 수정하겠어 직접 에러수정이 가능하다면 더 좋고` 로 5분 로그 모니터링 예약
3. 장 마감 후 loop 정리 및 변경사항 커밋

## HarnessKit

### Session Start Protocol
1. Read `progress/claude-progress.txt`
2. Read `docs/feature_list.json` — select highest priority `passes: false` feature
3. Write selected feature ID to `.harnesskit/current-feature.txt`
4. Run existing tests to verify baseline

### Session End Protocol
1. Update `progress/claude-progress.txt` with what was implemented, what's broken, what's next
2. Update `docs/feature_list.json` — set `passes: true` only after tests pass
3. Commit changes

### Error Logging (automatic)
- On error: append to `.harnesskit/current-session.jsonl`:
  `{"type":"error","pattern":"error message","file":"file path"}`

### Tool Usage Logging (v2a — automatic)
- On major tool use, append to `.harnesskit/current-session.jsonl`:
  `{"type":"tool_call","tool":"ToolName","summary":"brief description","timestamp":"HH:MM"}`
  (Log Bash, Edit, Write, WebSearch, WebFetch only — skip Read, Glob, Grep)

### Absolute Rules
- Do NOT modify `feature_list.json` except the `passes` field
- One feature per session
- Never set `passes: true` without passing tests

For harness engineering principles → .harnesskit/bible.md

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).
