import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import chat, health
from app.services.mcp_client import mcp_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect to MCP server on startup, disconnect on shutdown."""
    logger.info("Starting up - connecting to MCP server...")
    try:
        await mcp_manager.connect()
        logger.info("MCP server connected successfully")
    except Exception as e:
        logger.error(f"Failed to connect to MCP server: {e}")
        logger.warning("Server starting without MCP connection - /health will show degraded")

    yield

    logger.info("Shutting down - disconnecting from MCP server...")
    await mcp_manager.disconnect()


app = FastAPI(
    title="KIS Trading Web App",
    description="LLM-based stock trading via Claude + KIS MCP Server",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)
