"""Async SQLite database connection and initialization."""

import logging
from pathlib import Path

import aiosqlite

from app.models.database import DEFAULT_RISK_CONFIG, DEFAULT_TASKS, SCHEMA_SQL

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent.parent / "data" / "trading.db"


async def get_db() -> aiosqlite.Connection:
    """Get a database connection. Caller is responsible for closing."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_database() -> None:
    """Create tables and seed default data on first run."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    db = await get_db()
    try:
        await db.executescript(SCHEMA_SQL)

        # Seed default risk config
        for key, value in DEFAULT_RISK_CONFIG.items():
            await db.execute(
                "INSERT OR IGNORE INTO risk_config (key, value) VALUES (?, ?)",
                (key, value),
            )

        # Seed default scheduled tasks
        for task in DEFAULT_TASKS:
            await db.execute(
                """INSERT OR IGNORE INTO scheduled_tasks
                   (name, agent_id, cron_expression, enabled, config_json)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    task["name"],
                    task["agent_id"],
                    task["cron_expression"],
                    task["enabled"],
                    task["config_json"],
                ),
            )

        await db.commit()
        logger.info(f"Database initialized at {DB_PATH}")
    finally:
        await db.close()


async def execute_query(
    query: str, params: tuple = (), fetch_one: bool = False
) -> list[dict] | dict | None:
    """Execute a query and return results as dicts."""
    db = await get_db()
    try:
        cursor = await db.execute(query, params)
        if query.strip().upper().startswith("SELECT"):
            rows = await cursor.fetchall()
            if fetch_one:
                return dict(rows[0]) if rows else None
            return [dict(row) for row in rows]
        else:
            await db.commit()
            return {"lastrowid": cursor.lastrowid, "rowcount": cursor.rowcount}
    finally:
        await db.close()


async def execute_insert(query: str, params: tuple = ()) -> int:
    """Execute an INSERT and return the last row id."""
    db = await get_db()
    try:
        cursor = await db.execute(query, params)
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()
