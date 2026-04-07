"""Agent management API router."""

import json

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.agents.engine import agent_engine
from app.agents.base import AgentContext, AgentStatus
from app.agents.event_bus import AgentEvent, event_bus
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
    min_composite_score: float | None = None
    calibration_ceiling: float | None = None
    # Multi-factor weights
    weight_rr_ratio: float | None = None
    weight_expert_consensus: float | None = None
    weight_fundamental: float | None = None
    weight_technical: float | None = None
    weight_institutional: float | None = None
    # Scanner settings
    max_candidates: int | None = None
    max_expert_stocks: int | None = None
    # Critic settings
    critic_check_dissent: bool | None = None
    critic_check_variant: bool | None = None
    # Data gate settings
    dart_per_required: bool | None = None
    # Execution settings
    max_buy_qty: int | None = None
    sector_max_pct: float | None = None
    min_hold_minutes: int | None = None
    # ATR dynamic stop-loss
    atr_stop_loss_multiplier_short: float | None = None
    atr_stop_loss_multiplier_long: float | None = None
    position_reeval_enabled: bool | None = None


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


def _format_risk_config(config: dict) -> dict:
    """Format risk_config dict with proper types and defaults."""
    return {
        "stop_loss_pct": float(config.get("stop_loss_pct", -3.0)),
        "take_profit_pct": float(config.get("take_profit_pct", 5.0)),
        "max_positions": int(config.get("max_positions", 5)),
        "max_position_weight_pct": float(config.get("max_position_weight_pct", 20.0)),
        "max_daily_loss": float(config.get("max_daily_loss", 500000)),
        "signal_approval_mode": config.get("signal_approval_mode", "auto"),
        "initial_capital": float(config.get("initial_capital", 0)),
        "min_composite_score": float(config.get("min_composite_score", 15)),
        "calibration_ceiling": float(config.get("calibration_ceiling", 2.0)),
        # Scanner settings
        "max_candidates": int(config.get("max_candidates", 25)),
        "max_expert_stocks": int(config.get("max_expert_stocks", 10)),
        # Critic settings
        "critic_check_dissent": config.get("critic_check_dissent", "true").lower() != "false",
        "critic_check_variant": config.get("critic_check_variant", "true").lower() != "false",
        # Data gate settings
        "dart_per_required": config.get("dart_per_required", "true").lower() != "false",
        # Execution settings
        "max_buy_qty": int(config.get("max_buy_qty", 10)),
        "sector_max_pct": float(config.get("sector_max_pct", 40.0)),
        "min_hold_minutes": int(config.get("min_hold_minutes", 0)),
        # Multi-factor weights
        "weight_rr_ratio": float(config.get("weight_rr_ratio", 0.25)),
        "weight_expert_consensus": float(config.get("weight_expert_consensus", 0.25)),
        "weight_fundamental": float(config.get("weight_fundamental", 0.20)),
        "weight_technical": float(config.get("weight_technical", 0.20)),
        "weight_institutional": float(config.get("weight_institutional", 0.10)),
        # ATR dynamic stop-loss
        "atr_stop_loss_multiplier_short": float(config.get("atr_stop_loss_multiplier_short", 2.0)),
        "atr_stop_loss_multiplier_long": float(config.get("atr_stop_loss_multiplier_long", 3.0)),
        "position_reeval_enabled": config.get("position_reeval_enabled", "true").lower() != "false",
    }


@router.get("/risk-config")
async def get_risk_config():
    """Get current risk management configuration."""
    rows = await execute_query("SELECT key, value FROM risk_config")
    config = {row["key"]: row["value"] for row in rows} if rows else {}
    return _format_risk_config(config)


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
    return _format_risk_config(config)


class StockStopLossUpdate(BaseModel):
    stop_loss_pct: float
    take_profit_pct: float | None = None


@router.get("/risk/stock-stop-loss")
async def get_all_stock_stop_losses():
    """Get all per-stock stop-loss overrides."""
    rows = await execute_query(
        "SELECT * FROM stock_stop_loss_overrides ORDER BY stock_code"
    )
    return {"overrides": rows or []}


@router.put("/risk/stock-stop-loss/{stock_code}")
async def update_stock_stop_loss(stock_code: str, body: StockStopLossUpdate):
    """Manually override stop-loss for a stock."""
    await execute_query(
        """INSERT INTO stock_stop_loss_overrides (stock_code, stop_loss_pct, take_profit_pct, source)
           VALUES (?, ?, ?, 'manual')
           ON CONFLICT(stock_code) DO UPDATE SET
               stop_loss_pct = excluded.stop_loss_pct,
               take_profit_pct = COALESCE(excluded.take_profit_pct, take_profit_pct),
               source = 'manual',
               updated_at = datetime('now')""",
        (stock_code, body.stop_loss_pct, body.take_profit_pct),
    )
    return {"stock_code": stock_code, "stop_loss_pct": body.stop_loss_pct, "source": "manual"}


@router.delete("/risk/stock-stop-loss/{stock_code}")
async def reset_stock_stop_loss(stock_code: str):
    """Reset to auto-calculated stop-loss (remove manual override)."""
    await execute_query(
        "UPDATE stock_stop_loss_overrides SET source = 'auto', updated_at = datetime('now') WHERE stock_code = ?",
        (stock_code,),
    )
    return {"stock_code": stock_code, "reset": True}


@router.get("/risk/position-evaluations")
async def get_position_evaluations(
    stock_code: str = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Get recent position re-evaluation history."""
    if stock_code:
        rows = await execute_query(
            "SELECT * FROM position_evaluations WHERE stock_code = ? ORDER BY evaluated_at DESC LIMIT ?",
            (stock_code, limit),
        )
    else:
        rows = await execute_query(
            "SELECT * FROM position_evaluations ORDER BY evaluated_at DESC LIMIT ?",
            (limit,),
        )
    return {"evaluations": rows or []}


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


class TestSignalRequest(BaseModel):
    stock_code: str = "005930"  # 삼성전자
    stock_name: str = "삼성전자"
    direction: str = "buy"  # buy | sell
    confidence: float = 0.8
    reason: str = "통합 테스트용 신호"


@router.post("/test/inject-signal")
async def inject_test_signal(body: TestSignalRequest):
    """테스트용 signal.generated 이벤트를 직접 주입합니다.

    risk_manager → trading_executor 연계를 검증하는 데 사용합니다.
    paper trading 환경에서 실제 주문이 실행될 수 있습니다.
    """
    if body.direction not in ("buy", "sell"):
        raise HTTPException(400, "direction must be 'buy' or 'sell'")
    if not 0.0 <= body.confidence <= 1.0:
        raise HTTPException(400, "confidence must be between 0.0 and 1.0")

    # DB에 pending 신호 저장 (risk_manager가 status 업데이트)
    signal_id = await execute_insert(
        """INSERT INTO signals
           (agent_id, stock_code, stock_name, direction, confidence, reason, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')""",
        (
            "test",
            body.stock_code,
            body.stock_name,
            body.direction,
            body.confidence,
            body.reason,
        ),
    )

    event = AgentEvent(
        event_type="signal.generated",
        agent_id="test",
        data={
            "signal_id": signal_id,
            "stock_code": body.stock_code,
            "stock_name": body.stock_name,
            "direction": body.direction,
            "confidence": body.confidence,
            "reason": body.reason,
        },
    )
    await event_bus.publish(event)

    return {
        "injected": True,
        "signal_id": signal_id,
        "event_type": "signal.generated",
        "data": event.data,
        "note": "이벤트 추적: GET /api/agents/events",
    }
