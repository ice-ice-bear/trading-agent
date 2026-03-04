"""Technical indicator calculations — pure Python, no external dependencies."""
from __future__ import annotations

import math
from typing import Any


def calculate_ma(closes: list[float], period: int) -> float | None:
    """Simple Moving Average."""
    if len(closes) < period:
        return None
    return sum(closes[-period:]) / period


def calculate_rsi(closes: list[float], period: int = 14) -> float | None:
    """Relative Strength Index (0-100). >70 과매수, <30 과매도."""
    if len(closes) < period + 1:
        return None

    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))

    # Initial averages
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    # Wilder's smoothing
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def calculate_macd(
    closes: list[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> dict[str, Any] | None:
    """MACD indicator. Returns macd, signal, histogram, cross."""
    if len(closes) < slow + signal:
        return None

    def ema(data: list[float], period: int) -> list[float]:
        k = 2 / (period + 1)
        result = [sum(data[:period]) / period]
        for val in data[period:]:
            result.append(val * k + result[-1] * (1 - k))
        return result

    ema_fast = ema(closes, fast)
    ema_slow = ema(closes, slow)

    # MACD line = fast EMA - slow EMA (aligned from slow start)
    offset = slow - fast
    macd_line = [f - s for f, s in zip(ema_fast[offset:], ema_slow)]

    if len(macd_line) < signal:
        return None

    signal_line = ema(macd_line, signal)
    histogram = macd_line[-1] - signal_line[-1]

    # Detect cross (current histogram vs previous)
    if len(macd_line) >= 2 and len(signal_line) >= 2:
        prev_hist = macd_line[-2] - signal_line[-2]
        if prev_hist < 0 and histogram > 0:
            cross = "bullish"
        elif prev_hist > 0 and histogram < 0:
            cross = "bearish"
        else:
            cross = "none"
    else:
        cross = "none"

    return {
        "macd": round(macd_line[-1], 2),
        "signal": round(signal_line[-1], 2),
        "histogram": round(histogram, 2),
        "cross": cross,
    }


def calculate_stochastic(
    closes: list[float],
    highs: list[float],
    lows: list[float],
    k_period: int = 14,
    d_period: int = 3,
) -> dict[str, float] | None:
    """Stochastic Oscillator %K and %D."""
    if len(closes) < k_period + d_period:
        return None

    k_values = []
    for i in range(k_period - 1, len(closes)):
        window_high = max(highs[i - k_period + 1 : i + 1])
        window_low = min(lows[i - k_period + 1 : i + 1])
        if window_high == window_low:
            k_values.append(50.0)
        else:
            k = (closes[i] - window_low) / (window_high - window_low) * 100
            k_values.append(round(k, 2))

    if len(k_values) < d_period:
        return None

    d = sum(k_values[-d_period:]) / d_period
    return {"k": k_values[-1], "d": round(d, 2)}


def calculate_bollinger_bands(
    closes: list[float],
    period: int = 20,
    std_dev: float = 2.0,
) -> dict[str, Any] | None:
    """Bollinger Bands: upper, middle, lower, bandwidth, position."""
    if len(closes) < period:
        return None

    window = closes[-period:]
    middle = sum(window) / period
    variance = sum((x - middle) ** 2 for x in window) / period
    std = math.sqrt(variance)

    upper = middle + std_dev * std
    lower = middle - std_dev * std
    bandwidth = (upper - lower) / middle if middle != 0 else 0

    current = closes[-1]
    if current > upper:
        position = "above_upper"
    elif current > middle:
        position = "upper_half"
    elif current > lower:
        position = "lower_half"
    else:
        position = "below_lower"

    return {
        "upper": round(upper, 0),
        "middle": round(middle, 0),
        "lower": round(lower, 0),
        "bandwidth": round(bandwidth, 4),
        "position": position,
    }


def calculate_atr(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    period: int = 14,
) -> float | None:
    """Average True Range — measures daily volatility."""
    if len(closes) < period + 1:
        return None

    true_ranges = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        true_ranges.append(tr)

    if len(true_ranges) < period:
        return None

    # Wilder's smoothing
    atr = sum(true_ranges[:period]) / period
    for tr in true_ranges[period:]:
        atr = (atr * (period - 1) + tr) / period

    return round(atr, 0)


def calculate_volume_change(volumes: list[float], period: int = 5) -> float | None:
    """Current volume vs N-day average (%). 양수=급증, 음수=급감."""
    if len(volumes) < period + 1:
        return None
    avg = sum(volumes[-period - 1 : -1]) / period
    if avg == 0:
        return None
    return round((volumes[-1] / avg - 1) * 100, 1)


def compute_all_indicators(
    ohlcv: dict[str, list[float]],
    current_price: float,
) -> dict[str, Any] | None:
    """Compute all indicators from OHLCV lists. Returns None if insufficient data."""
    closes = ohlcv.get("closes", [])
    highs = ohlcv.get("highs", [])
    lows = ohlcv.get("lows", [])
    volumes = ohlcv.get("volumes", [])

    if len(closes) < 26:
        return None

    ma5 = calculate_ma(closes, 5)
    ma20 = calculate_ma(closes, 20)
    ma60 = calculate_ma(closes, 60)

    # MA alignment
    if ma5 and ma20 and ma60:
        if ma5 > ma20 > ma60:
            ma_alignment = "bullish"
        elif ma5 < ma20 < ma60:
            ma_alignment = "bearish"
        else:
            ma_alignment = "neutral"
    else:
        ma_alignment = "neutral"

    return {
        "current_price": current_price,
        "ma5": ma5,
        "ma20": ma20,
        "ma60": ma60,
        "ma_alignment": ma_alignment,
        "rsi_14": calculate_rsi(closes, 14),
        "macd": calculate_macd(closes),
        "stochastic": calculate_stochastic(closes, highs, lows) if highs and lows else None,
        "bollinger": calculate_bollinger_bands(closes),
        "atr_14": calculate_atr(highs, lows, closes) if highs and lows else None,
        "volume_change_5d_pct": calculate_volume_change(volumes) if volumes else None,
    }
