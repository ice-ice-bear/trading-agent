import pytest
from app.agents.market_scanner_indicators import (
    calculate_ma,
    calculate_rsi,
    calculate_macd,
    calculate_stochastic,
    calculate_bollinger_bands,
    calculate_atr,
    calculate_volume_change,
    compute_all_indicators,
)

# 샘플 OHLCV 데이터 (35일 — MACD signal line 계산에 최소 35일 필요)
SAMPLE_CLOSES = [
    71000, 71200, 70800, 71500, 72000, 71800, 72200, 73000, 72500, 72800,
    73200, 72900, 73500, 74000, 73800, 74200, 74500, 74100, 74800, 75000,
    74600, 75200, 75500, 75100, 75800, 76000, 75600, 76200, 76500, 76800,
    77000, 77200, 76800, 77500, 78000,
]
SAMPLE_HIGHS = [h + 300 for h in SAMPLE_CLOSES]
SAMPLE_LOWS = [l - 300 for l in SAMPLE_CLOSES]
SAMPLE_VOLUMES = [
    10000000, 11000000, 9500000, 12000000, 15000000,
    13000000, 14000000, 18000000, 16000000, 17000000,
    19000000, 17500000, 20000000, 21000000, 19500000,
    22000000, 23000000, 21000000, 24000000, 25000000,
    23000000, 26000000, 27000000, 25000000, 28000000,
    29000000, 27000000, 30000000, 31000000, 32000000,
    33000000, 34000000, 32000000, 35000000, 36000000,
]


def test_calculate_ma():
    ma5 = calculate_ma(SAMPLE_CLOSES, 5)
    assert ma5 is not None
    assert isinstance(ma5, float)
    # MA5 = 마지막 5개 평균
    expected = sum(SAMPLE_CLOSES[-5:]) / 5
    assert abs(ma5 - expected) < 0.01


def test_calculate_ma_insufficient_data():
    assert calculate_ma([70000, 71000], 5) is None


def test_calculate_rsi():
    rsi = calculate_rsi(SAMPLE_CLOSES, 14)
    assert rsi is not None
    assert 0 <= rsi <= 100


def test_calculate_rsi_insufficient_data():
    assert calculate_rsi(SAMPLE_CLOSES[:10], 14) is None


def test_calculate_macd():
    result = calculate_macd(SAMPLE_CLOSES)
    assert result is not None
    assert "macd" in result
    assert "signal" in result
    assert "histogram" in result
    assert "cross" in result
    assert result["cross"] in ("bullish", "bearish", "none")


def test_calculate_stochastic():
    result = calculate_stochastic(SAMPLE_CLOSES, SAMPLE_HIGHS, SAMPLE_LOWS)
    assert result is not None
    assert "k" in result
    assert "d" in result
    assert 0 <= result["k"] <= 100
    assert 0 <= result["d"] <= 100


def test_calculate_bollinger_bands():
    result = calculate_bollinger_bands(SAMPLE_CLOSES)
    assert result is not None
    assert result["upper"] > result["middle"] > result["lower"]
    assert "position" in result
    assert result["position"] in ("above_upper", "upper_half", "middle", "lower_half", "below_lower")


def test_calculate_atr():
    atr = calculate_atr(SAMPLE_HIGHS, SAMPLE_LOWS, SAMPLE_CLOSES, 14)
    assert atr is not None
    assert atr > 0


def test_calculate_volume_change():
    change_pct = calculate_volume_change(SAMPLE_VOLUMES, 5)
    assert change_pct is not None
    # 최근 값이 증가 추세이므로 양수여야 함
    assert change_pct > 0


def test_compute_all_indicators():
    ohlcv = {
        "closes": SAMPLE_CLOSES,
        "highs": SAMPLE_HIGHS,
        "lows": SAMPLE_LOWS,
        "volumes": SAMPLE_VOLUMES,
    }
    result = compute_all_indicators(ohlcv, current_price=78000)
    assert result is not None
    assert "ma5" in result
    assert "ma20" in result
    assert "ma60" in result
    assert "rsi_14" in result
    assert "macd" in result
    assert "stochastic" in result
    assert "bollinger" in result
    assert "atr_14" in result
    assert "volume_change_5d_pct" in result
    assert "ma_alignment" in result
    assert result["ma_alignment"] in ("bullish", "bearish", "neutral")
