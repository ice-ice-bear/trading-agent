"""동종 업종 비교 서비스"""
import logging
from app.models.db import execute_query
from app.services.dart_client import dart_client

logger = logging.getLogger(__name__)


async def get_sector_peers(stock_code: str, max_peers: int = 5) -> dict:
    """동일 섹터 종목 조회 + DART 재무 비교"""
    row = await execute_query(
        "SELECT sector, stock_name FROM kospi200_components WHERE stock_code = ?",
        (stock_code,)
    )
    if not row or not row[0].get("sector"):
        return {"sector": None, "peers": [], "error": "섹터 정보 없음"}

    sector = row[0]["sector"]
    stock_name = row[0]["stock_name"]

    peers_rows = await execute_query(
        "SELECT stock_code, stock_name FROM kospi200_components WHERE sector = ? AND stock_code != ? LIMIT ?",
        (sector, stock_code, max_peers)
    )
    if not peers_rows:
        return {"sector": sector, "peers": [], "target": {"code": stock_code, "name": stock_name}}

    peers = []
    for pr in peers_rows:
        try:
            dart_result = await dart_client.fetch(pr["stock_code"])
            fin = dart_result.get("financials") or {}
            peers.append({
                "code": pr["stock_code"],
                "name": pr["stock_name"],
                "per": fin.get("dart_per"),
                "pbr": fin.get("dart_pbr"),
                "operating_margin": fin.get("dart_operating_margin"),
                "debt_ratio": fin.get("dart_debt_ratio"),
            })
        except Exception:
            peers.append({"code": pr["stock_code"], "name": pr["stock_name"], "per": None, "pbr": None})

    target_dart = await dart_client.fetch(stock_code)
    target_fin = target_dart.get("financials") or {}

    return {
        "sector": sector,
        "target": {
            "code": stock_code,
            "name": stock_name,
            "per": target_fin.get("dart_per"),
            "pbr": target_fin.get("dart_pbr"),
            "operating_margin": target_fin.get("dart_operating_margin"),
            "debt_ratio": target_fin.get("dart_debt_ratio"),
        },
        "peers": peers,
    }
