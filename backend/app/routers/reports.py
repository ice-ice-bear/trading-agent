"""Reports API — list, view, and generate performance reports."""

import json

from fastapi import APIRouter, HTTPException, Query

from app.models.db import execute_query

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _enrich_report(row: dict) -> dict:
    """Parse summary_json string into a dict for the frontend."""
    result = dict(row)
    raw = result.pop("summary_json", None)
    try:
        result["summary"] = json.loads(raw) if raw else None
    except (json.JSONDecodeError, TypeError):
        result["summary"] = None
    return result


@router.get("")
async def list_reports(
    report_type: str | None = Query(None, description="Filter by type: daily, weekly, manual"),
    limit: int = Query(20, ge=1, le=100),
):
    """Return recent reports with metadata (content excluded for list view)."""
    if report_type:
        rows = await execute_query(
            """SELECT id, timestamp, report_type, period_start, period_end,
                      title, summary_json, agent_id
               FROM reports WHERE report_type = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (report_type, limit),
        )
    else:
        rows = await execute_query(
            """SELECT id, timestamp, report_type, period_start, period_end,
                      title, summary_json, agent_id
               FROM reports ORDER BY timestamp DESC LIMIT ?""",
            (limit,),
        )
    reports = [_enrich_report(dict(row)) for row in (rows or [])]
    return {"reports": reports}


@router.get("/{report_id}")
async def get_report(report_id: int):
    """Return full report including content."""
    rows = await execute_query("SELECT * FROM reports WHERE id = ?", (report_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Report not found")
    return _enrich_report(dict(rows[0]))


@router.post("/generate")
async def generate_report(report_type: str = Query("daily", pattern="^(daily|weekly)$")):
    """Trigger report generation via the ReportGeneratorAgent."""
    from app.agents.base import AgentContext
    from app.agents.engine import agent_engine

    ctx = AgentContext(trigger="manual", params={"report_type": report_type})
    result = await agent_engine.run_agent("report_generator", ctx)

    if not result.success:
        raise HTTPException(status_code=500, detail=result.summary)

    return {
        "success": True,
        "summary": result.summary,
        "report_id": result.data.get("report_id"),
        "report_type": result.data.get("report_type"),
    }


@router.delete("/{report_id}")
async def delete_report(report_id: int):
    """Delete a report by ID."""
    rows = await execute_query("SELECT id FROM reports WHERE id = ?", (report_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Report not found")
    await execute_query("DELETE FROM reports WHERE id = ?", (report_id,))
    return {"success": True, "deleted_id": report_id}


@router.delete("")
async def delete_reports_bulk(
    report_type: str | None = Query(None, description="Delete by type: daily, weekly, manual"),
    all: bool = Query(False, description="Delete all reports"),
):
    """Delete multiple reports — by type or all."""
    if all:
        result = await execute_query("DELETE FROM reports")
    elif report_type:
        result = await execute_query("DELETE FROM reports WHERE report_type = ?", (report_type,))
    else:
        raise HTTPException(status_code=400, detail="Specify report_type or all=true")
    deleted = result.get("rowcount", 0) if isinstance(result, dict) else 0
    return {"success": True, "deleted_count": deleted}


@router.get("/performance/history")
async def get_performance_history(days: int = Query(30, ge=1, le=365)):
    """Return portfolio value history for charting."""
    rows = await execute_query(
        """SELECT timestamp, total_value, cash_balance, total_pnl, total_pnl_pct
           FROM portfolio_snapshots
           ORDER BY timestamp DESC LIMIT ?""",
        (days * 20,),  # multiple snapshots per day
    )
    return {"history": list(reversed(rows or []))}
