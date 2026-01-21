"""
Market Data Adapter - Re-export for backward compatibility

This module re-exports MarketDataAdapter from data_hub_adapter
for services that import from this path.
"""

from .data_hub_adapter import MarketDataAdapter, PostgreSQLMarketDataAdapter

__all__ = ['MarketDataAdapter', 'PostgreSQLMarketDataAdapter']
