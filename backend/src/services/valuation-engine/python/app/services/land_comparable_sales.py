"""
Land Comparable Sales Service
Automated scoring, selection, adjustment, and valuation of land comparables

This service implements:
1. Land-specific comparable search and filtering
2. 6-factor weighted scoring algorithm
3. Land-specific adjustments (time, size, zoning, infrastructure, access, tenure)
4. Dual-method outlier detection (IQR + Modified Z-Score)
5. Weighted average land value calculation
"""

import logging
from datetime import date
from typing import List, Optional, Tuple
from math import radians, cos, sin, asin, sqrt
import statistics

import numpy as np

from ..schemas.property import (
    Property,
    GhanaRegion,
    PropertyType,
    LandTenureType as PropertyLandTenureType,
)
from ..schemas.land_comparable import (
    LandZoning,
    LandTenureType,
    RoadAccessType,
    Topography,
    LandShape,
    LandAdjustmentType,
    OutlierDetectionMethod,
    ConfidenceLevel,
    LandCharacteristics,
    LandComparableScore,
    LandAdjustment,
    OutlierInfo,
    LandComparableAnalysis,
    LandComparableSearchCriteria,
    LandComparableBasket,
    LandComparableSalesResult,
)
from ..adapters.data_hub_adapter import MarketDataAdapter


logger = logging.getLogger(__name__)


# ============================================================================
# CONSTANTS - Ghana Market Data
# ============================================================================

# Land appreciation rates by region (annual, decimal)
# Source: Market analysis from Ghana real estate trends
LAND_APPRECIATION_RATES = {
    GhanaRegion.GREATER_ACCRA: 0.12,      # 12% annual
    GhanaRegion.KUMASI_METRO: 0.10,       # 10% annual
    GhanaRegion.EASTERN: 0.07,            # 7% annual
    GhanaRegion.WESTERN_CLUSTER: 0.08,    # 8% annual
    GhanaRegion.NORTHERN_CLUSTER: 0.05,   # 5% annual
}
DEFAULT_APPRECIATION_RATE = 0.08  # 8% default

# Size adjustment factors (economies of scale)
# Larger plots typically have lower per-sqm prices
SIZE_ADJUSTMENT_FACTORS = {
    # size_ratio: adjustment_factor
    # ratio = subject_size / comparable_size
    # If subject is larger (ratio > 1), apply discount to comparable
    # If subject is smaller (ratio < 1), apply premium to comparable
    'base_elasticity': -0.15,  # -15% for every 100% size increase
}

# Zoning adjustment matrix (GHS per sqm premium/discount)
# Row = comparable zoning, Column = subject zoning
# Value = adjustment to apply to comparable to match subject
ZONING_ADJUSTMENTS = {
    LandZoning.COMMERCIAL: {
        LandZoning.RESIDENTIAL: -250,    # Commercial comp → Residential subject: discount
        LandZoning.COMMERCIAL: 0,
        LandZoning.INDUSTRIAL: 100,
        LandZoning.MIXED_USE: -100,
        LandZoning.AGRICULTURAL: -400,
    },
    LandZoning.RESIDENTIAL: {
        LandZoning.COMMERCIAL: 250,      # Residential comp → Commercial subject: premium
        LandZoning.RESIDENTIAL: 0,
        LandZoning.INDUSTRIAL: -50,
        LandZoning.MIXED_USE: 50,
        LandZoning.AGRICULTURAL: -200,
    },
    LandZoning.INDUSTRIAL: {
        LandZoning.COMMERCIAL: -100,
        LandZoning.RESIDENTIAL: 50,
        LandZoning.INDUSTRIAL: 0,
        LandZoning.MIXED_USE: -50,
        LandZoning.AGRICULTURAL: -150,
    },
    LandZoning.MIXED_USE: {
        LandZoning.COMMERCIAL: 100,
        LandZoning.RESIDENTIAL: -50,
        LandZoning.INDUSTRIAL: 50,
        LandZoning.MIXED_USE: 0,
        LandZoning.AGRICULTURAL: -250,
    },
    LandZoning.AGRICULTURAL: {
        LandZoning.COMMERCIAL: 400,
        LandZoning.RESIDENTIAL: 200,
        LandZoning.INDUSTRIAL: 150,
        LandZoning.MIXED_USE: 250,
        LandZoning.AGRICULTURAL: 0,
    },
}

# Infrastructure factors (multipliers on land value)
INFRASTRUCTURE_FACTORS = {
    'paved_road': 1.20,
    'unpaved_road': 1.00,
    'no_road': 0.70,
    'electricity': 1.15,
    'water': 1.10,
    'sewage': 1.05,
}

# Tenure adjustment factors
TENURE_FACTORS = {
    LandTenureType.FREEHOLD: 1.15,
    LandTenureType.LEASEHOLD: 1.00,  # Base
    LandTenureType.STOOL_LAND: 0.90,
    LandTenureType.FAMILY_LAND: 0.85,
    LandTenureType.GOVERNMENT_LAND: 0.95,
    LandTenureType.UNKNOWN: 1.00,
}

# Topography adjustment factors
TOPOGRAPHY_FACTORS = {
    Topography.FLAT: 1.10,
    Topography.GENTLE_SLOPE: 1.00,
    Topography.MODERATE_SLOPE: 0.90,
    Topography.STEEP: 0.75,
    Topography.IRREGULAR: 0.85,
    Topography.UNKNOWN: 1.00,
}

# Shape adjustment factors
SHAPE_FACTORS = {
    LandShape.REGULAR: 1.05,
    LandShape.CORNER_LOT: 1.10,  # Corner lots often premium
    LandShape.IRREGULAR: 0.90,
    LandShape.FLAG_LOT: 0.85,
    LandShape.UNKNOWN: 1.00,
}


class LandComparableSalesService:
    """
    Automated land comparable sales analysis for the Cost Approach.
    
    Workflow:
    1. Search for land comparables within criteria
    2. Score each comparable (automated 6-factor weighted)
    3. Apply land-specific adjustments
    4. Detect and flag outliers using IQR + Modified Z-Score
    5. Calculate weighted average land value
    
    Usage:
        service = LandComparableSalesService(market_data_adapter)
        result = await service.calculate_land_value(subject_property, valuation_date)
    """
    
    def __init__(self, market_data_adapter: MarketDataAdapter):
        self.market_data = market_data_adapter
        
        # Configuration
        self.MIN_COMPARABLES = 3
        self.MAX_COMPARABLES = 7
        self.MAX_DISTANCE_KM = 15.0
        self.MAX_AGE_DAYS = 1095  # 3 years for land
        self.MIN_SCORE_THRESHOLD = 0.50
        # "Conventional" baseline — comps beyond this are flagged as an extended-search
        # disclosure (land markets are thinner, so we widen but must declare it).
        self.CONVENTIONAL_DISTANCE_KM = 10.0
        self.CONVENTIONAL_AGE_DAYS = 730  # 2 years
        
        # Outlier detection
        self.OUTLIER_IQR_MULTIPLIER = 1.5
        self.OUTLIER_Z_THRESHOLD = 3.5
        
        # Adjustment limits
        self.MAX_SINGLE_ADJUSTMENT_PCT = 0.30  # 30% max per adjustment
        self.MAX_TOTAL_ADJUSTMENT_PCT = 0.50   # 50% max total
        
        # Scoring weights (sum = 1.0)
        self.SCORING_WEIGHTS = {
            'location': 0.30,
            'size': 0.20,
            'zoning': 0.15,
            'infrastructure': 0.15,
            'time': 0.10,
            'data_quality': 0.10,
        }
    
    # =========================================================================
    # MAIN ENTRY POINT
    # =========================================================================
    
    async def calculate_land_value(
        self,
        subject_property: Property,
        valuation_date: Optional[date] = None
    ) -> LandComparableSalesResult:
        """
        Main entry point: Calculate land value using comparable sales method.
        
        Args:
            subject_property: The property being valued
            valuation_date: Date of valuation (defaults to today)
        
        Returns:
            LandComparableSalesResult with indicated value, confidence, and details
        """
        valuation_date = valuation_date or date.today()
        
        logger.info(f"Starting land comparable sales analysis for property {subject_property.id}")
        
        # Validate subject property has land area
        land_area = subject_property.specifications.land_size_sqm
        if not land_area or land_area <= 0:
            return LandComparableSalesResult(
                success=False,
                error="Subject property has no land area specified",
                method="comparable_land_sales"
            )
        
        # Step 1: Build search criteria
        search_criteria = self._build_search_criteria(subject_property)
        active_criteria = search_criteria  # Track active criteria
        
        # Step 2: Fetch land comparables from database (with auto-relaxing criteria)
        try:
            comparable_properties = await self.market_data.get_land_comparables(search_criteria)
            
            # RETRY LOGIC: If insufficient comparables, relax criteria
            if len(comparable_properties) < self.MIN_COMPARABLES:
                logger.info(f"Initial search found only {len(comparable_properties)}. Relaxing criteria.")
                
                # Relaxed criteria: Double distance, 3 years age, double size tolerance
                # Use a specific relaxed criteria object to avoid modifying the original if it's reused
                relaxed_criteria = self._build_search_criteria(subject_property)
                relaxed_criteria.max_distance_km = 25.0
                relaxed_criteria.max_age_days = 1095  # 3 years
                relaxed_criteria.size_tolerance_pct = 1.0  # +/- 100%
                
                # Update active criteria for scoring
                active_criteria = relaxed_criteria
                
                # Retry search
                comparable_properties = await self.market_data.get_land_comparables(relaxed_criteria)
                logger.info(f"Relaxed search found {len(comparable_properties)} comparables")
                
        except Exception as e:
            logger.error(f"Error fetching land comparables: {e}")
            return LandComparableSalesResult(
                success=False,
                error=f"Failed to fetch land comparables: {str(e)}",
                method="comparable_land_sales"
            )
        
        logger.info(f"Found {len(comparable_properties)} potential land comparables")
        
        if len(comparable_properties) < self.MIN_COMPARABLES:
            return LandComparableSalesResult(
                success=False,
                error=f"Insufficient land comparables found: {len(comparable_properties)} (minimum {self.MIN_COMPARABLES} required)",
                comparables_found=len(comparable_properties),
                method="comparable_land_sales"
            )
        
        # Step 3: Score and analyze each comparable
        analyses: List[LandComparableAnalysis] = []
        for comp in comparable_properties:
            try:
                analysis = self._analyze_comparable(subject_property, comp, valuation_date, criteria=active_criteria)
                if analysis and analysis.score.overall_score >= self.MIN_SCORE_THRESHOLD:
                    analyses.append(analysis)
            except Exception as e:
                logger.warning(f"Error analyzing comparable {comp.id}: {e}")
                continue
        
        logger.info(f"Analyzed {len(analyses)} comparables above score threshold")
        
        if len(analyses) < self.MIN_COMPARABLES:
            return LandComparableSalesResult(
                success=False,
                error=f"Insufficient qualifying comparables: {len(analyses)} (minimum {self.MIN_COMPARABLES} required after scoring)",
                comparables_found=len(comparable_properties),
                comparables_used=len(analyses),
                method="comparable_land_sales"
            )
        
        # Step 4: Sort by score and select top comparables
        analyses.sort(key=lambda x: x.score.overall_score, reverse=True)
        analyses = analyses[:self.MAX_COMPARABLES]
        
        # Step 5: Detect outliers
        analyses = self._detect_outliers(analyses)
        outlier_count = len([a for a in analyses if a.is_outlier])
        
        # Step 6: Get active (non-outlier, non-excluded) comparables
        active_analyses = [a for a in analyses if not a.is_outlier and not a.is_excluded]
        
        if len(active_analyses) < 2:
            return LandComparableSalesResult(
                success=False,
                error=f"Too many outliers detected: {outlier_count} of {len(analyses)} flagged",
                comparables_found=len(comparable_properties),
                comparables_used=len(analyses),
                outliers_excluded=outlier_count,
                method="comparable_land_sales"
            )
        
        # Step 7: Calculate weights based on scores
        self._calculate_weights(active_analyses)
        
        # Step 8: Calculate weighted average land value per sqm
        indicated_value_per_sqm = self._calculate_weighted_average(active_analyses)
        
        # Step 9: Calculate final land value
        indicated_value = indicated_value_per_sqm * land_area
        
        # Step 10: Calculate confidence
        confidence_score, confidence_level = self._calculate_confidence(
            active_analyses, len(comparable_properties)
        )
        
        # Step 11: Build basket with statistics
        basket = self._build_basket(
            valuation_id=subject_property.id,
            search_criteria=search_criteria,
            analyses=analyses,
            indicated_value_per_sqm=indicated_value_per_sqm,
            confidence_score=confidence_score,
            confidence_level=confidence_level
        )
        
        # Step 12: Generate methodology notes
        methodology_notes = self._generate_methodology_notes(active_analyses, basket)
        
        logger.info(
            f"Land comparable analysis complete: GHS {indicated_value:,.0f} "
            f"({indicated_value_per_sqm:,.0f}/sqm), confidence: {confidence_score:.2f}"
        )
        
        return LandComparableSalesResult(
            success=True,
            indicated_value=round(indicated_value, 2),
            value_per_sqm=round(indicated_value_per_sqm, 2),
            land_area_sqm=land_area,
            confidence_score=round(confidence_score, 4),
            confidence_level=confidence_level,
            comparables_found=len(comparable_properties),
            comparables_used=len(active_analyses),
            outliers_excluded=outlier_count,
            basket=basket,
            methodology_notes=methodology_notes,
            assumptions=self._get_assumptions(subject_property, active_analyses),
            limitations=self._get_limitations(active_analyses),
            method="comparable_land_sales"
        )
    
    # =========================================================================
    # SEARCH CRITERIA
    # =========================================================================
    
    def _build_search_criteria(self, subject: Property) -> LandComparableSearchCriteria:
        """Build search criteria for finding land comparables"""
        
        # Determine target zoning from property type
        target_zoning = self._property_type_to_zoning(subject.property_type)
        
        return LandComparableSearchCriteria(
            target_property_id=subject.id,
            target_region=subject.location.region.value if hasattr(subject.location.region, 'value') else subject.location.region,
            target_coordinates=subject.location.coordinates,
            target_land_area_sqm=subject.specifications.land_size_sqm or 0,
            target_zoning=target_zoning,
            max_distance_km=self.MAX_DISTANCE_KM,
            max_age_days=self.MAX_AGE_DAYS,
            min_score_threshold=self.MIN_SCORE_THRESHOLD,
            max_results=self.MAX_COMPARABLES * 3,  # Fetch more for filtering
            size_tolerance_pct=0.50,  # 50% size tolerance for land
        )
    
    def _property_type_to_zoning(self, property_type: PropertyType) -> LandZoning:
        """Map property type to land zoning category"""
        mapping = {
            PropertyType.RESIDENTIAL_HOUSE: LandZoning.RESIDENTIAL,
            PropertyType.RESIDENTIAL_APARTMENT: LandZoning.RESIDENTIAL,
            PropertyType.RESIDENTIAL_TOWNHOUSE: LandZoning.RESIDENTIAL,
            PropertyType.RESIDENTIAL_VILLA: LandZoning.RESIDENTIAL,
            PropertyType.RESIDENTIAL_PENTHOUSE: LandZoning.RESIDENTIAL,
            PropertyType.COMMERCIAL_OFFICE: LandZoning.COMMERCIAL,
            PropertyType.COMMERCIAL_RETAIL: LandZoning.COMMERCIAL,
            PropertyType.COMMERCIAL_WAREHOUSE: LandZoning.COMMERCIAL,
            PropertyType.COMMERCIAL_MIXED_USE: LandZoning.MIXED_USE,
            PropertyType.INDUSTRIAL_WAREHOUSE: LandZoning.INDUSTRIAL,
            PropertyType.INDUSTRIAL_FACTORY: LandZoning.INDUSTRIAL,
            PropertyType.LAND_RESIDENTIAL: LandZoning.RESIDENTIAL,
            PropertyType.LAND_COMMERCIAL: LandZoning.COMMERCIAL,
            PropertyType.LAND_INDUSTRIAL: LandZoning.INDUSTRIAL,
            PropertyType.LAND_AGRICULTURAL: LandZoning.AGRICULTURAL,
        }
        return mapping.get(property_type, LandZoning.UNKNOWN)
    
    # =========================================================================
    # SCORING
    # =========================================================================
    
    def _analyze_comparable(
        self,
        subject: Property,
        comparable: Property,
        valuation_date: date,
        criteria: Optional[LandComparableSearchCriteria] = None
    ) -> Optional[LandComparableAnalysis]:
        """Analyze a single land comparable: score, adjust, and package results"""
        
        # Get active limits (from criteria or defaults)
        max_dist = criteria.max_distance_km if criteria else self.MAX_DISTANCE_KM
        max_age = criteria.max_age_days if criteria else self.MAX_AGE_DAYS
        
        # Basic validation
        if not comparable.specifications.land_size_sqm or comparable.specifications.land_size_sqm <= 0:
            return None
        if not comparable.financials or not comparable.financials.current_price_ghs:
            return None
        
        # Calculate distance
        distance_km = self._calculate_distance(subject, comparable)
        if distance_km is None or distance_km > max_dist:
            return None
        
        # Calculate days since sale
        sale_date = comparable.financials.price_date or valuation_date
        days_since_sale = (valuation_date - sale_date).days
        if days_since_sale > max_age:
            return None
        
        # Original values
        original_price = comparable.financials.current_price_ghs
        land_area = comparable.specifications.land_size_sqm
        original_price_per_sqm = original_price / land_area
        
        # Build land characteristics
        characteristics = self._extract_characteristics(comparable)
        
        # Calculate score
        score = self._calculate_score(subject, comparable, distance_km, days_since_sale, criteria)
        
        # Calculate adjustments
        adjustments = self._calculate_adjustments(
            subject, comparable, valuation_date, original_price
        )
        
        # Sum adjustments
        total_adjustment_ghs = sum(a.adjustment_amount_ghs for a in adjustments)
        total_adjustment_pct = total_adjustment_ghs / original_price if original_price > 0 else 0
        
        # Cap total adjustment
        if abs(total_adjustment_pct) > self.MAX_TOTAL_ADJUSTMENT_PCT:
            cap_factor = self.MAX_TOTAL_ADJUSTMENT_PCT / abs(total_adjustment_pct)
            total_adjustment_ghs = total_adjustment_ghs * cap_factor
            total_adjustment_pct = self.MAX_TOTAL_ADJUSTMENT_PCT * (1 if total_adjustment_pct > 0 else -1)
        
        # Adjusted values
        adjusted_price = original_price + total_adjustment_ghs
        adjusted_price_per_sqm = adjusted_price / land_area
        
        return LandComparableAnalysis(
            comparable_id=comparable.id,
            distance_km=distance_km,
            sale_date=sale_date,
            days_since_sale=days_since_sale,
            original_price_ghs=original_price,
            original_price_per_sqm=original_price_per_sqm,
            land_area_sqm=land_area,
            characteristics=characteristics,
            score=score,
            adjustments=adjustments,
            total_adjustment_ghs=round(total_adjustment_ghs, 2),
            total_adjustment_pct=round(total_adjustment_pct, 4),
            adjusted_price_ghs=round(adjusted_price, 2),
            adjusted_price_per_sqm=round(adjusted_price_per_sqm, 2),
            weight_in_valuation=0,  # Will be calculated later
            source_type="database",
        )
    
    def _calculate_score(
        self,
        subject: Property,
        comparable: Property,
        distance_km: float,
        days_since_sale: int,
        criteria: Optional[LandComparableSearchCriteria] = None
    ) -> LandComparableScore:
        """Calculate 6-factor weighted score for land comparable"""
        
        # Get active limits for scoring normalization
        max_dist = criteria.max_distance_km if criteria else self.MAX_DISTANCE_KM
        max_age = criteria.max_age_days if criteria else self.MAX_AGE_DAYS
        
        # 1. Location score (distance-based)
        location_score = max(0, 1.0 - (distance_km / max_dist))
        
        # 2. Size score (land area similarity)
        subject_area = subject.specifications.land_size_sqm or 1
        comp_area = comparable.specifications.land_size_sqm or 1
        size_ratio = min(subject_area, comp_area) / max(subject_area, comp_area)
        size_score = size_ratio ** 0.5  # Square root to be less punitive
        
        # 3. Zoning score
        subject_zoning = self._property_type_to_zoning(subject.property_type)
        comp_zoning = self._property_type_to_zoning(comparable.property_type)
        zoning_score = 1.0 if subject_zoning == comp_zoning else 0.6
        if subject_zoning == LandZoning.UNKNOWN or comp_zoning == LandZoning.UNKNOWN:
            zoning_score = 0.7  # Unknown penalty
        
        # 4. Infrastructure score
        infrastructure_score = self._calculate_infrastructure_score(subject, comparable)
        
        # 5. Time score (recency)
        time_score = max(0, 1.0 - (days_since_sale / max_age))
        
        # 6. Data quality score
        if hasattr(comparable, 'data_quality') and comparable.data_quality:
            data_quality_score = comparable.data_quality.data_quality_score
        else:
            data_quality_score = 0.7  # Default moderate quality
        
        # Weighted overall score
        overall_score = (
            location_score * self.SCORING_WEIGHTS['location'] +
            size_score * self.SCORING_WEIGHTS['size'] +
            zoning_score * self.SCORING_WEIGHTS['zoning'] +
            infrastructure_score * self.SCORING_WEIGHTS['infrastructure'] +
            time_score * self.SCORING_WEIGHTS['time'] +
            data_quality_score * self.SCORING_WEIGHTS['data_quality']
        )
        
        return LandComparableScore(
            overall_score=round(overall_score, 4),
            location_score=round(location_score, 4),
            size_score=round(size_score, 4),
            zoning_score=round(zoning_score, 4),
            infrastructure_score=round(infrastructure_score, 4),
            time_score=round(time_score, 4),
            data_quality_score=round(data_quality_score, 4),
            component_scores={
                'location': round(location_score, 4),
                'size': round(size_score, 4),
                'zoning': round(zoning_score, 4),
                'infrastructure': round(infrastructure_score, 4),
                'time': round(time_score, 4),
                'data_quality': round(data_quality_score, 4),
            },
            weights=self.SCORING_WEIGHTS.copy(),
        )
    
    def _calculate_infrastructure_score(
        self,
        subject: Property,
        comparable: Property
    ) -> float:
        """Calculate infrastructure similarity score"""
        
        # Compare available infrastructure attributes
        matches = 0
        total = 0
        
        attrs = [
            ('has_generator', 'has_generator'),
            ('has_borehole', 'has_borehole'),
        ]
        
        for subj_attr, comp_attr in attrs:
            subj_val = getattr(subject.specifications, subj_attr, None)
            comp_val = getattr(comparable.specifications, comp_attr, None)
            
            if subj_val is not None and comp_val is not None:
                total += 1
                if subj_val == comp_val:
                    matches += 1
        
        if total == 0:
            return 0.7  # Default score when no data
        
        return 0.5 + (0.5 * matches / total)  # Base 0.5 + up to 0.5 for matches
    
    # =========================================================================
    # ADJUSTMENTS
    # =========================================================================
    
    def _calculate_adjustments(
        self,
        subject: Property,
        comparable: Property,
        valuation_date: date,
        original_price: float
    ) -> List[LandAdjustment]:
        """Calculate all land-specific adjustments"""
        
        adjustments = []
        
        # 1. Time adjustment (market appreciation)
        time_adj = self._calculate_time_adjustment(comparable, valuation_date, original_price)
        if time_adj:
            adjustments.append(time_adj)
        
        # 2. Size adjustment (economies of scale)
        size_adj = self._calculate_size_adjustment(subject, comparable, original_price)
        if size_adj:
            adjustments.append(size_adj)
        
        # 3. Zoning adjustment
        zoning_adj = self._calculate_zoning_adjustment(subject, comparable)
        if zoning_adj:
            adjustments.append(zoning_adj)
        
        # 4. Infrastructure adjustment
        infra_adj = self._calculate_infrastructure_adjustment(subject, comparable, original_price)
        if infra_adj:
            adjustments.append(infra_adj)
        
        # 5. Access/Road adjustment
        access_adj = self._calculate_access_adjustment(subject, comparable, original_price)
        if access_adj:
            adjustments.append(access_adj)
        
        # 6. Tenure adjustment
        tenure_adj = self._calculate_tenure_adjustment(subject, comparable, original_price)
        if tenure_adj:
            adjustments.append(tenure_adj)
        
        # 7. Topography adjustment
        topo_adj = self._calculate_topography_adjustment(subject, comparable, original_price)
        if topo_adj:
            adjustments.append(topo_adj)
        
        # 8. Shape adjustment
        shape_adj = self._calculate_shape_adjustment(subject, comparable, original_price)
        if shape_adj:
            adjustments.append(shape_adj)
        
        return adjustments
    
    def _calculate_time_adjustment(
        self,
        comparable: Property,
        valuation_date: date,
        original_price: float
    ) -> Optional[LandAdjustment]:
        """Calculate time adjustment based on market appreciation"""
        
        sale_date = comparable.financials.price_date or valuation_date
        days_since_sale = (valuation_date - sale_date).days
        
        if days_since_sale < 30:  # Less than 1 month, no adjustment
            return None
        
        # Get regional appreciation rate
        region = comparable.location.region
        if hasattr(region, 'value'):
            region_key = GhanaRegion(region.value)
        else:
            region_key = GhanaRegion(region) if region in [r.value for r in GhanaRegion] else None
        
        annual_rate = LAND_APPRECIATION_RATES.get(region_key, DEFAULT_APPRECIATION_RATE)
        
        # Calculate adjustment
        years = days_since_sale / 365.0
        appreciation_factor = (1 + annual_rate) ** years - 1
        adjustment_amount = original_price * appreciation_factor
        
        # Cap adjustment
        if abs(appreciation_factor) > self.MAX_SINGLE_ADJUSTMENT_PCT:
            appreciation_factor = self.MAX_SINGLE_ADJUSTMENT_PCT
            adjustment_amount = original_price * appreciation_factor
        
        return LandAdjustment(
            adjustment_type=LandAdjustmentType.TIME,
            adjustment_amount_ghs=round(adjustment_amount, 2),
            adjustment_percentage=round(appreciation_factor, 4),
            confidence=0.75,
            methodology="Time Adjustment",
            assumptions=[
                f"Sale date: {sale_date}",
                f"Days since sale: {days_since_sale}",
                f"Annual appreciation rate: {annual_rate*100:.1f}%",
            ],
            comparable_value=str(sale_date),
            subject_value=str(valuation_date),
        )
    
    def _calculate_size_adjustment(
        self,
        subject: Property,
        comparable: Property,
        original_price: float
    ) -> Optional[LandAdjustment]:
        """Calculate size adjustment based on economies of scale"""
        
        subject_area = subject.specifications.land_size_sqm
        comp_area = comparable.specifications.land_size_sqm
        
        if not subject_area or not comp_area:
            return None
        
        # Size ratio
        size_ratio = subject_area / comp_area
        
        if abs(size_ratio - 1.0) < 0.10:  # Within 10%, no adjustment
            return None
        
        # Apply elasticity: larger plots have lower per-sqm prices
        # If subject is larger, apply negative adjustment (premium to comparable)
        # If subject is smaller, apply positive adjustment (discount to comparable)
        elasticity = SIZE_ADJUSTMENT_FACTORS['base_elasticity']
        size_factor = elasticity * (size_ratio - 1.0)
        
        # Cap adjustment
        if abs(size_factor) > self.MAX_SINGLE_ADJUSTMENT_PCT:
            size_factor = self.MAX_SINGLE_ADJUSTMENT_PCT * (1 if size_factor > 0 else -1)
        
        adjustment_amount = original_price * size_factor
        
        return LandAdjustment(
            adjustment_type=LandAdjustmentType.SIZE,
            adjustment_amount_ghs=round(adjustment_amount, 2),
            adjustment_percentage=round(size_factor, 4),
            confidence=0.80,
            methodology="Size Adjustment (Economies of Scale)",
            assumptions=[
                f"Subject land area: {subject_area:,.0f} sqm",
                f"Comparable land area: {comp_area:,.0f} sqm",
                f"Size ratio: {size_ratio:.2f}",
                f"Elasticity factor: {elasticity}",
            ],
            comparable_value=f"{comp_area:,.0f} sqm",
            subject_value=f"{subject_area:,.0f} sqm",
        )
    
    def _calculate_zoning_adjustment(
        self,
        subject: Property,
        comparable: Property
    ) -> Optional[LandAdjustment]:
        """Calculate zoning adjustment based on use category"""
        
        subject_zoning = self._property_type_to_zoning(subject.property_type)
        comp_zoning = self._property_type_to_zoning(comparable.property_type)
        
        if subject_zoning == comp_zoning:
            return None
        
        if subject_zoning == LandZoning.UNKNOWN or comp_zoning == LandZoning.UNKNOWN:
            return None
        
        # Get adjustment from matrix
        comp_adjustments = ZONING_ADJUSTMENTS.get(comp_zoning, {})
        adjustment_per_sqm = comp_adjustments.get(subject_zoning, 0)
        
        if adjustment_per_sqm == 0:
            return None
        
        land_area = comparable.specifications.land_size_sqm or 0
        adjustment_amount = adjustment_per_sqm * land_area
        original_price = comparable.financials.current_price_ghs or 1
        adjustment_pct = adjustment_amount / original_price
        
        return LandAdjustment(
            adjustment_type=LandAdjustmentType.ZONING,
            adjustment_amount_ghs=round(adjustment_amount, 2),
            adjustment_percentage=round(adjustment_pct, 4),
            confidence=0.70,
            methodology="Zoning Adjustment",
            assumptions=[
                f"Subject zoning: {subject_zoning.value}",
                f"Comparable zoning: {comp_zoning.value}",
                f"Adjustment rate: GHS {adjustment_per_sqm}/sqm",
            ],
            comparable_value=comp_zoning.value,
            subject_value=subject_zoning.value,
        )
    
    def _calculate_infrastructure_adjustment(
        self,
        subject: Property,
        comparable: Property,
        original_price: float
    ) -> Optional[LandAdjustment]:
        """Calculate infrastructure adjustment based on utilities availability"""
        
        # This is a simplified version - in practice would check actual utility data
        # For now, we compare what data is available
        
        subject_score = 0
        comp_score = 0
        factors_checked = 0
        
        # Check generator (proxy for power reliability)
        if subject.specifications.has_generator is not None and comparable.specifications.has_generator is not None:
            factors_checked += 1
            if subject.specifications.has_generator:
                subject_score += 1
            if comparable.specifications.has_generator:
                comp_score += 1
        
        # Check borehole (proxy for water)
        if subject.specifications.has_borehole is not None and comparable.specifications.has_borehole is not None:
            factors_checked += 1
            if subject.specifications.has_borehole:
                subject_score += 1
            if comparable.specifications.has_borehole:
                comp_score += 1
        
        if factors_checked == 0 or subject_score == comp_score:
            return None
        
        # Calculate adjustment
        score_diff = subject_score - comp_score
        adjustment_pct = score_diff * 0.05  # 5% per infrastructure factor
        adjustment_amount = original_price * adjustment_pct
        
        return LandAdjustment(
            adjustment_type=LandAdjustmentType.INFRASTRUCTURE,
            adjustment_amount_ghs=round(adjustment_amount, 2),
            adjustment_percentage=round(adjustment_pct, 4),
            confidence=0.65,
            methodology="Infrastructure Adjustment",
            assumptions=[
                f"Subject infrastructure score: {subject_score}/{factors_checked}",
                f"Comparable infrastructure score: {comp_score}/{factors_checked}",
                "Adjustment per factor: 5%",
            ],
        )
    
    def _calculate_access_adjustment(
        self,
        subject: Property,
        comparable: Property,
        original_price: float
    ) -> Optional[LandAdjustment]:
        """Calculate road access adjustment"""
        
        # Check if access data available (would need road_type field in property)
        # For now, use location neighborhood as proxy
        # This is a placeholder - actual implementation would use road data
        
        return None  # No adjustment if no data
    
    def _calculate_tenure_adjustment(
        self,
        subject: Property,
        comparable: Property,
        original_price: float
    ) -> Optional[LandAdjustment]:
        """Calculate land tenure adjustment"""
        
        subject_tenure = subject.specifications.land_tenure
        comp_tenure = comparable.specifications.land_tenure
        
        if not subject_tenure or not comp_tenure:
            return None
        
        if subject_tenure == comp_tenure:
            return None
        
        # Map to our enum
        def map_tenure(t) -> LandTenureType:
            if t == PropertyLandTenureType.FREEHOLD:
                return LandTenureType.FREEHOLD
            elif t == PropertyLandTenureType.LEASEHOLD:
                return LandTenureType.LEASEHOLD
            elif t == PropertyLandTenureType.STOOL_LAND:
                return LandTenureType.STOOL_LAND
            elif t == PropertyLandTenureType.FAMILY_LAND:
                return LandTenureType.FAMILY_LAND
            elif t == PropertyLandTenureType.GOVERNMENT_LAND:
                return LandTenureType.GOVERNMENT_LAND
            return LandTenureType.UNKNOWN
        
        subject_mapped = map_tenure(subject_tenure)
        comp_mapped = map_tenure(comp_tenure)
        
        subject_factor = TENURE_FACTORS.get(subject_mapped, 1.0)
        comp_factor = TENURE_FACTORS.get(comp_mapped, 1.0)
        
        if subject_factor == comp_factor:
            return None
        
        # Adjustment to bring comparable to subject's tenure level
        adjustment_pct = (subject_factor / comp_factor) - 1.0
        adjustment_amount = original_price * adjustment_pct
        
        return LandAdjustment(
            adjustment_type=LandAdjustmentType.TENURE,
            adjustment_amount_ghs=round(adjustment_amount, 2),
            adjustment_percentage=round(adjustment_pct, 4),
            confidence=0.80,
            methodology="Tenure Adjustment",
            assumptions=[
                f"Subject tenure: {subject_mapped.value} (factor: {subject_factor})",
                f"Comparable tenure: {comp_mapped.value} (factor: {comp_factor})",
            ],
            comparable_value=comp_mapped.value,
            subject_value=subject_mapped.value,
        )
    
    def _calculate_topography_adjustment(
        self,
        subject: Property,
        comparable: Property,
        original_price: float
    ) -> Optional[LandAdjustment]:
        """Calculate topography adjustment"""
        # Would need topography data in property schema
        # Placeholder for future implementation
        return None
    
    def _calculate_shape_adjustment(
        self,
        subject: Property,
        comparable: Property,
        original_price: float
    ) -> Optional[LandAdjustment]:
        """Calculate plot shape adjustment"""
        # Would need shape data in property schema
        # Placeholder for future implementation
        return None
    
    # =========================================================================
    # OUTLIER DETECTION
    # =========================================================================
    
    def _detect_outliers(
        self,
        analyses: List[LandComparableAnalysis]
    ) -> List[LandComparableAnalysis]:
        """
        Detect outliers using BOTH IQR and Modified Z-Score methods.
        A value is only flagged as outlier if BOTH methods agree.
        """
        
        if len(analyses) < 4:
            # Not enough data for reliable outlier detection
            return analyses
        
        # Get adjusted prices per sqm
        values = [a.adjusted_price_per_sqm for a in analyses]
        
        # IQR method
        q1 = np.percentile(values, 25)
        q3 = np.percentile(values, 75)
        iqr = q3 - q1
        iqr_lower = q1 - (self.OUTLIER_IQR_MULTIPLIER * iqr)
        iqr_upper = q3 + (self.OUTLIER_IQR_MULTIPLIER * iqr)
        
        # Modified Z-Score using MAD (Median Absolute Deviation)
        median_value = np.median(values)
        mad = np.median([abs(v - median_value) for v in values])
        
        for analysis in analyses:
            v = analysis.adjusted_price_per_sqm
            
            # IQR check
            iqr_flagged = v < iqr_lower or v > iqr_upper
            
            # Modified Z-Score check
            if mad > 0:
                modified_z = 0.6745 * (v - median_value) / mad
                z_flagged = abs(modified_z) > self.OUTLIER_Z_THRESHOLD
            else:
                modified_z = 0
                z_flagged = False
            
            # Update outlier info
            analysis.outlier_info = OutlierInfo(
                is_outlier=iqr_flagged and z_flagged,  # BOTH must agree
                outlier_reason=f"Value GHS {v:,.0f}/sqm outside range [{iqr_lower:,.0f}, {iqr_upper:,.0f}]" if (iqr_flagged and z_flagged) else None,
                detection_method=OutlierDetectionMethod.BOTH,
                iqr_flagged=iqr_flagged,
                iqr_lower_bound=round(iqr_lower, 2),
                iqr_upper_bound=round(iqr_upper, 2),
                z_score_flagged=z_flagged,
                modified_z_score=round(modified_z, 4) if mad > 0 else None,
                z_score_threshold=self.OUTLIER_Z_THRESHOLD,
                median_value=round(median_value, 2),
                mad_value=round(mad, 2) if mad > 0 else None,
            )
            
            analysis.is_outlier = analysis.outlier_info.is_outlier
            analysis.outlier_reason = analysis.outlier_info.outlier_reason
        
        return analyses
    
    # =========================================================================
    # WEIGHTING AND VALUE CALCULATION
    # =========================================================================
    
    def _calculate_weights(self, analyses: List[LandComparableAnalysis]) -> None:
        """Calculate valuation weights based on similarity scores"""
        
        if not analyses:
            return
        
        # Use overall score as weight
        total_score = sum(a.score.overall_score for a in analyses)
        
        if total_score == 0:
            # Equal weights if no scores
            for a in analyses:
                a.weight_in_valuation = 1.0 / len(analyses)
        else:
            for a in analyses:
                a.weight_in_valuation = round(a.score.overall_score / total_score, 4)
    
    def _calculate_weighted_average(
        self,
        analyses: List[LandComparableAnalysis]
    ) -> float:
        """Calculate weighted average land value per sqm"""
        
        if not analyses:
            return 0
        
        weighted_sum = sum(
            a.adjusted_price_per_sqm * a.weight_in_valuation 
            for a in analyses
        )
        total_weight = sum(a.weight_in_valuation for a in analyses)
        
        return weighted_sum / total_weight if total_weight > 0 else 0
    
    # =========================================================================
    # CONFIDENCE CALCULATION
    # =========================================================================
    
    def _calculate_confidence(
        self,
        analyses: List[LandComparableAnalysis],
        total_found: int
    ) -> Tuple[float, ConfidenceLevel]:
        """Calculate overall confidence score and level"""
        
        factors = []
        
        # Factor 1: Number of comparables (more is better, up to 5)
        count_factor = min(len(analyses) / 5.0, 1.0)
        factors.append(count_factor * 0.25)
        
        # Factor 2: Average similarity score
        avg_score = statistics.mean(a.score.overall_score for a in analyses)
        factors.append(avg_score * 0.30)
        
        # Factor 3: Value consistency (low CoV is better)
        values = [a.adjusted_price_per_sqm for a in analyses]
        if len(values) > 1:
            try:
                cov = statistics.stdev(values) / statistics.mean(values)
                consistency_factor = max(0, 1.0 - min(cov, 1.0))
            except (ZeroDivisionError, statistics.StatisticsError):
                consistency_factor = 0.5
        else:
            consistency_factor = 0.5
        factors.append(consistency_factor * 0.25)
        
        # Factor 4: Recency (average days since sale)
        avg_days = statistics.mean(a.days_since_sale for a in analyses)
        recency_factor = max(0, 1.0 - (avg_days / self.MAX_AGE_DAYS))
        factors.append(recency_factor * 0.20)
        
        confidence_score = sum(factors)
        
        # Determine level
        if confidence_score >= 0.75:
            level = ConfidenceLevel.HIGH
        elif confidence_score >= 0.50:
            level = ConfidenceLevel.MODERATE
        else:
            level = ConfidenceLevel.LOW
        
        return confidence_score, level
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    def _calculate_distance(
        self,
        subject: Property,
        comparable: Property
    ) -> Optional[float]:
        """Calculate distance between two properties using Haversine formula"""
        
        # If subject has no coordinates, we can't calculate distance
        # Return 0 to indicate "unknown distance" - allows regional fallback
        if not subject.location.coordinates:
            # No subject coordinates - allow by returning 0 (treat as same location)
            return 0.0
        
        if not comparable.location.coordinates:
            # Comparable has no coordinates - return moderate distance
            return 5.0  # Default to 5km (within typical search radius)
        
        lat1, lon1 = subject.location.coordinates
        lat2, lon2 = comparable.location.coordinates
        
        # Haversine formula
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a))
        r = 6371  # Earth radius in km
        
        return round(c * r, 3)
    
    def _extract_characteristics(self, comparable: Property) -> LandCharacteristics:
        """Extract land characteristics from property"""
        
        # Map tenure type
        tenure = LandTenureType.UNKNOWN
        if comparable.specifications.land_tenure:
            tenure_map = {
                PropertyLandTenureType.FREEHOLD: LandTenureType.FREEHOLD,
                PropertyLandTenureType.LEASEHOLD: LandTenureType.LEASEHOLD,
                PropertyLandTenureType.STOOL_LAND: LandTenureType.STOOL_LAND,
                PropertyLandTenureType.FAMILY_LAND: LandTenureType.FAMILY_LAND,
                PropertyLandTenureType.GOVERNMENT_LAND: LandTenureType.GOVERNMENT_LAND,
            }
            tenure = tenure_map.get(comparable.specifications.land_tenure, LandTenureType.UNKNOWN)
        
        return LandCharacteristics(
            region=comparable.location.region.value if hasattr(comparable.location.region, 'value') else str(comparable.location.region),
            district=comparable.location.district,
            locality=None,
            neighborhood=comparable.location.neighborhood,
            coordinates=comparable.location.coordinates,
            zoning=self._property_type_to_zoning(comparable.property_type),
            tenure_type=tenure,
            lease_years_remaining=comparable.specifications.lease_years_remaining,
            has_road_access=None,
            road_type=RoadAccessType.UNKNOWN,
            has_electricity=None,
            has_water=comparable.specifications.has_borehole,
            has_sewage=None,
            topography=Topography.UNKNOWN,
            shape=LandShape.UNKNOWN,
        )
    
    def _build_basket(
        self,
        valuation_id: str,
        search_criteria: LandComparableSearchCriteria,
        analyses: List[LandComparableAnalysis],
        indicated_value_per_sqm: float,
        confidence_score: float,
        confidence_level: ConfidenceLevel
    ) -> LandComparableBasket:
        """Build the complete basket with statistics"""
        
        active = [a for a in analyses if not a.is_outlier and not a.is_excluded]
        outliers = [a for a in analyses if a.is_outlier]
        
        # Calculate statistics from active comparables
        if active:
            values = [a.adjusted_price_per_sqm for a in active]
            mean_val = statistics.mean(values)
            median_val = statistics.median(values)
            std_dev = statistics.stdev(values) if len(values) > 1 else 0
            cov = std_dev / mean_val if mean_val > 0 else 0
            
            avg_score = statistics.mean(a.score.overall_score for a in active)
            avg_distance = statistics.mean(a.distance_km for a in active)
            avg_days = statistics.mean(a.days_since_sale for a in active)
        else:
            mean_val = median_val = std_dev = cov = 0
            avg_score = avg_distance = avg_days = 0
        
        # Get IQR bounds from first analysis with outlier info
        iqr_lower = iqr_upper = None
        for a in analyses:
            if a.outlier_info and a.outlier_info.iqr_lower_bound is not None:
                iqr_lower = a.outlier_info.iqr_lower_bound
                iqr_upper = a.outlier_info.iqr_upper_bound
                break
        
        return LandComparableBasket(
            valuation_id=valuation_id,
            search_criteria=search_criteria,
            comparables=analyses,
            active_comparables=len(active),
            mean_adjusted_price_per_sqm=round(mean_val, 2) if mean_val else None,
            median_adjusted_price_per_sqm=round(median_val, 2) if median_val else None,
            std_deviation=round(std_dev, 2) if std_dev else None,
            coefficient_of_variation=round(cov, 4) if cov else None,
            value_range_low=round(min(values), 2) if active else None,
            value_range_high=round(max(values), 2) if active else None,
            outliers_detected=len(outliers),
            outlier_ids=[a.comparable_id for a in outliers],
            iqr_lower_bound=iqr_lower,
            iqr_upper_bound=iqr_upper,
            iqr_multiplier=self.OUTLIER_IQR_MULTIPLIER,
            average_score=round(avg_score, 4) if avg_score else None,
            average_distance_km=round(avg_distance, 2) if avg_distance else None,
            average_days_since_sale=round(avg_days, 0) if avg_days else None,
            indicated_land_value_per_sqm=round(indicated_value_per_sqm, 2),
            indicated_land_value=round(indicated_value_per_sqm * search_criteria.target_land_area_sqm, 2),
            confidence_score=round(confidence_score, 4),
            confidence_level=confidence_level,
        )
    
    def _generate_methodology_notes(
        self,
        analyses: List[LandComparableAnalysis],
        basket: LandComparableBasket
    ) -> str:
        """Generate methodology documentation"""
        
        return (
            f"Land value estimated using {len(analyses)} comparable land sales. "
            f"Comparables scored on 6 factors (location {self.SCORING_WEIGHTS['location']*100:.0f}%, "
            f"size {self.SCORING_WEIGHTS['size']*100:.0f}%, "
            f"zoning {self.SCORING_WEIGHTS['zoning']*100:.0f}%, "
            f"infrastructure {self.SCORING_WEIGHTS['infrastructure']*100:.0f}%, "
            f"time {self.SCORING_WEIGHTS['time']*100:.0f}%, "
            f"data quality {self.SCORING_WEIGHTS['data_quality']*100:.0f}%). "
            f"Adjustments applied for time, size, zoning, infrastructure, tenure. "
            f"Outlier detection using IQR (×{self.OUTLIER_IQR_MULTIPLIER}) and Modified Z-Score (threshold {self.OUTLIER_Z_THRESHOLD}). "
            f"{basket.outliers_detected} outlier(s) excluded. "
            f"Average distance: {basket.average_distance_km or 0:.1f}km. "
            f"Average sale age: {basket.average_days_since_sale or 0:.0f} days."
        )
    
    def _get_assumptions(
        self,
        subject: Property,
        analyses: List[LandComparableAnalysis]
    ) -> List[str]:
        """List key assumptions made"""
        
        return [
            "Land comparables are from arm's length transactions",
            "Market conditions have not changed significantly since comparable sales",
            f"Search radius: {self.MAX_DISTANCE_KM}km, max age: {self.MAX_AGE_DAYS} days",
            "Size adjustment assumes -15% elasticity for economies of scale",
            "Regional appreciation rates based on market analysis",
        ]
    
    def _get_limitations(
        self,
        analyses: List[LandComparableAnalysis]
    ) -> List[str]:
        """List limitations of the analysis"""
        
        limitations = []
        
        if len(analyses) < 5:
            limitations.append(f"Limited to {len(analyses)} qualifying comparables")
        
        # Check for missing data
        missing_tenure = sum(1 for a in analyses if a.characteristics.tenure_type == LandTenureType.UNKNOWN)
        if missing_tenure > 0:
            limitations.append(f"{missing_tenure} comparable(s) missing tenure information")
        
        missing_infra = sum(1 for a in analyses if a.characteristics.road_type == RoadAccessType.UNKNOWN)
        if missing_infra > 0:
            limitations.append(f"{missing_infra} comparable(s) missing infrastructure information")
        
        return limitations
