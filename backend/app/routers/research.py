"""Stock research API — user-driven stock information lookup."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.services.market_service import (
    get_daily_chart,
    get_fluctuation_rank,
    get_investor_trend,
    get_stock_price,
    get_volume_rank,
)
from app.services.mcp_client import mcp_manager
from app.services.technical_service import compute_technicals

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/research", tags=["research"])

# ── simple in-memory cache for ranks (5-min TTL) ───────────────────────
_ranks_cache: dict[str, Any] = {"data": None, "ts": 0.0}
_RANKS_TTL = 300  # seconds


@router.get("/search")
async def search_stocks(q: str = Query(..., min_length=2)):
    """Search stocks by name or code via MCP find_stock_code.

    MCP find_stock_code expects {"stock_name": "..."} and returns a single
    match: {"ok": True, "data": {"stock_code": "...", "stock_name_found": "..."}}.
    We wrap the single result into a list for the frontend.
    """
    try:
        raw = await mcp_manager.call_tool(
            "domestic_stock",
            {"api_type": "find_stock_code", "params": {"stock_name": q}},
        )
        import json as _json

        # Parse MCP response — may be CallToolResult, str, or dict
        if isinstance(raw, str):
            try:
                data = _json.loads(raw)
            except (_json.JSONDecodeError, TypeError):
                data = {}
        elif hasattr(raw, "content"):
            text = raw.content if isinstance(raw.content, str) else raw.content[0].text
            try:
                data = _json.loads(text)
            except (_json.JSONDecodeError, TypeError):
                data = {}
        elif isinstance(raw, dict):
            data = raw
        else:
            data = {}

        results = []

        # MCP returns {"ok": True, "data": {"stock_code": ..., "stock_name_found": ...}}
        if isinstance(data, dict) and data.get("ok"):
            inner = data.get("data", {})
            if inner.get("found") and inner.get("stock_code"):
                results.append({
                    "stock_code": inner["stock_code"],
                    "stock_name": inner.get("stock_name_found", q),
                    "market": inner.get("ex", ""),
                })
        # Fallback: if data is a list (future-proofing)
        elif isinstance(data, list):
            for item in data[:20]:
                if isinstance(item, dict):
                    results.append({
                        "stock_code": item.get("stock_code", item.get("code", "")),
                        "stock_name": item.get("stock_name", item.get("name", "")),
                        "market": item.get("market", ""),
                    })

        return {"results": results}
    except Exception as e:
        logger.warning(f"Stock search failed for q={q}: {e}")
        return {"results": []}


@router.get("/ranks")
async def get_market_ranks():
    """Market rankings for discovery sidebar (5-min cache)."""
    now = time.time()
    if _ranks_cache["data"] and now - _ranks_cache["ts"] < _RANKS_TTL:
        return _ranks_cache["data"]

    volume, fluctuation = await asyncio.gather(
        get_volume_rank(20),
        get_fluctuation_rank(20),
    )
    result = {"volume_rank": volume, "fluctuation_rank": fluctuation}
    _ranks_cache["data"] = result
    _ranks_cache["ts"] = now
    return result


@router.get("/{stock_code}/price")
async def get_price(stock_code: str):
    """Realtime price for a stock."""
    data = await get_stock_price(stock_code)
    if not data:
        raise HTTPException(status_code=404, detail="Price data not found")
    return data


@router.get("/{stock_code}/analysis")
async def get_analysis(stock_code: str):
    """Comprehensive analysis: chart + technicals + fundamentals + investor + insider + DCF."""
    from app.services.dart_client import dart_client
    from app.services.valuation_service import get_or_compute_dcf

    price_data = await get_stock_price(stock_code)
    current_price = float(price_data.get("stck_prpr", 0)) if price_data else 0

    chart_task = get_daily_chart(stock_code)
    dart_task = dart_client.fetch(stock_code, current_price)
    investor_task = get_investor_trend(stock_code)
    insider_task = dart_client.fetch_insider_trades(stock_code)
    dcf_task = get_or_compute_dcf(stock_code, dart_client)

    chart, dart_result, investor, insider, dcf = await asyncio.gather(
        chart_task, dart_task, investor_task, insider_task, dcf_task,
        return_exceptions=True,
    )

    chart_data = chart if isinstance(chart, list) else []
    sorted_chart = list(reversed(chart_data)) if chart_data else []
    technicals = compute_technicals(sorted_chart)

    dart_dict = dart_result if isinstance(dart_result, dict) else {}
    fundamentals = dart_dict.get("financials")
    confidence_grades = dart_dict.get("confidence_grades", {})

    return {
        "chart": chart_data,
        "technicals": technicals,
        "fundamentals": fundamentals,
        "confidence_grades": confidence_grades,
        "investor_trend": investor if isinstance(investor, dict) else {},
        "insider_trades": insider if isinstance(insider, list) else [],
        "dcf": dcf if isinstance(dcf, dict) else None,
    }


@router.get("/{stock_code}/news")
async def get_news(stock_code: str, stock_name: str = Query("", description="Stock name for news search")):
    """News headlines + DART disclosures."""
    from app.services.calendar_service import fetch_dart_disclosures
    from app.services.news_service import fetch_stock_news

    search_name = stock_name or stock_code

    news_result, disclosures = await asyncio.gather(
        fetch_stock_news(search_name, stock_code),
        fetch_dart_disclosures(stock_code),
        return_exceptions=True,
    )

    return {
        "news": news_result if isinstance(news_result, dict) else {"headlines": [], "sentiment": "neutral"},
        "disclosures": disclosures if isinstance(disclosures, list) else [],
    }
