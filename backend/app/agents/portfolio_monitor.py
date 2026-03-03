"""Portfolio Monitor Agent — tracks positions, balances, and P/L."""

import json
import logging

from app.agents.base import AgentContext, AgentResult, AgentRole, BaseAgent
from app.agents.state import PortfolioCache, shared_state
from app.models.db import execute_insert, execute_query

logger = logging.getLogger(__name__)


class PortfolioMonitorAgent(BaseAgent):
    agent_id = "portfolio_monitor"
    name = "포트폴리오 모니터"
    role = AgentRole.MONITOR
    allowed_tools = ["domestic_stock"]

    async def execute(self, context: AgentContext) -> AgentResult:
        """Fetch portfolio balance and positions, save snapshot, emit event."""

        # 1. Fetch balance from MCP
        try:
            balance_raw = await self.call_mcp_tool(
                "domestic_stock",
                {
                    "api_type": "inquire_balance",
                    "params": {
                        "env_dv": "demo",
                        "afhr_flpr_yn": "N",
                        "inqr_dvsn": "02",
                        "unpr_dvsn": "01",
                        "fund_sttl_icld_yn": "N",
                        "fncg_amt_auto_rdpt_yn": "N",
                        "prcs_dvsn": "01",
                    },
                },
            )
        except Exception as e:
            return AgentResult(
                success=False,
                summary=f"잔고 조회 실패: {e}",
                error=str(e),
            )

        # 2. Parse balance data
        positions = []
        total_value = 0.0
        cash_balance = 0.0
        total_pnl = 0.0

        try:
            raw_data = json.loads(balance_raw) if isinstance(balance_raw, str) else balance_raw

            # MCP response wraps KIS data: {"ok": true, "data": {"data": "JSON_STRING", ...}}
            data = raw_data
            if isinstance(data, dict) and "data" in data:
                inner = data["data"]
                if isinstance(inner, dict) and "data" in inner:
                    # Double-wrapped: parse the inner JSON string
                    inner_data = inner["data"]
                    if isinstance(inner_data, str):
                        data = json.loads(inner_data)
                    else:
                        data = inner_data
                elif isinstance(inner, str):
                    data = json.loads(inner)
                else:
                    data = inner

            # Parse KIS balance response structure
            if isinstance(data, list):
                for item in data:
                    pos = self._parse_position(item)
                    if pos:
                        positions.append(pos)
            elif isinstance(data, dict):
                if "output1" in data:
                    items = data["output1"]
                    if isinstance(items, list):
                        for item in items:
                            pos = self._parse_position(item)
                            if pos:
                                positions.append(pos)
                if "output2" in data:
                    summary = data["output2"]
                    if isinstance(summary, list) and summary:
                        summary = summary[0]
                    if isinstance(summary, dict):
                        total_value = float(summary.get("tot_evlu_amt", 0))
                        cash_balance = float(summary.get("dnca_tot_amt", 0) or summary.get("prvs_rcdl_excc_amt", 0))
                        total_pnl = float(summary.get("evlu_pfls_smtl_amt", 0))
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            logger.warning(f"Balance parse partial failure: {e}, raw: {str(balance_raw)[:500]}")

        # Compute totals from positions if not available from summary
        if positions:
            total_market = sum(p.get("market_value", 0) for p in positions)
            # Always recompute total_value from positions + cash for accuracy
            if total_market > 0:
                total_value = total_market + cash_balance
        elif cash_balance > 0:
            # No positions: total value equals cash balance
            total_value = cash_balance
        if total_pnl == 0 and positions:
            total_pnl = sum(p.get("unrealized_pnl", 0) for p in positions)

        total_pnl_pct = (total_pnl / (total_value - total_pnl) * 100) if (total_value - total_pnl) > 0 else 0.0

        # 3. Save snapshot to DB
        snapshot_id = await execute_insert(
            """INSERT INTO portfolio_snapshots
               (total_value, cash_balance, total_pnl, total_pnl_pct, positions_json)
               VALUES (?, ?, ?, ?, ?)""",
            (total_value, cash_balance, total_pnl, round(total_pnl_pct, 2), json.dumps(positions, ensure_ascii=False)),
        )

        # Save individual positions
        for pos in positions:
            await execute_insert(
                """INSERT INTO positions
                   (snapshot_id, stock_code, stock_name, quantity, avg_buy_price,
                    current_price, market_value, unrealized_pnl, unrealized_pnl_pct)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    snapshot_id,
                    pos.get("stock_code", ""),
                    pos.get("stock_name", ""),
                    pos.get("quantity", 0),
                    pos.get("avg_buy_price", 0),
                    pos.get("current_price", 0),
                    pos.get("market_value", 0),
                    pos.get("unrealized_pnl", 0),
                    pos.get("unrealized_pnl_pct", 0),
                ),
            )

        # Auto-set initial capital on first run
        existing_ic = await execute_query(
            "SELECT value FROM risk_config WHERE key = 'initial_capital'",
            fetch_one=True,
        )
        if not existing_ic and cash_balance > 0:
            await execute_query(
                "INSERT INTO risk_config (key, value) VALUES ('initial_capital', ?) "
                "ON CONFLICT(key) DO NOTHING",
                (str(cash_balance),),
            )
            logger.info(f"Initial capital set: {cash_balance:,.0f}")

        # 4. Update shared state
        await shared_state.update_portfolio(
            PortfolioCache(
                total_value=total_value,
                cash_balance=cash_balance,
                total_pnl=total_pnl,
                total_pnl_pct=round(total_pnl_pct, 2),
                positions=positions,
            )
        )

        # 5. Emit portfolio.updated event
        await self.emit_event(
            "portfolio.updated",
            {
                "snapshot_id": snapshot_id,
                "total_value": total_value,
                "cash_balance": cash_balance,
                "total_pnl": total_pnl,
                "total_pnl_pct": round(total_pnl_pct, 2),
                "position_count": len(positions),
                "positions": positions,
            },
        )

        return AgentResult(
            success=True,
            summary=(
                f"포트폴리오 스냅샷 저장 (ID: {snapshot_id}). "
                f"총자산: {total_value:,.0f}원, 손익: {total_pnl:,.0f}원 ({total_pnl_pct:.2f}%), "
                f"포지션: {len(positions)}개"
            ),
            data={
                "snapshot_id": snapshot_id,
                "total_value": total_value,
                "cash_balance": cash_balance,
                "total_pnl": total_pnl,
                "positions": positions,
            },
        )

    def _parse_position(self, item: dict) -> dict | None:
        """Parse a single position from KIS balance response."""
        if not isinstance(item, dict):
            return None

        stock_code = item.get("pdno", "") or item.get("stock_code", "")
        if not stock_code:
            return None

        quantity = int(item.get("hldg_qty", 0) or item.get("quantity", 0))
        if quantity == 0:
            return None

        avg_price = float(item.get("pchs_avg_pric", 0) or item.get("avg_buy_price", 0))
        current_price = float(item.get("prpr", 0) or item.get("current_price", 0))
        market_value = float(item.get("evlu_amt", 0) or 0) or (current_price * quantity)
        pnl = float(item.get("evlu_pfls_amt", 0) or 0) or (market_value - avg_price * quantity)
        pnl_pct = float(item.get("evlu_pfls_rt", 0) or 0)
        if pnl_pct == 0 and avg_price > 0:
            pnl_pct = round((current_price - avg_price) / avg_price * 100, 2)

        return {
            "stock_code": stock_code,
            "stock_name": item.get("prdt_name", "") or item.get("stock_name", ""),
            "quantity": quantity,
            "avg_buy_price": avg_price,
            "current_price": current_price,
            "market_value": market_value,
            "unrealized_pnl": pnl,
            "unrealized_pnl_pct": pnl_pct,
        }
