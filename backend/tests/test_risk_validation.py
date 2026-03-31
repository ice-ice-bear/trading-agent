"""Risk manager signal validation tests."""
import pytest
from unittest.mock import MagicMock


class FakePortfolio:
    def __init__(self, positions=None, total_value=10_000_000, cash_balance=10_000_000, total_pnl=0):
        self.positions = positions or []
        self.total_value = total_value
        self.cash_balance = cash_balance
        self.total_pnl = total_pnl


def _make_risk_config(**overrides):
    defaults = {
        "min_rr_score": "0.3",
        "max_positions": "5",
        "max_position_weight_pct": "20.0",
        "max_daily_loss": "500000",
        "sector_max_pct": "40.0",
        "min_hold_minutes": "0",
    }
    defaults.update(overrides)
    return defaults


from app.agents.risk_manager import RiskManagerAgent


@pytest.fixture
def risk_agent():
    agent = RiskManagerAgent.__new__(RiskManagerAgent)
    return agent


@pytest.mark.asyncio
async def test_sell_rejected_when_no_position(risk_agent):
    """SELL signal for stock not in portfolio must be rejected."""
    signal = {"stock_code": "047040", "direction": "sell", "rr_score": 0.5, "critic_result": "pass"}
    portfolio = FakePortfolio(positions=[])
    config = _make_risk_config()
    result = await risk_agent._validate_signal(signal, config, portfolio)
    assert result is not None
    assert "미보유" in result


@pytest.mark.asyncio
async def test_sell_approved_when_position_exists(risk_agent):
    """SELL signal for held stock should pass (if rr_score is adequate)."""
    signal = {"stock_code": "005930", "direction": "sell", "rr_score": 0.5, "critic_result": "pass"}
    portfolio = FakePortfolio(positions=[{"stock_code": "005930", "market_value": 1_000_000}])
    config = _make_risk_config()
    result = await risk_agent._validate_signal(signal, config, portfolio)
    assert result is None


@pytest.mark.asyncio
async def test_buy_still_works_with_new_structure(risk_agent):
    """BUY validation logic must still function after restructure."""
    signal = {"stock_code": "005930", "direction": "buy", "rr_score": 0.5, "critic_result": "pass"}
    portfolio = FakePortfolio(positions=[])
    config = _make_risk_config()
    result = await risk_agent._validate_signal(signal, config, portfolio)
    assert result is None


@pytest.mark.asyncio
async def test_rr_score_rejection_still_works(risk_agent):
    """Common rr_score gate must still reject low scores."""
    signal = {"stock_code": "005930", "direction": "buy", "rr_score": 0.1, "critic_result": "pass"}
    portfolio = FakePortfolio(positions=[])
    config = _make_risk_config(min_rr_score="0.3")
    result = await risk_agent._validate_signal(signal, config, portfolio)
    assert result is not None
    assert "R/R" in result


@pytest.mark.asyncio
async def test_sell_rejected_when_rr_too_low(risk_agent):
    """SELL signal must also be rejected if rr_score is below threshold."""
    signal = {"stock_code": "005930", "direction": "sell", "rr_score": 0.1, "critic_result": "pass"}
    portfolio = FakePortfolio(positions=[{"stock_code": "005930", "market_value": 1_000_000}])
    config = _make_risk_config(min_rr_score="0.3")
    result = await risk_agent._validate_signal(signal, config, portfolio)
    assert result is not None
    assert "R/R" in result
