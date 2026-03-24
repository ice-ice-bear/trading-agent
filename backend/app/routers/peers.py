from fastapi import APIRouter
from app.services.peer_service import get_sector_peers

router = APIRouter(prefix="/api/peers", tags=["peers"])


@router.get("/{stock_code}")
async def peer_comparison(stock_code: str, max_peers: int = 5):
    return await get_sector_peers(stock_code, max_peers)
