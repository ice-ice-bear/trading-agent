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
        "min_composite_score": "15",
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


@pytest.fixture
def mock_portfolio():
    return FakePortfolio(positions=[])


@pytest.fixture
def mock_portfolio_with_position():
    return FakePortfolio(positions=[{"stock_code": "005930", "market_value": 1_000_000}])


@pytest.mark.asyncio
async def test_sell_rejected_when_no_position(risk_agent):
    """SELL signal for stock not in portfolio must be rejected."""
    signal = {"stock_code": "047040", "direction": "sell", "confidence": 0.5, "critic_result": "pass"}
    portfolio = FakePortfolio(positions=[])
    config = _make_risk_config()
    result = await risk_agent._validate_signal(signal, config, portfolio)
    assert result is not None
    assert "미보유" in result


@pytest.mark.asyncio
async def test_sell_approved_when_position_exists(risk_agent):
    """SELL signal for held stock should pass (if composite score is adequate)."""
    signal = {"stock_code": "005930", "direction": "sell", "confidence": 0.5, "critic_result": "pass"}
    portfolio = FakePortfolio(positions=[{"stock_code": "005930", "market_value": 1_000_000}])
    config = _make_risk_config()
    result = await risk_agent._validate_signal(signal, config, portfolio)
    assert result is None


@pytest.mark.asyncio
async def test_buy_still_works_with_new_structure(risk_agent):
    """BUY validation logic must still function after restructure."""
    signal = {"stock_code": "005930", "direction": "buy", "confidence": 0.5, "critic_result": "pass"}
    portfolio = FakePortfolio(positions=[])
    config = _make_risk_config()
    result = await risk_agent._validate_signal(signal, config, portfolio)
    assert result is None


@pytest.mark.asyncio
async def test_composite_score_rejection(risk_agent):
    """Signals with low composite score should be rejected."""
    signal = {
        "stock_code": "005930",
        "direction": "buy",
        "confidence": 0.05,  # 5% composite score
    }
    risk_config = {"min_composite_score": "15"}
    reason = await risk_agent._validate_signal(signal, risk_config, FakePortfolio(positions=[]))
    assert reason is not None
    assert "복합 점수 미달" in reason


@pytest.mark.asyncio
async def test_sell_rejected_when_composite_too_low(risk_agent, mock_portfolio_with_position):
    """SELL signals should also be rejected if composite score is too low."""
    signal = {
        "stock_code": "005930",
        "direction": "sell",
        "confidence": 0.05,  # 5% composite score
    }
    risk_config = {"min_composite_score": "15"}
    reason = await risk_agent._validate_signal(signal, risk_config, mock_portfolio_with_position)
    assert reason is not None
    assert "복합 점수 미달" in reason
