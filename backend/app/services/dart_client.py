# backend/app/services/dart_client.py
"""
DartClient — wraps DART OpenAPI (opendart.fss.or.kr).

Corp code cache: SQLite dart_corp_codes table, TTL 30 days.
Financials cache: SQLite dart_financials_cache table, TTL 1 calendar day.
All fetch failures → grade D (hard gate upstream will reject the signal).
"""
import asyncio
import io
import json
import logging
import zipfile
from datetime import datetime, timedelta

import httpx
import xmltodict  # type: ignore

from app.config import settings
from app.models.db import execute_insert, execute_query

logger = logging.getLogger(__name__)

_DART_BASE = "https://opendart.fss.or.kr/api"
_CORP_CODE_TTL_DAYS = 30


class DartClient:
    def __init__(self) -> None:
        self.enabled: bool = bool(settings.dart_api_key)
        self._api_key: str | None = settings.dart_api_key

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Call from lifespan() — refreshes corp code cache if stale."""
        if not self.enabled:
            logger.info("DartClient disabled (no DART_API_KEY)")
            return
        await self._refresh_corp_codes_if_stale()

    async def fetch(self, stock_code: str, current_price: float = 0) -> dict:
        """
        Fetch DART fundamentals for a stock.

        Returns:
            {
                "enabled": bool,
                "financials": dict | None,
                "confidence_grades": dict[str, str],
            }
        """
        _grade_d = {
            "dart_revenue": "D",
            "dart_operating_profit": "D",
            "dart_per": "D",
            "dart_pbr": "D",
            "dart_eps_yoy_pct": "D",
            "dart_debt_ratio": "D",
            "dart_operating_margin": "D",
            "dart_dividend_yield": "D",
        }

        if not self.enabled:
            return {"enabled": False, "financials": None, "confidence_grades": _grade_d}

        try:
            # Check daily cache first
            cached = await self._get_cached_financials(stock_code)
            if cached:
                return self._build_result(cached, enabled=True)

            # Corp code lookup
            corp_code = await self._get_corp_code(stock_code)
            if not corp_code:
                logger.warning(f"No DART corp code for {stock_code}")
                return {"enabled": True, "financials": None, "confidence_grades": _grade_d}

            # Fetch from DART API — try year-1 first, fall back to year-2
            # (annual reports for year N are typically filed by April of year N+1)
            year = datetime.now().year - 1
            financials = await self._fetch_financials(corp_code, str(year))
            if not financials:
                financials = await self._fetch_financials(corp_code, str(year - 1))
                year = year - 1
            dividend = await self._fetch_dividend(corp_code, str(year))

            if financials:
                financials["dart_dividend_yield"] = dividend

                # Compute PBR if we have equity, share count, and current price
                total_equity = financials.pop("_total_equity", None)
                if total_equity and current_price > 0:
                    shares = await self._fetch_share_count(corp_code, str(year))
                    if shares and shares > 0:
                        bps = total_equity / shares
                        financials["dart_pbr"] = round(current_price / bps, 2)

                await self._cache_financials(stock_code, financials)
                return self._build_result(financials, enabled=True)

            return {"enabled": True, "financials": None, "confidence_grades": _grade_d}

        except Exception as e:
            logger.error(f"DartClient.fetch({stock_code}) failed: {e}")
            return {"enabled": True, "financials": None, "confidence_grades": _grade_d}

    # ------------------------------------------------------------------
    # Internal — corp code cache
    # ------------------------------------------------------------------

    async def _get_corp_code(self, stock_code: str) -> str | None:
        rows = await execute_query(
            "SELECT corp_code FROM dart_corp_codes WHERE stock_code = ?",
            (stock_code,),
        )
        return rows[0]["corp_code"] if rows else None

    async def _refresh_corp_codes_if_stale(self) -> None:
        rows = await execute_query(
            "SELECT MAX(cached_at) as last FROM dart_corp_codes"
        )
        last_str = rows[0]["last"] if rows and rows[0]["last"] else None
        if last_str:
            last = datetime.fromisoformat(last_str)
            if datetime.now() - last < timedelta(days=_CORP_CODE_TTL_DAYS):
                return  # cache is fresh

        logger.info("Refreshing DART corp code cache...")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_DART_BASE}/corpCode.xml",
                    params={"crtfc_key": self._api_key},
                )
                resp.raise_for_status()

            with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
                xml_bytes = zf.read("CORPCODE.xml")

            data = xmltodict.parse(xml_bytes)
            corps = data.get("result", {}).get("list", [])
            now = datetime.now().isoformat()

            for corp in corps:
                stock_code = (corp.get("stock_code") or "").strip()
                corp_code = (corp.get("corp_code") or "").strip()
                corp_name = (corp.get("corp_name") or "").strip()
                if stock_code and corp_code:
                    await execute_insert(
                        """INSERT OR REPLACE INTO dart_corp_codes
                           (stock_code, corp_code, corp_name, cached_at)
                           VALUES (?, ?, ?, ?)""",
                        (stock_code, corp_code, corp_name, now),
                    )
            logger.info(f"DART corp code cache refreshed ({len(corps)} entries)")

        except Exception as e:
            logger.error(f"Failed to refresh DART corp codes: {e}")

    # ------------------------------------------------------------------
    # Internal — financials fetch and cache
    # ------------------------------------------------------------------

    async def _get_cached_financials(self, stock_code: str) -> dict | None:
        today = datetime.now().strftime("%Y-%m-%d")
        rows = await execute_query(
            "SELECT financials_json FROM dart_financials_cache WHERE stock_code=? AND cache_date=?",
            (stock_code, today),
        )
        if rows:
            return json.loads(rows[0]["financials_json"])
        return None

    async def _cache_financials(self, stock_code: str, financials: dict) -> None:
        today = datetime.now().strftime("%Y-%m-%d")
        await execute_insert(
            """INSERT OR REPLACE INTO dart_financials_cache
               (stock_code, cache_date, financials_json) VALUES (?, ?, ?)""",
            (stock_code, today, json.dumps(financials, ensure_ascii=False)),
        )

    async def _fetch_financials(self, corp_code: str, year: str) -> dict | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{_DART_BASE}/fnlttSinglAcntAll.json",
                    params={
                        "crtfc_key": self._api_key,
                        "corp_code": corp_code,
                        "bsns_year": year,
                        "reprt_code": "11011",  # annual report
                        "fs_div": "CFS",        # consolidated
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            if data.get("status") != "000":
                return None

            # Prefer Balance Sheet (BS) and Income Statement (IS) entries over
            # Statement of Changes in Equity (SCE) — first-wins dedup ensures
            # 자본총계/부채총계 come from 재무상태표, not 자본변동표
            items: dict = {}
            for item in data.get("list", []):
                nm = item["account_nm"]
                if nm not in items:
                    items[nm] = item
            return self._parse_financials(items)

        except Exception as e:
            logger.warning(f"DART fnlttSinglAcntAll failed for {corp_code}: {e}")
            return None

    def _parse_financials(self, items: dict) -> dict:
        def _num(key: str, field: str = "thstrm_amount") -> float | None:
            item = items.get(key)
            if not item:
                return None
            val_str = (item.get(field) or "").replace(",", "")
            try:
                return float(val_str)
            except (ValueError, TypeError):
                return None

        def _num_first(*keys: str, field: str = "thstrm_amount") -> float | None:
            """Try multiple field names, return first non-None value."""
            for key in keys:
                val = _num(key, field)
                if val is not None:
                    return val
            return None

        # EPS field name candidates (varies by industry)
        _eps_keys = (
            "기본주당이익", "기본주당이익(손실)",
            "보통주기본주당이익", "보통주기본주당이익(손실)",
            "계속영업기본주당이익(손실)",
        )

        # DART field names vary by industry:
        #   Manufacturing: 매출액, 영업이익, 기본주당이익
        #   Insurance:     보험수익, 영업이익, 보통주기본주당이익
        #   Construction:  매출액, 영업이익(손실), 기본주당이익(손실)
        #   Others:        수익(매출액), 영업이익(손실), 계속영업기본주당이익(손실)
        revenue = _num_first("매출액", "수익(매출액)", "영업수익", "보험수익", "보험영업수익")
        op_profit = _num_first("영업이익", "영업이익(손실)")
        net_profit = _num_first("당기순이익", "당기순이익(손실)")
        total_debt = _num("부채총계")
        total_equity = _num("자본총계")

        operating_margin = (
            (op_profit / revenue * 100) if revenue and op_profit else None
        )

        eps = _num_first(*_eps_keys)

        # EPS YoY: compare current year vs prior year (frmtrm_amount)
        eps_prior = _num_first(*_eps_keys, field="frmtrm_amount")
        eps_yoy_pct = None
        if eps is not None and eps_prior is not None and eps_prior != 0:
            eps_yoy_pct = round((eps - eps_prior) / abs(eps_prior) * 100, 1)

        # Debt ratio = 부채총계 / 자본총계 * 100
        debt_ratio = (
            (total_debt / total_equity * 100)
            if total_debt is not None and total_equity
            else None
        )

        return {
            "dart_revenue": revenue,
            "dart_operating_profit": op_profit,
            "dart_net_profit": net_profit,
            "dart_per": eps,  # EPS — PER requires market price
            "dart_pbr": None,  # computed in fetch() after share count lookup
            "dart_eps_yoy_pct": eps_yoy_pct,
            "dart_debt_ratio": debt_ratio,
            "dart_operating_margin": operating_margin,
            "_total_equity": total_equity,  # used for PBR calculation
        }

    async def _fetch_dividend(self, corp_code: str, year: str) -> float | None:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{_DART_BASE}/alotMatter.json",
                    params={"crtfc_key": self._api_key, "corp_code": corp_code, "bsns_year": year},
                )
                resp.raise_for_status()
                data = resp.json()
            items = data.get("list", [])
            if items:
                yield_str = items[0].get("dvd_rtng", "").replace(",", "")
                return float(yield_str) if yield_str else None
        except Exception:
            return None
        return None  # items list was empty

    async def _fetch_share_count(self, corp_code: str, year: str) -> int | None:
        """Fetch outstanding share count (보통주 발행주식총수) from DART."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{_DART_BASE}/stockTotqySttus.json",
                    params={
                        "crtfc_key": self._api_key,
                        "corp_code": corp_code,
                        "bsns_year": year,
                        "reprt_code": "11011",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            if data.get("status") != "000":
                return None
            for item in data.get("list", []):
                if item.get("se") == "보통주":
                    qty_str = (item.get("istc_totqy") or "").replace(",", "")
                    return int(qty_str) if qty_str else None
        except Exception:
            return None
        return None

    async def fetch_cash_flow(self, stock_code: str) -> dict | None:
        """DART 현금흐름표 조회"""
        if not self.enabled:
            return None
        corp_code = await self._get_corp_code(stock_code)
        if not corp_code:
            return None

        year = str(datetime.now().year - 1)
        try:
            params = {
                "crtfc_key": self._api_key,
                "corp_code": corp_code,
                "bsns_year": year,
                "reprt_code": "11011",
                "fs_div": "CFS",
            }
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json",
                    params=params,
                    timeout=15,
                )
                data = resp.json()

            if data.get("status") != "000":
                return None

            items = {}
            for item in data.get("list", []):
                nm = item.get("account_nm", "")
                if nm not in items:
                    items[nm] = item

            def parse_amt(name):
                item = items.get(name)
                if not item:
                    return None
                val = item.get("thstrm_amount", "").replace(",", "")
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return None

            op_cf = parse_amt("영업활동현금흐름") or parse_amt("영업활동으로인한현금흐름")
            capex = abs(parse_amt("유형자산의 취득") or parse_amt("유형자산취득") or 0)

            return {
                "operating_cash_flow": op_cf,
                "capex": capex,
                "free_cash_flow": (op_cf - capex) if op_cf else None,
                "year": year,
            }
        except Exception as e:
            logger.warning(f"Cash flow fetch failed for {stock_code}: {e}")
            return None

    async def fetch_insider_trades(self, stock_code: str, limit: int = 5) -> list[dict]:
        """DART 임원 주요주주 특정증권등 소유상황 보고서 조회"""
        if not self.enabled:
            return []

        corp_code = await self._get_corp_code(stock_code)
        if not corp_code:
            return []

        try:
            params = {
                "crtfc_key": self._api_key,
                "corp_code": corp_code,
            }
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://opendart.fss.or.kr/api/elestock.json",
                    params=params,
                    timeout=10,
                )
                data = resp.json()

            if data.get("status") != "000":
                return []

            trades = []
            for item in data.get("list", [])[:limit]:
                shares_before = int(item.get("sp_stock_lmp_cnt", 0) or 0)
                shares_after = int(item.get("sp_stock_lmp_irds_cnt", 0) or 0)
                trades.append({
                    "reporter_name": item.get("repror", ""),
                    "position": item.get("isu_exctv_rgist_at", ""),
                    "change_type": item.get("rcv_dl_srtnm", ""),
                    "shares_before": shares_before,
                    "shares_after": shares_after,
                    "change_amount": shares_after - shares_before,
                    "report_date": item.get("rcept_dt", ""),
                })
            return trades
        except Exception as e:
            logger.warning(f"Insider trades fetch failed for {stock_code}: {e}")
            return []

    # ------------------------------------------------------------------
    # Internal — result builder
    # ------------------------------------------------------------------

    def _build_result(self, financials: dict, enabled: bool) -> dict:
        grades: dict[str, str] = {}
        dart_a_fields = [
            "dart_revenue", "dart_operating_profit", "dart_per",
            "dart_pbr", "dart_debt_ratio", "dart_operating_margin",
        ]
        for field in dart_a_fields:
            grades[field] = "A" if financials.get(field) is not None else "D"

        if financials.get("dart_eps_yoy_pct") is not None:
            grades["dart_eps_yoy_pct"] = "A"
        else:
            grades["dart_eps_yoy_pct"] = "C"  # single-year data only

        if financials.get("dart_dividend_yield") is not None:
            grades["dart_dividend_yield"] = "B"
        else:
            grades["dart_dividend_yield"] = "C"

        return {"enabled": enabled, "financials": financials, "confidence_grades": grades}


# Module-level singleton
dart_client = DartClient()
