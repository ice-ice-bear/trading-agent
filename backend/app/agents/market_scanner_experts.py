"""Expert analyst panel — 5 specialists + Chief Analyst debate simulation."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import anthropic

from app.config import settings
from app.models.signal import SignalAnalysis, Scenario, compute_rr_score
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
    dart_financials: dict | None = None,
) -> list[dict[str, Any]]:
    """5명의 전문가를 asyncio.gather로 병렬 호출."""

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

    async def fundamental_analyst():
        stock_info = data_package.get("stock", {})
        technicals = data_package.get("technicals", {})
        prompt = f"""당신은 기본적분석가입니다. DART 재무제표 데이터를 기반으로 분석합니다.

종목: {stock_info.get('name')} ({stock_info.get('code')})

DART 재무 데이터:
{json.dumps(dart_financials or {}, ensure_ascii=False, indent=2)}

기술적 지표 (참고):
{json.dumps(technicals, ensure_ascii=False, indent=2)}

다음 JSON 형식으로만 응답하세요:
{{
  "persona": "기본적분석가",
  "view": "bullish|bearish|neutral",
  "key_signals": ["신호1", "신호2"],
  "confidence": 0.0,
  "concern": "주요 우려사항"
}}

분석 포인트: 매출 성장 추세, 영업이익률, PER/PBR 밸류에이션, 부채비율, 배당 지속성"""

        client = _get_claude_client()
        model, _ = _get_model()
        response = await client.messages.create(
            model=model,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in response.content if hasattr(b, "text"))
        result = _parse_json_response(text)
        if result:
            result["persona"] = "기본적분석가"
        return result or {
            "persona": "기본적분석가",
            "view": "neutral",
            "key_signals": [],
            "confidence": 0.0,
            "concern": "DART data unavailable",
        }

    tasks = [_call_expert(persona, focus, data_package) for persona, focus in experts]
    tasks.append(fundamental_analyst())
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
    dart_financials: dict | None = None,
    critic_feedback: str | None = None,
) -> "SignalAnalysis | None":
    """Chief Analyst가 5명 의견을 토론 시뮬레이션 후 최종 신호 결정."""
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

    if bullish_count >= 4:
        consensus_hint = "bullish 강한 우세 (5명 중 4명 이상)"
    elif bullish_count >= 3:
        consensus_hint = "bullish 과반수 (5명 중 3명)"
    elif bearish_count >= 4:
        consensus_hint = "bearish 강한 우세 (5명 중 4명 이상)"
    elif bearish_count >= 3:
        consensus_hint = "bearish 과반수 (5명 중 3명)"
    else:
        consensus_hint = "의견 분산"

    critic_prefix = f"CRITIC FEEDBACK: {critic_feedback}\n이 피드백을 반영하여 분석을 수정하세요.\n\n" if critic_feedback else ""

    dart_section = ""
    if dart_financials:
        dart_section = f"\n## DART 재무 데이터\n{json.dumps(dart_financials, ensure_ascii=False, indent=2)}\n"

    prompt = f"""{critic_prefix}당신은 Chief Market Analyst입니다.
5명의 전문가 의견({consensus_hint})을 검토하고 토론 시뮬레이션을 통해 최종 매매 결정을 내리세요.

## 종목 정보
{json.dumps(stock_info, ensure_ascii=False, indent=2)}

## 전문가 의견
{analyses_text}

## 포트폴리오 현황
{json.dumps(portfolio_context, ensure_ascii=False, indent=2)}
{dart_section}
## 토론 진행
Round 1: 가장 큰 이견에 대해 각 전문가 입장 간략히 정리
Round 2: 조건부 동의 또는 거부 이유

## 최종 결정 (JSON만 출력)
```json
{{
  "direction": "buy|sell|hold",
  "bull": {{"label": "강세", "price_target": 95000, "upside_pct": 18.5, "probability": 0.35}},
  "base": {{"label": "기본", "price_target": 84000, "upside_pct": 5.0, "probability": 0.45}},
  "bear": {{"label": "약세", "price_target": 72000, "upside_pct": -10.0, "probability": 0.20}},
  "rr_score": 4.36,
  "variant_view": "시장이 구체적으로 오해하는 점 — 데이터 근거 포함",
  "expert_stances": {{
    "기술적 분석가 (Technical Analyst)": "bullish",
    "모멘텀 트레이더 (Momentum Trader)": "neutral",
    "리스크 평가자 (Risk Assessor)": "bearish",
    "포트폴리오 전략가 (Portfolio Strategist)": "bullish",
    "기본적분석가": "bullish"
  }}
}}
```
확률 합계(bull+base+bear)는 반드시 1.0이 되어야 합니다."""

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=1536,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in response.content if hasattr(b, "text"))
        raw = _parse_json_response(text)
        if not raw:
            return None

        bull = Scenario(**raw["bull"])
        base = Scenario(**raw["base"])
        bear = Scenario(**raw["bear"])

        # Server recomputes rr_score (LLM value discarded)
        rr = compute_rr_score(bull, base, bear)

        return SignalAnalysis(
            direction=raw["direction"].upper(),
            bull=bull,
            base=base,
            bear=bear,
            rr_score=rr,
            variant_view=raw.get("variant_view", ""),
            expert_stances=raw.get("expert_stances", {}),
            critic_result="pending",
        )
    except Exception as e:
        logger.error(f"Chief debate failed: {e}")
        return None
