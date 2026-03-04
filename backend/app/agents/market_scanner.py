"""Market Scanner Agent — KOSPI200 screening + expert team analysis."""
import asyncio
import logging
from typing import Any

from app.agents.base import AgentContext, AgentResult, AgentRole, BaseAgent
from app.agents.market_scanner_experts import run_chief_debate, run_expert_panel
from app.agents.market_scanner_indicators import compute_all_indicators
from app.agents.state import shared_state
from app.models.db import execute_insert
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
