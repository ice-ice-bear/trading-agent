"""시그널 이력 서비스 — 동일 종목 시그널 시계열 비교"""
import json
import logging
from app.models.db import execute_query, execute_insert

logger = logging.getLogger(__name__)


async def save_signal_snapshot(signal_id: int, stock_code: str, direction: str, rr_score: float,
                                scenarios_json: str, expert_stances_json: str, variant_view: str, dart_json: str):
    """시그널 생성 시 자동 스냅샷 저장"""
    try:
        await execute_insert(
            """INSERT INTO signal_snapshots (stock_code, signal_id, direction, rr_score,
               scenarios_json, expert_stances_json, variant_view, dart_fundamentals_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (stock_code, signal_id, direction, rr_score, scenarios_json, expert_stances_json, variant_view, dart_json)
        )
    except Exception as e:
        logger.warning(f"Failed to save signal snapshot: {e}")


async def get_signal_history(stock_code: str, limit: int = 10) -> list[dict]:
    """특정 종목의 과거 시그널 이력"""
    rows = await execute_query(
        """SELECT ss.*, s.status, s.timestamp as signal_timestamp
           FROM signal_snapshots ss
           LEFT JOIN signals s ON ss.signal_id = s.id
           WHERE ss.stock_code = ?
           ORDER BY ss.snapshot_date DESC LIMIT ?""",
        (stock_code, limit)
    )
    results = []
    for r in (rows or []):
        d = dict(r)
        try:
            d["scenarios"] = json.loads(d.get("scenarios_json") or "null")
        except (json.JSONDecodeError, TypeError):
            d["scenarios"] = None
        try:
            d["expert_stances"] = json.loads(d.get("expert_stances_json") or "null")
        except (json.JSONDecodeError, TypeError):
            d["expert_stances"] = None
        results.append(d)
    return results
