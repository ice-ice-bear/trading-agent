from fastapi import APIRouter
from app.services.calendar_service import get_catalyst_events, fetch_dart_disclosures

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("")
async def list_events(stock_code: str | None = None, days: int = 30):
    events = await get_catalyst_events(stock_code, days)
    return {"events": events}


@router.post("/refresh/{stock_code}")
async def refresh_disclosures(stock_code: str):
    disclosures = await fetch_dart_disclosures(stock_code)
    return {"refreshed": len(disclosures)}
