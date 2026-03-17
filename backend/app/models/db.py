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

        # --- Migration guards for existing databases ---
        _ALTER_STATEMENTS = [
            "ALTER TABLE signals ADD COLUMN scenarios_json TEXT",
            "ALTER TABLE signals ADD COLUMN variant_view TEXT",
            "ALTER TABLE signals ADD COLUMN rr_score REAL",
            "ALTER TABLE signals ADD COLUMN current_price REAL",
            "ALTER TABLE signals ADD COLUMN expert_stances_json TEXT",
            "ALTER TABLE signals ADD COLUMN dart_fundamentals_json TEXT",
            "ALTER TABLE signals ADD COLUMN metadata_json TEXT",
            "ALTER TABLE signals ADD COLUMN critic_result TEXT",
            "ALTER TABLE signals ADD COLUMN confidence_grades_json TEXT",
        ]
        for stmt in _ALTER_STATEMENTS:
            try:
                await db.execute(stmt)
            except Exception:
                pass  # column already exists — safe to ignore

        # --- Migrate signals CHECK constraints (add 'hold' direction, 'failed' status) ---
        try:
            row = await db.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='signals'"
            )
            schema_row = await row.fetchone()
            if schema_row:
                schema_sql = schema_row[0] or ""
                if "'hold'" not in schema_sql or "'failed'" not in schema_sql:
                    logger.info("Migrating signals table to add 'hold'/'failed' constraints...")
                    await db.execute("ALTER TABLE signals RENAME TO signals_old")
                    await db.executescript("""
                        CREATE TABLE IF NOT EXISTS signals (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                            agent_id TEXT NOT NULL,
                            stock_code TEXT NOT NULL,
                            stock_name TEXT NOT NULL DEFAULT '',
                            direction TEXT NOT NULL CHECK(direction IN ('buy', 'sell', 'hold')),
                            confidence REAL NOT NULL DEFAULT 0.0,
                            reason TEXT,
                            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
                            risk_notes TEXT,
                            scenarios_json TEXT,
                            variant_view TEXT,
                            rr_score REAL,
                            current_price REAL,
                            expert_stances_json TEXT,
                            dart_fundamentals_json TEXT,
                            metadata_json TEXT,
                            critic_result TEXT,
                            confidence_grades_json TEXT
                        );
                        CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
                    """)
                    await db.execute("""
                        INSERT INTO signals
                        SELECT id, timestamp, agent_id, stock_code, stock_name,
                               direction, confidence, reason, status, risk_notes,
                               scenarios_json, variant_view, rr_score, current_price,
                               expert_stances_json, dart_fundamentals_json,
                               metadata_json, critic_result, confidence_grades_json
                        FROM signals_old
                    """)
                    await db.execute("DROP TABLE signals_old")
                    logger.info("Signals table migration complete.")
        except Exception as e:
            logger.warning(f"Signals CHECK migration skipped: {e}")

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
