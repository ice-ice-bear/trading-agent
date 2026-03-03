"""In-process async event bus for agent communication."""

import asyncio
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)


@dataclass
class AgentEvent:
    """An event emitted by an agent."""

    event_type: str
    agent_id: str
    data: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class EventBus:
    """Async pub/sub event bus for inter-agent communication.

    Also forwards events to registered external listeners (e.g. WebSocket manager).
    """

    def __init__(self, max_history: int = 1000):
        self._subscribers: dict[str, list[Callable]] = {}
        self._global_listeners: list[Callable] = []
        self._history: deque[AgentEvent] = deque(maxlen=max_history)
        self._lock = asyncio.Lock()

    def subscribe(
        self,
        event_type: str,
        handler: Callable[[AgentEvent], Coroutine],
    ) -> None:
        """Register a handler for a specific event type."""
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)

    def subscribe_all(
        self,
        handler: Callable[[AgentEvent], Coroutine],
    ) -> None:
        """Register a global listener that receives ALL events (e.g. WebSocket push)."""
        self._global_listeners.append(handler)

    async def publish(self, event: AgentEvent) -> None:
        """Publish an event to all matching subscribers and global listeners."""
        async with self._lock:
            self._history.append(event)

        logger.info(
            f"Event: {event.event_type} from {event.agent_id} | "
            f"data keys: {list(event.data.keys())}"
        )

        # Notify type-specific subscribers
        handlers = self._subscribers.get(event.event_type, [])
        for handler in handlers:
            try:
                await handler(event)
            except Exception as e:
                logger.error(
                    f"Event handler error for {event.event_type}: {e}",
                    exc_info=True,
                )

        # Notify global listeners (WebSocket push, etc.)
        for listener in self._global_listeners:
            try:
                await listener(event)
            except Exception as e:
                logger.error(f"Global listener error: {e}", exc_info=True)

    def get_history(self, limit: int = 100, event_type: str | None = None) -> list[dict]:
        """Return recent events as dicts, optionally filtered by type."""
        events = list(self._history)
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        return [
            {
                "event_type": e.event_type,
                "agent_id": e.agent_id,
                "data": e.data,
                "timestamp": e.timestamp,
            }
            for e in events[-limit:]
        ]


# Singleton
event_bus = EventBus()
