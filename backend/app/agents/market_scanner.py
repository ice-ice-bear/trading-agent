"""Market Scanner Agent — KOSPI200 screening + expert team analysis."""
import asyncio
import logging
from typing import Any

from app.agents.base import AgentContext, AgentResult, AgentRole, BaseAgent
from app.agents.market_scanner_experts import run_chief_debate, run_expert_panel
from app.agents.market_scanner_indicators import compute_all_indicators
from app.agents.state import shared_state
import json
from app.agents.signal_critic import signal_critic
from app.models.confidence import check_hard_gate
from app.models.signal import compute_rr_score
from app.models.db import execute_insert
from app.services.dart_client import dart_client
from app.services.market_service import (
    get_batch_charts,
    get_fluctuation_rank,
    get_kospi200_components,
    get_volume_rank,
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
                summary="후보 종목 추출 실패 (거래량/등락률 순위 데이터 없음)",
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
        """거래량/등락률 TOP50을 KOSPI200과 교차 필터링.

        Note: fastmcp SSE 클라이언트가 단일 세션에서 동시 호출을 지원하지 않아
        asyncio.gather 대신 순차 호출을 사용한다.
        """
        try:
            kospi200_codes = await get_kospi200_components()
            volume_data = await get_volume_rank(count=50)
            fluctuation_data = await get_fluctuation_rank(count=50)
        except Exception as e:
            logger.error(f"Stage 1 data fetch failed: {e}")
            return []

        kospi200_set = set(kospi200_codes)
        logger.info(
            f"Stage 1: KOSPI200={len(kospi200_set)}개, "
            f"volume_rank={len(volume_data)}개, fluctuation={len(fluctuation_data)}개"
        )

        def _extract_code(item: dict) -> str:
            # volume_rank → mksc_shrn_iscd, fluctuation → stck_shrn_iscd
            return (
                item.get("mksc_shrn_iscd")
                or item.get("stck_shrn_iscd")
                or item.get("stock_code", "")
            )

        # 종목별 스코어 집계 (거래량/등락률 순위 역수 합산)
        scores: dict[str, dict] = {}

        for rank, item in enumerate(volume_data):
            code = _extract_code(item)
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
            code = _extract_code(item)
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

        logger.info(f"Stage 1: 후보군 {len(scores)}개 종목 추출")
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
                "current_price": current_price,
                "indicators": indicators,
                "ohlcv": ohlcv,
            })

        return enriched

    async def _analyze_stock(
        self, stock_data: dict, portfolio_context: dict
    ) -> dict | None:
        """단일 종목에 대해 전문가 팀 분석 + Chief 토론 → 신호 DB 저장."""
        stock_code = stock_data["stock_code"]
        stock_name = stock_data.get("stock_name", "")
        stock_info = {"code": stock_code, "name": stock_name}
        indicators = stock_data.get("indicators", {})
        current_price = stock_data.get("current_price", 0)

        metadata = {}

        data_package = {
            "stock": stock_info,
            "technicals": indicators,
            "portfolio_context": portfolio_context,
        }

        # --- Stage 2.5: Confidence grading ---
        confidence_grades: dict[str, str] = {
            "current_price": "A" if current_price else "D",
            "volume": "A" if stock_data.get("ohlcv", {}).get("volumes", [0])[-1] > 0 else "D",
        }

        # --- Stage 2.6: Fetch DART fundamentals ---
        dart_result = await dart_client.fetch(stock_code, current_price=current_price)
        dart_financials = dart_result.get("financials")
        confidence_grades.update(dart_result.get("confidence_grades", {}))

        # --- Stage 2.65: Fetch foreign/institutional trend ---
        from app.services.market_service import get_investor_trend
        investor_trend = await get_investor_trend(stock_code)
        data_package["investor_trend"] = investor_trend
        metadata["investor_trend"] = investor_trend

        # --- Stage 2.66: Fetch insider trades ---
        insider_trades = await dart_client.fetch_insider_trades(stock_code)
        data_package["insider_trades"] = insider_trades
        metadata["insider_trades"] = insider_trades[:3]

        # --- Stage 2.7: Hard gate check ---
        gate_passed, failed_fields = check_hard_gate(confidence_grades)
        if not gate_passed:
            await self._reject_signal_confidence(stock_info, confidence_grades, failed_fields)
            return None

        # Update data_package with dart_financials for the 5th expert
        data_package["dart_financials"] = dart_financials

        # Stage 3: 전문가 병렬 분석
        expert_analyses = await run_expert_panel(data_package, dart_financials=dart_financials)
        if not expert_analyses:
            return None

        metadata["news_summary"] = data_package.get("news_summary", {})

        # --- Stage 4: Chief Analyst debate ---
        signal_analysis = await run_chief_debate(
            stock_info, expert_analyses, portfolio_context,
            dart_financials=dart_financials,
            critic_feedback=None,
        )
        if not signal_analysis:
            logger.warning(f"Chief debate returned None for {stock_code}")
            return None

        if signal_analysis.direction == "HOLD":
            return None  # hold 신호는 저장하지 않음

        # Server overrides rr_score (LLM value is discarded)
        signal_analysis.rr_score = compute_rr_score(
            signal_analysis.bull, signal_analysis.base, signal_analysis.bear
        )

        # --- Stage 5: Critic review ---
        critic_passed, critic_feedback = await signal_critic.review(
            signal_analysis, expert_analyses, confidence_grades
        )

        if not critic_passed:
            # One revision attempt — re-run Chief with critique injected
            logger.info(f"Critic failed for {stock_code}, requesting revision...")
            signal_analysis = await run_chief_debate(
                stock_info, expert_analyses, portfolio_context,
                dart_financials=dart_financials,
                critic_feedback=critic_feedback,
            )
            if signal_analysis:
                signal_analysis.rr_score = compute_rr_score(
                    signal_analysis.bull, signal_analysis.base, signal_analysis.bear
                )
                critic_passed, critic_feedback = await signal_critic.review(
                    signal_analysis, expert_analyses, confidence_grades
                )

        if not critic_passed or not signal_analysis:
            # Final rejection
            await execute_insert(
                """INSERT INTO signals
                   (agent_id, stock_code, stock_name, direction, confidence,
                    reason, status, metadata_json, critic_result)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    self.agent_id,
                    stock_code,
                    stock_name,
                    "hold",
                    0.0,
                    "critic_failed",
                    "rejected",
                    json.dumps({"reason": "critic_failed", "feedback": critic_feedback}),
                    "fail",
                ),
            )
            return None

        signal_analysis.critic_result = "pass"

        # --- Stage 6: Persist signal and emit ---
        signal_id = await execute_insert(
            """INSERT INTO signals
               (agent_id, stock_code, stock_name, direction, confidence, reason, status,
                scenarios_json, variant_view, rr_score, current_price, expert_stances_json,
                dart_fundamentals_json, metadata_json, critic_result, confidence_grades_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                self.agent_id,
                stock_code,
                stock_name,
                signal_analysis.direction.lower(),
                round(1 / (1 + (2.718 ** (-signal_analysis.rr_score / 2))), 4),
                signal_analysis.variant_view[:200],
                "pending",
                json.dumps({
                    "bull": signal_analysis.bull.model_dump(),
                    "base": signal_analysis.base.model_dump(),
                    "bear": signal_analysis.bear.model_dump(),
                }),
                signal_analysis.variant_view,
                signal_analysis.rr_score,
                current_price,
                json.dumps(signal_analysis.expert_stances),
                json.dumps(dart_financials) if dart_financials else None,
                json.dumps(metadata, ensure_ascii=False),
                "pass",
                json.dumps(confidence_grades),
            ),
        )

        await self.emit_event("signal.generated", {
            "signal_id": signal_id,
            "stock_code": stock_code,
            "stock_name": stock_name,
            "direction": signal_analysis.direction.lower(),
            "confidence": round(1 / (1 + (2.718 ** (-signal_analysis.rr_score / 2))), 4),
            "rr_score": signal_analysis.rr_score,
            "critic_result": "pass",
        })
        return {"signal_id": signal_id, "stock_code": stock_code, "direction": signal_analysis.direction}

    async def _reject_signal_confidence(
        self,
        stock_info: dict,
        confidence_grades: dict,
        failed_fields: list[str],
    ) -> None:
        """Write a failed signal row and emit signal.failed."""
        metadata = json.dumps({"reason": "confidence_gate", "failed_fields": failed_fields})
        await execute_insert(
            """INSERT INTO signals
               (agent_id, stock_code, stock_name, direction, confidence, status, metadata_json)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                self.agent_id,
                stock_info.get("code", ""),
                stock_info.get("name", ""),
                "hold",
                0.0,
                "failed",
                metadata,
            ),
        )
        await self.emit_event("signal.failed", {
            "stock_code": stock_info.get("code"),
            "reason": "confidence_gate",
            "failed_fields": failed_fields,
        })
