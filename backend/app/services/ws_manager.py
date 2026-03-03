"""WebSocket manager for pushing real-time events to frontend clients."""

import json
import logging

from fastapi import WebSocket

from app.agents.event_bus import AgentEvent

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections from frontend clients."""

    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)
        logger.info(f"WebSocket client connected (total: {len(self._connections)})")

    async def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        logger.info(f"WebSocket client disconnected (total: {len(self._connections)})")

    async def broadcast(self, event_type: str, data: dict) -> None:
        """Send an event to all connected clients."""
        if not self._connections:
            return

        message = json.dumps({"type": event_type, "data": data}, ensure_ascii=False)
        dead = set()
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)

        self._connections -= dead

    async def on_agent_event(self, event: AgentEvent) -> None:
        """Handler for EventBus — forwards agent events to WebSocket clients."""
        await self.broadcast(
            "agent_event",
            {
                "event_type": event.event_type,
                "agent_id": event.agent_id,
                "data": event.data,
                "timestamp": event.timestamp,
            },
        )

    @property
    def client_count(self) -> int:
        return len(self._connections)


# Singleton
ws_manager = WebSocketManager()
