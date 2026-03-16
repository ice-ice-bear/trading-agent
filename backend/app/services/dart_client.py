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

    async def fetch(self, stock_code: str) -> dict:
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

            # Fetch from DART API
            year = str(datetime.now().year - 1)  # use prior year for complete data
            financials = await self._fetch_financials(corp_code, year)
            dividend = await self._fetch_dividend(corp_code, year)

            if financials:
                financials["dart_dividend_yield"] = dividend
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
                stock_code = corp.get("stock_code", "").strip()
                corp_code = corp.get("corp_code", "").strip()
                corp_name = corp.get("corp_name", "").strip()
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

            items = {item["account_nm"]: item for item in data.get("list", [])}
            return self._parse_financials(items)

        except Exception as e:
            logger.warning(f"DART fnlttSinglAcntAll failed for {corp_code}: {e}")
            return None

    def _parse_financials(self, items: dict) -> dict:
        def _num(key: str) -> float | None:
            item = items.get(key)
            if not item:
                return None
            val_str = item.get("thstrm_amount", "").replace(",", "")
            try:
                return float(val_str)
            except (ValueError, TypeError):
                return None

        revenue = _num("매출액")
        op_profit = _num("영업이익")
        net_profit = _num("당기순이익")

        operating_margin = (
            (op_profit / revenue * 100) if revenue and op_profit else None
        )

        return {
            "dart_revenue": revenue,
            "dart_operating_profit": op_profit,
            "dart_net_profit": net_profit,
            "dart_per": _num("주당순이익(PER)"),
            "dart_pbr": _num("주당순자산(PBR)"),
            "dart_eps_yoy_pct": None,   # requires prior year — set to None for now
            "dart_debt_ratio": _num("부채비율"),
            "dart_operating_margin": operating_margin,
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
