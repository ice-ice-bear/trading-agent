"""Agent management API router."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.agents.engine import agent_engine
from app.agents.base import AgentContext, AgentStatus
from app.agents.event_bus import event_bus
from app.services import portfolio_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentConfigUpdate(BaseModel):
    config: dict


@router.get("")
async def list_agents():
    """List all registered agents."""
    return {"agents": agent_engine.list_agents()}


@router.get("/logs")
async def get_agent_logs(
    agent_id: str = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
):
    """Get agent execution logs."""
    logs = await portfolio_service.get_agent_logs(agent_id, limit)
    return {"logs": logs}


@router.get("/events")
async def get_agent_events(limit: int = Query(default=100, ge=1, le=1000)):
    """Get recent events from the event bus."""
    events = event_bus.get_history(limit)
    return {"events": events}


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """Get agent details."""
    agent = agent_engine.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    info = agent.to_dict()
    logs = await portfolio_service.get_agent_logs(agent_id, limit=10)
    info["recent_logs"] = logs
    return info


@router.put("/{agent_id}/config")
async def update_agent_config(agent_id: str, body: AgentConfigUpdate):
    """Update agent configuration."""
    agent = agent_engine.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    agent.config.update(body.config)
    return {"agent_id": agent_id, "config": agent.config}


@router.post("/{agent_id}/enable")
async def enable_agent(agent_id: str):
    """Enable an agent."""
    agent = agent_engine.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    agent.status = AgentStatus.IDLE
    return {"agent_id": agent_id, "status": agent.status.value}


@router.post("/{agent_id}/disable")
async def disable_agent(agent_id: str):
    """Disable an agent."""
    agent = agent_engine.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    agent.status = AgentStatus.DISABLED
    return {"agent_id": agent_id, "status": agent.status.value}


@router.post("/{agent_id}/run")
async def run_agent(agent_id: str):
    """Trigger an agent execution immediately."""
    agent = agent_engine.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    context = AgentContext(trigger="manual")
    result = await agent_engine.run_agent(agent_id, context)
    return {
        "agent_id": agent_id,
        "success": result.success,
        "summary": result.summary,
        "events_emitted": result.events_emitted,
        "error": result.error,
    }
