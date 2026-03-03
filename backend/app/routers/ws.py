"""WebSocket endpoint for real-time event streaming to frontend."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import ws_manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket endpoint for real-time dashboard updates."""
    await ws_manager.connect(ws)
    try:
        while True:
            # Keep connection alive; handle client messages if needed
            data = await ws.receive_text()
            # Future: handle subscribe/unsubscribe commands from client
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)
