# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KIS Trading Web App — an LLM-based stock trading assistant using Korea Investment & Securities (KIS) OpenAPI. Users chat with Claude to query market data and place paper trading orders via natural language. The system prompt and UI are in Korean.

## Architecture

```
React (Vite, :5173) <--> FastAPI (:8000) <--> Claude API
                               |
                        MCP Client (fastmcp)
                               |
                   KIS Trading MCP Server (SSE, :3000)
                               |
                       KIS OpenAPI (paper trading)
```

Three services run together: a React frontend, a FastAPI backend, and a KIS MCP server. The backend acts as an intermediary — it receives user messages, sends them to Claude with MCP tool definitions, executes any tool calls Claude requests via the MCP client, feeds results back to Claude, and streams the final response to the frontend via SSE.

## Common Commands

All automation uses `make`. Run from the project root.

```bash
make install        # Install all deps (backend uv sync + frontend npm install)
make start          # Start all 3 services (stops existing first)
make stop           # Stop all services (kills ports 3000, 8000, 5173)
make status         # Check which services are running
make health         # Hit /health endpoint for MCP connection status
make logs           # Tail all logs (.logs/mcp.log, backend.log, frontend.log)
make logs-backend   # Tail backend log only
make logs-mcp       # Tail MCP server log only
make logs-frontend  # Tail frontend log only
make clean          # Stop services + remove build artifacts and logs
```

### Running individual services

```bash
make mcp            # MCP server on :3000 (env ENV=paper)
make backend        # FastAPI on :8000 (uvicorn --reload)
make frontend       # Vite dev server on :5173
```

### Frontend-specific

```bash
cd frontend
npm run dev         # Vite dev server
npm run build       # TypeScript compile + Vite build
npm run lint        # ESLint (flat config)
```

### Backend-specific

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

## Key Architecture Details

**Backend agentic loop** (`backend/app/services/claude_service.py`): Implements a tool-use loop where Claude can make multiple sequential tool calls before producing a final text response. Each tool call is executed via MCP, and results are appended to the conversation before calling Claude again. Results are truncated at 10,000 chars to prevent token overflow.

**MCP client singleton** (`backend/app/services/mcp_client.py`): Manages a single persistent SSE connection to the MCP server. Safety feature: overrides `env_dv="real"` to `"demo"` to enforce paper trading only.

**SSE streaming to frontend** (`backend/app/routers/chat.py`): The `/api/chat` endpoint returns SSE events: `tool_start` → `tool_executing` → `tool_result` → `text_delta` → `done` (see `chat.py` for current event types). The frontend reconstructs streaming text and tool call status from these events.

**Session management**: In-memory dictionary (`session_id` → message history). Not persisted across restarts.

**MCP server** (`open-trading-api/MCP/Kis Trading MCP/server.py`): FastMCP instance exposing 8 tool classes covering 100+ KIS APIs (domestic stocks, bonds, derivatives, overseas stocks, ETF/ETN, ELW, auth). Tools use `ApiExecutor` base class in `tools/base.py`.

**Frontend** (`frontend/src/`): React 19 + TypeScript. `ChatView.tsx` handles SSE streaming. `MessageBubble.tsx` renders markdown with embedded `ToolIndicator` components. `Sidebar.tsx` manages sessions.

## Configuration

Backend env (`backend/.env`): `ANTHROPIC_API_KEY` (required), `MCP_SERVER_URL`, `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS`.

MCP env (`open-trading-api/MCP/Kis Trading MCP/.env.paper`): `KIS_PAPER_APP_KEY`, `KIS_PAPER_APP_SECRET`, `KIS_PAPER_STOCK`.

Copy from `.example` files to create actual config files.

## Tech Stack

- **Backend**: Python 3.12+, FastAPI, uv (package manager), Pydantic
- **Frontend**: React 19, Vite 7, TypeScript 5.9, ESLint flat config
- **MCP Server**: Python 3.12+, FastMCP
- **AI**: Anthropic Claude API (streaming with tool use)

## Important Conventions

- Python uses `uv` for dependency management, not pip
- Frontend uses nvm for Node.js version management (Node 22+)
- Vite proxy forwards `/api` and `/health` to backend (:8000)
- Log files go to `.logs/` directory
- All trading is paper-only — the system enforces `env_dv="demo"`
- Backend starts gracefully even if MCP server is unavailable
