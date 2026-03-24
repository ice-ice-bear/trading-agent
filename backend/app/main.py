import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import agents, calendar, chat, dashboard, health, peers, reports, settings, signals, tasks, watchlist, ws
from app.services.dart_client import dart_client
from app.services.mcp_client import mcp_manager
from app.agents.signal_critic import signal_critic

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


async def _init_agents():
    """Register and start agent engine."""
    from app.agents.engine import agent_engine
    from app.agents.event_bus import event_bus
    from app.agents.market_scanner import MarketScannerAgent
    from app.agents.portfolio_monitor import PortfolioMonitorAgent
    from app.agents.risk_manager import RiskManagerAgent
    from app.agents.report_generator import ReportGeneratorAgent
    from app.agents.trading_executor import TradingExecutorAgent
    from app.services.ws_manager import ws_manager

    # Register agents
    agent_engine.register(PortfolioMonitorAgent())
    agent_engine.register(RiskManagerAgent())
    agent_engine.register(MarketScannerAgent())
    agent_engine.register(TradingExecutorAgent())
    agent_engine.register(ReportGeneratorAgent())

    # Wire WebSocket manager to receive all events
    event_bus.subscribe_all(ws_manager.on_agent_event)

    # Start engine (wires event subscriptions)
    await agent_engine.start()


async def _init_scheduler():
    """Start the trading scheduler."""
    from app.agents.engine import agent_engine
    from app.agents.base import AgentContext
    from app.services.scheduler import trading_scheduler

    async def run_agent(agent_id: str):
        ctx = AgentContext(trigger="scheduled")
        return await agent_engine.run_agent(agent_id, ctx)

    trading_scheduler.set_agent_runner(run_agent)
    await trading_scheduler.start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize all services on startup, clean up on shutdown."""
    # 1. Initialize database
    from app.models.db import init_database
    logger.info("Initializing database...")
    await init_database()

    # 1.5. Initialize DART client (refreshes corp code cache if stale)
    logger.info("Initializing DART client...")
    await dart_client.initialize()
    app.state.signal_critic = signal_critic

    # 2. Connect to MCP server
    logger.info("Connecting to MCP server...")
    try:
        await mcp_manager.connect()
        logger.info("MCP server connected successfully")
    except Exception as e:
        logger.error(f"Failed to connect to MCP server: {e}")
        logger.warning("Server starting without MCP connection - /health will show degraded")

    # 3. Initialize agent engine
    logger.info("Initializing agent engine...")
    await _init_agents()

    # 4. Start scheduler
    logger.info("Starting scheduler...")
    await _init_scheduler()

    yield

    # Shutdown in reverse order
    from app.services.scheduler import trading_scheduler
    from app.agents.engine import agent_engine

    logger.info("Shutting down scheduler...")
    await trading_scheduler.stop()
    logger.info("Shutting down agent engine...")
    await agent_engine.stop()
    logger.info("Disconnecting from MCP server...")
    await mcp_manager.disconnect()


app = FastAPI(
    title="KIS Trading Web App",
    description="LLM-based stock trading via Claude + KIS MCP Server",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Existing routers
app.include_router(health.router)
app.include_router(chat.router)
app.include_router(settings.router)

# New routers (Phase 1)
app.include_router(dashboard.router)
app.include_router(agents.router)
app.include_router(tasks.router)
app.include_router(watchlist.router)
app.include_router(ws.router)

# Phase 2 routers
app.include_router(signals.router)

# Phase 3 routers
app.include_router(reports.router)

# Phase 4 routers
app.include_router(calendar.router)
app.include_router(peers.router)
