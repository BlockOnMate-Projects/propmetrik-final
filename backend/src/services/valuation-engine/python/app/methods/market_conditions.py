"""
Market conditions — `/api/v1/market/conditions`.

Per-method module extracted from main.py (behaviour-preserving). Returns regional market-condition
indicators. Shared helpers come from the dependency-free ._shared module; main includes this router.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ._shared import (
    _normalize_region,
    logger,
)

router = APIRouter()


class MarketConditionsRequest(BaseModel):
    """Request for market conditions"""
    region: str
    property_type: Optional[str] = None
    as_of_date: Optional[str] = None


@router.post("/api/v1/market/conditions")
async def get_market_conditions(request: MarketConditionsRequest):
    """
    Get market conditions for a region
    """
    try:
        region = _normalize_region(request.region)

        # Market conditions by region
        conditions = {
            "greater_accra": {
                "market_activity": "high",
                "price_trend": "increasing",
                "inventory_level": "low",
                "avg_days_on_market": 45,
                "price_change_6m_pct": 8.5,
                "rental_yield_pct": 7.2,
            },
            "kumasi_metro": {
                "market_activity": "moderate",
                "price_trend": "stable",
                "inventory_level": "balanced",
                "avg_days_on_market": 60,
                "price_change_6m_pct": 3.5,
                "rental_yield_pct": 9.0,
            },
            "eastern": {
                "market_activity": "low",
                "price_trend": "stable",
                "inventory_level": "high",
                "avg_days_on_market": 90,
                "price_change_6m_pct": 1.5,
                "rental_yield_pct": 10.0,
            },
            "western_cluster": {
                "market_activity": "moderate",
                "price_trend": "increasing",
                "inventory_level": "balanced",
                "avg_days_on_market": 75,
                "price_change_6m_pct": 5.0,
                "rental_yield_pct": 8.5,
            },
            "northern_cluster": {
                "market_activity": "low",
                "price_trend": "stable",
                "inventory_level": "high",
                "avg_days_on_market": 120,
                "price_change_6m_pct": 0.5,
                "rental_yield_pct": 11.0,
            },
        }

        region_conditions = conditions.get(region, conditions["greater_accra"])

        return {
            "success": True,
            "region": region,
            "conditions": region_conditions,
            "as_of_date": datetime.now().strftime("%Y-%m-%d"),
            "data_source": "PROPMETRIK Market Analysis",
        }

    except Exception as e:
        logger.error(f"Market conditions fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
