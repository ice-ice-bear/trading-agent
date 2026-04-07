"""Trading Executor Agent — executes approved trading signals via MCP order tools."""

import logging

from app.agents.base import AgentContext, AgentResult, AgentRole, BaseAgent
from app.agents.event_bus import AgentEvent
from app.models.db import load_risk_config
from app.services.order_service import check_buyable, check_sellable, place_order

logger = logging.getLogger(__name__)


class TradingExecutorAgent(BaseAgent):
    agent_id = "trading_executor"
    name = "매매 실행기"
    role = AgentRole.EXECUTOR
    allowed_tools = ["domestic_stock"]

    # Events this agent subscribes to
    subscribed_events = ["signal.approved", "risk.stop_loss", "risk.take_profit", "reeval.sell_recommended"]

    async def execute(self, context: AgentContext) -> AgentResult:
        """Manual execution — not typically used directly."""
        return AgentResult(
            success=True,
            summary="매매 실행기는 이벤트 기반으로 동작합니다. signal.approved, risk.stop_loss, risk.take_profit 이벤트에 반응합니다.",
        )

    async def handle_event(self, event: AgentEvent) -> None:
        """React to approved signals and risk events."""
        if event.event_type == "signal.approved":
            await self._execute_signal(event)
        elif event.event_type == "risk.stop_loss":
            await self._execute_stop_loss(event)
        elif event.event_type == "risk.take_profit":
            await self._execute_take_profit(event)
        elif event.event_type == "reeval.sell_recommended":
            await self._execute_reeval_sell(event)

    async def _execute_signal(self, event: AgentEvent) -> None:
        """Execute an approved trading signal."""
        stock_code = event.data.get("stock_code", "")
        stock_name = event.data.get("stock_name", "")
        direction = event.data.get("direction", "")
        signal_id = event.data.get("signal_id")
        reason = event.data.get("reason", "")

        if not stock_code or not direction:
            logger.warning(f"Invalid signal data: {event.data}")
            return

        if direction == "buy":
            await self._execute_buy(stock_code, stock_name, signal_id, reason)
        elif direction == "sell":
            await self._execute_sell(stock_code, stock_name, signal_id, reason)

    async def _execute_buy(
        self,
        stock_code: str,
        stock_name: str,
        signal_id: int | None = None,
        reason: str = "",
    ) -> None:
        """Execute a buy order."""
        try:
            # Check how many shares we can buy
            # KIS 응답: flat dict (list[dict] 첫 행) — output 중첩 없음
            buyable = await check_buyable(stock_code)
            max_qty = int(
                buyable.get("nrcvb_buy_qty") or  # 미수없는매수수량
                buyable.get("max_buy_qty") or     # 최대매수수량 (폴백)
                buyable.get("output", {}).get("nrcvb_buy_qty") or
                buyable.get("output", {}).get("max_buy_qty") or
                0
            )
            logger.info(
                f"check_buyable({stock_code}): nrcvb={buyable.get('nrcvb_buy_qty')}, "
                f"max={buyable.get('max_buy_qty')}, cash={buyable.get('ord_psbl_cash')}, "
                f"keys={list(buyable.keys())[:15]}"
            )

            if max_qty <= 0:
                logger.warning(f"Cannot buy {stock_code}: no buying power (max_qty=0)")
                await self.emit_event("order.failed", {
                    "stock_code": stock_code,
                    "stock_name": stock_name,
                    "side": "buy",
                    "reason": "매수 가능 수량 없음",
                })
                return

            # Buy up to configured max or max available
            risk_config = await load_risk_config()
            configured_max = int(risk_config.get("max_buy_qty", 10))
            quantity = min(max_qty, configured_max)

            result = await place_order(
                stock_code=stock_code,
                side="buy",
                quantity=quantity,
                order_type="market",
                agent_id=self.agent_id,
                stock_name=stock_name,
                signal_id=signal_id,
                reason=reason,
            )

            event_type = "order.filled" if result["success"] else "order.failed"
            await self.emit_event(event_type, {
                "stock_code": stock_code,
                "stock_name": stock_name,
                "side": "buy",
                "quantity": quantity,
                "order_id": result.get("order_id"),
                "status": result.get("status"),
                "error": result.get("error"),
            })

        except Exception as e:
            logger.error(f"Buy execution failed for {stock_code}: {e}")
            await self.emit_event("order.failed", {
                "stock_code": stock_code,
                "stock_name": stock_name,
                "side": "buy",
                "reason": str(e),
            })

    async def _execute_sell(
        self,
        stock_code: str,
        stock_name: str,
        signal_id: int | None = None,
        reason: str = "",
        quantity: int | None = None,
    ) -> None:
        """Execute a sell order."""
        try:
            if quantity is None:
                # Check how many shares we can sell
                sellable = await check_sellable(stock_code)
                max_qty = int(sellable.get("output", {}).get("psbl_qty", 0)
                             or sellable.get("psbl_qty", 0) or 0)
                quantity = max_qty

            if not quantity or quantity <= 0:
                logger.warning(f"Cannot sell {stock_code}: no sellable quantity")
                await self.emit_event("order.failed", {
                    "stock_code": stock_code,
                    "stock_name": stock_name,
                    "side": "sell",
                    "reason": "매도 가능 수량 없음",
                })
                return

            result = await place_order(
                stock_code=stock_code,
                side="sell",
                quantity=quantity,
                order_type="market",
                agent_id=self.agent_id,
                stock_name=stock_name,
                signal_id=signal_id,
                reason=reason,
            )

            event_type = "order.filled" if result["success"] else "order.failed"
            await self.emit_event(event_type, {
                "stock_code": stock_code,
                "stock_name": stock_name,
                "side": "sell",
                "quantity": quantity,
                "order_id": result.get("order_id"),
                "status": result.get("status"),
                "error": result.get("error"),
            })

        except Exception as e:
            logger.error(f"Sell execution failed for {stock_code}: {e}")
            await self.emit_event("order.failed", {
                "stock_code": stock_code,
                "stock_name": stock_name,
                "side": "sell",
                "reason": str(e),
            })

    async def _execute_stop_loss(self, event: AgentEvent) -> None:
        """Execute emergency stop-loss sell — always auto regardless of approval mode."""
        stock_code = event.data.get("stock_code", "")
        stock_name = event.data.get("stock_name", "")
        quantity = event.data.get("quantity", 0)
        pnl_pct = event.data.get("pnl_pct", 0)

        logger.warning(
            f"STOP-LOSS TRIGGERED: Selling {quantity}x {stock_name}({stock_code}) "
            f"at {pnl_pct:.2f}% loss"
        )

        await self._execute_sell(
            stock_code=stock_code,
            stock_name=stock_name,
            quantity=quantity,
            reason=f"손절매: {pnl_pct:.2f}% 손실",
        )

    async def _execute_take_profit(self, event: AgentEvent) -> None:
        """Execute take-profit sell."""
        stock_code = event.data.get("stock_code", "")
        stock_name = event.data.get("stock_name", "")
        quantity = event.data.get("quantity", 0)
        pnl_pct = event.data.get("pnl_pct", 0)

        logger.info(
            f"TAKE-PROFIT TRIGGERED: Selling {quantity}x {stock_name}({stock_code}) "
            f"at {pnl_pct:.2f}% profit"
        )

        await self._execute_sell(
            stock_code=stock_code,
            stock_name=stock_name,
            quantity=quantity,
            reason=f"익절매: {pnl_pct:.2f}% 수익",
        )

    async def _execute_reeval_sell(self, event: AgentEvent) -> None:
        """Execute sell from position re-evaluation recommendation."""
        stock_code = event.data.get("stock_code", "")
        stock_name = event.data.get("stock_name", "")
        quantity = event.data.get("quantity", 0)
        reason = event.data.get("reason", "재평가 매도")

        logger.warning(
            f"REEVAL SELL: Selling {quantity}x {stock_name}({stock_code}) — {reason}"
        )

        await self._execute_sell(
            stock_code=stock_code,
            stock_name=stock_name,
            quantity=quantity,
            reason=reason,
        )
