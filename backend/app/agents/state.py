"""Shared state accessible by all agents."""

import asyncio
from dataclasses import dataclass, field
from typing import Any


@dataclass
class MarketData:
    """Cached market data for a single stock."""

    stock_code: str
    stock_name: str = ""
    price: float = 0.0
    change_pct: float = 0.0
    volume: int = 0
    updated_at: str = ""


@dataclass
class PortfolioCache:
    """Cached portfolio state from latest snapshot."""

    total_value: float = 0.0
    cash_balance: float = 0.0
    total_pnl: float = 0.0
    total_pnl_pct: float = 0.0
    positions: list[dict[str, Any]] = field(default_factory=list)
    updated_at: str = ""


class SharedState:
    """Thread-safe shared state for all agents.

    Provides cached portfolio data, market data, and watchlist
    so agents don't need to re-query MCP for every operation.
    """

    def __init__(self):
        self._lock = asyncio.Lock()
        self.portfolio: PortfolioCache = PortfolioCache()
        self.market_data: dict[str, MarketData] = {}
        self.watchlist: list[str] = []

    async def update_portfolio(self, data: PortfolioCache) -> None:
        async with self._lock:
            self.portfolio = data

    async def get_portfolio(self) -> PortfolioCache:
        async with self._lock:
            return self.portfolio

    async def update_market_data(self, stock_code: str, data: MarketData) -> None:
        async with self._lock:
            self.market_data[stock_code] = data

    async def get_market_data(self, stock_code: str) -> MarketData | None:
        async with self._lock:
            return self.market_data.get(stock_code)

    async def set_watchlist(self, codes: list[str]) -> None:
        async with self._lock:
            self.watchlist = codes

    async def get_watchlist(self) -> list[str]:
        async with self._lock:
            return list(self.watchlist)


# Singleton
shared_state = SharedState()
