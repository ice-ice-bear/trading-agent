"""Reusable technical indicator computation for the research API.

Delegates to market_scanner_indicators for the actual math so we have
a single source of truth.
"""

from __future__ import annotations

from typing import Any

from app.agents.market_scanner_indicators import (
    calculate_bollinger_bands,
    calculate_macd,
    calculate_rsi,
    calculate_ma,
)


def compute_technicals(ohlcv_rows: list[dict]) -> dict[str, Any] | None:
    """Compute technical indicators from a list of OHLCV dicts.

    Args:
        ohlcv_rows: list of dicts with keys like
            stck_clpr (close), stck_hgpr (high), stck_lwpr (low),
            acml_vol (volume), stck_bsop_date (date).
            Rows should be sorted oldest-first.

    Returns:
        Dict with rsi, macd, bollinger, ma, volume_trend_pct or None if
        insufficient data.
    """
    if not ohlcv_rows or len(ohlcv_rows) < 26:
        return None

    closes: list[float] = []
    highs: list[float] = []
    lows: list[float] = []
    volumes: list[float] = []

    for row in ohlcv_rows:
        closes.append(float(row.get("stck_clpr", 0)))
        highs.append(float(row.get("stck_hgpr", 0)))
        lows.append(float(row.get("stck_lwpr", 0)))
        volumes.append(float(row.get("acml_vol", 0)))

    rsi = calculate_rsi(closes, 14)
    macd = calculate_macd(closes)
    bollinger = calculate_bollinger_bands(closes)
    ma20 = calculate_ma(closes, 20)
    ma50 = calculate_ma(closes, 50)
    ma200 = calculate_ma(closes, 200)

    # Volume trend: current 5-day avg vs 20-day avg
    volume_trend_pct: float | None = None
    if len(volumes) >= 20:
        avg_5 = sum(volumes[-5:]) / 5
        avg_20 = sum(volumes[-20:]) / 20
        if avg_20 > 0:
            volume_trend_pct = round((avg_5 / avg_20 - 1) * 100, 1)

    return {
        "rsi": rsi,
        "macd": macd,
        "bollinger": bollinger,
        "ma": {"ma20": ma20, "ma50": ma50, "ma200": ma200},
        "volume_trend_pct": volume_trend_pct,
    }
