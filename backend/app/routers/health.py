from fastapi import APIRouter

from app.services.mcp_client import mcp_manager
from app.services.runtime_settings import runtime_settings

router = APIRouter()


@router.get("/health")
async def health():
    """Health check endpoint showing MCP connection status."""
    current = runtime_settings.get_all()
    return {
        "status": "ok" if mcp_manager.connected else "degraded",
        "mcp_connected": mcp_manager.connected,
        "mcp_tools_count": len(mcp_manager.tools),
        "mcp_tools": [t["name"] for t in mcp_manager.tools],
        "trading_mode": current.get("trading_mode", "demo"),
        "claude_model": current.get("claude_model"),
    }
