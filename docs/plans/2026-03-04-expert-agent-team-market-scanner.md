# Expert Agent Team MarketScanner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** MarketScanner를 KOSPI200 스크리닝 + 4명의 전문가 팀(기술적 분석가, 모멘텀 트레이더, 리스크 평가자, 포트폴리오 전략가) 병렬 Claude 호출 + Chief Analyst 토론 시뮬레이션 구조로 고도화한다.

**Architecture:** MarketScanner 내부에 전문가 팀을 캡슐화 (Option B). Stage 1에서 volume/fluctuation rank TOP50 × 2를 KOSPI200 구성 종목과 교차 필터해 후보군 추출, Stage 2에서 Python으로 기술적 지표 계산 (RSI, MACD, Stochastic, Bollinger Bands, ATR, MA), Stage 3에서 asyncio.gather로 4명 전문가 병렬 Claude 호출, Stage 4에서 Chief Analyst가 토론 시뮬레이션 후 최종 신호 결정.

**Tech Stack:** Python 3.12, asyncio, anthropic SDK (AsyncAnthropic), aiosqlite, fastmcp (KIS MCP client), 순수 Python 지표 계산 (pandas 의존성 없음)

---

## 설계 문서 참조
`docs/plans/2026-03-04-expert-agent-team-market-scanner-design.md`

---

### Task 1: 기술적 지표 계산 모듈 생성

**파일:**
- 생성: `backend/app/agents/market_scanner_indicators.py`
- 생성: `backend/tests/test_indicators.py` (테스트 먼저)

**Step 1: 테스트 파일 생성 (실패 확인)**

```python
# backend/tests/test_indicators.py
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

# 샘플 OHLCV 데이터 (30일)
SAMPLE_CLOSES = [
    71000, 71200, 70800, 71500, 72000, 71800, 72200, 73000, 72500, 72800,
    73200, 72900, 73500, 74000, 73800, 74200, 74500, 74100, 74800, 75000,
    74600, 75200, 75500, 75100, 75800, 76000, 75600, 76200, 76500, 76800,
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
    result = compute_all_indicators(ohlcv, current_price=76800)
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
```

**Step 2: 실패 확인**
```bash
cd backend && uv run pytest tests/test_indicators.py -v 2>&1 | head -20
```
예상 출력: `ImportError` or `ModuleNotFoundError`

**Step 3: 지표 계산 모듈 구현**

```python
# backend/app/agents/market_scanner_indicators.py
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
    # Align lengths: ema_slow starts from index (slow - fast)
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
```

**Step 4: 테스트 통과 확인**
```bash
cd backend && uv run pytest tests/test_indicators.py -v
```
예상 출력: 모든 테스트 PASS

**Step 5: 커밋**
```bash
git add backend/app/agents/market_scanner_indicators.py backend/tests/test_indicators.py
git commit -m "feat: add pure-Python technical indicator calculator (RSI, MACD, Stochastic, BB, ATR)"
```

---

### Task 2: KOSPI200 구성 종목 캐싱 (DB + market_service)

**파일:**
- 수정: `backend/app/models/database.py` — SCHEMA_SQL에 테이블 추가
- 수정: `backend/app/services/market_service.py` — KOSPI200 fetch/cache 함수 추가

**Step 1: DB 스키마에 kospi200_components 추가**

`backend/app/models/database.py`의 SCHEMA_SQL 내 마지막 `CREATE TABLE` 블록 뒤에 추가:

```sql
CREATE TABLE IF NOT EXISTS kospi200_components (
    stock_code TEXT PRIMARY KEY,
    stock_name TEXT NOT NULL,
    sector TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);
```

**Step 2: market_service.py에 KOSPI200 함수 추가**

`backend/app/services/market_service.py` 끝에 추가:

```python
from app.models.db import execute_query, execute_insert


async def get_kospi200_components() -> list[str]:
    """KOSPI200 구성 종목 코드 반환. DB 캐시 우선, 없으면 KIS API 조회."""
    # 캐시 확인 (오늘 이후 업데이트된 데이터)
    cached = await execute_query(
        "SELECT stock_code FROM kospi200_components WHERE date(updated_at) >= date('now')"
    )
    if cached:
        return [row["stock_code"] for row in cached]

    # KIS API로 KOSPI200 구성 종목 조회
    raw = await mcp_manager.call_tool(
        "domestic_stock",
        {
            "api_type": "inquire_index_components",
            "params": {
                "env_dv": "demo",
                "fid_cond_mrkt_div_code": "U",
                "fid_input_iscd": "0002",  # KOSPI200 index code
            },
        },
    )

    components = _parse_list_response(raw, 300)
    if not components:
        # API 실패 시 캐시된 데이터 fallback (날짜 무관)
        fallback = await execute_query("SELECT stock_code FROM kospi200_components")
        return [row["stock_code"] for row in fallback] if fallback else []

    # DB에 upsert
    codes = []
    for item in components:
        code = item.get("stck_shrn_iscd") or item.get("stock_code", "")
        name = item.get("hts_kor_isnm") or item.get("stock_name", "")
        if code:
            await execute_query(
                """INSERT OR REPLACE INTO kospi200_components (stock_code, stock_name, updated_at)
                   VALUES (?, ?, datetime('now'))""",
                (code, name),
            )
            codes.append(code)

    return codes


async def get_batch_charts(
    stock_codes: list[str], period: str = "D"
) -> dict[str, list[dict]]:
    """여러 종목의 일봉 차트를 asyncio.gather로 병렬 수집."""
    import asyncio

    async def safe_chart(code: str) -> tuple[str, list[dict]]:
        try:
            data = await get_daily_chart(code, period)
            return code, data
        except Exception as e:
            logger.warning(f"Chart fetch failed for {code}: {e}")
            return code, []

    results = await asyncio.gather(*[safe_chart(code) for code in stock_codes])
    return dict(results)


def parse_ohlcv_from_chart(chart_data: list[dict]) -> dict[str, list[float]]:
    """KIS 일봉 차트 응답을 OHLCV dict로 변환."""
    closes, highs, lows, volumes = [], [], [], []
    for day in reversed(chart_data):  # 오래된 날짜 → 최신 순서
        try:
            closes.append(float(day.get("stck_clpr") or day.get("close", 0)))
            highs.append(float(day.get("stck_hgpr") or day.get("high", 0)))
            lows.append(float(day.get("stck_lwpr") or day.get("low", 0)))
            volumes.append(float(day.get("acml_vol") or day.get("volume", 0)))
        except (ValueError, TypeError):
            continue
    return {"closes": closes, "highs": highs, "lows": lows, "volumes": volumes}
```

**Step 3: DB 마이그레이션 적용 확인**

백엔드 재시작 또는 init_database() 재실행:
```bash
cd backend && uv run python -c "import asyncio; from app.models.db import init_database; asyncio.run(init_database())"
```
예상 출력: 에러 없음

**Step 4: 커밋**
```bash
git add backend/app/models/database.py backend/app/services/market_service.py
git commit -m "feat: add KOSPI200 component caching and batch chart fetch"
```

---

### Task 3: 전문가 패널 모듈 생성

**파일:**
- 생성: `backend/app/agents/market_scanner_experts.py`

**Step 1: 전문가 모듈 구현**

```python
# backend/app/agents/market_scanner_experts.py
"""Expert analyst panel — 4 specialists + Chief Analyst debate simulation."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import anthropic

from app.config import settings
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)


def _get_claude_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


def _get_model() -> tuple[str, int]:
    model = runtime_settings.get("claude_model") or settings.claude_model
    max_tokens = int(runtime_settings.get("claude_max_tokens") or 1024)
    return model, min(max_tokens, 1024)


def _parse_json_response(text: str) -> dict | None:
    """응답에서 JSON 객체 추출."""
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


async def _call_expert(
    persona: str, focus: str, data_package: dict
) -> dict[str, Any]:
    """단일 전문가 Claude 호출."""
    client = _get_claude_client()
    model, max_tokens = _get_model()

    prompt = f"""당신은 {persona}입니다.
아래 주식 데이터를 {focus} 관점에서 분석하세요.

## 분석 데이터
{json.dumps(data_package, ensure_ascii=False, indent=2)}

## 응답 형식 (JSON만 출력)
```json
{{
  "view": "bullish|bearish|neutral",
  "key_signals": ["신호1", "신호2", "신호3"],
  "confidence": 0.0~1.0,
  "concern": "주요 우려사항 또는 null"
}}
```
"""

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in response.content if hasattr(b, "text"))
        result = _parse_json_response(text)
        if result:
            result["persona"] = persona
            return result
    except Exception as e:
        logger.error(f"Expert call failed ({persona}): {e}")

    return {"persona": persona, "view": "neutral", "key_signals": [], "confidence": 0.0, "concern": str(e) if 'e' in dir() else "API error"}


async def run_expert_panel(
    data_package: dict,
) -> list[dict[str, Any]]:
    """4명의 전문가를 asyncio.gather로 병렬 호출."""

    experts = [
        (
            "기술적 분석가 (Technical Analyst)",
            "MA 정배열/역배열, RSI 구간, MACD 크로스, 볼린저 밴드 돌파 등 차트 지표",
        ),
        (
            "모멘텀 트레이더 (Momentum Trader)",
            "거래량 급등 배율, Stochastic K/D 방향, 단기 가격 모멘텀과 돌파 패턴",
        ),
        (
            "리스크 평가자 (Risk Assessor)",
            "ATR 기반 위험도, RSI 과매수 여부, 현재 포트폴리오 집중도 리스크",
        ),
        (
            "포트폴리오 전략가 (Portfolio Strategist)",
            "현재 포지션 맥락, 현금 비중 대비 기회비용, 섹터 집중도와 분산 전략",
        ),
    ]

    tasks = [_call_expert(persona, focus, data_package) for persona, focus in experts]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    analyses = []
    for r in results:
        if isinstance(r, Exception):
            logger.error(f"Expert panel exception: {r}")
        else:
            analyses.append(r)

    return analyses


async def run_chief_debate(
    stock_info: dict,
    expert_analyses: list[dict],
    portfolio_context: dict,
) -> dict[str, Any] | None:
    """Chief Analyst가 4명 의견을 토론 시뮬레이션 후 최종 신호 결정."""
    client = _get_claude_client()
    model, _ = _get_model()

    analyses_text = "\n".join(
        f"- {a.get('persona', '?')}: {a.get('view','?')} "
        f"(신뢰도: {a.get('confidence', 0):.0%}) "
        f"| 핵심: {', '.join(a.get('key_signals', [])[:2])} "
        f"| 우려: {a.get('concern', '없음')}"
        for a in expert_analyses
    )

    views = [a.get("view", "neutral") for a in expert_analyses]
    bullish_count = views.count("bullish")
    bearish_count = views.count("bearish")

    if bullish_count >= 3:
        consensus_hint = "bullish 우세"
    elif bearish_count >= 3:
        consensus_hint = "bearish 우세"
    else:
        consensus_hint = "의견 분산"

    prompt = f"""당신은 Chief Market Analyst입니다.
4명의 전문가 의견({consensus_hint})을 검토하고 토론 시뮬레이션을 통해 최종 매매 결정을 내리세요.

## 종목 정보
{json.dumps(stock_info, ensure_ascii=False, indent=2)}

## 전문가 의견
{analyses_text}

## 포트폴리오 현황
{json.dumps(portfolio_context, ensure_ascii=False, indent=2)}

## 토론 진행
Round 1: 가장 큰 이견에 대해 각 전문가 입장 간략히 정리
Round 2: 조건부 동의 또는 거부 이유

## 최종 결정 (JSON만 출력, confidence 0.7 미만이면 hold)
```json
{{
  "stock_code": "{stock_info.get('code', '')}",
  "stock_name": "{stock_info.get('name', '')}",
  "decision": "buy|sell|hold",
  "confidence": 0.0~1.0,
  "consensus_type": "unanimous|majority|conditional|divided",
  "dissenting_view": "반대 의견 요약 또는 null",
  "reason": "50자 이내 최종 판단 근거",
  "suggested_position_size": "small|medium|large"
}}
```
"""

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=1536,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in response.content if hasattr(b, "text"))
        return _parse_json_response(text)
    except Exception as e:
        logger.error(f"Chief debate failed: {e}")
        return None
```

**Step 2: 커밋**
```bash
git add backend/app/agents/market_scanner_experts.py
git commit -m "feat: add expert analyst panel with Chief Analyst debate simulation"
```

---

### Task 4: MarketScanner 오케스트레이션 교체

**파일:**
- 수정: `backend/app/agents/market_scanner.py` — 전체 execute() 재작성

**Step 1: market_scanner.py 전체 교체**

```python
# backend/app/agents/market_scanner.py
"""Market Scanner Agent — KOSPI200 screening + expert team analysis."""
import asyncio
import logging
from typing import Any

from app.agents.base import AgentContext, AgentResult, AgentRole, BaseAgent
from app.agents.market_scanner_experts import run_expert_panel, run_chief_debate
from app.agents.market_scanner_indicators import compute_all_indicators
from app.agents.state import shared_state
from app.models.db import execute_insert, execute_query
from app.services.market_service import (
    get_volume_rank,
    get_fluctuation_rank,
    get_kospi200_components,
    get_batch_charts,
    parse_ohlcv_from_chart,
)

logger = logging.getLogger(__name__)

# 후보군 최대 종목 수 (Stage 2 차트 수집 대상)
MAX_CANDIDATES = 25


class MarketScannerAgent(BaseAgent):
    agent_id = "market_scanner"
    name = "마켓 스캐너"
    role = AgentRole.SCANNER
    allowed_tools = ["domestic_stock"]

    async def execute(self, context: AgentContext) -> AgentResult:
        """KOSPI200 스크리닝 → 기술적 지표 계산 → 전문가 팀 분석 → 신호 생성."""

        # Stage 1: KOSPI200 스크리닝
        candidates = await self._stage1_screening()
        if not candidates:
            return AgentResult(
                success=False,
                summary="후보 종목 추출 실패 (KOSPI200 데이터 없음)",
                error="no_candidates",
            )

        # Stage 2: 차트 수집 + 지표 계산
        enriched = await self._stage2_enrich(candidates)
        if not enriched:
            return AgentResult(
                success=False,
                summary="기술적 지표 계산 실패 (차트 데이터 없음)",
                error="no_chart_data",
            )

        # Stage 3 + 4: 전문가 팀 분석 및 신호 생성
        portfolio = await shared_state.get_portfolio()
        portfolio_context = {
            "cash_pct": (
                portfolio.cash_balance / portfolio.total_value * 100
                if portfolio.total_value > 0 else 100
            ),
            "position_count": len(portfolio.positions),
            "total_pnl": portfolio.total_pnl,
            "held_codes": [p.get("stock_code") for p in portfolio.positions],
        }

        saved_signals = []
        for stock_data in enriched[:10]:  # 상위 10개만 전문가 분석
            signal = await self._analyze_stock(stock_data, portfolio_context)
            if signal:
                saved_signals.append(signal)

        return AgentResult(
            success=True,
            summary=f"KOSPI200 {len(candidates)}개 스캔 → {len(enriched)}개 지표 계산 → {len(saved_signals)}개 신호 생성",
            data={"signals": saved_signals, "scanned": len(candidates)},
        )

    async def _stage1_screening(self) -> list[dict[str, Any]]:
        """거래량/등락률 TOP50을 KOSPI200과 교차 필터링."""
        try:
            kospi200_codes, volume_data, fluctuation_data = await asyncio.gather(
                get_kospi200_components(),
                get_volume_rank(count=50),
                get_fluctuation_rank(count=50),
            )
        except Exception as e:
            logger.error(f"Stage 1 data fetch failed: {e}")
            return []

        kospi200_set = set(kospi200_codes)

        # 종목별 스코어 집계 (거래량/등락률 순위 역수 합산)
        scores: dict[str, dict] = {}

        for rank, item in enumerate(volume_data):
            code = item.get("stck_shrn_iscd") or item.get("stock_code", "")
            if not code:
                continue
            if kospi200_set and code not in kospi200_set:
                continue  # KOSPI200 외 종목 제외 (리스트 있을 때만)
            if code not in scores:
                scores[code] = {
                    "stock_code": code,
                    "stock_name": item.get("hts_kor_isnm") or item.get("stock_name", ""),
                    "score": 0,
                }
            scores[code]["score"] += (50 - rank)

        for rank, item in enumerate(fluctuation_data):
            code = item.get("stck_shrn_iscd") or item.get("stock_code", "")
            if not code:
                continue
            if kospi200_set and code not in kospi200_set:
                continue
            if code not in scores:
                scores[code] = {
                    "stock_code": code,
                    "stock_name": item.get("hts_kor_isnm") or item.get("stock_name", ""),
                    "score": 0,
                }
            scores[code]["score"] += (50 - rank)

        return sorted(scores.values(), key=lambda x: x["score"], reverse=True)[:MAX_CANDIDATES]

    async def _stage2_enrich(self, candidates: list[dict]) -> list[dict]:
        """후보 종목 차트 데이터 수집 + 기술적 지표 계산."""
        codes = [c["stock_code"] for c in candidates]
        charts = await get_batch_charts(codes)

        enriched = []
        for candidate in candidates:
            code = candidate["stock_code"]
            chart_data = charts.get(code, [])
            if not chart_data:
                continue

            ohlcv = parse_ohlcv_from_chart(chart_data)
            if len(ohlcv.get("closes", [])) < 20:
                continue

            current_price = ohlcv["closes"][-1] if ohlcv["closes"] else 0
            indicators = compute_all_indicators(ohlcv, current_price)
            if not indicators:
                continue

            enriched.append({
                **candidate,
                "indicators": indicators,
                "ohlcv": ohlcv,
            })

        return enriched

    async def _analyze_stock(
        self, stock_data: dict, portfolio_context: dict
    ) -> dict | None:
        """단일 종목에 대해 전문가 팀 분석 + Chief 토론 → 신호 DB 저장."""
        stock_info = {
            "code": stock_data["stock_code"],
            "name": stock_data.get("stock_name", ""),
        }
        indicators = stock_data.get("indicators", {})

        data_package = {
            "stock": stock_info,
            "technicals": indicators,
            "portfolio_context": portfolio_context,
        }

        # Stage 3: 전문가 병렬 분석
        expert_analyses = await run_expert_panel(data_package)
        if not expert_analyses:
            return None

        # Stage 4: Chief 토론
        final = await run_chief_debate(stock_info, expert_analyses, portfolio_context)
        if not final:
            return None

        confidence = float(final.get("confidence", 0))
        decision = final.get("decision", "hold")

        if decision == "hold" or confidence < 0.7:
            return None  # hold 또는 낮은 신뢰도는 신호 없음

        # DB 저장
        signal_id = await execute_insert(
            """INSERT INTO signals
               (agent_id, stock_code, stock_name, direction, confidence, reason, status)
               VALUES (?, ?, ?, ?, ?, ?, 'pending')""",
            (
                self.agent_id,
                stock_info["code"],
                stock_info["name"],
                decision,
                confidence,
                final.get("reason", ""),
            ),
        )

        saved = {**final, "signal_id": signal_id}
        await self.emit_event("signal.generated", saved)
        return saved
```

**Step 2: 백엔드 import 오류 확인**
```bash
cd backend && uv run python -c "from app.agents.market_scanner import MarketScannerAgent; print('OK')"
```
예상 출력: `OK`

**Step 3: 커밋**
```bash
git add backend/app/agents/market_scanner.py
git commit -m "feat: replace MarketScanner with KOSPI200 + expert team + Chief debate orchestration"
```

---

### Task 5: 의존성 추가 및 통합 검증

**파일:**
- 수정: `backend/pyproject.toml` — 의존성 없음 (순수 Python 사용, 추가 불필요)

**Step 1: 백엔드 기동 및 로그 확인**
```bash
make backend
# 새 터미널에서:
curl -s http://localhost:8000/health
```
예상 출력: `{"status": "ok", ...}`

**Step 2: MarketScanner 수동 실행 테스트**
```bash
curl -s -X POST http://localhost:8000/api/agents/market_scanner/run | python3 -m json.tool
```
예상 출력:
```json
{
  "agent_id": "market_scanner",
  "success": true,
  "summary": "KOSPI200 N개 스캔 → M개 지표 계산 → K개 신호 생성"
}
```

**Step 3: 신호 확인**
```bash
curl -s "http://localhost:8000/api/signals?status=pending" | python3 -m json.tool
```

**Step 4: 에러 발생 시 로그 확인**
```bash
make logs
```
KOSPI200 API가 실패하면 fallback으로 volume_rank만 사용하는 경로도 동작 확인.

**Step 5: 최종 커밋**
```bash
git add -A
git commit -m "feat: complete expert agent team market scanner integration"
```

---

## 예상 소요 시간

| Task | 예상 시간 |
|------|---------|
| Task 1: 지표 계산 모듈 | ~30분 |
| Task 2: KOSPI200 캐싱 | ~20분 |
| Task 3: 전문가 패널 모듈 | ~20분 |
| Task 4: MarketScanner 교체 | ~20분 |
| Task 5: 통합 검증 | ~15분 |

---

## 주의사항

1. **KOSPI200 API 실패 처리:** `inquire_index_components` API가 동작하지 않으면 KOSPI200 필터를 건너뛰고 volume_rank + fluctuation_rank만 사용 (graceful degradation)
2. **차트 데이터 키 차이:** KIS API 응답의 필드명이 `stck_clpr`(종가), `stck_hgpr`(고가), `stck_lwpr`(저가), `acml_vol`(거래량)임을 주의
3. **Claude 비용:** 종목 10개 × (4 전문가 + 1 Chief) = 50회 Claude 호출 → 비용 모니터링 필요
4. **타임아웃:** 전문가 패널 병렬 호출이 30초를 초과하면 asyncio timeout 추가 고려
