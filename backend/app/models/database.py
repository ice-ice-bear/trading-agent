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

CREATE TABLE IF NOT EXISTS kospi200_components (
    stock_code TEXT PRIMARY KEY,
    stock_name TEXT NOT NULL,
    sector TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dart_corp_codes (
    stock_code TEXT PRIMARY KEY,
    corp_code TEXT NOT NULL,
    corp_name TEXT,
    cached_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dart_financials_cache (
    stock_code TEXT NOT NULL,
    cache_date TEXT NOT NULL,
    financials_json TEXT NOT NULL,
    PRIMARY KEY (stock_code, cache_date)
);

CREATE TABLE IF NOT EXISTS agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    agent_id TEXT,
    data TEXT,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp ON agent_events(timestamp);

-- Phase 1: Data Collection
CREATE TABLE IF NOT EXISTS foreign_ownership_cache (
    stock_code TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    foreign_net_buy INTEGER DEFAULT 0,
    institution_net_buy INTEGER DEFAULT 0,
    foreign_holding_pct REAL,
    cached_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (stock_code, trade_date)
);

CREATE TABLE IF NOT EXISTS insider_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT NOT NULL,
    corp_code TEXT,
    report_date TEXT,
    reporter_name TEXT,
    position TEXT,
    change_type TEXT,
    shares_before INTEGER,
    shares_after INTEGER,
    change_amount INTEGER,
    cached_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_insider_stock ON insider_trades(stock_code);

CREATE TABLE IF NOT EXISTS catalyst_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT,
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    description TEXT,
    source TEXT DEFAULT 'dart',
    impact TEXT DEFAULT 'neutral',
    cached_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalyst_date ON catalyst_events(event_date);
CREATE INDEX IF NOT EXISTS idx_catalyst_stock ON catalyst_events(stock_code);

-- Phase 2: Analysis
CREATE TABLE IF NOT EXISTS news_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT,
    title TEXT,
    summary TEXT,
    sentiment TEXT,
    source_url TEXT,
    published_at TEXT,
    cached_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_news_stock ON news_cache(stock_code);

CREATE TABLE IF NOT EXISTS signal_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT NOT NULL,
    snapshot_date TEXT DEFAULT (date('now')),
    signal_id INTEGER REFERENCES signals(id),
    direction TEXT,
    rr_score REAL,
    scenarios_json TEXT,
    expert_stances_json TEXT,
    variant_view TEXT,
    dart_fundamentals_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_snapshot_stock ON signal_snapshots(stock_code);

-- Phase 3: Advanced Analysis
CREATE TABLE IF NOT EXISTS valuation_cache (
    stock_code TEXT NOT NULL,
    cache_date TEXT NOT NULL,
    dcf_result_json TEXT,
    assumptions_json TEXT,
    PRIMARY KEY (stock_code, cache_date)
);

CREATE TABLE IF NOT EXISTS portfolio_risk_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT DEFAULT (datetime('now')),
    var_95 REAL,
    var_99 REAL,
    portfolio_beta REAL,
    sector_breakdown_json TEXT,
    correlation_matrix_json TEXT
);

-- Phase 4: Exports
CREATE TABLE IF NOT EXISTS memo_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id INTEGER REFERENCES signals(id),
    format TEXT DEFAULT 'html',
    file_path TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Phase 5: Per-stock dynamic stop-loss
CREATE TABLE IF NOT EXISTS stock_stop_loss_overrides (
    stock_code TEXT PRIMARY KEY,
    stop_loss_pct REAL NOT NULL,
    take_profit_pct REAL,
    atr_value REAL,
    atr_multiplier REAL DEFAULT 2.0,
    investment_horizon TEXT DEFAULT 'short',
    source TEXT DEFAULT 'auto',
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Phase 5: Position re-evaluation history
CREATE TABLE IF NOT EXISTS position_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT NOT NULL,
    evaluated_at TEXT DEFAULT (datetime('now')),
    new_status TEXT NOT NULL,
    reason TEXT,
    indicators_json TEXT,
    new_stop_loss_pct REAL
);
CREATE INDEX IF NOT EXISTS idx_position_eval_stock ON position_evaluations(stock_code);
"""

# Default risk configuration values
DEFAULT_RISK_CONFIG = {
    "stop_loss_pct": "-3.0",
    "take_profit_pct": "5.0",
    "max_positions": "5",
    "max_position_weight_pct": "20.0",
    "max_daily_loss": "500000",
    "signal_approval_mode": "auto",
    "min_rr_score": "2.0",
    "atr_stop_loss_multiplier_short": "2.0",
    "atr_stop_loss_multiplier_long": "3.0",
    "position_reeval_enabled": "true",
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
        "cron_expression": "30 9 * * 1-5",  # 09:30 — after opening auction settles
        "enabled": 1,
        "config_json": "{}",
    },
    {
        "name": "midday_scan",
        "agent_id": "market_scanner",
        "cron_expression": "0 12 * * 1-5",
        "enabled": 1,
        "config_json": "{}",
    },
    {
        "name": "afternoon_scan",
        "agent_id": "market_scanner",
        "cron_expression": "0 14 * * 1-5",  # 14:00 — late-day momentum before close
        "enabled": 1,
        "config_json": "{}",
    },
    {
        "name": "position_reeval",
        "agent_id": "position_revaluator",
        "cron_expression": "*/30 9-15 * * 1-5",
        "enabled": 1,
        "config_json": "{}",
    },
    {
        "name": "closing_check",
        "agent_id": "portfolio_monitor",
        "cron_expression": "35 15 * * 1-5",  # 15:35 — after market close, final prices settled
        "enabled": 1,
        "config_json": "{}",
    },
    {
        "name": "daily_report",
        "agent_id": "report_generator",
        "cron_expression": "10 16 * * 1-5",  # 16:10 — after after-hours session ends
        "enabled": 1,
        "config_json": "{}",
    },
    {
        "name": "weekly_report",
        "agent_id": "report_generator",
        "cron_expression": "0 17 * * 5",
        "enabled": 1,
        "config_json": "{}",
    },
]
