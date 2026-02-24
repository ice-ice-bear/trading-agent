from fastapi import APIRouter

from app.services.mcp_client import mcp_manager

router = APIRouter()


@router.get("/health")
async def health():
    """Health check endpoint showing MCP connection status."""
    return {
        "status": "ok" if mcp_manager.connected else "degraded",
        "mcp_connected": mcp_manager.connected,
        "mcp_tools_count": len(mcp_manager.tools),
        "mcp_tools": [t["name"] for t in mcp_manager.tools],
    }
