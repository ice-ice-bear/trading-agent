"""Watchlist API router."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import portfolio_service

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class WatchlistAdd(BaseModel):
    stock_code: str
    stock_name: str = ""


@router.get("")
async def get_watchlist():
    """Get all watchlist items."""
    items = await portfolio_service.get_watchlist()
    return {"items": items}


@router.post("")
async def add_watchlist_item(body: WatchlistAdd):
    """Add a stock to the watchlist."""
    result = await portfolio_service.add_to_watchlist(
        body.stock_code, body.stock_name
    )
    return {"item": result}


@router.delete("/{stock_code}")
async def remove_watchlist_item(stock_code: str):
    """Remove a stock from the watchlist."""
    removed = await portfolio_service.remove_from_watchlist(stock_code)
    if not removed:
        raise HTTPException(status_code=404, detail="Stock not found in watchlist")
    return {"status": "ok"}
