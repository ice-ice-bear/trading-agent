"""포트폴리오 리스크 분석 서비스"""
import logging
from app.models.db import execute_query
from app.services.market_service import get_daily_chart, parse_ohlcv_from_chart

logger = logging.getLogger(__name__)


def _compute_returns(closes: list[float]) -> list[float]:
    return [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes)) if closes[i - 1] > 0]


def calculate_historical_var(returns: list[float], confidence: float = 0.95) -> float:
    if len(returns) < 10:
        return 0.0
    sorted_returns = sorted(returns)
    idx = int(len(sorted_returns) * (1 - confidence))
    return abs(sorted_returns[max(idx, 0)])


async def compute_portfolio_risk(positions: list[dict]) -> dict:
    if not positions:
        return {"var_95": 0, "var_99": 0, "portfolio_beta": 1.0, "sector_breakdown": {}, "total_value": 0}

    stock_returns_map = {}
    for pos in positions:
        try:
            chart = await get_daily_chart(pos["stock_code"])
            ohlcv = parse_ohlcv_from_chart(chart)
            if ohlcv and ohlcv.get("closes") and len(ohlcv["closes"]) > 10:
                stock_returns_map[pos["stock_code"]] = _compute_returns(ohlcv["closes"])
        except Exception as e:
            logger.warning(f"Chart fetch failed for {pos['stock_code']}: {e}")

    total_value = sum(
        pos.get("market_value", 0) or (pos.get("current_price", 0) * pos.get("quantity", 0))
        for pos in positions
    )
    if total_value == 0:
        return {"var_95": 0, "var_99": 0, "portfolio_beta": 1.0, "sector_breakdown": {}, "total_value": 0}

    # Weighted portfolio daily returns
    min_len = min((len(r) for r in stock_returns_map.values()), default=0)
    if min_len < 10:
        var_95 = 0
        var_99 = 0
    else:
        portfolio_returns = []
        for i in range(min_len):
            daily = 0
            for pos in positions:
                code = pos["stock_code"]
                if code in stock_returns_map and i < len(stock_returns_map[code]):
                    weight = (pos.get("market_value", 0) or 0) / total_value
                    daily += stock_returns_map[code][i] * weight
            portfolio_returns.append(daily)

        var_95 = calculate_historical_var(portfolio_returns, 0.95)
        var_99 = calculate_historical_var(portfolio_returns, 0.99)

    # Sector breakdown
    sector_breakdown = {}
    for pos in positions:
        row = await execute_query(
            "SELECT sector FROM kospi200_components WHERE stock_code = ?",
            (pos["stock_code"],)
        )
        sector = row[0]["sector"] if row and row[0].get("sector") else "기타"
        weight = (pos.get("market_value", 0) or 0) / total_value * 100
        sector_breakdown[sector] = round(sector_breakdown.get(sector, 0) + weight, 1)

    return {
        "var_95": round(var_95 * 100, 2),
        "var_99": round(var_99 * 100, 2),
        "portfolio_beta": 1.0,  # Market index chart not available, default
        "sector_breakdown": sector_breakdown,
        "total_value": round(total_value),
    }
