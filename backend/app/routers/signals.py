"""Signals router — view, approve, reject trading signals."""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.event_bus import event_bus
from app.models.db import execute_query

router = APIRouter(prefix="/api/signals", tags=["signals"])


class SignalAction(BaseModel):
    reason: str = ""


def _enrich_signal(row: dict) -> dict:
    """Parse JSON columns from the signals DB row into Python objects."""
    result = dict(row)
    for json_col, out_key in [
        ("scenarios_json", "scenarios"),
        ("expert_stances_json", "expert_stances"),
        ("dart_fundamentals_json", "dart_fundamentals"),
        ("metadata_json", "metadata"),
    ]:
        raw = result.pop(json_col, None)
        try:
            result[out_key] = json.loads(raw) if raw else None
        except (json.JSONDecodeError, TypeError):
            result[out_key] = None
    return result


@router.get("")
async def list_signals(status: str | None = None, limit: int = 50):
    """List trading signals, optionally filtered by status."""
    if status:
        rows = await execute_query(
            "SELECT * FROM signals WHERE status=? ORDER BY timestamp DESC LIMIT ?",
            (status, limit),
        )
    else:
        rows = await execute_query(
            "SELECT * FROM signals ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        )
    signals = [_enrich_signal(dict(row)) for row in (rows or [])]
    return {"signals": signals}


@router.get("/{signal_id}")
async def get_signal(signal_id: int):
    """Get a single signal by ID."""
    rows = await execute_query("SELECT * FROM signals WHERE id=?", (signal_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Signal not found")
    return _enrich_signal(dict(rows[0]))


@router.post("/{signal_id}/approve")
async def approve_signal(signal_id: int, body: SignalAction | None = None):
    """Manually approve a pending signal — triggers TradingExecutor."""
    rows = await execute_query("SELECT * FROM signals WHERE id=?", (signal_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Signal not found")

    signal = rows[0]
    if signal["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Signal is not pending (current: {signal['status']})",
        )

    # Update status
    await execute_query(
        "UPDATE signals SET status='approved', risk_notes=? WHERE id=?",
        (body.reason if body else "수동 승인", signal_id),
    )

    # Emit signal.approved event to trigger TradingExecutor
    from app.agents.event_bus import AgentEvent

    event = AgentEvent(
        event_type="signal.approved",
        agent_id="user",
        data={
            "signal_id": signal_id,
            "stock_code": signal["stock_code"],
            "stock_name": signal["stock_name"],
            "direction": signal["direction"],
            "confidence": signal["confidence"],
            "reason": signal.get("reason", ""),
        },
    )
    await event_bus.publish(event)

    return {"success": True, "message": f"Signal #{signal_id} approved"}


@router.post("/{signal_id}/reject")
async def reject_signal(signal_id: int, body: SignalAction | None = None):
    """Manually reject a pending signal."""
    rows = await execute_query("SELECT * FROM signals WHERE id=?", (signal_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Signal not found")

    signal = rows[0]
    if signal["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Signal is not pending (current: {signal['status']})",
        )

    reason = body.reason if body else "수동 거부"
    await execute_query(
        "UPDATE signals SET status='rejected', risk_notes=? WHERE id=?",
        (reason, signal_id),
    )

    return {"success": True, "message": f"Signal #{signal_id} rejected"}
