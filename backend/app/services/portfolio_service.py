"""Portfolio service — wraps MCP balance queries and DB access."""

import logging

from app.models.db import execute_query

logger = logging.getLogger(__name__)


async def get_latest_portfolio() -> dict | None:
    """Get the most recent portfolio snapshot."""
    return await execute_query(
        "SELECT * FROM portfolio_snapshots ORDER BY id DESC LIMIT 1",
        fetch_one=True,
    )


async def get_portfolio_history(hours: int = 24) -> list[dict]:
    """Get portfolio snapshots from the last N hours."""
    return await execute_query(
        """SELECT id, timestamp, total_value, cash_balance, total_pnl, total_pnl_pct
           FROM portfolio_snapshots
           WHERE timestamp >= datetime('now', ?)
           ORDER BY timestamp ASC""",
        (f"-{hours} hours",),
    )


async def get_latest_positions() -> list[dict]:
    """Get positions from the latest snapshot."""
    snapshot = await get_latest_portfolio()
    if not snapshot:
        return []
    return await execute_query(
        "SELECT * FROM positions WHERE snapshot_id = ?",
        (snapshot["id"],),
    )


async def get_orders(limit: int = 50, offset: int = 0, status: str | None = None) -> dict:
    """Get order history with pagination."""
    if status and status != "all":
        rows = await execute_query(
            """SELECT * FROM orders WHERE status = ?
               ORDER BY timestamp DESC LIMIT ? OFFSET ?""",
            (status, limit, offset),
        )
        count_result = await execute_query(
            "SELECT COUNT(*) as cnt FROM orders WHERE status = ?",
            (status,),
            fetch_one=True,
        )
    else:
        rows = await execute_query(
            "SELECT * FROM orders ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        count_result = await execute_query(
            "SELECT COUNT(*) as cnt FROM orders",
            fetch_one=True,
        )

    total = count_result["cnt"] if count_result else 0
    return {"orders": rows or [], "total_count": total}


async def get_signals(limit: int = 50, status: str | None = None) -> dict:
    """Get trading signals with optional status filter."""
    if status and status != "all":
        rows = await execute_query(
            """SELECT * FROM signals WHERE status = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (status, limit),
        )
        count_result = await execute_query(
            "SELECT COUNT(*) as cnt FROM signals WHERE status = ?",
            (status,),
            fetch_one=True,
        )
    else:
        rows = await execute_query(
            "SELECT * FROM signals ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        )
        count_result = await execute_query(
            "SELECT COUNT(*) as cnt FROM signals",
            fetch_one=True,
        )

    total = count_result["cnt"] if count_result else 0
    return {"signals": rows or [], "total_count": total}


async def get_agent_logs(agent_id: str | None = None, limit: int = 50) -> list[dict]:
    """Get agent execution logs."""
    if agent_id:
        return await execute_query(
            """SELECT * FROM agent_logs WHERE agent_id = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (agent_id, limit),
        )
    return await execute_query(
        "SELECT * FROM agent_logs ORDER BY timestamp DESC LIMIT ?",
        (limit,),
    )


async def get_watchlist() -> list[dict]:
    """Get all watchlist items."""
    return await execute_query("SELECT * FROM watchlist ORDER BY added_at DESC")


async def add_to_watchlist(stock_code: str, stock_name: str = "", added_by: str = "user") -> dict:
    """Add a stock to the watchlist."""
    row_id = await execute_query(
        """INSERT OR IGNORE INTO watchlist (stock_code, stock_name, added_by)
           VALUES (?, ?, ?)""",
        (stock_code, stock_name, added_by),
    )
    return {"id": row_id, "stock_code": stock_code, "stock_name": stock_name}


async def remove_from_watchlist(stock_code: str) -> bool:
    """Remove a stock from the watchlist."""
    result = await execute_query(
        "DELETE FROM watchlist WHERE stock_code = ?",
        (stock_code,),
    )
    return result.get("rowcount", 0) > 0 if result else False


async def get_risk_config() -> dict:
    """Get all risk configuration values."""
    rows = await execute_query("SELECT key, value FROM risk_config")
    return {row["key"]: row["value"] for row in rows} if rows else {}


async def update_risk_config(key: str, value: str) -> None:
    """Update a risk configuration value."""
    await execute_query(
        """INSERT INTO risk_config (key, value, updated_at)
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value=?, updated_at=datetime('now')""",
        (key, value, value),
    )
