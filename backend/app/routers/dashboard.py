"""Dashboard API router — portfolio, positions, orders, performance."""

from fastapi import APIRouter, Query

from app.models.db import execute_query
from app.services import portfolio_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/portfolio")
async def get_portfolio():
    """Get latest portfolio snapshot with initial capital and recalculated P/L."""
    snapshot = await portfolio_service.get_latest_portfolio()
    if not snapshot:
        return {
            "total_value": 0,
            "cash_balance": 0,
            "initial_capital": 0,
            "total_pnl": 0,
            "total_pnl_pct": 0,
            "positions": [],
        }

    # Fetch initial capital from risk_config
    ic_row = await execute_query(
        "SELECT value FROM risk_config WHERE key = 'initial_capital'",
        fetch_one=True,
    )
    initial_capital = float(ic_row["value"]) if ic_row else snapshot["cash_balance"]

    # Recalculate P/L based on initial capital (includes realized + unrealized)
    total_value = snapshot["total_value"]
    total_pnl = total_value - initial_capital
    total_pnl_pct = round((total_pnl / initial_capital * 100), 2) if initial_capital > 0 else 0.0

    positions = await portfolio_service.get_latest_positions()
    await _enrich_positions_with_stop_loss(positions)
    return {
        "total_value": total_value,
        "cash_balance": snapshot["cash_balance"],
        "initial_capital": initial_capital,
        "total_pnl": total_pnl,
        "total_pnl_pct": total_pnl_pct,
        "positions": positions,
        "timestamp": snapshot["timestamp"],
    }


@router.get("/portfolio/history")
async def get_portfolio_history(hours: int = Query(default=24, ge=1, le=720)):
    """Get portfolio snapshots from the last N hours."""
    snapshots = await portfolio_service.get_portfolio_history(hours)
    return {"snapshots": snapshots}


@router.get("/positions")
async def get_positions():
    """Get positions from the latest snapshot, enriched with per-stock stop-loss."""
    positions = await portfolio_service.get_latest_positions()
    await _enrich_positions_with_stop_loss(positions)
    return {"positions": positions}


async def _enrich_positions_with_stop_loss(positions: list[dict]) -> None:
    """Add stop_loss_pct, stop_loss_source, investment_horizon, reeval_status to each position."""
    if not positions:
        return
    from app.models.db import execute_query

    # Load global default + all overrides in bulk (max 5 positions)
    config_row = await execute_query("SELECT value FROM risk_config WHERE key = 'stop_loss_pct'", fetch_one=True)
    global_stop = float(config_row["value"]) if config_row else -3.0

    override_rows = await execute_query(
        "SELECT stock_code, stop_loss_pct, source, investment_horizon FROM stock_stop_loss_overrides"
    )
    overrides = {r["stock_code"]: r for r in (override_rows or [])}

    eval_rows = await execute_query(
        """SELECT stock_code, new_status FROM position_evaluations
           WHERE id IN (SELECT MAX(id) FROM position_evaluations GROUP BY stock_code)"""
    )
    evals = {r["stock_code"]: r["new_status"] for r in (eval_rows or [])}

    for pos in positions:
        code = pos.get("stock_code", "")
        ov = overrides.get(code)
        if ov:
            pos["stop_loss_pct"] = float(ov["stop_loss_pct"])
            pos["stop_loss_source"] = ov["source"]
            pos["investment_horizon"] = ov.get("investment_horizon", "short")
        else:
            pos["stop_loss_pct"] = global_stop
            pos["stop_loss_source"] = "global"
            pos["investment_horizon"] = None
        pos["reeval_status"] = evals.get(code)


@router.get("/orders")
async def get_orders(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status: str = Query(default="all"),
):
    """Get order history with pagination."""
    return await portfolio_service.get_orders(limit, offset, status)


@router.get("/performance")
async def get_performance(period: str = Query(default="7d")):
    """Get performance metrics for the given period."""
    # Parse period to hours
    hours_map = {"1d": 24, "7d": 168, "30d": 720, "90d": 2160}
    hours = hours_map.get(period, 168)

    snapshots = await portfolio_service.get_portfolio_history(hours)
    if not snapshots:
        return {
            "returns_pct": 0,
            "max_drawdown": 0,
            "trade_count": 0,
            "chart_data": [],
        }

    # Calculate basic performance metrics
    values = [s["total_value"] for s in snapshots if s["total_value"] > 0]
    if len(values) < 2:
        return {
            "returns_pct": 0,
            "max_drawdown": 0,
            "trade_count": 0,
            "chart_data": snapshots,
        }

    initial = values[0]
    final = values[-1]
    returns_pct = ((final - initial) / initial * 100) if initial > 0 else 0

    # Max drawdown
    peak = values[0]
    max_dd = 0
    for v in values:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100 if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd

    # Trade count from orders
    orders_data = await portfolio_service.get_orders(limit=1000, status="filled")
    trade_count = orders_data["total_count"]

    return {
        "returns_pct": round(returns_pct, 2),
        "max_drawdown": round(max_dd, 2),
        "trade_count": trade_count,
        "chart_data": snapshots,
    }


@router.get("/risk-analysis")
async def risk_analysis():
    from app.services.portfolio_risk_service import compute_portfolio_risk
    positions = await portfolio_service.get_latest_positions()
    risk = await compute_portfolio_risk(positions)
    return risk
