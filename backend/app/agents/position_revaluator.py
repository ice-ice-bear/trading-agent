"""Position Revaluator Agent — periodically re-evaluates held positions."""

import json
import logging

from app.agents.base import AgentContext, AgentResult, AgentRole, BaseAgent
from app.agents.market_scanner_indicators import compute_all_indicators
from app.agents.state import shared_state
from app.models.db import execute_insert, execute_query, load_risk_config
from app.services.market_service import get_batch_charts, parse_ohlcv_from_chart

logger = logging.getLogger(__name__)


class PositionRevaluatorAgent(BaseAgent):
    agent_id = "position_revaluator"
    name = "포지션 재평가"
    role = AgentRole.MONITOR
    allowed_tools = ["domestic_stock"]

    async def execute(self, context: AgentContext) -> AgentResult:
        """Re-evaluate all held positions: health check + trailing stop."""
        risk_config = await load_risk_config()
        if risk_config.get("position_reeval_enabled", "true").lower() == "false":
            return AgentResult(success=True, summary="재평가 비활성화 상태")

        portfolio = await shared_state.get_portfolio()
        if not portfolio or not portfolio.positions:
            return AgentResult(success=True, summary="보유 포지션 없음")

        results = []
        for pos in portfolio.positions:
            eval_result = await self._revaluate_position(pos, risk_config)
            if eval_result:
                results.append(eval_result)

        return AgentResult(
            success=True,
            summary=(
                f"포지션 {len(portfolio.positions)}개 재평가 완료, "
                f"변경 {len(results)}건"
            ),
            data={"evaluations": results},
        )

    async def _revaluate_position(
        self, pos: dict, risk_config: dict
    ) -> dict | None:
        """Re-evaluate a single position."""
        stock_code = pos.get("stock_code", "")
        stock_name = pos.get("stock_name", "")
        current_price = pos.get("current_price", 0)

        # 1. Fetch fresh chart data
        try:
            charts = await get_batch_charts([stock_code])
            chart_data = charts.get(stock_code, [])
            if not chart_data:
                return None

            ohlcv = parse_ohlcv_from_chart(chart_data)
            if len(ohlcv.get("closes", [])) < 20:
                return None

            indicators = compute_all_indicators(ohlcv, current_price)
            if not indicators:
                return None
        except Exception as e:
            logger.warning(f"재평가 차트 조회 실패 ({stock_code}): {e}")
            return None

        # 2. Assess position health
        new_status, reasons = self._assess_position_health(pos, indicators)

        # 3. Trailing stop: tighten ATR-based stop-loss if price moved up
        new_stop_loss = await self._maybe_tighten_stop_loss(
            stock_code, indicators, current_price, risk_config
        )

        # 4. Persist evaluation
        reason_text = "; ".join(reasons) if reasons else "정상"
        await execute_insert(
            """INSERT INTO position_evaluations
               (stock_code, new_status, reason, indicators_json, new_stop_loss_pct)
               VALUES (?, ?, ?, ?, ?)""",
            (
                stock_code,
                new_status,
                reason_text,
                json.dumps({
                    "rsi_14": indicators.get("rsi_14"),
                    "ma_alignment": indicators.get("ma_alignment"),
                    "macd_cross": (indicators.get("macd") or {}).get("cross"),
                    "volume_change_5d_pct": indicators.get("volume_change_5d_pct"),
                    "atr_14": indicators.get("atr_14"),
                }),
                new_stop_loss,
            ),
        )

        # 5. If sell recommended, emit event
        if new_status == "sell":
            logger.warning(
                f"REEVAL SELL: {stock_name}({stock_code}) — {reason_text}"
            )
            await self.emit_event("reeval.sell_recommended", {
                "stock_code": stock_code,
                "stock_name": stock_name,
                "reason": f"재평가 매도 권고: {reason_text}",
                "quantity": pos.get("quantity", 0),
            })

        if new_status != "hold":
            logger.info(
                f"REEVAL {new_status.upper()}: {stock_name}({stock_code}) — {reason_text}"
            )

        return {
            "stock_code": stock_code,
            "stock_name": stock_name,
            "new_status": new_status,
            "reason": reason_text,
            "new_stop_loss_pct": new_stop_loss,
        }

    def _assess_position_health(
        self, pos: dict, indicators: dict
    ) -> tuple[str, list[str]]:
        """Determine if position should be held, watched, or sold."""
        warnings: list[str] = []

        # RSI overbought
        rsi = indicators.get("rsi_14")
        if rsi and rsi > 75:
            warnings.append(f"RSI 과매수({rsi:.0f})")

        # MACD bearish cross
        macd = indicators.get("macd")
        if macd and macd.get("cross") == "bearish":
            warnings.append("MACD 데드크로스")

        # MA alignment turned bearish
        if indicators.get("ma_alignment") == "bearish":
            warnings.append("이동평균 역배열")

        # Volume collapse
        vol_change = indicators.get("volume_change_5d_pct")
        if vol_change is not None and vol_change < -50:
            warnings.append(f"거래량 급감({vol_change:.0f}%)")

        # Stochastic overbought
        stoch = indicators.get("stochastic") or {}
        stoch_k = stoch.get("k")
        if stoch_k and stoch_k > 85:
            warnings.append(f"Stochastic 과매수(K={stoch_k:.0f})")

        if len(warnings) >= 3:
            return "sell", warnings
        elif len(warnings) >= 2:
            return "caution", warnings
        return "hold", warnings

    async def _maybe_tighten_stop_loss(
        self,
        stock_code: str,
        indicators: dict,
        current_price: float,
        risk_config: dict,
    ) -> float | None:
        """Trailing stop: tighten stop-loss if ATR suggests tighter level."""
        row = await execute_query(
            "SELECT * FROM stock_stop_loss_overrides WHERE stock_code = ?",
            (stock_code,),
            fetch_one=True,
        )
        if not row or row.get("source") == "manual":
            return None  # Don't override manual settings

        atr = indicators.get("atr_14")
        if not atr or current_price <= 0:
            return None

        horizon = row.get("investment_horizon", "short")
        multiplier_key = f"atr_stop_loss_multiplier_{horizon}"
        multiplier = float(risk_config.get(multiplier_key, "2.0"))
        new_stop_pct = -round((atr * multiplier) / current_price * 100, 2)

        old_stop = float(row.get("stop_loss_pct", -3.0))

        # Only tighten (make less negative = closer to current price)
        if new_stop_pct > old_stop:
            await execute_query(
                """UPDATE stock_stop_loss_overrides
                   SET stop_loss_pct = ?, atr_value = ?, updated_at = datetime('now')
                   WHERE stock_code = ? AND source = 'auto'""",
                (new_stop_pct, atr, stock_code),
            )
            logger.info(
                f"Trailing stop tightened: {stock_code} {old_stop}% → {new_stop_pct}%"
            )
            return new_stop_pct

        return None
