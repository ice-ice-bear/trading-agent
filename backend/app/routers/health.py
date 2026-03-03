from fastapi import APIRouter

from app.services.mcp_client import mcp_manager
from app.services.runtime_settings import runtime_settings

router = APIRouter()


@router.get("/health")
async def health():
    """Health check endpoint showing MCP, agent, and scheduler status."""
    from app.agents.engine import agent_engine
    from app.services.scheduler import trading_scheduler
    from app.services.ws_manager import ws_manager

    current = runtime_settings.get_all()
    return {
        "status": "ok" if mcp_manager.connected else "degraded",
        "mcp_connected": mcp_manager.connected,
        "mcp_tools_count": len(mcp_manager.tools),
        "mcp_tools": [t["name"] for t in mcp_manager.tools],
        "trading_mode": current.get("trading_mode", "demo"),
        "claude_model": current.get("claude_model"),
        "agents_count": len(agent_engine.agents),
        "agents_running": agent_engine.is_running,
        "scheduler_running": trading_scheduler.is_running,
        "ws_clients": ws_manager.client_count,
    }
