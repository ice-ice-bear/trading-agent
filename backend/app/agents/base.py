"""Base agent class and shared types for the trading agent framework."""

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app.agents.event_bus import AgentEvent, event_bus
from app.models.db import execute_insert
from app.services.mcp_client import mcp_manager

logger = logging.getLogger(__name__)


class AgentRole(str, Enum):
    MONITOR = "monitor"
    SCANNER = "scanner"
    EXECUTOR = "executor"
    RISK = "risk"
    REPORTER = "reporter"
    ANALYST = "analyst"


class AgentStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    ERROR = "error"
    DISABLED = "disabled"


@dataclass
class AgentContext:
    """Context passed to an agent on execution."""

    trigger: str = "manual"  # "scheduled", "event", "manual"
    trigger_event: AgentEvent | None = None
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentResult:
    """Result returned by an agent after execution."""

    success: bool = True
    summary: str = ""
    data: dict[str, Any] = field(default_factory=dict)
    events_emitted: list[str] = field(default_factory=list)
    error: str | None = None


class BaseAgent:
    """Base class for all trading agents.

    Subclasses must implement `execute()` and set class-level attributes.
    """

    agent_id: str = ""
    name: str = ""
    role: AgentRole = AgentRole.MONITOR
    allowed_tools: list[str] = []

    def __init__(self):
        self.status: AgentStatus = AgentStatus.IDLE
        self.config: dict[str, Any] = {}
        self.last_run: str | None = None
        self._events_emitted: list[str] = []

    async def execute(self, context: AgentContext) -> AgentResult:
        """Main execution method. Override in subclasses."""
        raise NotImplementedError

    async def run(self, context: AgentContext) -> AgentResult:
        """Wrapper that handles status, logging, and error isolation."""
        if self.status == AgentStatus.DISABLED:
            return AgentResult(
                success=False, summary="Agent is disabled", error="disabled"
            )

        self.status = AgentStatus.RUNNING
        self._events_emitted = []
        start = time.monotonic()

        try:
            result = await self.execute(context)
            result.events_emitted = self._events_emitted
            self.status = AgentStatus.IDLE
            elapsed = int((time.monotonic() - start) * 1000)
            self.last_run = time.strftime("%Y-%m-%dT%H:%M:%S")

            await self._log_execution(elapsed, result)
            logger.info(
                f"Agent {self.agent_id} completed in {elapsed}ms: {result.summary}"
            )
            return result

        except Exception as e:
            self.status = AgentStatus.ERROR
            elapsed = int((time.monotonic() - start) * 1000)
            error_result = AgentResult(
                success=False,
                summary=f"Agent error: {str(e)}",
                error=str(e),
                events_emitted=self._events_emitted,
            )
            await self._log_execution(elapsed, error_result)
            logger.error(f"Agent {self.agent_id} error: {e}", exc_info=True)
            return error_result

    async def call_mcp_tool(self, tool_name: str, params: dict) -> str:
        """Call an MCP tool through the shared MCPClientManager.

        Enforces tool isolation: only allowed_tools can be called.
        """
        # Extract the base tool name (e.g. "domestic_stock" from "domestic_stock.inquire_balance")
        base_tool = tool_name.split(".")[0] if "." in tool_name else tool_name
        if self.allowed_tools and base_tool not in self.allowed_tools:
            raise PermissionError(
                f"Agent {self.agent_id} not allowed to call tool {tool_name}. "
                f"Allowed: {self.allowed_tools}"
            )
        return await mcp_manager.call_tool(tool_name, params)

    async def emit_event(self, event_type: str, data: dict) -> None:
        """Publish an event to the event bus."""
        event = AgentEvent(
            event_type=event_type,
            agent_id=self.agent_id,
            data=data,
        )
        self._events_emitted.append(event_type)
        await event_bus.publish(event)

    async def _log_execution(self, duration_ms: int, result: AgentResult) -> None:
        """Persist execution log to database."""
        import json

        try:
            await execute_insert(
                """INSERT INTO agent_logs
                   (agent_id, agent_role, action, duration_ms, success,
                    result_summary, error_message, events_emitted_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    self.agent_id,
                    self.role.value,
                    "execute",
                    duration_ms,
                    1 if result.success else 0,
                    result.summary[:500],
                    result.error,
                    json.dumps(result.events_emitted),
                ),
            )
        except Exception as e:
            logger.error(f"Failed to log agent execution: {e}")

    def to_dict(self) -> dict:
        """Serialize agent state for API responses."""
        return {
            "id": self.agent_id,
            "name": self.name,
            "role": self.role.value,
            "status": self.status.value,
            "last_run": self.last_run,
            "config": self.config,
            "allowed_tools": self.allowed_tools,
        }
