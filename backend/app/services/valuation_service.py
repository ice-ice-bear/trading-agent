"""DCF 밸류에이션 서비스"""
import json
import logging
from app.models.db import execute_query, execute_insert

logger = logging.getLogger(__name__)

DEFAULT_WACC = 0.10
DEFAULT_GROWTH = 0.03
PROJECTION_YEARS = 5


def compute_dcf(free_cash_flow: float, shares_outstanding: int,
                wacc: float = DEFAULT_WACC, growth_rate: float = DEFAULT_GROWTH,
                terminal_growth: float = 0.02) -> dict:
    if not free_cash_flow or free_cash_flow <= 0 or not shares_outstanding:
        return {"error": "FCF 또는 주식수 데이터 부족", "fair_value": None}

    projected_fcf = []
    fcf = free_cash_flow
    total_pv = 0
    for yr in range(1, PROJECTION_YEARS + 1):
        fcf *= (1 + growth_rate)
        pv = fcf / ((1 + wacc) ** yr)
        projected_fcf.append({"year": yr, "fcf": round(fcf), "pv": round(pv)})
        total_pv += pv

    terminal_fcf = fcf * (1 + terminal_growth)
    terminal_value = terminal_fcf / (wacc - terminal_growth)
    terminal_pv = terminal_value / ((1 + wacc) ** PROJECTION_YEARS)

    enterprise_value = total_pv + terminal_pv
    fair_value_per_share = enterprise_value / shares_outstanding

    return {
        "fair_value": round(fair_value_per_share),
        "enterprise_value": round(enterprise_value),
        "assumptions": {"wacc": wacc, "growth_rate": growth_rate, "terminal_growth": terminal_growth},
        "projected_fcf": projected_fcf,
    }


def compute_sensitivity_table(free_cash_flow: float, shares_outstanding: int) -> list[list]:
    wacc_range = [0.08, 0.10, 0.12]
    growth_range = [0.02, 0.03, 0.05]
    table = []
    for w in wacc_range:
        row = []
        for g in growth_range:
            result = compute_dcf(free_cash_flow, shares_outstanding, wacc=w, growth_rate=g)
            row.append(result.get("fair_value"))
        table.append(row)
    return table


async def get_or_compute_dcf(stock_code: str, dart_client) -> dict | None:
    cached = await execute_query(
        "SELECT dcf_result_json FROM valuation_cache WHERE stock_code = ? AND cache_date = date('now')",
        (stock_code,)
    )
    if cached:
        try:
            return json.loads(cached[0]["dcf_result_json"])
        except (json.JSONDecodeError, TypeError):
            pass

    cf_data = await dart_client.fetch_cash_flow(stock_code)
    if not cf_data or not cf_data.get("free_cash_flow"):
        return None

    corp_code = await dart_client._get_corp_code(stock_code)
    shares = await dart_client._fetch_share_count(corp_code, cf_data["year"]) if corp_code else None
    if not shares:
        return None

    result = compute_dcf(cf_data["free_cash_flow"], shares)
    if result.get("fair_value"):
        result["sensitivity"] = compute_sensitivity_table(cf_data["free_cash_flow"], shares)
        result["cash_flow_data"] = cf_data

    await execute_insert(
        "INSERT OR REPLACE INTO valuation_cache (stock_code, cache_date, dcf_result_json) VALUES (?, date('now'), ?)",
        (stock_code, json.dumps(result, ensure_ascii=False))
    )

    return result
