"""포트폴리오 리스크 분석 서비스"""
import logging
from app.models.db import execute_query
from app.services.market_service import get_daily_chart, parse_ohlcv_from_chart

logger = logging.getLogger(__name__)


def _compute_returns(closes: list[float]) -> list[float]:
    return [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes)) if closes[i - 1] > 0]


def calculate_beta(stock_returns: list[float], market_returns: list[float]) -> float:
    """종목 베타 = Cov(stock, market) / Var(market)"""
    n = min(len(stock_returns), len(market_returns))
    if n < 10:
        return 1.0
    sr = stock_returns[:n]
    mr = market_returns[:n]
    mean_s = sum(sr) / n
    mean_m = sum(mr) / n
    cov = sum((sr[i] - mean_s) * (mr[i] - mean_m) for i in range(n)) / n
    var_m = sum((mr[i] - mean_m) ** 2 for i in range(n)) / n
    if var_m == 0:
        return 1.0
    return round(cov / var_m, 3)


def compute_correlation_matrix(returns_map: dict[str, list[float]]) -> dict:
    """종목 간 수익률 상관관계 매트릭스"""
    codes = list(returns_map.keys())
    if len(codes) < 2:
        return {"codes": codes, "matrix": []}

    n = min(len(r) for r in returns_map.values())
    if n < 10:
        return {"codes": codes, "matrix": []}

    matrix = []
    for i, code_i in enumerate(codes):
        row = []
        ri = returns_map[code_i][:n]
        mean_i = sum(ri) / n
        std_i = (sum((x - mean_i) ** 2 for x in ri) / n) ** 0.5
        for j, code_j in enumerate(codes):
            if i == j:
                row.append(1.0)
            else:
                rj = returns_map[code_j][:n]
                mean_j = sum(rj) / n
                std_j = (sum((x - mean_j) ** 2 for x in rj) / n) ** 0.5
                if std_i == 0 or std_j == 0:
                    row.append(0.0)
                else:
                    cov = sum((ri[k] - mean_i) * (rj[k] - mean_j) for k in range(n)) / n
                    row.append(round(cov / (std_i * std_j), 3))
        matrix.append(row)

    return {"codes": codes, "matrix": matrix}


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

    # Fetch market proxy (KODEX200 ETF) for beta calculation
    market_returns = []
    try:
        market_chart = await get_daily_chart("069500")
        market_ohlcv = parse_ohlcv_from_chart(market_chart)
        if market_ohlcv and market_ohlcv.get("closes") and len(market_ohlcv["closes"]) > 10:
            market_returns = _compute_returns(market_ohlcv["closes"])
    except Exception:
        pass

    # Portfolio beta (value-weighted)
    if market_returns:
        weighted_beta = 0.0
        for pos in positions:
            code = pos["stock_code"]
            if code in stock_returns_map:
                beta = calculate_beta(stock_returns_map[code], market_returns)
                weight = (pos.get("market_value", 0) or 0) / total_value if total_value > 0 else 0
                weighted_beta += beta * weight
        portfolio_beta = round(weighted_beta, 3)
    else:
        portfolio_beta = 1.0

    # Correlation matrix
    correlation = compute_correlation_matrix(stock_returns_map)

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
        "portfolio_beta": portfolio_beta,
        "sector_breakdown": sector_breakdown,
        "total_value": round(total_value),
        "correlation": correlation,
    }
