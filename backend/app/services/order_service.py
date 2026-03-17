"""Order execution service — wraps MCP order tools for TradingExecutor."""

import json
import logging
from typing import Any

from app.models.db import execute_insert, execute_query
from app.services.mcp_client import mcp_manager

logger = logging.getLogger(__name__)


async def check_buyable(stock_code: str, price: int = 0) -> dict[str, Any]:
    """Check how many shares can be bought (매수 가능 조회).

    KIS api_code.py가 ord_unpr=0 또는 "" 모두 ValueError를 발생시키므로
    price가 없으면 inquire_price로 현재가를 먼저 조회해 전달한다.
    """
    from app.services.market_service import get_stock_price  # 순환 import 방지

    if not price:
        try:
            price_data = await get_stock_price(stock_code)
            price = int(
                price_data.get("stck_prpr") or      # 주식현재가
                price_data.get("stck_clpr") or      # 주식종가
                price_data.get("output", {}).get("stck_prpr") or
                0
            )
            logger.info(f"check_buyable: got current price for {stock_code} = {price}")
        except Exception as e:
            logger.warning(f"check_buyable: failed to get price for {stock_code}: {e}")

    if not price:
        logger.warning(f"check_buyable({stock_code}): no price available, returning empty")
        return {"nrcvb_buy_qty": "0", "max_buy_qty": "0", "ord_psbl_cash": "0"}

    params: dict[str, Any] = {
        "env_dv": "demo",
        "pdno": stock_code,
        "ord_unpr": str(price),
        "ord_dvsn": "01",
        "cma_evlu_amt_icld_yn": "Y",
        "ovrs_icld_yn": "N",
    }
    raw = await mcp_manager.call_tool(
        "domestic_stock",
        {"api_type": "inquire_psbl_order", "params": params},
    )

    # MCP 응답: {"ok": true, "data": {MCP metadata dict with "error" key}}
    # 실제 KIS 응답은 error가 없을 때 별도 data 필드에 있음
    raw_parsed = json.loads(raw) if isinstance(raw, str) else raw
    mcp_inner = raw_parsed.get("data", raw_parsed) if isinstance(raw_parsed, dict) else raw_parsed

    # MCP 툴 자체 에러 확인
    if isinstance(mcp_inner, dict) and mcp_inner.get("error"):
        logger.warning(f"check_buyable MCP error: {str(mcp_inner['error'])[:200]}")
        return {"nrcvb_buy_qty": "0", "max_buy_qty": "0", "ord_psbl_cash": "0"}

    # 실제 KIS 응답 추출 (이중 래핑)
    result = _unwrap_mcp_response(raw_parsed)
    if isinstance(result, list) and result:
        result = result[0]
    if not isinstance(result, dict):
        result = {}

    logger.info(
        f"check_buyable({stock_code}@{price}): "
        f"nrcvb={result.get('nrcvb_buy_qty')}, max={result.get('max_buy_qty')}, "
        f"cash={result.get('ord_psbl_cash')}"
    )
    return result


async def check_sellable(stock_code: str) -> dict[str, Any]:
    """Check how many shares can be sold (매도 가능 조회)."""
    raw = await mcp_manager.call_tool(
        "domestic_stock",
        {
            "api_type": "inquire_psbl_sell",
            "params": {
                "pdno": stock_code,
                "tr_cont": "",
                "depth": "0",
                "max_depth": "1",
            },
        },
    )
    return _parse_dict(raw)


async def place_order(
    stock_code: str,
    side: str,
    quantity: int,
    price: int = 0,
    order_type: str = "market",
    agent_id: str = "trading_executor",
    stock_name: str = "",
    signal_id: int | None = None,
    reason: str = "",
) -> dict[str, Any]:
    """Place a buy or sell order via MCP and record in DB.

    Args:
        side: "buy" or "sell"
        order_type: "market" or "limit"
        price: Required for limit orders, 0 for market orders
    """
    # Map order type to KIS ord_dvsn codes
    # 00 = 지정가 (limit), 01 = 시장가 (market)
    ord_dvsn = "01" if order_type == "market" else "00"

    params: dict[str, Any] = {
        "env_dv": "demo",
        "ord_dv": side,  # "buy" or "sell"
        "pdno": stock_code,
        "ord_dvsn": ord_dvsn,
        "ord_qty": str(quantity),
        "ord_unpr": str(price) if price else "0",
        "excg_id_dvsn_cd": "KRX",
        "sll_type": "01" if side == "sell" else "",
        "cndt_pric": "",
    }

    # Record order in DB first (status: submitted)
    order_id = await execute_insert(
        """INSERT INTO orders
           (agent_id, stock_code, stock_name, side, order_type, quantity, price, status, reason, signal_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)""",
        (agent_id, stock_code, stock_name, side, order_type, quantity, price or None, reason, signal_id),
    )

    try:
        raw = await mcp_manager.call_tool(
            "domestic_stock",
            {"api_type": "order_cash", "params": params},
        )

        # Parse MCP double-wrapped response
        raw_parsed = json.loads(raw) if isinstance(raw, str) else raw
        mcp_data = raw_parsed.get("data", raw_parsed) if isinstance(raw_parsed, dict) else {}
        mcp_error = mcp_data.get("error", "") if isinstance(mcp_data, dict) else ""
        mcp_success = mcp_data.get("success", False) if isinstance(mcp_data, dict) else False

        # Check for MCP-level error (e.g. unexpected keyword argument)
        if mcp_error:
            raise RuntimeError(str(mcp_error)[:500])

        # Parse inner KIS data
        inner_data_str = mcp_data.get("data", "") if isinstance(mcp_data, dict) else ""
        kis_data = {}
        if isinstance(inner_data_str, str) and inner_data_str.strip():
            # Check for error patterns in plain-text responses from KIS
            if "rt_cd : 1" in inner_data_str or "Error in response" in inner_data_str:
                mcp_success = False
                kis_data = {"raw_error": inner_data_str[:500]}
            else:
                try:
                    kis_data = json.loads(inner_data_str)
                except json.JSONDecodeError:
                    kis_data = {"raw_error": inner_data_str[:500]}
                    mcp_success = False
        elif isinstance(inner_data_str, (dict, list)):
            kis_data = inner_data_str

        # Determine success: MCP success + KIS order number present
        order_no = ""
        if isinstance(kis_data, list) and kis_data:
            order_no = kis_data[0].get("ODNO", "")
        elif isinstance(kis_data, dict):
            order_no = kis_data.get("ODNO", kis_data.get("output", {}).get("ODNO", ""))
            # Also check rt_cd for KIS-level rejection
            rt_cd = kis_data.get("rt_cd", "")
            if rt_cd and rt_cd != "0":
                mcp_success = False

        result = {"mcp_success": mcp_success, "order_no": order_no, "kis_data": kis_data, "raw": mcp_data}

        if mcp_success and order_no:
            # Update order status to filled
            fill_price = price or 0
            await execute_query(
                """UPDATE orders SET status='filled', fill_price=?, fill_quantity=?,
                   mcp_result_json=? WHERE id=?""",
                (fill_price, quantity, json.dumps(result, ensure_ascii=False)[:2000], order_id),
            )
            # Update signal to executed if present
            if signal_id:
                await execute_query(
                    "UPDATE signals SET status='executed' WHERE id=?",
                    (signal_id,),
                )

            logger.info(
                f"Order FILLED: {side} {quantity}x {stock_code} @ {fill_price} (order #{order_id})"
            )
            return {
                "success": True,
                "order_id": order_id,
                "status": "filled",
                "stock_code": stock_code,
                "side": side,
                "quantity": quantity,
                "price": fill_price,
                "result": result,
            }
        else:
            # Order rejected by KIS
            msg = ""
            if isinstance(kis_data, dict):
                msg = kis_data.get("msg1", kis_data.get("msg", ""))
            if not msg:
                msg = str(mcp_error) if mcp_error else "Unknown error"
            await execute_query(
                "UPDATE orders SET status='rejected', reason=?, mcp_result_json=? WHERE id=?",
                (msg, json.dumps(result, ensure_ascii=False)[:2000], order_id),
            )
            logger.warning(f"Order REJECTED: {side} {quantity}x {stock_code} — {msg}")
            return {
                "success": False,
                "order_id": order_id,
                "status": "rejected",
                "error": msg,
                "result": result,
            }

    except Exception as e:
        await execute_query(
            "UPDATE orders SET status='rejected', reason=? WHERE id=?",
            (str(e)[:500], order_id),
        )
        logger.error(f"Order ERROR: {side} {quantity}x {stock_code} — {e}")
        return {
            "success": False,
            "order_id": order_id,
            "status": "rejected",
            "error": str(e),
        }


def _unwrap_mcp_response(raw: Any) -> Any:
    """Unwrap the MCP double-wrapped response structure."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(data, dict) and "data" in data:
            inner = data["data"]
            if isinstance(inner, dict) and "data" in inner:
                inner_data = inner["data"]
                if isinstance(inner_data, str):
                    return json.loads(inner_data)
                return inner_data
            if isinstance(inner, str):
                return json.loads(inner)
            return inner
        return data
    except (json.JSONDecodeError, TypeError):
        return raw


def _parse_dict(raw: Any) -> dict[str, Any]:
    """Parse MCP response into a dict."""
    try:
        data = _unwrap_mcp_response(raw)
        return data if isinstance(data, dict) else {"raw": str(raw)[:500]}
    except (json.JSONDecodeError, TypeError):
        return {"raw": str(raw)[:500]}
