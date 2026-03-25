# backend/app/agents/signal_critic.py
"""
SignalCriticAgent — validates SignalAnalysis before signal.generated is emitted.

Programmatic checks (no Claude call): scenario completeness, data confidence,
R/R arithmetic consistency.

Qualitative checks (one Claude call): expert dissent, variant view specificity.

Max 1 revision loop — caller handles the retry and final rejection.
"""
import json
import logging

from app.config import settings
from app.models.confidence import CRITICAL_FIELDS
from app.models.db import execute_insert, load_risk_config
from app.models.signal import SignalAnalysis, compute_rr_score

logger = logging.getLogger(__name__)

_DEFAULT_RR_TOLERANCE = 0.20   # 20% — detects hallucinated scenario values


class SignalCriticAgent:
    def __init__(self) -> None:
        # Uses module-level execute_insert/execute_query from db.py — no db param
        pass

    async def review(
        self,
        signal_analysis: SignalAnalysis,
        expert_outputs: list[dict],
        confidence_grades: dict[str, str],
    ) -> tuple[bool, str | None]:
        """
        Returns (passed, feedback_string | None).
        Programmatic checks run first (no Claude call).
        Qualitative checks run only if programmatic pass.
        """
        self._risk_config = await load_risk_config()
        passed, feedback = self._check_programmatic(signal_analysis, confidence_grades)
        if not passed:
            return False, feedback

        check_dissent = self._risk_config.get("critic_check_dissent", "true").lower() != "false"
        check_variant = self._risk_config.get("critic_check_variant", "true").lower() != "false"

        if not check_dissent and not check_variant:
            return True, None  # Both qualitative checks disabled

        return await self._check_qualitative(signal_analysis, expert_outputs, check_dissent, check_variant)

    # ------------------------------------------------------------------
    # Programmatic checks (items 1-3)
    # ------------------------------------------------------------------

    def _check_programmatic(
        self,
        analysis: SignalAnalysis,
        confidence_grades: dict[str, str],
    ) -> tuple[bool, str | None]:
        # Check 1: probability sum
        total = (
            analysis.bull.probability
            + analysis.base.probability
            + analysis.bear.probability
        )
        if abs(total - 1.0) > 0.01:
            return False, (
                f"시나리오 확률 합계가 1.0이 아닙니다 (probability sum: {total:.3f}). "
                f"강세+기본+약세 확률의 합이 1.0 ±0.01이어야 합니다."
            )

        # Check 2: data confidence
        failed_grades = [
            f for f in CRITICAL_FIELDS
            if confidence_grades.get(f, "D") == "D"
        ]
        if failed_grades:
            return False, (
                f"핵심 데이터 신뢰도가 D등급입니다: {', '.join(failed_grades)}. "
                f"이 데이터 없이는 신뢰할 수 있는 분석이 불가능합니다."
            )

        # Check 3: R/R arithmetic — compare declared vs server-computed
        computed = compute_rr_score(analysis.bull, analysis.base, analysis.bear)
        rr_tolerance = _DEFAULT_RR_TOLERANCE
        if computed != 0:
            discrepancy = abs(analysis.rr_score - computed) / abs(computed)
            if discrepancy > rr_tolerance:
                return False, (
                    f"rr 점수 불일치: Chief 선언값 {analysis.rr_score:.2f}, "
                    f"서버 계산값 {computed:.2f} (오차 {discrepancy*100:.0f}%). "
                    f"시나리오 확률 또는 상승률 수치가 내부적으로 일관성이 없습니다."
                )

        return True, None

    # ------------------------------------------------------------------
    # Qualitative checks (items 4-5) — one Claude call
    # ------------------------------------------------------------------

    async def _check_qualitative(
        self,
        analysis: SignalAnalysis,
        expert_outputs: list[dict],
        check_dissent: bool = True,
        check_variant: bool = True,
    ) -> tuple[bool, str | None]:
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

            stances = analysis.expert_stances
            stance_summary = ", ".join(f"{k}: {v}" for k, v in stances.items())
            majority_direction = max(
                ["bullish", "bearish", "neutral"],
                key=lambda d: list(stances.values()).count(d),
            )

            criteria_sections = []
            if check_dissent:
                criteria_sections.append(f"""**기준 4 — 전문가 이견 존재 여부:**
- 최소 1명의 전문가가 다수 의견과 다른 입장을 가져야 합니다
- 5명 전원이 동일한 입장({majority_direction})이면 실패 — variant_view가 만장일치 이유를 구체적 데이터와 함께 설명해야 통과
- 평가: PASS 또는 FAIL""")
            if check_variant:
                criteria_sections.append(f"""**기준 5 — Variant View 구체성:**
- "리스크 대비 기회", "시장 과소평가" 등 일반적 표현은 FAIL
- DART 수치, RSI 값, 특정 분기 실적 등 구체적 데이터 포인트가 있어야 PASS
- 현재 variant_view: "{analysis.variant_view}"
- 평가: PASS 또는 FAIL""")

            # Build JSON response template dynamically
            json_fields = []
            if check_dissent:
                json_fields.extend(['"check4_result": "PASS|FAIL"', '"check4_reason": "한 문장 이유"'])
            if check_variant:
                json_fields.extend(['"check5_result": "PASS|FAIL"', '"check5_reason": "한 문장 이유"'])

            prompt = f"""당신은 투자 리서치 품질 검토자입니다. 다음 신호 분석을 평가하세요.

## 종목 신호 분석
- 방향: {analysis.direction}
- 전문가 의견: {stance_summary}
- Variant View: {analysis.variant_view}

## 평가 기준

{chr(10).join(criteria_sections)}

## 응답 형식 (JSON만 출력):
{{
  {", ".join(json_fields)}
}}"""

            response = await client.messages.create(
                model=settings.claude_model,
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )

            text = response.content[0].text.strip()
            # Extract JSON
            if "```" in text:
                text = text.split("```")[1].lstrip("json").strip()
            result = json.loads(text)

            failures = []
            if check_dissent and result.get("check4_result") != "PASS":
                failures.append(f"[기준4] {result.get('check4_reason', '')}")
            if check_variant and result.get("check5_result") != "PASS":
                failures.append(f"[기준5] {result.get('check5_reason', '')}")

            if failures:
                return False, " | ".join(failures)
            return True, None

        except Exception as e:
            logger.error(f"SignalCriticAgent qualitative check failed: {e}")
            # On error, pass through — don't block signals due to critic errors
            return True, None


# Module-level singleton
signal_critic = SignalCriticAgent()
