"""SQLite database models and schema definitions for the trading platform."""

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    total_value REAL NOT NULL,
    cash_balance REAL NOT NULL,
    total_pnl REAL NOT NULL,
    total_pnl_pct REAL NOT NULL,
    positions_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES portfolio_snapshots(id),
    stock_code TEXT NOT NULL,
    stock_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    avg_buy_price REAL NOT NULL,
    current_price REAL NOT NULL,
    market_value REAL NOT NULL,
    unrealized_pnl REAL NOT NULL,
    unrealized_pnl_pct REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    agent_id TEXT NOT NULL,
    stock_code TEXT NOT NULL,
    stock_name TEXT NOT NULL DEFAULT '',
    side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
    order_type TEXT NOT NULL DEFAULT 'market' CHECK(order_type IN ('market', 'limit')),
    quantity INTEGER NOT NULL,
    price REAL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted', 'filled', 'rejected', 'cancelled')),
    fill_price REAL,
    fill_quantity INTEGER,
    reason TEXT,
    mcp_result_json TEXT,
    signal_id INTEGER REFERENCES signals(id)
);

CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    agent_id TEXT NOT NULL,
    stock_code TEXT NOT NULL,
    stock_name TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL CHECK(direction IN ('buy', 'sell')),
    confidence REAL NOT NULL DEFAULT 0.0,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'executed')),
    risk_notes TEXT
);

CREATE TABLE IF NOT EXISTS agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    agent_id TEXT NOT NULL,
    agent_role TEXT NOT NULL,
    action TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 1,
    result_summary TEXT,
    error_message TEXT,
    events_emitted_json TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT NOT NULL UNIQUE,
    stock_name TEXT NOT NULL DEFAULT '',
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    added_by TEXT NOT NULL DEFAULT 'user',
    last_price REAL,
    last_updated TEXT
);

CREATE TABLE IF NOT EXISTS risk_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    agent_id TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run TEXT,
    next_run TEXT,
    last_status TEXT,
    config_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    report_type TEXT NOT NULL CHECK(report_type IN ('daily', 'weekly', 'manual')),
    period_start TEXT,
    period_end TEXT,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    summary_json TEXT DEFAULT '{}',
    agent_id TEXT NOT NULL DEFAULT 'report_generator'
);

CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON reports(timestamp);
CREATE INDEX IF NOT EXISTS idx_positions_snapshot ON positions(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders(timestamp);
CREATE INDEX IF NOT EXISTS idx_orders_signal ON orders(signal_id);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_timestamp ON agent_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON portfolio_snapshots(timestamp);
"""

# Default risk configuration values
DEFAULT_RISK_CONFIG = {
    "stop_loss_pct": "-3.0",
    "take_profit_pct": "5.0",
    "max_positions": "5",
    "max_position_weight_pct": "20.0",
    "max_daily_loss": "500000",
    "signal_approval_mode": "auto",
}

# Default scheduled tasks
DEFAULT_TASKS = [
    {
        "name": "portfolio_check",
        "agent_id": "portfolio_monitor",
        "cron_expression": "*/5 9-15 * * 1-5",
        "enabled": 1,
        "config_json": "{}",
    },
    {
        "name": "morning_scan",
        "agent_id": "market_scanner",
        "cron_expression": "5 9 * * 1-5",
        "enabled": 0,
        "config_json": "{}",
    },
    {
        "name": "midday_scan",
        "agent_id": "market_scanner",
        "cron_expression": "0 12 * * 1-5",
        "enabled": 0,
        "config_json": "{}",
    },
    {
        "name": "closing_check",
        "agent_id": "portfolio_monitor",
        "cron_expression": "20 15 * * 1-5",
        "enabled": 1,
        "config_json": "{}",
    },
    {
        "name": "daily_report",
        "agent_id": "report_generator",
        "cron_expression": "0 16 * * 1-5",
        "enabled": 0,
        "config_json": "{}",
    },
    {
        "name": "weekly_report",
        "agent_id": "report_generator",
        "cron_expression": "0 17 * * 5",
        "enabled": 0,
        "config_json": "{}",
    },
]
