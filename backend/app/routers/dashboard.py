"""Dashboard API router — portfolio, positions, orders, performance."""

from fastapi import APIRouter, Query

from app.services import portfolio_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/portfolio")
async def get_portfolio():
    """Get latest portfolio snapshot."""
    snapshot = await portfolio_service.get_latest_portfolio()
    if not snapshot:
        return {
            "total_value": 0,
            "cash_balance": 0,
            "total_pnl": 0,
            "total_pnl_pct": 0,
            "positions": [],
        }

    positions = await portfolio_service.get_latest_positions()
    return {
        "total_value": snapshot["total_value"],
        "cash_balance": snapshot["cash_balance"],
        "total_pnl": snapshot["total_pnl"],
        "total_pnl_pct": snapshot["total_pnl_pct"],
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
    """Get positions from the latest snapshot."""
    positions = await portfolio_service.get_latest_positions()
    return {"positions": positions}


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
