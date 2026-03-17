# backend/tests/test_report_summary.py
import pytest
from app.agents.report_generator import ReportGeneratorAgent


def test_compute_summary_basic():
    agent = ReportGeneratorAgent()
    data = {
        "snapshots": [
            {"total_value": 10000000, "total_pnl": 0, "total_pnl_pct": 0, "timestamp": "2026-03-17T09:00:00"},
            {"total_value": 10200000, "total_pnl": 200000, "total_pnl_pct": 2.0, "timestamp": "2026-03-17T15:00:00"},
            {"total_value": 10100000, "total_pnl": 100000, "total_pnl_pct": 1.0, "timestamp": "2026-03-17T16:00:00"},
        ],
        "orders": [
            {"stock_name": "삼성전자", "stock_code": "005930", "side": "buy", "quantity": 10, "price": 80000, "status": "filled", "timestamp": "2026-03-17T10:00:00", "fill_price": 80000},
            {"stock_name": "SK하이닉스", "stock_code": "000660", "side": "sell", "quantity": 5, "price": 150000, "status": "filled", "timestamp": "2026-03-17T14:00:00", "fill_price": 152000},
        ],
        "signals": [
            {"stock_name": "삼성전자", "direction": "buy", "rr_score": 3.5, "status": "approved"},
            {"stock_name": "LG에너지솔루션", "direction": "sell", "rr_score": 2.1, "status": "rejected"},
            {"stock_name": "SK하이닉스", "direction": "buy", "rr_score": 4.0, "status": "approved"},
        ],
        "latest_pnl": 100000,
        "latest_pnl_pct": 1.0,
    }
    summary = agent._compute_summary(data)

    # KPIs
    assert summary["kpis"]["total_pnl"] == 100000
    assert summary["kpis"]["total_pnl_pct"] == 1.0
    assert summary["kpis"]["trade_count"] == 2
    assert summary["kpis"]["signal_count"] == 3
    assert summary["kpis"]["signal_approval_rate"] == pytest.approx(66.67, abs=0.1)

    # Trades
    assert len(summary["trades"]) == 2
    assert summary["trades"][0]["stock_name"] == "삼성전자"

    # Signals
    assert len(summary["signals"]) == 3

    # Max drawdown: peak was 10200000, trough after was 10100000
    # drawdown = (10200000 - 10100000) / 10200000 * 100 = ~0.98%
    assert summary["kpis"]["max_drawdown_pct"] == pytest.approx(0.98, abs=0.1)


def test_compute_summary_empty_data():
    agent = ReportGeneratorAgent()
    data = {"snapshots": [], "orders": [], "signals": [], "latest_pnl": 0, "latest_pnl_pct": 0}
    summary = agent._compute_summary(data)
    assert summary["kpis"]["trade_count"] == 0
    assert summary["kpis"]["win_rate"] == 0
    assert summary["kpis"]["max_drawdown_pct"] == 0
    assert summary["trades"] == []
    assert summary["signals"] == []
    assert summary["risk_events"] == []
