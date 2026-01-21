"""
Data Hub API Adapter
HTTP adapter that calls the TypeScript backend Data Hub API for live data.
This ensures Python valuation services use the same calculated data as TypeScript.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import date, timedelta
import asyncio
import aiohttp
import logging

from ..schemas import (
    GhanaRegion, 
    PropertyType,
    ConstructionCosts,
    EconomicIndicator,
)
from ..config import settings


logger = logging.getLogger(__name__)


class DataHubAPIClient:
    """HTTP client for TypeScript Data Hub API"""
    
    def __init__(self, base_url: str = None, timeout: int = None):
        self.base_url = base_url or settings.data_hub_api_url
        self.timeout = aiohttp.ClientTimeout(total=timeout or settings.data_hub_api_timeout)
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self.timeout)
        return self._session
    
    async def close(self):
        """Close the HTTP session"""
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request to Data Hub API"""
        session = await self._get_session()
        url = f"{self.base_url}{endpoint}"
        
        try:
            async with session.request(method, url, **kwargs) as response:
                if response.status == 200:
                    data = await response.json()
                    return data
                else:
                    text = await response.text()
                    logger.error(f"Data Hub API error: {response.status} - {text}")
                    return {"success": False, "error": f"HTTP {response.status}"}
        except asyncio.TimeoutError:
            logger.error(f"Data Hub API timeout for {endpoint}")
            return {"success": False, "error": "Request timeout"}
        except aiohttp.ClientError as e:
            logger.error(f"Data Hub API client error: {str(e)}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Data Hub API unexpected error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def get(self, endpoint: str, params: Dict = None) -> Dict[str, Any]:
        """GET request"""
        return await self._request("GET", endpoint, params=params)
    
    async def post(self, endpoint: str, data: Dict = None) -> Dict[str, Any]:
        """POST request"""
        return await self._request("POST", endpoint, json=data)


class DataHubAPIAdapter:
    """
    Adapter that fetches construction, labor, and economic data from
    the TypeScript backend's Data Hub API.
    
    This ensures Python valuation services use live calculated data from:
    - baseCostCalculationService (base_costs_per_sqm table)
    - regional_cost_multipliers table
    - material_prices table
    - labor_rates table
    - economic_indicators table
    """
    
    def __init__(self, client: DataHubAPIClient = None):
        self.client = client or DataHubAPIClient()
    
    async def close(self):
        """Close underlying client"""
        await self.client.close()
    
    # =========================================================================
    # CONSTRUCTION COSTS
    # =========================================================================
    
    async def get_construction_costs(
        self,
        region: str,
        property_type: str = "residential",
        quality_level: str = "standard"
    ) -> Optional[ConstructionCosts]:
        """
        Fetch construction costs from Data Hub API.
        Returns base costs with regional multipliers applied.
        """
        try:
            # Normalize region
            normalized_region = self._normalize_region(region)
            
            # Fetch base costs (using snake_case params to match TypeScript API)
            base_cost_result = await self.client.post("/construction/estimate", {
                "property_type": property_type,
                "quality_level": quality_level,
                "region": normalized_region,
                "built_area_sqm": 1,  # Get per-sqm cost
                "num_floors": 1
            })
            
            if not base_cost_result.get("success"):
                logger.warning(f"Failed to get construction estimate: {base_cost_result.get('error')}")
                return None
            
            estimate = base_cost_result.get("data", {})
            estimates = estimate.get("estimates", {})
            
            # Fetch all quality tier costs
            quality_costs = {}
            for tier in ["basic", "standard", "premium", "luxury"]:
                tier_result = await self.client.post("/construction/estimate", {
                    "property_type": property_type,
                    "quality_level": tier,
                    "region": normalized_region,
                    "built_area_sqm": 1,
                    "num_floors": 1
                })
                if tier_result.get("success") and tier_result.get("data"):
                    tier_estimates = tier_result["data"].get("estimates", {})
                    quality_costs[tier] = tier_estimates.get("cost_per_sqm", 0)
            
            regional_multiplier = estimate.get("regional_multiplier", {})
            
            # Build ConstructionCosts object
            return ConstructionCosts(
                region=normalized_region,
                effective_date=date.today(),
                cost_per_sqm_basic=quality_costs.get("basic", 2000),
                cost_per_sqm_standard=quality_costs.get("standard", estimates.get("cost_per_sqm", 4500)),
                cost_per_sqm_premium=quality_costs.get("premium", 7000),
                cost_per_sqm_luxury=quality_costs.get("luxury", 12000),
                skilled_labor_rate_per_day=0,  # Will be fetched separately
                unskilled_labor_rate_per_day=0,
                utilities_connection_cost=5000.0,
                site_preparation_cost_per_sqm=50.0,
                data_source="PropMetrik Data Hub API",
                regional_multiplier=regional_multiplier.get("value", 1.0),
                material_costs={}
            )
            
        except Exception as e:
            logger.error(f"Error fetching construction costs: {str(e)}")
            return None
    
    async def get_base_cost_per_sqm(
        self,
        property_type: str,
        quality_level: str,
        region: str
    ) -> Optional[Dict[str, Any]]:
        """Get calculated base cost per sqm from baseCostCalculationService"""
        try:
            normalized_region = self._normalize_region(region)
            
            # Use snake_case to match TypeScript API expectations
            result = await self.client.post("/construction/estimate", {
                "property_type": property_type,
                "quality_level": quality_level,
                "region": normalized_region,
                "built_area_sqm": 1,
                "num_floors": 1
            })
            
            if result.get("success") and result.get("data"):
                data = result["data"]
                estimates = data.get("estimates", {})
                return {
                    "cost_ghs": estimates.get("cost_per_sqm", 0),
                    "regional_multiplier": data.get("regional_multiplier", {}).get("value", 1.0),
                    "adjusted_cost": estimates.get("cost_per_sqm", 0),
                    "source": data.get("data_source", "calculated"),
                    "property_type": property_type,
                    "quality_level": quality_level,
                    "region": normalized_region
                }
            return None
            
        except Exception as e:
            logger.error(f"Error fetching base cost: {str(e)}")
            return None
    
    async def get_regional_multiplier(self, region: str) -> Dict[str, Any]:
        """Get regional cost multiplier from database"""
        try:
            normalized_region = self._normalize_region(region)
            
            # Use construction estimate endpoint to get multiplier (snake_case params)
            result = await self.client.post("/construction/estimate", {
                "property_type": "residential",
                "quality_level": "standard",
                "region": normalized_region,
                "built_area_sqm": 1,
                "num_floors": 1
            })
            
            if result.get("success") and result.get("data"):
                regional_data = result["data"].get("regional_multiplier", {})
                return {
                    "region": normalized_region,
                    "value": regional_data.get("value", 1.0),
                    "source": regional_data.get("source", "calculated"),
                    "confidence": regional_data.get("confidence", 0.9)
                }
            
            return {
                "region": normalized_region,
                "value": 1.0,
                "source": "fallback",
                "confidence": 0.5
            }
            
        except Exception as e:
            logger.error(f"Error fetching regional multiplier: {str(e)}")
            return {"region": region, "value": 1.0, "source": "error", "confidence": 0.3}
    
    # =========================================================================
    # MATERIAL PRICES
    # =========================================================================
    
    async def get_material_prices(
        self,
        region: str = None,
        category: str = None
    ) -> List[Dict[str, Any]]:
        """Fetch current material prices from Data Hub"""
        try:
            params = {}
            if region:
                params["region"] = self._normalize_region(region)
            if category:
                params["category"] = category
            
            result = await self.client.get("/construction/materials", params=params)
            
            if result.get("success") and result.get("data"):
                return result["data"]
            
            return []
            
        except Exception as e:
            logger.error(f"Error fetching material prices: {str(e)}")
            return []
    
    async def get_material_price(self, material_name: str, region: str = None) -> Optional[Dict]:
        """Get price for a specific material"""
        materials = await self.get_material_prices(region=region)
        for mat in materials:
            if mat.get("name", "").lower() == material_name.lower():
                return mat
        return None
    
    # =========================================================================
    # LABOR RATES
    # =========================================================================
    
    async def get_labor_rates(self, region: str = None) -> List[Dict[str, Any]]:
        """Fetch current labor rates from Data Hub"""
        try:
            params = {}
            if region:
                params["region"] = self._normalize_region(region)
            
            result = await self.client.get("/construction/labor", params=params)
            
            if result.get("success") and result.get("data"):
                return result["data"]
            
            return []
            
        except Exception as e:
            logger.error(f"Error fetching labor rates: {str(e)}")
            return []
    
    async def get_labor_rate(self, category: str, region: str = None) -> Optional[Dict]:
        """Get rate for a specific labor category"""
        rates = await self.get_labor_rates(region=region)
        for rate in rates:
            if rate.get("category", "").lower() == category.lower():
                return rate
        return None
    
    async def get_skilled_labor_rate(self, region: str) -> float:
        """Get skilled labor daily rate"""
        rate = await self.get_labor_rate("skilled_laborer", region)
        if rate:
            return rate.get("daily_rate_ghs", 120.0)
        return 120.0  # Fallback
    
    async def get_unskilled_labor_rate(self, region: str) -> float:
        """Get unskilled labor daily rate"""
        rate = await self.get_labor_rate("unskilled_laborer", region)
        if rate:
            return rate.get("daily_rate_ghs", 60.0)
        return 60.0  # Fallback
    
    # =========================================================================
    # ECONOMIC INDICATORS
    # =========================================================================
    
    async def get_economic_snapshot(self) -> Dict[str, Any]:
        """Get latest economic indicators snapshot"""
        try:
            result = await self.client.get("/economic/snapshot")
            
            if result.get("success") and result.get("data"):
                snapshot = result["data"]
                return {
                    "inflation_rate": snapshot.get("inflation_rate", 0.12),
                    "interest_rate_policy": snapshot.get("interest_rate_policy", 0.27),
                    "mortgage_rate_avg": snapshot.get("mortgage_rate_avg", 0.32),
                    "exchange_rate_usd": snapshot.get("exchange_rate_usd", 15.5),
                    "gdp_growth": snapshot.get("gdp_growth", 0.032),
                    "construction_cost_index": snapshot.get("construction_cost_index", 110),
                    "date": snapshot.get("date"),
                    "source": "live"
                }
            
            # Fallback defaults
            return {
                "inflation_rate": 0.12,
                "interest_rate_policy": 0.27,
                "mortgage_rate_avg": 0.32,
                "exchange_rate_usd": 15.5,
                "gdp_growth": 0.032,
                "construction_cost_index": 110,
                "source": "fallback"
            }
            
        except Exception as e:
            logger.error(f"Error fetching economic snapshot: {str(e)}")
            return {
                "inflation_rate": 0.12,
                "interest_rate_policy": 0.27,
                "mortgage_rate_avg": 0.32,
                "exchange_rate_usd": 15.5,
                "gdp_growth": 0.032,
                "construction_cost_index": 110,
                "source": "error"
            }
    
    async def get_construction_cost_index(self, region: str = None) -> Dict[str, Any]:
        """Get construction cost index for region"""
        try:
            params = {}
            if region:
                params["region"] = self._normalize_region(region)
            
            result = await self.client.get("/construction/index", params=params)
            
            if result.get("success") and result.get("data"):
                return result["data"]
            
            return {"index_value": 110, "source": "fallback"}
            
        except Exception as e:
            logger.error(f"Error fetching construction index: {str(e)}")
            return {"index_value": 110, "source": "error"}
    
    # =========================================================================
    # DEPRECIATED REPLACEMENT COST
    # =========================================================================
    
    async def calculate_drc(
        self,
        property_type: str,
        quality_level: str,
        region: str,
        built_area_sqm: float,
        year_built: int,
        condition: str = "good"
    ) -> Optional[Dict[str, Any]]:
        """Calculate DRC using Data Hub service"""
        try:
            result = await self.client.post("/construction/drc", {
                "propertyType": property_type,
                "qualityLevel": quality_level,
                "region": self._normalize_region(region),
                "builtAreaSqm": built_area_sqm,
                "yearBuilt": year_built,
                "condition": condition
            })
            
            if result.get("success") and result.get("data"):
                return result["data"]
            
            return None
            
        except Exception as e:
            logger.error(f"Error calculating DRC: {str(e)}")
            return None
    
    # =========================================================================
    # UTILITY METHODS
    # =========================================================================
    
    def _normalize_region(self, region: str) -> str:
        """Normalize region name to data hub format"""
        if isinstance(region, GhanaRegion):
            return region.value
        
        # Convert common formats
        region_lower = str(region).lower().replace("-", "_").replace(" ", "_")
        
        # Map common variations
        region_map = {
            "greater_accra": "greater_accra",
            "greateraccra": "greater_accra",
            "accra": "greater_accra",
            "gar": "greater_accra",
            "ashanti": "ashanti",
            "ash": "ashanti",
            "kumasi": "ashanti",
            "kumasi_metro": "ashanti",
            "eastern": "eastern",
            "er": "eastern",
            "western": "western",
            "wr": "western",
            "western_cluster": "western",
            "central": "central",
            "cr": "central",
            "volta": "volta",
            "vr": "volta",
            "oti": "oti",
            "northern": "northern",
            "nr": "northern",
            "northern_cluster": "northern",
            "north_east": "north_east",
            "ne": "north_east",
            "savannah": "savannah",
            "upper_east": "upper_east",
            "ue": "upper_east",
            "upper_west": "upper_west",
            "uw": "upper_west",
            "bono": "bono",
            "bono_east": "bono_east",
            "ahafo": "ahafo",
            "western_north": "western_north",
        }
        
        return region_map.get(region_lower, region_lower)


# Singleton instance
_data_hub_adapter: Optional[DataHubAPIAdapter] = None


def get_data_hub_adapter() -> DataHubAPIAdapter:
    """Get or create singleton Data Hub API adapter"""
    global _data_hub_adapter
    if _data_hub_adapter is None:
        _data_hub_adapter = DataHubAPIAdapter()
    return _data_hub_adapter


async def cleanup_data_hub_adapter():
    """Cleanup adapter on shutdown"""
    global _data_hub_adapter
    if _data_hub_adapter is not None:
        await _data_hub_adapter.close()
        _data_hub_adapter = None
