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
                "fid_div_cls_code": "0",
                "fid_rsfl_rate1": "",
                "fid_rsfl_rate2": "",
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
    from datetime import date, timedelta
    today = date.today().strftime("%Y%m%d")
    start = (date.today() - timedelta(days=90)).strftime("%Y%m%d")
    raw = await mcp_manager.call_tool(
        "domestic_stock",
        {
            "api_type": "inquire_daily_itemchartprice",
            "params": {
                "env_dv": "demo",
                "fid_cond_mrkt_div_code": "J",
                "fid_input_iscd": stock_code,
                "fid_input_date_1": start,
                "fid_input_date_2": today,
                "fid_period_div_code": period,
                "fid_org_adj_prc": "0",
            },
        },
    )
    # chart price returns output2 (daily OHLCV list), not output/output1
    try:
        data = _unwrap_mcp_response(raw)
        if isinstance(data, dict):
            for key in ("output2", "output", "output1"):
                if key in data and isinstance(data[key], list):
                    return data[key][:30]
        return []
    except Exception:
        return []


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
                    # Strip "The End\n" prefix produced by some KIS API wrappers
                    cleaned = inner_data.strip()
                    if cleaned.startswith("The End"):
                        newline_pos = cleaned.find("\n")
                        cleaned = cleaned[newline_pos + 1:] if newline_pos != -1 else cleaned
                    return json.loads(cleaned)
                return inner_data
            if isinstance(inner, str):
                return json.loads(inner)
            return inner
        return data
    except (json.JSONDecodeError, TypeError):
        return raw


async def get_kospi200_components() -> list[str]:
    """KOSPI200 구성 종목 코드 반환. DB 캐시 우선, 없으면 NAVER Finance 스크래핑."""
    # 캐시 확인 (오늘 업데이트된 데이터)
    cached = await execute_query(
        "SELECT stock_code FROM kospi200_components WHERE date(updated_at) >= date('now')"
    )
    if cached:
        return [row["stock_code"] for row in cached]

    # NAVER Finance에서 KOSPI200 구성종목 스크래핑 (동기 → executor)
    try:
        loop = asyncio.get_event_loop()
        codes_names = await loop.run_in_executor(None, _fetch_kospi200_via_naver)
    except Exception as e:
        logger.warning(f"NAVER KOSPI200 조회 실패: {e}")
        codes_names = {}

    if not codes_names:
        # 실패 시 캐시된 데이터 fallback (날짜 무관)
        fallback = await execute_query("SELECT stock_code FROM kospi200_components")
        return [row["stock_code"] for row in fallback] if fallback else []

    # DB에 upsert
    for code, name in codes_names.items():
        await execute_insert(
            """INSERT OR REPLACE INTO kospi200_components (stock_code, stock_name, updated_at)
               VALUES (?, ?, datetime('now'))""",
            (code, name),
        )

    logger.info(f"KOSPI200 구성종목 {len(codes_names)}개 NAVER Finance에서 갱신")
    return list(codes_names.keys())


def _fetch_kospi200_via_naver() -> dict[str, str]:
    """NAVER Finance에서 KOSPI200 구성종목 코드·종목명 반환 (동기 함수).

    NAVER Finance는 별도 인증 없이 접근 가능하며 항상 최신 구성 정보를 제공한다.
    Returns:
        {종목코드: 종목명} dict
    """
    import re
    import requests

    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0"
    session.get("https://finance.naver.com/")

    codes: dict[str, str] = {}
    for page in range(1, 25):
        resp = session.get(
            "https://finance.naver.com/sise/entryJongmok.naver",
            params={"indCode": "KPI200", "page": str(page)},
            timeout=10,
        )
        pairs = re.findall(r"item/main\.naver\?code=(\d{6})[^>]*>([^<]+)", resp.text)
        if not pairs:
            break
        for code, name in pairs:
            codes[code] = name.strip()

    return codes


async def get_batch_charts(
    stock_codes: list[str], period: str = "D"
) -> dict[str, list[dict]]:
    """여러 종목의 일봉 차트를 순차 수집.

    Note: fastmcp SSE 클라이언트가 단일 세션에서 동시 호출을 지원하지 않아
    asyncio.gather 대신 순차 호출을 사용한다.
    """
    results = {}
    for code in stock_codes:
        try:
            data = await get_daily_chart(code, period)
            results[code] = data
        except Exception as e:
            logger.warning(f"Chart fetch failed for {code}: {e}")
            results[code] = []
    return results


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
