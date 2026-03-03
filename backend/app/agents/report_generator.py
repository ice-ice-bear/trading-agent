"""Report Generator Agent — creates daily/weekly performance reports using Claude analysis."""

import json
import logging
from datetime import datetime, timedelta

import anthropic

from app.agents.base import AgentContext, AgentResult, AgentRole, BaseAgent
from app.config import settings
from app.models.db import execute_insert, execute_query
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)


class ReportGeneratorAgent(BaseAgent):
    agent_id = "report_generator"
    name = "리포트 생성기"
    role = AgentRole.REPORTER
    allowed_tools = ["domestic_stock"]

    async def execute(self, context: AgentContext) -> AgentResult:
        """Generate a performance report for the given period."""
        report_type = context.params.get("report_type", "daily")

        # Determine period
        now = datetime.now()
        if report_type == "weekly":
            period_start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
            period_end = now.strftime("%Y-%m-%d")
        else:
            period_start = now.strftime("%Y-%m-%d")
            period_end = now.strftime("%Y-%m-%d")

        # 1. Gather data for the report
        data = await self._gather_report_data(period_start, period_end)

        if not data.get("snapshots") and not data.get("orders"):
            return AgentResult(
                success=True,
                summary=f"{report_type} 리포트: 해당 기간 데이터 없음",
                data={"report_type": report_type, "period": f"{period_start}~{period_end}"},
            )

        # 2. Generate report with Claude
        report_content = await self._generate_with_claude(data, report_type, period_start, period_end)

        # 3. Save report to DB
        summary_json = json.dumps({
            "total_trades": data.get("total_trades", 0),
            "filled_trades": data.get("filled_trades", 0),
            "total_signals": data.get("total_signals", 0),
            "latest_pnl": data.get("latest_pnl", 0),
            "latest_pnl_pct": data.get("latest_pnl_pct", 0),
        }, ensure_ascii=False)

        report_id = await execute_insert(
            """INSERT INTO reports
               (report_type, period_start, period_end, title, content, summary_json, agent_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                report_type,
                period_start,
                period_end,
                f"{'일일' if report_type == 'daily' else '주간'} 투자 리포트 ({period_start})",
                report_content,
                summary_json,
                self.agent_id,
            ),
        )

        # 4. Emit event
        await self.emit_event("report.generated", {
            "report_id": report_id,
            "report_type": report_type,
            "period": f"{period_start}~{period_end}",
        })

        return AgentResult(
            success=True,
            summary=f"{'일일' if report_type == 'daily' else '주간'} 리포트 생성 완료 (ID: {report_id})",
            data={"report_id": report_id, "report_type": report_type},
        )

    async def _gather_report_data(self, period_start: str, period_end: str) -> dict:
        """Collect all relevant data for the report period."""
        data: dict = {}

        # Portfolio snapshots
        snapshots = await execute_query(
            """SELECT * FROM portfolio_snapshots
               WHERE date(timestamp) >= date(?) AND date(timestamp) <= date(?)
               ORDER BY timestamp""",
            (period_start, period_end),
        )
        data["snapshots"] = snapshots or []

        # Latest snapshot
        latest = await execute_query(
            "SELECT * FROM portfolio_snapshots ORDER BY timestamp DESC LIMIT 1"
        )
        if latest:
            data["latest_snapshot"] = latest[0]
            data["latest_pnl"] = latest[0].get("total_pnl", 0)
            data["latest_pnl_pct"] = latest[0].get("total_pnl_pct", 0)

        # Orders
        orders = await execute_query(
            """SELECT * FROM orders
               WHERE date(timestamp) >= date(?) AND date(timestamp) <= date(?)
               ORDER BY timestamp""",
            (period_start, period_end),
        )
        data["orders"] = orders or []
        data["total_trades"] = len(orders or [])
        data["filled_trades"] = sum(1 for o in (orders or []) if o.get("status") == "filled")

        # Signals
        signals = await execute_query(
            """SELECT * FROM signals
               WHERE date(timestamp) >= date(?) AND date(timestamp) <= date(?)
               ORDER BY timestamp""",
            (period_start, period_end),
        )
        data["signals"] = signals or []
        data["total_signals"] = len(signals or [])

        # Agent activity
        logs = await execute_query(
            """SELECT agent_id, COUNT(*) as run_count,
                      SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as success_count,
                      AVG(duration_ms) as avg_duration
               FROM agent_logs
               WHERE date(timestamp) >= date(?) AND date(timestamp) <= date(?)
               GROUP BY agent_id""",
            (period_start, period_end),
        )
        data["agent_activity"] = logs or []

        return data

    async def _generate_with_claude(
        self, data: dict, report_type: str, period_start: str, period_end: str
    ) -> str:
        """Use Claude to analyze data and generate a natural language report."""
        model = runtime_settings.get("claude_model") or settings.claude_model
        max_tokens = int(runtime_settings.get("claude_max_tokens") or settings.claude_max_tokens)

        # Prepare concise data summary for Claude
        summary = {
            "기간": f"{period_start} ~ {period_end}",
            "유형": "일일" if report_type == "daily" else "주간",
            "포트폴리오_스냅샷_수": len(data.get("snapshots", [])),
            "최근_총자산": data.get("latest_snapshot", {}).get("total_value", 0),
            "최근_현금": data.get("latest_snapshot", {}).get("cash_balance", 0),
            "최근_손익": data.get("latest_pnl", 0),
            "최근_손익률": data.get("latest_pnl_pct", 0),
            "주문_수": data.get("total_trades", 0),
            "체결_수": data.get("filled_trades", 0),
            "신호_수": data.get("total_signals", 0),
            "에이전트_활동": data.get("agent_activity", []),
        }

        # Include order details (truncated)
        orders = data.get("orders", [])[:20]
        summary["주문_상세"] = [
            {
                "종목": o.get("stock_code"),
                "구분": o.get("side"),
                "수량": o.get("quantity"),
                "상태": o.get("status"),
                "시간": o.get("timestamp"),
            }
            for o in orders
        ]

        # Include signal details (truncated)
        signals = data.get("signals", [])[:20]
        summary["신호_상세"] = [
            {
                "종목": s.get("stock_code"),
                "방향": s.get("direction"),
                "신뢰도": s.get("confidence"),
                "상태": s.get("status"),
            }
            for s in signals
        ]

        prompt = f"""당신은 투자 성과 분석 전문가입니다.
아래 데이터를 바탕으로 한국어 {"일일" if report_type == "daily" else "주간"} 투자 리포트를 작성하세요.

## 데이터
{json.dumps(summary, ensure_ascii=False, indent=2)}

## 리포트 작성 요건
1. **성과 요약**: 총자산, 손익, 손익률을 간결하게 정리
2. **매매 활동**: 주문/체결 현황, 주요 거래 내용
3. **신호 분석**: 생성된 신호와 승인/거부 비율
4. **에이전트 활동**: 각 에이전트의 실행 현황
5. **투자 인사이트**: 향후 주의할 점이나 기회 요인
6. **위험 요인**: 포지션 집중도, 손실 종목 등

마크다운 형식으로 작성하되, 전문적이면서도 읽기 쉽게 작성하세요.
모의투자 환경임을 명시하세요.
"""

        try:
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            response = await client.messages.create(
                model=model,
                max_tokens=min(max_tokens, 4096),
                messages=[{"role": "user", "content": prompt}],
            )

            text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    text += block.text
            return text or "(리포트 생성 실패)"

        except Exception as e:
            logger.error(f"Claude report generation failed: {e}")
            return f"리포트 생성 중 오류 발생: {e}"
