"""Market Scanner Agent — scans market data and generates trading signals using Claude analysis."""

import json
import logging

import anthropic

from app.agents.base import AgentContext, AgentResult, AgentRole, BaseAgent
from app.agents.state import shared_state
from app.config import settings
from app.models.db import execute_insert
from app.services.market_service import get_fluctuation_rank, get_stock_price, get_volume_rank
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)


class MarketScannerAgent(BaseAgent):
    agent_id = "market_scanner"
    name = "마켓 스캐너"
    role = AgentRole.SCANNER
    allowed_tools = ["domestic_stock"]

    async def execute(self, context: AgentContext) -> AgentResult:
        """Scan market data and generate trading signals via Claude analysis."""

        # 1. Gather market data
        market_data = {}
        errors = []

        try:
            volume_data = await get_volume_rank(count=10)
            market_data["volume_rank"] = volume_data
        except Exception as e:
            errors.append(f"거래량 순위 조회 실패: {e}")

        try:
            fluctuation_data = await get_fluctuation_rank(count=10)
            market_data["fluctuation_rank"] = fluctuation_data
        except Exception as e:
            errors.append(f"등락률 순위 조회 실패: {e}")

        # Check watchlist prices
        watchlist = await shared_state.get_watchlist()
        if watchlist:
            watchlist_prices = {}
            for stock_code in watchlist[:10]:
                try:
                    price_data = await get_stock_price(stock_code)
                    watchlist_prices[stock_code] = price_data
                except Exception:
                    pass
            if watchlist_prices:
                market_data["watchlist_prices"] = watchlist_prices

        if not market_data:
            return AgentResult(
                success=False,
                summary=f"시장 데이터 수집 실패: {'; '.join(errors)}",
                error="; ".join(errors),
            )

        # Get current portfolio for context
        portfolio = await shared_state.get_portfolio()
        portfolio_summary = {
            "total_value": portfolio.total_value,
            "cash_balance": portfolio.cash_balance,
            "total_pnl": portfolio.total_pnl,
            "positions": [
                {"stock_code": p.get("stock_code"), "stock_name": p.get("stock_name")}
                for p in portfolio.positions
            ],
        }

        # 2. Ask Claude to analyze and generate signals
        signals = await self._analyze_with_claude(market_data, portfolio_summary)

        if not signals:
            return AgentResult(
                success=True,
                summary="시장 스캔 완료. 매매 신호 없음.",
                data={"scanned_stocks": len(market_data.get("volume_rank", []))},
            )

        # 3. Save signals to DB and emit events
        saved_signals = []
        for sig in signals:
            signal_id = await execute_insert(
                """INSERT INTO signals
                   (agent_id, stock_code, stock_name, direction, confidence, reason, status)
                   VALUES (?, ?, ?, ?, ?, ?, 'pending')""",
                (
                    self.agent_id,
                    sig["stock_code"],
                    sig.get("stock_name", ""),
                    sig["direction"],
                    sig.get("confidence", 0.5),
                    sig.get("reason", ""),
                ),
            )
            saved_signal = {**sig, "signal_id": signal_id}
            saved_signals.append(saved_signal)

            # Emit signal.generated for RiskManager to evaluate
            await self.emit_event("signal.generated", saved_signal)

        return AgentResult(
            success=True,
            summary=f"시장 스캔 완료. {len(saved_signals)}개 신호 생성.",
            data={"signals": saved_signals},
        )

    async def _analyze_with_claude(
        self, market_data: dict, portfolio_summary: dict
    ) -> list[dict]:
        """Use Claude to analyze market data and extract trading signals."""
        model = runtime_settings.get("claude_model") or settings.claude_model
        max_tokens = int(runtime_settings.get("claude_max_tokens") or settings.claude_max_tokens)

        prompt = f"""당신은 국내 주식 시장 분석가입니다.
아래 시장 데이터를 분석하고 매매 신호를 생성하세요.

## 현재 포트폴리오
{json.dumps(portfolio_summary, ensure_ascii=False, indent=2)}

## 시장 데이터
{json.dumps(market_data, ensure_ascii=False, indent=2)}

## 분석 기준
- 거래량 급증 + 상승 종목 중 추가 상승 여력이 있는 종목
- 과매도 종목 중 반등 가능성이 높은 종목
- 이미 보유 중인 종목은 추가 매수보다 매도 신호에 집중
- 신뢰도(confidence)는 0.0~1.0 사이, 0.7 이상만 신호로 생성

## 응답 형식 (반드시 JSON 배열만 출력)
```json
[
  {{
    "stock_code": "005930",
    "stock_name": "삼성전자",
    "direction": "buy",
    "confidence": 0.8,
    "reason": "거래량 200% 급증, MACD 골든크로스 임박"
  }}
]
```

신호가 없으면 빈 배열 `[]`을 반환하세요.
"""

        try:
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            response = await client.messages.create(
                model=model,
                max_tokens=min(max_tokens, 2048),
                messages=[{"role": "user", "content": prompt}],
            )

            # Extract text from response
            text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    text += block.text

            # Parse JSON from response
            return self._parse_signals(text)

        except Exception as e:
            logger.error(f"Claude analysis failed: {e}")
            return []

    def _parse_signals(self, text: str) -> list[dict]:
        """Parse trading signals from Claude's response text."""
        # Try to find JSON array in the response
        import re

        # Try code block first
        match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # Try raw JSON
        match = re.search(r"\[.*?\]", text, re.DOTALL)
        if match:
            try:
                signals = json.loads(match.group(0))
                if isinstance(signals, list):
                    # Validate signal structure
                    valid = []
                    for s in signals:
                        if isinstance(s, dict) and s.get("stock_code") and s.get("direction"):
                            if s.get("confidence", 0) >= 0.7:
                                valid.append(s)
                    return valid
            except json.JSONDecodeError:
                pass

        logger.warning(f"Could not parse signals from Claude response: {text[:200]}")
        return []
