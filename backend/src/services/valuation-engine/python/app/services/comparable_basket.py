"""
Comparable Basket Service
Python implementation for PROPMETRIK valuation engine

Handles manual comparable selection, weighting, and basket management
with Ghana-specific market data integration.
"""

import logging
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict, Any, Tuple
from decimal import Decimal
import statistics
import uuid

from pydantic import BaseModel, Field
import numpy as np
import pandas as pd

from ..schemas import (
    GhanaRegion,
    PropertyType,
    TransactionType,
    ComparableQuality,
    AdjustmentType,
    ValuationMethod
)

# Setup logging
logger = logging.getLogger(__name__)


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class SearchCriteria(BaseModel):
    """Search criteria for finding comparable properties"""
    max_distance_km: Optional[float] = Field(5.0, description="Maximum distance in km")
    max_age_days: Optional[int] = Field(365, description="Maximum age in days")
    property_types: Optional[List[PropertyType]] = Field(None, description="Property types")
    size_range: Optional[Dict[str, float]] = Field(None, description="Size range min/max")
    bedroom_range: Optional[Dict[str, int]] = Field(None, description="Bedroom range min/max")
    location_filter: Optional[List[str]] = Field(None, description="Location filters")
    price_range: Optional[Dict[str, float]] = Field(None, description="Price range min/max")

class ManualComparableData(BaseModel):
    """Manual comparable property data"""
    address: str = Field(..., description="Property address")
    sale_price: float = Field(..., description="Sale price in GHS")
    sale_date: date = Field(..., description="Sale date")
    property_type: PropertyType = Field(..., description="Property type")
    bedrooms: Optional[int] = Field(None, description="Number of bedrooms")
    bathrooms: Optional[int] = Field(None, description="Number of bathrooms")
    building_area_sqm: float = Field(..., description="Building area in sqm")
    land_area_sqm: Optional[float] = Field(None, description="Land area in sqm")
    source: str = Field(..., description="Data source")
    source_reference: Optional[str] = Field(None, description="Source reference")
    location: Optional[Dict[str, Any]] = Field(None, description="Location data")

class AdjustmentsSummary(BaseModel):
    """Summary of adjustments applied to comparable"""
    time: float = Field(0.0, description="Time adjustment percentage")
    location: float = Field(0.0, description="Location adjustment percentage")
    physical: float = Field(0.0, description="Physical adjustment percentage")
    legal: float = Field(0.0, description="Legal adjustment percentage")
    total_net: float = Field(0.0, description="Total net adjustment")
    total_gross: float = Field(0.0, description="Total gross adjustment")

class BasketComparable(BaseModel):
    """Individual comparable within a basket"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    basket_id: str = Field(..., description="Parent basket ID")
    comparable_property_id: Optional[str] = Field(None, description="Property ID if from database")
    comparable_transaction_id: Optional[str] = Field(None, description="Transaction ID if from database")
    is_manual_entry: bool = Field(False, description="Is manually entered")
    manual_data: Optional[ManualComparableData] = Field(None, description="Manual data if applicable")
    selection_method: str = Field("auto", description="Selection method")
    quality_score: Optional[float] = Field(None, description="Quality score 0-1")
    weight: float = Field(1.0, description="Weight in basket")
    is_weight_manual: bool = Field(False, description="Is weight manually set")
    weight_justification: Optional[str] = Field(None, description="Weight justification")
    tags: List[str] = Field(default_factory=list, description="Tags")
    is_excluded: bool = Field(False, description="Is excluded from analysis")
    exclusion_reason: Optional[str] = Field(None, description="Exclusion reason")
    raw_sale_price: Optional[float] = Field(None, description="Raw sale price")
    adjusted_sale_price: Optional[float] = Field(None, description="Adjusted sale price")
    total_adjustment_percentage: Optional[float] = Field(None, description="Total adjustment %")
    gross_adjustment_percentage: Optional[float] = Field(None, description="Gross adjustment %")
    adjustments_summary: Optional[AdjustmentsSummary] = Field(None, description="Adjustment details")
    display_order: int = Field(1, description="Display order")
    added_by: Optional[str] = Field(None, description="Added by user")
    added_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class ComparableBasket(BaseModel):
    """Comparable basket containing multiple properties for analysis"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    valuation_id: str = Field(..., description="Parent valuation ID")
    basket_name: str = Field("Primary Basket", description="Basket name")
    is_primary: bool = Field(True, description="Is primary basket")
    search_criteria: SearchCriteria = Field(default_factory=SearchCriteria)
    comparable_count: int = Field(0, description="Number of comparables")
    avg_adjusted_value: Optional[float] = Field(None, description="Average adjusted value")
    median_adjusted_value: Optional[float] = Field(None, description="Median adjusted value")
    value_range_low: Optional[float] = Field(None, description="Value range low")
    value_range_high: Optional[float] = Field(None, description="Value range high")
    coefficient_of_variation: Optional[float] = Field(None, description="Coefficient of variation")
    is_locked: bool = Field(False, description="Is locked")
    locked_at: Optional[datetime] = Field(None, description="Locked timestamp")
    locked_by: Optional[str] = Field(None, description="Locked by user")
    created_by: Optional[str] = Field(None, description="Created by user")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    # Related data
    comparables: List[BasketComparable] = Field(default_factory=list)

class BasketStatistics(BaseModel):
    """Statistical analysis of basket comparables"""
    comparable_count: int = Field(0, description="Total comparables")
    active_count: int = Field(0, description="Active (non-excluded) comparables")
    
    # Value statistics
    mean_value: Optional[float] = Field(None, description="Mean adjusted value")
    median_value: Optional[float] = Field(None, description="Median adjusted value")
    std_deviation: Optional[float] = Field(None, description="Standard deviation")
    coefficient_of_variation: Optional[float] = Field(None, description="Coefficient of variation")
    
    # Range statistics
    min_value: Optional[float] = Field(None, description="Minimum value")
    max_value: Optional[float] = Field(None, description="Maximum value")
    value_range: Optional[float] = Field(None, description="Value range")
    iqr: Optional[float] = Field(None, description="Interquartile range")
    
    # Price per sqm statistics
    mean_price_per_sqm: Optional[float] = Field(None, description="Mean price per sqm")
    median_price_per_sqm: Optional[float] = Field(None, description="Median price per sqm")
    
    # Quality metrics
    avg_quality_score: Optional[float] = Field(None, description="Average quality score")
    quality_distribution: Optional[Dict[str, int]] = Field(None, description="Quality distribution")


# ============================================================================
# COMPARABLE BASKET SERVICE
# ============================================================================

class ComparableBasketService:
    """
    Service for managing comparable property baskets in Ghana property valuations.
    
    Features:
    - Create and manage comparable baskets
    - Add/remove comparables (auto and manual)
    - Manual weighting with justification
    - Quality scoring and statistics
    - Ghana market-specific adjustments
    """
    
    def __init__(self):
        """Initialize the service"""
        self.ghana_market_multipliers = {
            "greater_accra": 1.30,
            "kumasi_metro": 1.00,
            "eastern": 1.00,
            "western": 0.85,
            "central": 0.75,
            "volta": 0.70,
            "ashanti": 0.90,
            "brong_ahafo": 0.65,
            "northern": 0.55,
            "upper_east": 0.50,
            "upper_west": 0.50,
        }
    
    # --------------------------------------------------------------------------
    # BASKET CRUD OPERATIONS
    # --------------------------------------------------------------------------
    
    async def create_basket(
        self,
        valuation_id: str,
        basket_name: str = "Primary Basket",
        search_criteria: Optional[SearchCriteria] = None,
        is_primary: bool = True,
        created_by: Optional[str] = None
    ) -> ComparableBasket:
        """Create a new comparable basket"""
        
        logger.info(f"Creating comparable basket for valuation {valuation_id}")
        
        basket = ComparableBasket(
            valuation_id=valuation_id,
            basket_name=basket_name,
            is_primary=is_primary,
            search_criteria=search_criteria or SearchCriteria(),
            created_by=created_by
        )
        
        logger.info(f"Comparable basket created: {basket.id}")
        return basket
    
    async def add_manual_comparable(
        self,
        basket_id: str,
        comparable_data: ManualComparableData,
        weight: float = 1.0,
        tags: Optional[List[str]] = None,
        added_by: Optional[str] = None
    ) -> BasketComparable:
        """Add a manual comparable to the basket"""
        
        logger.info(f"Adding manual comparable to basket {basket_id}")
        
        # Calculate quality score for manual entry
        quality_score = self._calculate_manual_quality_score(comparable_data)
        
        comparable = BasketComparable(
            basket_id=basket_id,
            is_manual_entry=True,
            manual_data=comparable_data,
            selection_method="manual",
            quality_score=quality_score,
            weight=weight,
            is_weight_manual=True,
            tags=tags or [],
            raw_sale_price=comparable_data.sale_price,
            added_by=added_by
        )
        
        # Apply initial adjustments
        await self._apply_adjustments(comparable)
        
        logger.info(f"Manual comparable added: {comparable.id}")
        return comparable
    
    async def update_comparable_weight(
        self,
        comparable_id: str,
        weight: float,
        justification: Optional[str] = None,
        updated_by: Optional[str] = None
    ) -> BasketComparable:
        """Update comparable weight with justification"""
        
        logger.info(f"Updating weight for comparable {comparable_id}")
        
        # In a real implementation, this would fetch from database
        # For now, create a mock response
        comparable = BasketComparable(
            id=comparable_id,
            basket_id="mock-basket",
            weight=weight,
            is_weight_manual=True,
            weight_justification=justification,
            updated_at=datetime.now()
        )
        
        logger.info(f"Comparable weight updated: {weight}")
        return comparable
    
    async def exclude_comparable(
        self,
        comparable_id: str,
        exclusion_reason: str,
        excluded_by: Optional[str] = None
    ) -> BasketComparable:
        """Exclude a comparable from analysis"""
        
        logger.info(f"Excluding comparable {comparable_id}: {exclusion_reason}")
        
        # Mock implementation
        comparable = BasketComparable(
            id=comparable_id,
            basket_id="mock-basket",
            is_excluded=True,
            exclusion_reason=exclusion_reason,
            updated_at=datetime.now()
        )
        
        return comparable
    
    # --------------------------------------------------------------------------
    # STATISTICAL ANALYSIS
    # --------------------------------------------------------------------------
    
    async def calculate_basket_statistics(
        self,
        basket_id: str
    ) -> BasketStatistics:
        """Calculate comprehensive statistics for the basket"""
        
        logger.info(f"Calculating statistics for basket {basket_id}")
        
        # In real implementation, fetch comparables from database
        # For now, create mock data
        comparables = await self._get_mock_comparables(basket_id)
        
        # Filter active comparables
        active_comparables = [c for c in comparables if not c.is_excluded]
        
        if not active_comparables:
            return BasketStatistics(comparable_count=len(comparables))
        
        # Extract adjusted values
        values = [c.adjusted_sale_price for c in active_comparables if c.adjusted_sale_price]
        
        if not values:
            return BasketStatistics(
                comparable_count=len(comparables),
                active_count=len(active_comparables)
            )
        
        # Calculate statistics
        stats = BasketStatistics(
            comparable_count=len(comparables),
            active_count=len(active_comparables),
            mean_value=float(np.mean(values)),
            median_value=float(np.median(values)),
            std_deviation=float(np.std(values)),
            min_value=float(np.min(values)),
            max_value=float(np.max(values)),
            value_range=float(np.max(values) - np.min(values)),
            iqr=float(np.percentile(values, 75) - np.percentile(values, 25))
        )
        
        # Coefficient of variation
        if stats.mean_value and stats.mean_value > 0:
            stats.coefficient_of_variation = stats.std_deviation / stats.mean_value
        
        # Price per sqm statistics
        price_per_sqm = []
        for comp in active_comparables:
            if comp.adjusted_sale_price and comp.manual_data and comp.manual_data.building_area_sqm:
                price_per_sqm.append(comp.adjusted_sale_price / comp.manual_data.building_area_sqm)
        
        if price_per_sqm:
            stats.mean_price_per_sqm = float(np.mean(price_per_sqm))
            stats.median_price_per_sqm = float(np.median(price_per_sqm))
        
        # Quality score statistics
        quality_scores = [c.quality_score for c in active_comparables if c.quality_score]
        if quality_scores:
            stats.avg_quality_score = float(np.mean(quality_scores))
            
            # Quality distribution
            quality_dist = {"high": 0, "medium": 0, "low": 0}
            for score in quality_scores:
                if score >= 0.8:
                    quality_dist["high"] += 1
                elif score >= 0.6:
                    quality_dist["medium"] += 1
                else:
                    quality_dist["low"] += 1
            stats.quality_distribution = quality_dist
        
        logger.info(f"Statistics calculated: {stats.active_count} comparables analyzed")
        return stats
    
    # --------------------------------------------------------------------------
    # ADJUSTMENTS AND SCORING
    # --------------------------------------------------------------------------
    
    async def _apply_adjustments(self, comparable: BasketComparable) -> None:
        """Apply time, location, and physical adjustments"""
        
        if not comparable.manual_data:
            return
        
        adjustments = AdjustmentsSummary()
        
        # Time adjustment (Ghana market appreciation: ~8% annually)
        sale_date = comparable.manual_data.sale_date
        days_old = (datetime.now().date() - sale_date).days
        if days_old > 0:
            years_old = days_old / 365.25
            time_adjustment = years_old * 0.08  # 8% annual appreciation
            adjustments.time = time_adjustment
        
        # Location adjustment (mock - would use actual location analysis)
        adjustments.location = 0.05  # Mock 5% positive location adjustment
        
        # Physical adjustment (mock - would analyze condition, features, etc.)
        adjustments.physical = -0.02  # Mock -2% for wear and tear
        
        # Calculate totals
        adjustments.total_net = adjustments.time + adjustments.location + adjustments.physical
        adjustments.total_gross = abs(adjustments.time) + abs(adjustments.location) + abs(adjustments.physical)
        
        # Apply adjustment to price
        raw_price = comparable.manual_data.sale_price
        adjusted_price = raw_price * (1 + adjustments.total_net)
        
        comparable.adjusted_sale_price = adjusted_price
        comparable.total_adjustment_percentage = adjustments.total_net * 100
        comparable.gross_adjustment_percentage = adjustments.total_gross * 100
        comparable.adjustments_summary = adjustments
    
    def _calculate_manual_quality_score(self, data: ManualComparableData) -> float:
        """Calculate quality score for manually entered comparable"""
        
        score = 0.5  # Base score
        
        # Address quality
        if data.address and len(data.address.strip()) > 10:
            score += 0.1
        
        # Date recency (within last year = +0.2)
        days_old = (datetime.now().date() - data.sale_date).days
        if days_old <= 365:
            score += 0.2
        elif days_old <= 730:
            score += 0.1
        
        # Data completeness
        if data.bedrooms:
            score += 0.05
        if data.bathrooms:
            score += 0.05
        if data.land_area_sqm:
            score += 0.05
        if data.source_reference:
            score += 0.05
        if data.location:
            score += 0.1
        
        return min(1.0, score)
    
    async def _get_mock_comparables(self, basket_id: str) -> List[BasketComparable]:
        """Get mock comparables for testing"""
        
        comparables = []
        
        # Create some mock comparables with Ghana-typical data
        for i in range(5):
            manual_data = ManualComparableData(
                address=f"Test Street {i+1}, Accra",
                sale_price=750000 + (i * 50000),  # GHS 750k - 950k range
                sale_date=datetime.now().date() - timedelta(days=i*30),
                property_type=PropertyType.residential_house,
                bedrooms=3 + (i % 2),
                bathrooms=2 + (i % 2),
                building_area_sqm=180 + (i * 20),
                land_area_sqm=400 + (i * 50),
                source="Manual Entry"
            )
            
            comparable = BasketComparable(
                basket_id=basket_id,
                is_manual_entry=True,
                manual_data=manual_data,
                selection_method="manual",
                quality_score=0.7 + (i * 0.05),
                weight=1.0,
                raw_sale_price=manual_data.sale_price
            )
            
            await self._apply_adjustments(comparable)
            comparables.append(comparable)
        
        return comparables


# ============================================================================
# SERVICE INSTANCE
# ============================================================================

comparable_basket_service = ComparableBasketService()