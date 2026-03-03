"""Agent engine that orchestrates agent lifecycle and event routing."""

import logging
from typing import Any

from app.agents.base import AgentContext, AgentResult, AgentStatus, BaseAgent
from app.agents.event_bus import AgentEvent, event_bus
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)


class AgentEngine:
    """Orchestrates agent registration, lifecycle, and event routing."""

    def __init__(self):
        self.agents: dict[str, BaseAgent] = {}
        self._started = False

    def register(self, agent: BaseAgent) -> None:
        """Register an agent with the engine."""
        self.agents[agent.agent_id] = agent
        logger.info(f"Registered agent: {agent.agent_id} ({agent.role.value})")

    async def start(self) -> None:
        """Initialize all agents and wire up event subscriptions."""
        if self._started:
            return

        # Safety: refuse to start executor if not in demo mode
        mode = runtime_settings.get("trading_mode")
        if mode != "demo":
            for agent in self.agents.values():
                if agent.role.value == "executor":
                    agent.status = AgentStatus.DISABLED
                    logger.warning(
                        f"Agent {agent.agent_id} disabled: trading_mode is '{mode}'"
                    )

        # Wire event subscriptions from agents
        for agent in self.agents.values():
            if hasattr(agent, "subscribed_events"):
                for evt_type in agent.subscribed_events:
                    event_bus.subscribe(evt_type, agent.handle_event)
                    logger.info(
                        f"Agent {agent.agent_id} subscribed to {evt_type}"
                    )

        self._started = True
        logger.info(
            f"Agent engine started with {len(self.agents)} agents: "
            f"{list(self.agents.keys())}"
        )

    async def stop(self) -> None:
        """Gracefully shut down all agents."""
        for agent in self.agents.values():
            if agent.status == AgentStatus.RUNNING:
                logger.warning(f"Agent {agent.agent_id} still running during shutdown")
            agent.status = AgentStatus.IDLE
        self._started = False
        logger.info("Agent engine stopped")

    async def run_agent(
        self,
        agent_id: str,
        context: AgentContext | None = None,
    ) -> AgentResult:
        """Execute a single agent by ID."""
        agent = self.agents.get(agent_id)
        if not agent:
            return AgentResult(
                success=False,
                summary=f"Unknown agent: {agent_id}",
                error="not_found",
            )

        if context is None:
            context = AgentContext(trigger="manual")

        return await agent.run(context)

    def get_agent(self, agent_id: str) -> BaseAgent | None:
        return self.agents.get(agent_id)

    def list_agents(self) -> list[dict[str, Any]]:
        return [agent.to_dict() for agent in self.agents.values()]

    @property
    def is_running(self) -> bool:
        return self._started


# Singleton
agent_engine = AgentEngine()
