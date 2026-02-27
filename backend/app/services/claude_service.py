import json
import logging
from collections.abc import AsyncGenerator

import anthropic

from app.config import settings
from app.services.mcp_client import mcp_manager
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT_TEMPLATE = """당신은 한국투자증권 API를 사용하는 주식 트레이딩 어시스턴트입니다.
현재 환경은 **{mode_label}** 모드입니다. {mode_description}

주요 역할:
- 국내/해외 주식, 선물옵션, 채권, ELW, ETF/ETN 시세 조회
- {order_description}
- 잔고 및 포트폴리오 조회
- 시장 분석 및 투자 정보 제공

## 도구 사용법

모든 도구는 두 개의 파라미터를 받습니다:
- `api_type`: 호출할 API 이름 (예: "inquire_price", "inquire_balance")
- `params`: API에 전달할 파라미터 딕셔너리

### env_dv 파라미터 규칙 (매우 중요!)

env_dv는 API마다 필요 여부가 다릅니다. **필요한 API에만 포함하고, 필요 없는 API에는 절대 포함하지 마세요.**
env_dv가 필요한 경우 값은 항상 "{env_dv_value}"입니다.{env_dv_warning}

**처음 호출하는 API는 반드시 find_api_detail로 먼저 파라미터를 확인하세요.**
find_api_detail 결과의 params 목록에 env_dv가 있으면 포함하고, 없으면 포함하지 마세요.

### 자주 사용하는 API 호출 예시:

1. **주식 현재가 조회** (domestic_stock):
   api_type: "inquire_price"
   params: {{"env_dv": "{env_dv_value}", "fid_cond_mrkt_div_code": "J", "fid_input_iscd": "005930"}}

2. **잔고 조회** (domestic_stock):
   api_type: "inquire_balance"
   params: {{"env_dv": "{env_dv_value}"}}

3. **주문** (domestic_stock):
   api_type: "order_cash"
   params: {{"env_dv": "{env_dv_value}", "ord_dvsn": "01", "qty": "10", "unpr": "0", "stock_code": "005930", "buy_sell": "buy"}}

4. **거래량 순위** (domestic_stock):
   api_type: "volume_rank"
   params: {{}}

5. **등락률 순위** (domestic_stock):
   api_type: "fluctuation"
   params: {{}}

6. **시가총액 상위** (domestic_stock):
   api_type: "market_cap"
   params: {{}}

7. **API 상세 정보 확인**:
   api_type: "find_api_detail"
   params: {{"api_type": "volume_rank"}}

8. **종목명으로 조회**: stock_name 파라미터 사용 가능 (예: {{"stock_name": "삼성전자"}} → 자동으로 종목코드 변환)

## 중요 규칙:
1. env_dv가 필요한지 확실하지 않으면 find_api_detail로 먼저 확인하세요.
2. env_dv가 필요한 API에는 항상 "{env_dv_value}"를 사용하세요. 필요 없는 API에는 포함하지 마세요.
3. API 호출이 "unexpected keyword argument" 오류를 반환하면, 해당 파라미터를 제거하고 재시도하세요.
4. 주문 실행 전 사용자에게 확인을 구하세요.
5. 응답은 한국어로 제공하세요.
6. 시세 데이터는 표(테이블) 형태로 정리해서 보여주세요.
7. 금액은 원화(₩) 단위로 표시하세요."""


def get_system_prompt() -> str:
    mode = runtime_settings.get("trading_mode")
    if mode == "real":
        return _SYSTEM_PROMPT_TEMPLATE.format(
            mode_label="실전투자(real)",
            mode_description="실제 자금으로 거래됩니다. 주문 시 각별히 주의하세요.",
            order_description="실전 주문 실행 (매수/매도) — 실제 자금 사용",
            env_dv_value="real",
            env_dv_warning="",
        )
    return _SYSTEM_PROMPT_TEMPLATE.format(
        mode_label="모의투자(demo)",
        mode_description="모든 거래와 조회는 모의투자 환경에서 이루어집니다.",
        order_description="모의투자 주문 실행 (매수/매도)",
        env_dv_value="demo",
        env_dv_warning=' 절대 "real"을 사용하지 마세요.',
    )


async def stream_chat(
    messages: list[dict], session_id: str
) -> AsyncGenerator[str, None]:
    """
    Stream a chat response from Claude, handling tool calls via MCP.
    Yields SSE-formatted event strings.
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    tools = mcp_manager.get_claude_tools()

    current_model = runtime_settings.get("claude_model")
    current_max_tokens = runtime_settings.get("claude_max_tokens")
    system_prompt = get_system_prompt()

    # Build messages for Claude
    claude_messages = []
    for msg in messages:
        claude_messages.append({"role": msg["role"], "content": msg["content"]})

    # Agentic loop: keep going until Claude stops using tools
    while True:
        try:
            with client.messages.stream(
                model=current_model,
                max_tokens=current_max_tokens,
                system=system_prompt,
                messages=claude_messages,
                tools=tools if tools else anthropic.NOT_GIVEN,
            ) as stream:
                # Stream events to the frontend for live UI updates
                for event in stream:
                    if event.type == "content_block_start":
                        block = event.content_block
                        if block.type == "tool_use":
                            yield _sse_event(
                                "tool_start",
                                {"tool_name": block.name, "tool_id": block.id},
                            )

                    elif event.type == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta":
                            yield _sse_event("text_delta", {"text": delta.text})

                # Get the complete, properly-structured response
                response = stream.get_final_message()

        except anthropic.APIError as e:
            yield _sse_event("error", {"message": f"Claude API error: {e}"})
            yield _sse_event("done", {})
            return

        # If Claude wants to use tools, execute them and continue the loop
        if response.stop_reason == "tool_use":
            # Build content blocks from the final message (preserves correct order)
            content_blocks = []
            for block in response.content:
                if block.type == "text":
                    content_blocks.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    content_blocks.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input if isinstance(block.input, dict) else {},
                    })

            # Add assistant message with all content blocks
            claude_messages.append({"role": "assistant", "content": content_blocks})

            # Execute each tool call and collect results
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    yield _sse_event(
                        "tool_executing",
                        {"tool_name": block.name, "tool_id": block.id, "input": block.input},
                    )

                    result_text = await mcp_manager.call_tool(
                        block.name,
                        block.input if isinstance(block.input, dict) else {},
                    )

                    # Truncate very long results to avoid token limits
                    if len(result_text) > 10000:
                        result_text = result_text[:10000] + "\n... (결과가 너무 길어 일부만 표시합니다)"

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    })

                    yield _sse_event(
                        "tool_result",
                        {
                            "tool_name": block.name,
                            "tool_id": block.id,
                            "result_preview": result_text[:500],
                        },
                    )

            # Add tool results to messages
            claude_messages.append({"role": "user", "content": tool_results})

            # Continue the loop to get Claude's response after tool execution
            continue

        # No more tool calls - we're done
        yield _sse_event("done", {})
        return


def _sse_event(event_type: str, data: dict) -> str:
    """Format an SSE event string."""
    return json.dumps({"event": event_type, "data": data})
