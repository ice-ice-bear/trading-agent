"""Risk Manager Agent — validates signals, enforces thresholds, triggers stop-loss/take-profit."""

import logging

from app.agents.base import AgentContext, AgentResult, AgentRole, BaseAgent
from app.agents.event_bus import AgentEvent
from app.agents.state import shared_state
from app.models.db import execute_query

logger = logging.getLogger(__name__)


class RiskManagerAgent(BaseAgent):
    agent_id = "risk_manager"
    name = "리스크 관리자"
    role = AgentRole.RISK
    allowed_tools = ["domestic_stock"]

    # Events this agent subscribes to
    subscribed_events = ["portfolio.updated", "signal.generated", "order.filled", "order.failed"]

    def __init__(self) -> None:
        super().__init__()
        # Track recently emitted risk events to prevent duplicates
        # key: (stock_code, event_type), cleared when order fills or position changes
        self._emitted_risk_events: set[tuple[str, str]] = set()

    async def execute(self, context: AgentContext) -> AgentResult:
        """Run risk checks on current portfolio (manual trigger)."""
        portfolio = await shared_state.get_portfolio()
        if not portfolio.positions:
            return AgentResult(success=True, summary="포지션 없음, 리스크 체크 스킵")

        risk_config = await self._load_risk_config()
        alerts = await self._check_position_thresholds(portfolio.positions, risk_config)

        return AgentResult(
            success=True,
            summary=f"리스크 체크 완료. 알림: {len(alerts)}건",
            data={"alerts": alerts, "risk_config": risk_config},
        )

    async def handle_event(self, event: AgentEvent) -> None:
        """React to portfolio updates, trading signals, and order results."""
        if event.event_type == "portfolio.updated":
            await self._on_portfolio_updated(event)
        elif event.event_type == "signal.generated":
            await self._on_signal_generated(event)
        elif event.event_type in ("order.filled", "order.failed"):
            self._on_order_completed(event)

    def _on_order_completed(self, event: AgentEvent) -> None:
        """Clear duplicate prevention cache when an order completes (filled or failed)."""
        stock_code = event.data.get("stock_code", "")
        if stock_code:
            self._emitted_risk_events.discard((stock_code, "stop_loss"))
            self._emitted_risk_events.discard((stock_code, "take_profit"))
            logger.debug(f"Cleared risk event cache for {stock_code}")

    async def _on_portfolio_updated(self, event: AgentEvent) -> None:
        """Check each position against stop-loss / take-profit thresholds."""
        positions = event.data.get("positions", [])
        if not positions:
            return

        risk_config = await self._load_risk_config()
        await self._check_position_thresholds(positions, risk_config)

    async def _check_position_thresholds(
        self, positions: list[dict], risk_config: dict
    ) -> list[dict]:
        """Check positions against risk thresholds and emit events."""
        stop_loss_pct = float(risk_config.get("stop_loss_pct", -3.0))
        take_profit_pct = float(risk_config.get("take_profit_pct", 5.0))
        alerts = []

        for pos in positions:
            pnl_pct = pos.get("unrealized_pnl_pct", 0)
            stock_code = pos.get("stock_code", "")
            stock_name = pos.get("stock_name", "")

            if pnl_pct <= stop_loss_pct:
                event_key = (stock_code, "stop_loss")
                if event_key in self._emitted_risk_events:
                    logger.debug(
                        f"STOP-LOSS already emitted for {stock_name}({stock_code}), skipping"
                    )
                    continue
                alert = {
                    "type": "stop_loss",
                    "stock_code": stock_code,
                    "stock_name": stock_name,
                    "pnl_pct": pnl_pct,
                    "threshold": stop_loss_pct,
                    "quantity": pos.get("quantity", 0),
                }
                alerts.append(alert)
                self._emitted_risk_events.add(event_key)
                logger.warning(
                    f"STOP-LOSS: {stock_name}({stock_code}) at {pnl_pct:.2f}% "
                    f"(threshold: {stop_loss_pct}%)"
                )
                await self.emit_event("risk.stop_loss", alert)

            elif pnl_pct >= take_profit_pct:
                event_key = (stock_code, "take_profit")
                if event_key in self._emitted_risk_events:
                    logger.debug(
                        f"TAKE-PROFIT already emitted for {stock_name}({stock_code}), skipping"
                    )
                    continue
                alert = {
                    "type": "take_profit",
                    "stock_code": stock_code,
                    "stock_name": stock_name,
                    "pnl_pct": pnl_pct,
                    "threshold": take_profit_pct,
                    "quantity": pos.get("quantity", 0),
                }
                alerts.append(alert)
                self._emitted_risk_events.add(event_key)
                logger.info(
                    f"TAKE-PROFIT: {stock_name}({stock_code}) at {pnl_pct:.2f}% "
                    f"(threshold: {take_profit_pct}%)"
                )
                await self.emit_event("risk.take_profit", alert)

        return alerts

    async def _on_signal_generated(self, event: AgentEvent) -> None:
        """Validate a trading signal against risk rules."""
        signals = event.data.get("signals", [])
        if not signals:
            signal = event.data
            if signal.get("stock_code"):
                signals = [signal]

        risk_config = await self._load_risk_config()
        approval_mode = risk_config.get("signal_approval_mode", "auto")
        portfolio = await shared_state.get_portfolio()

        for signal in signals:
            rejection_reason = await self._validate_signal(signal, risk_config, portfolio)

            if rejection_reason:
                logger.info(
                    f"Signal REJECTED: {signal.get('stock_code')} "
                    f"{signal.get('direction')} — {rejection_reason}"
                )
                await self.emit_event(
                    "signal.rejected",
                    {**signal, "reason": rejection_reason},
                )
                # Update signal status in DB if signal_id present
                signal_id = signal.get("signal_id")
                if signal_id:
                    await execute_query(
                        "UPDATE signals SET status='rejected', risk_notes=? WHERE id=?",
                        (rejection_reason, signal_id),
                    )
            else:
                logger.info(
                    f"Signal APPROVED: {signal.get('stock_code')} "
                    f"{signal.get('direction')} (mode: {approval_mode})"
                )
                approved_data = {**signal, "approval_mode": approval_mode}

                if approval_mode == "auto":
                    await self.emit_event("signal.approved", approved_data)
                else:
                    # Manual mode: mark as pending user approval
                    await self.emit_event("signal.pending_approval", approved_data)

                signal_id = signal.get("signal_id")
                if signal_id:
                    status = "approved" if approval_mode == "auto" else "pending"
                    await execute_query(
                        "UPDATE signals SET status=? WHERE id=?",
                        (status, signal_id),
                    )

    async def _validate_signal(
        self, signal: dict, risk_config: dict, portfolio
    ) -> str | None:
        """Validate a signal against risk rules. Returns rejection reason or None."""
        direction = signal.get("direction", "")
        stock_code = signal.get("stock_code", "")

        # --- NEW: R/R score gate ---
        rr_score = signal.get("rr_score")
        if rr_score is not None:
            min_rr = float(risk_config.get("min_rr_score", "2.0"))
            if rr_score < min_rr:
                return f"R/R 점수 미달 ({rr_score:.2f} < {min_rr:.1f})"

        # --- NEW: Critic result gate ---
        critic_result = signal.get("critic_result")
        if critic_result is not None and critic_result != "pass":
            return f"Critic 검증 미통과 ({critic_result})"

        # Check max positions (for buy signals only)
        if direction == "buy":
            max_positions = int(risk_config.get("max_positions", 5))
            current_count = len(portfolio.positions)
            # Check if we already hold this stock
            already_held = any(
                p.get("stock_code") == stock_code for p in portfolio.positions
            )
            if not already_held and current_count >= max_positions:
                return f"최대 포지션 수 초과 ({current_count}/{max_positions})"

            # Check concentration limit
            max_weight = float(risk_config.get("max_position_weight_pct", 20.0))
            if portfolio.total_value > 0:
                # Estimate position value (rough: use confidence as weight proxy)
                for pos in portfolio.positions:
                    if pos.get("stock_code") == stock_code:
                        weight = pos.get("market_value", 0) / portfolio.total_value * 100
                        if weight >= max_weight:
                            return f"종목 비중 한도 초과 ({weight:.1f}% >= {max_weight}%)"

            # Check daily loss limit
            max_daily_loss = float(risk_config.get("max_daily_loss", 500000))
            if portfolio.total_pnl < -max_daily_loss:
                return f"일일 손실 한도 초과 ({portfolio.total_pnl:,.0f}원)"

            # Sector concentration gate (buy only)
            if portfolio:
                try:
                    from app.models.db import execute_query as _eq
                    row = await _eq("SELECT sector FROM kospi200_components WHERE stock_code = ?", (signal.get("stock_code"),))
                    if row and row[0].get("sector"):
                        signal_sector = row[0]["sector"]
                        total_val = portfolio.total_value
                        if total_val > 0:
                            sector_weight = 0
                            for pos in portfolio.positions:
                                pos_row = await _eq("SELECT sector FROM kospi200_components WHERE stock_code = ?", (pos.get("stock_code"),))
                                if pos_row and pos_row[0].get("sector") == signal_sector:
                                    sector_weight += (pos.get("market_value", 0) or 0)
                            sector_pct = sector_weight / total_val * 100
                            sector_max = float(risk_config.get("sector_max_pct", 40.0))
                            if sector_pct > sector_max:
                                return f"섹터 집중도 초과: {signal_sector} ({sector_pct:.0f}% > {sector_max:.0f}%)"
                except Exception:
                    pass  # Graceful degradation if sector data unavailable

        # --- SELL-specific gates ---
        elif direction == "sell":
            # Must hold the stock to sell it
            held = any(
                p.get("stock_code") == stock_code for p in portfolio.positions
            )
            if not held:
                return f"미보유 종목 매도 불가 ({stock_code})"

            # Optional: minimum hold time check
            min_hold = int(risk_config.get("min_hold_minutes", 0))
            if min_hold > 0:
                try:
                    from app.models.db import execute_query as _eq
                    row = await _eq(
                        "SELECT MIN(timestamp) as first_buy FROM orders "
                        "WHERE stock_code = ? AND side = 'buy' AND status = 'filled'",
                        (stock_code,),
                    )
                    if row and row[0].get("first_buy"):
                        from datetime import datetime, timezone
                        first_buy = datetime.fromisoformat(row[0]["first_buy"])
                        elapsed = (datetime.now(timezone.utc) - first_buy).total_seconds() / 60
                        if elapsed < min_hold:
                            return f"최소 보유 시간 미달 ({elapsed:.0f}분 < {min_hold}분)"
                except Exception:
                    pass  # Graceful degradation

        return None

    async def _load_risk_config(self) -> dict:
        """Load risk configuration from database."""
        try:
            rows = await execute_query("SELECT key, value FROM risk_config")
            return {row["key"]: row["value"] for row in rows} if rows else {}
        except Exception as e:
            logger.error(f"Failed to load risk config: {e}")
            return {
                "stop_loss_pct": "-3.0",
                "take_profit_pct": "5.0",
                "max_positions": "5",
                "max_position_weight_pct": "20.0",
                "max_daily_loss": "500000",
                "signal_approval_mode": "auto",
                "min_rr_score": "0.3",
            }
