"""Market data service — wraps MCP market data tools for agent use."""

import json
import logging
from typing import Any

from app.services.mcp_client import mcp_manager

logger = logging.getLogger(__name__)


async def get_volume_rank(count: int = 20) -> list[dict]:
    """Fetch top volume stocks from KIS via MCP."""
    raw = await mcp_manager.call_tool(
        "domestic_stock",
        {
            "api_type": "volume_rank",
            "params": {
                "env_dv": "demo",
                "fid_cond_mrkt_div_code": "J",
                "fid_input_iscd": "0000",
                "fid_cond_scr_div_code": "20171",
                "fid_div_cls_code": "0",
                "fid_blng_cls_code": "0",
                "fid_trgt_cls_code": "111111111",
                "fid_trgt_exls_cls_code": "000000",
                "fid_input_price_1": "",
                "fid_input_price_2": "",
                "fid_vol_cnt": "",
                "fid_input_date_1": "",
            },
        },
    )
    return _parse_list_response(raw, count)


async def get_fluctuation_rank(count: int = 20) -> list[dict]:
    """Fetch top fluctuation (등락률) stocks."""
    raw = await mcp_manager.call_tool(
        "domestic_stock",
        {
            "api_type": "fluctuation",
            "params": {
                "env_dv": "demo",
                "fid_cond_mrkt_div_code": "J",
                "fid_input_iscd": "0000",
                "fid_cond_scr_div_code": "20170",
                "fid_rank_sort_cls_code": "0",
                "fid_input_cnt_1": "0",
                "fid_prc_cls_code": "0",
                "fid_input_price_1": "",
                "fid_input_price_2": "",
                "fid_vol_cnt": "",
                "fid_trgt_cls_code": "0",
                "fid_trgt_exls_cls_code": "0",
            },
        },
    )
    return _parse_list_response(raw, count)


async def get_stock_price(stock_code: str) -> dict[str, Any]:
    """Fetch current price for a stock."""
    raw = await mcp_manager.call_tool(
        "domestic_stock",
        {
            "api_type": "inquire_price",
            "params": {
                "env_dv": "demo",
                "fid_cond_mrkt_div_code": "J",
                "fid_input_iscd": stock_code,
            },
        },
    )
    try:
        data = _unwrap_mcp_response(raw)
        if isinstance(data, dict):
            output = data.get("output", data)
            return output
        return {"raw": raw}
    except (json.JSONDecodeError, TypeError):
        return {"raw": str(raw)[:500]}


async def get_daily_chart(stock_code: str, period: str = "D") -> list[dict]:
    """Fetch daily price chart data."""
    raw = await mcp_manager.call_tool(
        "domestic_stock",
        {
            "api_type": "inquire_daily_itemchartprice",
            "params": {
                "env_dv": "demo",
                "fid_cond_mrkt_div_code": "J",
                "fid_input_iscd": stock_code,
                "fid_period_div_code": period,
                "fid_org_adj_prc": "0",
            },
        },
    )
    return _parse_list_response(raw, 30)


def _unwrap_mcp_response(raw: Any) -> Any:
    """Unwrap the MCP double-wrapped response structure.

    MCP returns: {"ok": true, "data": {"data": "JSON_STRING", ...}}
    This extracts the inner KIS API data.
    """
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


def _parse_list_response(raw: Any, limit: int = 20) -> list[dict]:
    """Parse MCP list response into list of dicts."""
    try:
        data = _unwrap_mcp_response(raw)
        if isinstance(data, list):
            return data[:limit]
        if isinstance(data, dict):
            # Try common KIS output structures
            for key in ("output", "output1"):
                if key in data and isinstance(data[key], list):
                    return data[key][:limit]
        return []
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning(f"Failed to parse market response: {e}")
        return []
