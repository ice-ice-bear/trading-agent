# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM-based stock trading assistant using Korea Investment & Securities (KIS) OpenAPI. A React chat UI communicates with a FastAPI backend that orchestrates Claude API calls and MCP tool execution for querying market data and paper trading.

## Architecture

```
React (Vite, :5173)  →  FastAPI (:8000)  →  Claude API
                              ↕
                     MCP Client (fastmcp)
                              ↕
                  KIS Trading MCP Server (SSE, :3000)
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
make stop             # Stop all services (kills ports 3000, 8000, 5173)
make status           # Show running/stopped status
make health           # curl /health endpoint
make logs             # Tail all service logs from .logs/
make clean            # Stop + remove dist, .vite cache, .logs, MCP tmp files
```

Individual services:
```bash
make mcp              # MCP server only (:3000)
make backend          # Backend only (:8000)
make frontend         # Frontend only (:5173)
```

Direct commands (for development/debugging):
```bash
# Backend
cd backend && ENV_FILE=../.env uv run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npx vite

# MCP Server
cd "open-trading-api/MCP/Kis Trading MCP" && ENV_FILE=../../.env uv run python server.py

# Frontend lint
cd frontend && npm run lint
```

## Key Entry Points

- **Backend app:** `backend/app/main.py` — FastAPI app with lifespan (MCP connect/disconnect)
- **Chat endpoint:** `backend/app/routers/chat.py` — POST `/api/chat`, SSE event generator
- **Agentic loop:** `backend/app/services/claude_service.py` — `stream_chat()` async generator, handles tool_use → MCP execution → feed results back to Claude
- **MCP client:** `backend/app/services/mcp_client.py` — `mcp_manager` singleton (MCPClientManager)
- **Config:** `backend/app/config.py` — Pydantic BaseSettings, loads from `.env` via `ENV_FILE` env var
- **Frontend chat:** `frontend/src/components/ChatView.tsx` — chat UI with SSE stream handling
- **SSE client:** `frontend/src/services/api.ts` — `sendMessage()` using `@microsoft/fetch-event-source`
- **MCP server:** `open-trading-api/MCP/Kis Trading MCP/server.py` — FastMCP entry point, tool registration
- **MCP tools base:** `open-trading-api/MCP/Kis Trading MCP/tools/base.py` — BaseTool with ApiExecutor (downloads API code from GitHub, modifies for paper trading, executes via subprocess)

## MCP Tool System

The MCP server exposes 8 tool classes (`domestic_stock`, `overseas_stock`, `domestic_bond`, `domestic_futureoption`, `overseas_futureoption`, `elw`, `etfetn`, `auth`) covering 166 KIS APIs. Each tool's `_run()` method handles three call types:
1. `find_stock_code` — stock lookup from master database
2. `find_api_detail` — API metadata lookup
3. Regular API calls — download Python code from GitHub, modify for demo mode (forces `env_dv=demo`), inject auth credentials, execute via subprocess

## Configuration

All services read from a single `.env` file at project root (passed via `ENV_FILE` env var). Copy `.env.example` to `.env` and fill in required values.

Required: `ANTHROPIC_API_KEY`, `KIS_PAPER_APP_KEY`, `KIS_PAPER_APP_SECRET`, `KIS_PAPER_STOCK`

Frontend dev server proxies `/api` and `/health` to `localhost:8000` (configured in `frontend/vite.config.ts`).

## Tech Stack

- **Backend:** FastAPI, uvicorn, anthropic SDK, fastmcp (MCP client), sse-starlette, pydantic-settings. Package manager: uv
- **Frontend:** React 19, Vite 7, TypeScript, react-markdown + rehype-highlight, @microsoft/fetch-event-source. Package manager: npm
- **MCP Server:** FastMCP (Python), SSE transport
- **Prerequisites:** Python 3.12+, Node.js 22+, uv, nvm

## Language

The system prompt in `claude_service.py` is in Korean. The UI is bilingual (Korean/English). User-facing trading queries are typically in Korean.
