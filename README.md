# KIS Trading Web App

LLM-based stock trading assistant using Korea Investment & Securities (KIS) OpenAPI. Chat with an AI assistant to query market data and place paper trading orders via natural language.

## Architecture

```
React (Vite, :5173)  <-->  FastAPI (:8000)  <-->  Claude API
                                 |
                          MCP Client (fastmcp)
                                 |
                     KIS Trading MCP Server (SSE, :3000)
                                 |
                         KIS OpenAPI (paper trading)
```

**Flow:** User message → FastAPI → Claude API (with MCP tool definitions) → Claude decides to call tools → FastAPI executes via MCP client → results fed back to Claude → Claude streams final response → SSE to React UI.

## Prerequisites

- **Python 3.12+** with [uv](https://docs.astral.sh/uv/)
- **Node.js 22+** (install via `nvm install 22`)
- **Anthropic API key** - Get one at [console.anthropic.com](https://console.anthropic.com/)
- **KIS paper trading credentials** - Register at [KIS API Portal](https://apiportal.koreainvestment.com/)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/ice-ice-bear/trading-agent.git
cd trading-agent
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in your ANTHROPIC_API_KEY and KIS paper trading credentials
```

### 3. Install dependencies and start

```bash
make install    # Install all dependencies (backend + frontend)
make start      # Start all 3 services
```

Open http://localhost:5173 and try:
- "삼성전자 현재가 알려줘" (Samsung Electronics current price)
- "거래량 상위 종목" (Top stocks by volume)
- "잔고 조회해줘" (Check balance)

## Configuration (`.env`)

| Variable | Description | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | (required) |
| `MCP_SERVER_URL` | MCP server SSE endpoint | `http://localhost:3000/sse` |
| `CLAUDE_MODEL` | Claude model to use | `claude-sonnet-4-5-20250929` |
| `CLAUDE_MAX_TOKENS` | Max response tokens | `4096` |
| `KIS_PAPER_APP_KEY` | Paper trading app key | (required) |
| `KIS_PAPER_APP_SECRET` | Paper trading app secret | (required) |
| `KIS_PAPER_STOCK` | Paper trading stock account number (8 digits) | (required) |
| `KIS_PROD_TYPE` | Account product code | `01` |

## Make Targets

| Command | Description |
|---|---|
| `make install` | Install all dependencies (backend + frontend) |
| `make start` | Start all 3 services (MCP, backend, frontend) |
| `make stop` | Stop all running services |
| `make mcp` | Start MCP server only |
| `make backend` | Start backend only |
| `make frontend` | Start frontend only |
| `make health` | Check backend health + MCP connection |
| `make status` | Show running/stopped status of each service |
| `make logs` | Tail all service logs |
| `make clean` | Remove build artifacts and caches |

## Project Structure

```
trading-agent/
├── README.md
├── Makefile                             # Project automation
├── .env.example                         # All environment variables
├── backend/                             # FastAPI backend
│   ├── pyproject.toml
│   └── app/
│       ├── main.py                      # FastAPI app + lifespan
│       ├── config.py                    # Settings from .env
│       ├── routers/
│       │   ├── chat.py                  # POST /api/chat (SSE streaming)
│       │   └── health.py               # GET /health
│       ├── services/
│       │   ├── mcp_client.py            # MCP connection + tool execution
│       │   └── claude_service.py        # Claude streaming + tool loop
│       └── models/
│           └── schemas.py               # Request/response models
├── frontend/                            # React + Vite + TypeScript
│   ├── package.json
│   ├── vite.config.ts                   # Proxy /api → backend
│   └── src/
│       ├── App.tsx                      # Layout: sidebar + chat
│       ├── services/api.ts              # SSE client
│       └── components/
│           ├── ChatView.tsx             # Chat UI + streaming
│           ├── MessageBubble.tsx        # Markdown message rendering
│           ├── ToolIndicator.tsx        # Tool execution status
│           └── Sidebar.tsx              # Session management
└── open-trading-api/                    # KIS MCP server
    └── MCP/Kis Trading MCP/
        ├── server.py                    # MCP server entry point
        └── tools/                       # 8 tools, 166 APIs
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check + MCP connection status |
| `/api/chat` | POST | Chat with AI (SSE streaming response) |
| `/api/sessions` | GET | List active sessions |
| `/api/sessions/{id}` | DELETE | Clear a session |

## How It Works

1. User sends a message in the React chat UI
2. Frontend sends POST to `/api/chat` and opens an SSE stream
3. Backend forwards the message to Claude API with MCP tool definitions
4. Claude decides which KIS APIs to call and returns tool_use blocks
5. Backend executes tool calls via MCP client → KIS MCP Server → KIS API
6. Results are fed back to Claude for interpretation
7. Claude streams a natural language response back through SSE
8. Frontend renders the response as markdown with tables for market data

## Tech Stack

- **Frontend:** React 19, Vite, TypeScript
- **Backend:** FastAPI, Uvicorn, Python 3.12+
- **AI:** Anthropic Claude API
- **Protocol:** MCP (Model Context Protocol) with SSE streaming
- **Trading API:** Korea Investment & Securities OpenAPI

## License

This project is for educational and paper trading purposes only. Use at your own risk.
