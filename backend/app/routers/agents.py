"""Agent management API router."""

import json

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.agents.engine import agent_engine
from app.agents.base import AgentContext, AgentStatus
from app.agents.event_bus import event_bus
from app.models.db import execute_insert, execute_query
from app.services import portfolio_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentConfigUpdate(BaseModel):
    config: dict


class RiskConfigUpdate(BaseModel):
    stop_loss_pct: float | None = None
    take_profit_pct: float | None = None
    max_positions: int | None = None
    max_position_weight_pct: float | None = None
    max_daily_loss: float | None = None
    signal_approval_mode: str | None = None
    initial_capital: float | None = None


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
    """Get recent events — from DB if available, falling back to in-memory."""
    try:
        rows = await execute_query(
            "SELECT event_type, agent_id, data, timestamp FROM agent_events ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        if rows:
            events = []
            for row in rows:
                evt = dict(row)
                try:
                    evt["data"] = json.loads(evt["data"]) if evt["data"] else {}
                except (json.JSONDecodeError, TypeError):
                    evt["data"] = {}
                events.append(evt)
            return {"events": events}
    except Exception:
        pass  # table may not exist yet — fall back
    events = event_bus.get_history(limit)
    return {"events": events}


@router.get("/risk-config")
async def get_risk_config():
    """Get current risk management configuration."""
    rows = await execute_query("SELECT key, value FROM risk_config")
    config = {row["key"]: row["value"] for row in rows} if rows else {}
    return {
        "stop_loss_pct": float(config.get("stop_loss_pct", -3.0)),
        "take_profit_pct": float(config.get("take_profit_pct", 5.0)),
        "max_positions": int(config.get("max_positions", 5)),
        "max_position_weight_pct": float(config.get("max_position_weight_pct", 20.0)),
        "max_daily_loss": float(config.get("max_daily_loss", 500000)),
        "signal_approval_mode": config.get("signal_approval_mode", "auto"),
        "initial_capital": float(config.get("initial_capital", 0)),
    }


@router.put("/risk-config")
async def update_risk_config(body: RiskConfigUpdate):
    """Update risk management configuration."""
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "No risk config values provided")

    for key, value in patch.items():
        await execute_query(
            "INSERT INTO risk_config (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )

    rows = await execute_query("SELECT key, value FROM risk_config")
    config = {row["key"]: row["value"] for row in rows} if rows else {}
    return {
        "stop_loss_pct": float(config.get("stop_loss_pct", -3.0)),
        "take_profit_pct": float(config.get("take_profit_pct", 5.0)),
        "max_positions": int(config.get("max_positions", 5)),
        "max_position_weight_pct": float(config.get("max_position_weight_pct", 20.0)),
        "max_daily_loss": float(config.get("max_daily_loss", 500000)),
        "signal_approval_mode": config.get("signal_approval_mode", "auto"),
        "initial_capital": float(config.get("initial_capital", 0)),
    }


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
