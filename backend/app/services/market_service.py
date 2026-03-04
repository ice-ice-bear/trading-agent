"""Market data service — wraps MCP market data tools for agent use."""

import asyncio
import json
import logging
from typing import Any

from app.models.db import execute_insert, execute_query
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


async def get_kospi200_components() -> list[str]:
    """KOSPI200 구성 종목 코드 반환. DB 캐시 우선, 없으면 KIS API 조회."""
    # 캐시 확인 (오늘 업데이트된 데이터)
    cached = await execute_query(
        "SELECT stock_code FROM kospi200_components WHERE date(updated_at) >= date('now')"
    )
    if cached:
        return [row["stock_code"] for row in cached]

    # KIS API로 KOSPI200 구성 종목 조회
    raw = await mcp_manager.call_tool(
        "domestic_stock",
        {
            "api_type": "inquire_index_components",
            "params": {
                "env_dv": "demo",
                "fid_cond_mrkt_div_code": "U",
                "fid_input_iscd": "0002",  # KOSPI200 index code
            },
        },
    )

    components = _parse_list_response(raw, 300)
    if not components:
        # API 실패 시 캐시된 데이터 fallback (날짜 무관)
        fallback = await execute_query("SELECT stock_code FROM kospi200_components")
        return [row["stock_code"] for row in fallback] if fallback else []

    # DB에 upsert
    codes = []
    for item in components:
        code = item.get("stck_shrn_iscd") or item.get("stock_code", "")
        name = item.get("hts_kor_isnm") or item.get("stock_name", "")
        if code:
            await execute_insert(
                """INSERT OR REPLACE INTO kospi200_components (stock_code, stock_name, updated_at)
                   VALUES (?, ?, datetime('now'))""",
                (code, name),
            )
            codes.append(code)

    return codes


async def get_batch_charts(
    stock_codes: list[str], period: str = "D"
) -> dict[str, list[dict]]:
    """여러 종목의 일봉 차트를 asyncio.gather로 병렬 수집."""

    async def safe_chart(code: str) -> tuple[str, list[dict]]:
        try:
            data = await get_daily_chart(code, period)
            return code, data
        except Exception as e:
            logger.warning(f"Chart fetch failed for {code}: {e}")
            return code, []

    results = await asyncio.gather(*[safe_chart(code) for code in stock_codes])
    return dict(results)


def parse_ohlcv_from_chart(chart_data: list[dict]) -> dict[str, list[float]]:
    """KIS 일봉 차트 응답을 OHLCV dict로 변환."""
    closes, highs, lows, volumes = [], [], [], []
    for day in reversed(chart_data):  # 오래된 날짜 → 최신 순서
        try:
            closes.append(float(day.get("stck_clpr") or day.get("close", 0)))
            highs.append(float(day.get("stck_hgpr") or day.get("high", 0)))
            lows.append(float(day.get("stck_lwpr") or day.get("low", 0)))
            volumes.append(float(day.get("acml_vol") or day.get("volume", 0)))
        except (ValueError, TypeError):
            continue
    return {"closes": closes, "highs": highs, "lows": lows, "volumes": volumes}


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
