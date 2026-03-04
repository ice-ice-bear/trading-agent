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

    error_msg = "API error"
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
        error_msg = str(e)

    return {
        "persona": persona,
        "view": "neutral",
        "key_signals": [],
        "confidence": 0.0,
        "concern": error_msg,
    }


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
