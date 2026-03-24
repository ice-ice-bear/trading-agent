"""촉매 일정 서비스 — DART 공시 + 정기 이벤트"""
import logging
import httpx
from datetime import datetime, timedelta
from app.models.db import execute_query, execute_insert
from app.services.dart_client import dart_client

logger = logging.getLogger(__name__)

REGULAR_EVENTS = [
    {"event_type": "earnings", "description": "1분기 실적 공시 마감", "month": 5, "day": 15},
    {"event_type": "earnings", "description": "반기 실적 공시 마감", "month": 8, "day": 14},
    {"event_type": "earnings", "description": "3분기 실적 공시 마감", "month": 11, "day": 14},
    {"event_type": "earnings", "description": "연간 실적 공시 마감", "month": 3, "day": 31},
]


async def get_catalyst_events(stock_code: str | None = None, days_ahead: int = 30) -> list[dict]:
    events = []

    if stock_code:
        rows = await execute_query(
            "SELECT * FROM catalyst_events WHERE stock_code = ? AND event_date >= date('now') ORDER BY event_date",
            (stock_code,)
        )
    else:
        rows = await execute_query(
            "SELECT * FROM catalyst_events WHERE event_date >= date('now') AND event_date <= date('now', ?) ORDER BY event_date",
            (f"+{days_ahead} days",)
        )
    events.extend([dict(r) for r in (rows or [])])

    today = datetime.now()
    for ev in REGULAR_EVENTS:
        try:
            ev_date = datetime(today.year, ev["month"], ev["day"])
            if ev_date < today:
                ev_date = datetime(today.year + 1, ev["month"], ev["day"])
            if (ev_date - today).days <= days_ahead:
                events.append({
                    "stock_code": None,
                    "event_type": ev["event_type"],
                    "event_date": ev_date.strftime("%Y-%m-%d"),
                    "description": ev["description"],
                    "source": "calendar",
                })
        except ValueError:
            pass

    events.sort(key=lambda e: e.get("event_date", ""))
    return events


async def fetch_dart_disclosures(stock_code: str, days_back: int = 30) -> list[dict]:
    if not dart_client.enabled:
        return []

    corp_code = await dart_client._get_corp_code(stock_code)
    if not corp_code:
        return []

    try:
        params = {
            "crtfc_key": dart_client._api_key,
            "corp_code": corp_code,
            "bgn_de": (datetime.now() - timedelta(days=days_back)).strftime("%Y%m%d"),
            "end_de": datetime.now().strftime("%Y%m%d"),
            "page_count": "10",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://opendart.fss.or.kr/api/list.json", params=params, timeout=10)
            data = resp.json()

        if data.get("status") != "000":
            return []

        results = []
        for item in data.get("list", []):
            rcept_dt = item.get("rcept_dt", "")
            event_date = f"{rcept_dt[:4]}-{rcept_dt[4:6]}-{rcept_dt[6:8]}" if len(rcept_dt) >= 8 else rcept_dt
            event = {
                "stock_code": stock_code,
                "event_type": "disclosure",
                "event_date": event_date,
                "description": item.get("report_nm", ""),
                "source": "dart",
            }
            results.append(event)
            await execute_insert(
                "INSERT OR IGNORE INTO catalyst_events (stock_code, event_type, event_date, description, source) VALUES (?, ?, ?, ?, ?)",
                (stock_code, "disclosure", event_date, event["description"], "dart")
            )
        return results
    except Exception as e:
        logger.warning(f"DART disclosure fetch failed for {stock_code}: {e}")
        return []
