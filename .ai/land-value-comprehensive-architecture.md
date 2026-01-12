# Land Value Calculation - Comprehensive Architecture

## Overview

This document outlines the comprehensive architecture for calculating land value using **three methods**:

1. **Comparable Land Sales Method** (Auto-Scored & Adjusted)
2. **Residual (GDV-Based) Method** 
3. **User-Entered Method**

Final land value is determined via **intelligent weight-averaging** with outlier detection and method failure handling. The calculated land value flows through all valuation approaches.

---

## Executive Summary

### Three-Method Land Valuation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LAND VALUE CALCULATION ENGINE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   COMPARABLE     │  │    RESIDUAL      │  │   USER-ENTERED   │          │
│  │   LAND SALES     │  │   (GDV-BASED)    │  │     MANUAL       │          │
│  │                  │  │                  │  │                  │          │
│  │ • Auto-score     │  │ • GDV calc       │  │ • Direct entry   │          │
│  │ • Auto-select    │  │ • Developer %    │  │ • Variance check │          │
│  │ • Auto-adjust    │  │ • Finance costs  │  │ • Justification  │          │
│  │ • Weighted avg   │  │ • Residual calc  │  │ • Evidence link  │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                     │                     │
│           ▼                     ▼                     ▼                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    RECONCILIATION ENGINE                             │   │
│  │                                                                       │   │
│  │  • Outlier Detection (IQR + Modified Z-Score)                        │   │
│  │  • Method Failure Handling (Dynamic Weight Redistribution)           │   │
│  │  • Confidence-Based Weighting                                        │   │
│  │  • Property Type Specific Weights                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    FINAL LAND VALUE                                  │   │
│  │  • Weighted average (after outlier exclusion)                        │   │
│  │  • Confidence score & level                                          │   │
│  │  • Disclosure requirements                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │               CROSS-APPROACH VALUE FLOW                              │   │
│  │                                                                       │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐            │   │
│  │  │ COST APPROACH │  │    INCOME     │  │   RESIDUAL    │            │   │
│  │  │               │  │   APPROACH    │  │    METHOD     │            │   │
│  │  │ Land + RCN    │  │ NOI ÷ Cap     │  │ GDV - Costs   │            │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Comparable Land Sales Method

### 1.1 Existing Infrastructure (FROM CODEBASE)

The codebase already has:

| Component | Location | Status |
|-----------|----------|--------|
| `SalesComparisonApproach` | `sales_comparison.py` | ✅ Exists - for improved properties |
| `ComparableBasketService` | `comparable_basket.py` | ✅ Exists - basket management |
| Similarity scoring | `sales_comparison.py` L263-310 | ✅ Exists - 6-factor weighted |
| Adjustment calculations | `sales_comparison.py` L350-710 | ✅ Exists - 11 adjustment types |
| Weight calculation | `sales_comparison.py` | ✅ Exists - similarity/distance/age |

### 1.2 Gap: Land-Specific Comparable Service

**What's Missing:**
- Land transactions are mixed with improved property transactions
- No land-specific scoring (e.g., zoning, frontage, topography)
- No land-specific adjustments (e.g., infrastructure access, development potential)
- No auto-selection for Cost Approach integration

### 1.3 New Service: `LandComparableSalesService`

```python
# backend/src/services/valuation-engine/python/app/services/land_comparable_sales.py

"""
Land Comparable Sales Service
Automated scoring, selection, adjustment, and valuation of land comparables
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import date, timedelta
from dataclasses import dataclass
from enum import Enum
import numpy as np
import statistics
import logging

from ..schemas import (
    Property,
    GhanaRegion,
    LandUseZoning,
    ComparableSearch,
    ValuationMethodResult,
    ValuationMethod
)
from ..adapters.data_hub_adapter import MarketDataAdapter

logger = logging.getLogger(__name__)


class LandCharacteristic(str, Enum):
    """Land-specific characteristics for adjustment"""
    ZONING = "zoning"
    INFRASTRUCTURE = "infrastructure"
    TOPOGRAPHY = "topography"
    SHAPE = "shape"
    FRONTAGE = "frontage"
    ACCESS = "access"
    UTILITIES = "utilities"
    DEVELOPMENT_POTENTIAL = "development_potential"
    TENURE = "tenure"


@dataclass
class LandComparableScore:
    """Scoring result for a land comparable"""
    overall_score: float
    location_score: float
    size_score: float
    zoning_score: float
    infrastructure_score: float
    time_score: float
    data_quality_score: float
    component_scores: Dict[str, float]
    weights: Dict[str, float]


@dataclass
class LandAdjustment:
    """Individual adjustment for land comparable"""
    adjustment_type: LandCharacteristic
    adjustment_amount_ghs: float
    adjustment_percentage: float
    confidence: float
    methodology: str
    assumptions: List[str]


@dataclass
class LandComparableAnalysis:
    """Complete analysis of a land comparable"""
    comparable_id: str
    distance_km: float
    days_since_sale: int
    sale_date: date
    original_price_ghs: float
    original_price_per_sqm: float
    land_area_sqm: float
    score: LandComparableScore
    adjustments: List[LandAdjustment]
    total_adjustment_ghs: float
    total_adjustment_pct: float
    adjusted_price_ghs: float
    adjusted_price_per_sqm: float
    weight_in_valuation: float
    is_outlier: bool
    outlier_reason: Optional[str]


class LandComparableSalesService:
    """
    Automated land comparable sales analysis for the Cost Approach.
    
    Workflow:
    1. Search for land comparables within criteria
    2. Score each comparable (automated)
    3. Apply land-specific adjustments
    4. Detect and flag outliers
    5. Calculate weighted average land value
    """
    
    def __init__(self, market_data_adapter: MarketDataAdapter):
        self.market_data = market_data_adapter
        
        # Configuration
        self.MIN_COMPARABLES = 3
        self.MAX_COMPARABLES = 7
        self.MAX_DISTANCE_KM = 10.0
        self.MAX_AGE_DAYS = 730  # 2 years for land
        self.MIN_SCORE_THRESHOLD = 0.50
        self.OUTLIER_IQR_MULTIPLIER = 1.5
        
        # Land scoring weights (sum = 1.0)
        self.SCORING_WEIGHTS = {
            'location': 0.30,      # Proximity to subject
            'size': 0.20,          # Land area similarity
            'zoning': 0.15,        # Zoning compatibility
            'infrastructure': 0.15, # Infrastructure access
            'time': 0.10,          # Recency of sale
            'data_quality': 0.10   # Source reliability
        }
        
        # Land adjustment factors by region (GHS/sqm adjustments)
        # Source: Market analysis from properties table + regional multipliers
        self.ZONING_ADJUSTMENTS = {
            'residential': {'commercial': -150, 'industrial': -200, 'mixed_use': -50},
            'commercial': {'residential': 150, 'industrial': 50, 'mixed_use': 75},
            # ... similar for other zones
        }
        
        self.INFRASTRUCTURE_FACTORS = {
            'paved_road': 1.15,
            'unpaved_road': 1.00,
            'no_road': 0.75,
            'water_available': 1.10,
            'water_unavailable': 0.90,
            'electricity_available': 1.10,
            'electricity_unavailable': 0.85
        }
    
    async def calculate_land_value(
        self,
        subject_property: Property,
        valuation_date: date = None
    ) -> Dict[str, Any]:
        """
        Main entry point: Calculate land value using comparable sales method.
        
        Returns:
            {
                'indicated_value': float,
                'value_per_sqm': float,
                'confidence_score': float,
                'comparables_used': int,
                'comparables_analyzed': List[LandComparableAnalysis],
                'outliers_excluded': List[str],
                'methodology_notes': str,
                'success': bool,
                'error': Optional[str]
            }
        """
        valuation_date = valuation_date or date.today()
        
        # Step 1: Search for land comparables
        search_criteria = self._build_land_search_criteria(subject_property)
        comparables = await self.market_data.get_land_comparables(search_criteria)
        
        if len(comparables) < self.MIN_COMPARABLES:
            return {
                'success': False,
                'error': f'Insufficient land comparables found: {len(comparables)} (minimum {self.MIN_COMPARABLES})',
                'comparables_found': len(comparables)
            }
        
        # Step 2: Score each comparable
        scored_comparables = []
        for comp in comparables:
            score = self._score_land_comparable(subject_property, comp, valuation_date)
            if score.overall_score >= self.MIN_SCORE_THRESHOLD:
                scored_comparables.append((comp, score))
        
        # Step 3: Rank and select top comparables
        scored_comparables.sort(key=lambda x: x[1].overall_score, reverse=True)
        selected = scored_comparables[:self.MAX_COMPARABLES]
        
        # Step 4: Apply adjustments to each
        analyses = []
        for comp, score in selected:
            analysis = self._analyze_land_comparable(
                subject_property, comp, score, valuation_date
            )
            analyses.append(analysis)
        
        # Step 5: Detect outliers
        analyses = self._detect_outliers(analyses)
        
        # Step 6: Calculate weighted average (excluding outliers)
        valid_analyses = [a for a in analyses if not a.is_outlier]
        
        if len(valid_analyses) < 2:
            return {
                'success': False,
                'error': 'Too many outliers - insufficient valid comparables',
                'comparables_analyzed': len(analyses),
                'outliers_detected': len([a for a in analyses if a.is_outlier])
            }
        
        # Weight by score
        total_weight = sum(a.weight_in_valuation for a in valid_analyses)
        weighted_sum = sum(a.adjusted_price_per_sqm * a.weight_in_valuation for a in valid_analyses)
        indicated_value_per_sqm = weighted_sum / total_weight if total_weight > 0 else 0
        
        # Apply to subject land area
        land_area = subject_property.specifications.land_size_sqm or 0
        indicated_value = indicated_value_per_sqm * land_area
        
        # Calculate confidence
        confidence_score = self._calculate_confidence(valid_analyses)
        
        return {
            'success': True,
            'indicated_value': round(indicated_value, 2),
            'value_per_sqm': round(indicated_value_per_sqm, 2),
            'confidence_score': round(confidence_score, 3),
            'comparables_used': len(valid_analyses),
            'comparables_analyzed': [self._serialize_analysis(a) for a in analyses],
            'outliers_excluded': [a.comparable_id for a in analyses if a.is_outlier],
            'methodology_notes': self._generate_methodology_notes(valid_analyses),
            'method': 'comparable_land_sales'
        }
    
    def _score_land_comparable(
        self,
        subject: Property,
        comparable: Property,
        valuation_date: date
    ) -> LandComparableScore:
        """Score a land comparable on multiple factors"""
        
        # Location score (distance-based)
        distance_km = self._calculate_distance(subject, comparable)
        location_score = max(0, 1.0 - (distance_km / self.MAX_DISTANCE_KM))
        
        # Size score (area similarity)
        subject_area = subject.specifications.land_size_sqm or 0
        comp_area = comparable.specifications.land_size_sqm or 0
        if subject_area > 0 and comp_area > 0:
            size_ratio = min(subject_area, comp_area) / max(subject_area, comp_area)
            size_score = size_ratio ** 0.5  # Square root to be less punitive
        else:
            size_score = 0.5
        
        # Zoning score
        if hasattr(subject, 'zoning') and hasattr(comparable, 'zoning'):
            zoning_score = 1.0 if subject.zoning == comparable.zoning else 0.6
        else:
            zoning_score = 0.7  # Unknown zoning
        
        # Infrastructure score
        infrastructure_score = self._score_infrastructure_similarity(subject, comparable)
        
        # Time score (recency)
        sale_date = comparable.financials.price_date or valuation_date
        days_since = (valuation_date - sale_date).days
        time_score = max(0, 1.0 - (days_since / self.MAX_AGE_DAYS))
        
        # Data quality score
        data_quality_score = comparable.data_quality.data_quality_score if hasattr(comparable, 'data_quality') else 0.7
        
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
            overall_score=overall_score,
            location_score=location_score,
            size_score=size_score,
            zoning_score=zoning_score,
            infrastructure_score=infrastructure_score,
            time_score=time_score,
            data_quality_score=data_quality_score,
            component_scores={
                'location': location_score,
                'size': size_score,
                'zoning': zoning_score,
                'infrastructure': infrastructure_score,
                'time': time_score,
                'data_quality': data_quality_score
            },
            weights=self.SCORING_WEIGHTS
        )
    
    def _analyze_land_comparable(
        self,
        subject: Property,
        comparable: Property,
        score: LandComparableScore,
        valuation_date: date
    ) -> LandComparableAnalysis:
        """Apply adjustments and calculate adjusted value"""
        
        sale_price = comparable.financials.current_price_ghs or 0
        land_area = comparable.specifications.land_size_sqm or 1
        original_price_per_sqm = sale_price / land_area
        sale_date = comparable.financials.price_date or valuation_date
        days_since = (valuation_date - sale_date).days
        distance_km = self._calculate_distance(subject, comparable)
        
        adjustments = []
        
        # Time adjustment (market appreciation)
        time_adj = self._calculate_time_adjustment(comparable, valuation_date)
        if time_adj:
            adjustments.append(time_adj)
        
        # Size adjustment (economies of scale)
        size_adj = self._calculate_land_size_adjustment(subject, comparable)
        if size_adj:
            adjustments.append(size_adj)
        
        # Zoning adjustment
        zoning_adj = self._calculate_zoning_adjustment(subject, comparable)
        if zoning_adj:
            adjustments.append(zoning_adj)
        
        # Infrastructure adjustment
        infra_adj = self._calculate_infrastructure_adjustment(subject, comparable)
        if infra_adj:
            adjustments.append(infra_adj)
        
        # Access/frontage adjustment
        access_adj = self._calculate_access_adjustment(subject, comparable)
        if access_adj:
            adjustments.append(access_adj)
        
        # Tenure adjustment
        tenure_adj = self._calculate_tenure_adjustment(subject, comparable)
        if tenure_adj:
            adjustments.append(tenure_adj)
        
        # Calculate totals
        total_adj_ghs = sum(a.adjustment_amount_ghs for a in adjustments)
        total_adj_pct = sum(a.adjustment_percentage for a in adjustments)
        adjusted_price = sale_price + total_adj_ghs
        adjusted_price_per_sqm = adjusted_price / land_area
        
        # Weight based on score
        weight = score.overall_score
        
        return LandComparableAnalysis(
            comparable_id=comparable.id,
            distance_km=distance_km,
            days_since_sale=days_since,
            sale_date=sale_date,
            original_price_ghs=sale_price,
            original_price_per_sqm=original_price_per_sqm,
            land_area_sqm=land_area,
            score=score,
            adjustments=adjustments,
            total_adjustment_ghs=total_adj_ghs,
            total_adjustment_pct=total_adj_pct,
            adjusted_price_ghs=adjusted_price,
            adjusted_price_per_sqm=adjusted_price_per_sqm,
            weight_in_valuation=weight,
            is_outlier=False,
            outlier_reason=None
        )
    
    def _detect_outliers(
        self,
        analyses: List[LandComparableAnalysis]
    ) -> List[LandComparableAnalysis]:
        """
        Detect outliers using IQR method and Modified Z-Score.
        Both must flag a value for it to be considered an outlier.
        """
        if len(analyses) < 4:
            return analyses  # Not enough data for outlier detection
        
        values = [a.adjusted_price_per_sqm for a in analyses]
        
        # IQR method
        q1 = np.percentile(values, 25)
        q3 = np.percentile(values, 75)
        iqr = q3 - q1
        lower_bound = q1 - (self.OUTLIER_IQR_MULTIPLIER * iqr)
        upper_bound = q3 + (self.OUTLIER_IQR_MULTIPLIER * iqr)
        
        # Modified Z-Score (more robust than standard Z-score)
        median = np.median(values)
        mad = np.median([abs(v - median) for v in values])  # Median Absolute Deviation
        modified_z_threshold = 3.5
        
        for analysis in analyses:
            v = analysis.adjusted_price_per_sqm
            
            # IQR check
            iqr_outlier = v < lower_bound or v > upper_bound
            
            # Modified Z-score check
            if mad > 0:
                modified_z = 0.6745 * (v - median) / mad
                z_outlier = abs(modified_z) > modified_z_threshold
            else:
                z_outlier = False
            
            # Both must agree for conservative outlier detection
            if iqr_outlier and z_outlier:
                analysis.is_outlier = True
                analysis.outlier_reason = f"Value GHS {v:,.0f}/sqm outside range [{lower_bound:,.0f}, {upper_bound:,.0f}]"
        
        return analyses
    
    def _calculate_confidence(
        self,
        valid_analyses: List[LandComparableAnalysis]
    ) -> float:
        """Calculate confidence score for the comparable land sales method"""
        
        factors = []
        
        # Factor 1: Number of comparables (more is better, up to 5)
        comp_count = len(valid_analyses)
        count_factor = min(comp_count / 5.0, 1.0)
        factors.append(count_factor * 0.25)
        
        # Factor 2: Average similarity score
        avg_score = statistics.mean(a.score.overall_score for a in valid_analyses)
        factors.append(avg_score * 0.30)
        
        # Factor 3: Value consistency (low CoV is better)
        values = [a.adjusted_price_per_sqm for a in valid_analyses]
        if len(values) > 1:
            cov = statistics.stdev(values) / statistics.mean(values)
            consistency_factor = max(0, 1.0 - cov)  # Lower CoV = higher factor
        else:
            consistency_factor = 0.5
        factors.append(consistency_factor * 0.25)
        
        # Factor 4: Recency (average days since sale)
        avg_days = statistics.mean(a.days_since_sale for a in valid_analyses)
        recency_factor = max(0, 1.0 - (avg_days / self.MAX_AGE_DAYS))
        factors.append(recency_factor * 0.20)
        
        return sum(factors)
```

### 1.4 Database Schema for Land Comparables

```sql
-- Migration: Add land_comparables_analysis table

CREATE TABLE valuation_land_comparables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
    comparable_property_id UUID REFERENCES properties(id),
    
    -- Sale data
    sale_price_ghs DECIMAL(15, 2) NOT NULL,
    sale_date DATE NOT NULL,
    land_area_sqm DECIMAL(12, 2) NOT NULL,
    price_per_sqm DECIMAL(12, 2) NOT NULL,
    
    -- Location
    region VARCHAR(50),
    district VARCHAR(100),
    locality VARCHAR(200),
    distance_km DECIMAL(6, 2),
    
    -- Characteristics
    zoning VARCHAR(50),
    tenure_type VARCHAR(50),
    has_road_access BOOLEAN,
    has_utilities BOOLEAN,
    topography VARCHAR(50),
    shape VARCHAR(50),
    
    -- Scoring
    overall_score DECIMAL(4, 3),
    location_score DECIMAL(4, 3),
    size_score DECIMAL(4, 3),
    zoning_score DECIMAL(4, 3),
    infrastructure_score DECIMAL(4, 3),
    time_score DECIMAL(4, 3),
    data_quality_score DECIMAL(4, 3),
    
    -- Adjustments (JSONB for flexibility)
    adjustments JSONB DEFAULT '[]',
    total_adjustment_ghs DECIMAL(15, 2),
    total_adjustment_pct DECIMAL(6, 4),
    adjusted_price_ghs DECIMAL(15, 2),
    adjusted_price_per_sqm DECIMAL(12, 2),
    
    -- Weighting
    weight_in_valuation DECIMAL(4, 3),
    is_outlier BOOLEAN DEFAULT FALSE,
    outlier_reason TEXT,
    
    -- Metadata
    source_type VARCHAR(50),  -- 'database', 'manual', 'scraped'
    source_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_land_comp_valuation ON valuation_land_comparables(valuation_id);
CREATE INDEX idx_land_comp_region ON valuation_land_comparables(region);
CREATE INDEX idx_land_comp_sale_date ON valuation_land_comparables(sale_date);
```

---

## Part 2: Multi-Method Reconciliation with Outlier Detection

### 2.1 Land Value Method Weights

```python
# Default weights by property type and use case

LAND_VALUE_METHOD_WEIGHTS = {
    # For developed properties (Cost Approach)
    'developed_property': {
        'comparable_land_sales': 0.45,  # Primary when good data exists
        'residual_gdv': 0.35,           # Strong secondary
        'user_entered': 0.20            # User override with justification
    },
    
    # For vacant land valuation
    'vacant_land': {
        'comparable_land_sales': 0.55,  # Primary method for land
        'residual_gdv': 0.30,           # Useful for development sites
        'user_entered': 0.15            # User override
    },
    
    # For development appraisal (residual method focus)
    'development_site': {
        'residual_gdv': 0.50,           # Primary for development sites
        'comparable_land_sales': 0.35,  # Cross-check
        'user_entered': 0.15            # User override
    }
}
```

### 2.2 Method Failure Handling

```python
class LandValueReconciliationService:
    """
    Reconcile multiple land valuation methods with intelligent failure handling.
    """
    
    def reconcile_land_value(
        self,
        method_results: Dict[str, Dict[str, Any]],
        property_use_case: str = 'developed_property'
    ) -> Dict[str, Any]:
        """
        Reconcile land values from multiple methods.
        
        Args:
            method_results: {
                'comparable_land_sales': {
                    'success': bool,
                    'indicated_value': float,
                    'confidence_score': float,
                    'error': Optional[str]
                },
                'residual_gdv': {...},
                'user_entered': {...}
            }
            property_use_case: 'developed_property' | 'vacant_land' | 'development_site'
        
        Returns:
            Reconciled land value with weights and confidence
        """
        
        # Get default weights for use case
        default_weights = LAND_VALUE_METHOD_WEIGHTS.get(
            property_use_case, 
            LAND_VALUE_METHOD_WEIGHTS['developed_property']
        )
        
        # Identify successful and failed methods
        successful_methods = {}
        failed_methods = {}
        
        for method, result in method_results.items():
            if result.get('success', False) and result.get('indicated_value', 0) > 0:
                successful_methods[method] = result
            else:
                failed_methods[method] = result
        
        if not successful_methods:
            return {
                'success': False,
                'error': 'All land valuation methods failed',
                'failed_methods': failed_methods
            }
        
        # Redistribute weights from failed methods
        active_weights = self._redistribute_weights(
            default_weights,
            successful_methods.keys(),
            failed_methods.keys()
        )
        
        # Detect outliers among successful methods
        successful_methods, outlier_info = self._detect_method_outliers(successful_methods)
        
        if outlier_info['outlier_detected']:
            # Recalculate weights excluding outlier
            active_weights = self._redistribute_weights(
                default_weights,
                [m for m in successful_methods.keys() if m != outlier_info['outlier_method']],
                list(failed_methods.keys()) + [outlier_info['outlier_method']]
            )
            successful_methods.pop(outlier_info['outlier_method'], None)
        
        # Calculate weighted average
        weighted_sum = 0.0
        weighted_confidence = 0.0
        total_weight = 0.0
        
        for method, result in successful_methods.items():
            weight = active_weights.get(method, 0)
            weighted_sum += result['indicated_value'] * weight
            weighted_confidence += result.get('confidence_score', 0.7) * weight
            total_weight += weight
        
        if total_weight == 0:
            return {
                'success': False,
                'error': 'No valid weights after reconciliation'
            }
        
        final_land_value = weighted_sum / total_weight
        final_confidence = weighted_confidence / total_weight
        
        return {
            'success': True,
            'final_land_value': round(final_land_value, 2),
            'final_land_value_per_sqm': None,  # Will be calculated with land area
            'confidence_score': round(final_confidence, 3),
            'methods_used': list(successful_methods.keys()),
            'methods_failed': list(failed_methods.keys()),
            'method_weights': active_weights,
            'method_results': {
                method: {
                    'indicated_value': result['indicated_value'],
                    'weight': active_weights.get(method, 0),
                    'contribution': result['indicated_value'] * active_weights.get(method, 0)
                }
                for method, result in successful_methods.items()
            },
            'outlier_info': outlier_info,
            'reconciliation_notes': self._generate_reconciliation_notes(
                successful_methods, failed_methods, active_weights, outlier_info
            )
        }
    
    def _redistribute_weights(
        self,
        default_weights: Dict[str, float],
        active_methods: List[str],
        inactive_methods: List[str]
    ) -> Dict[str, float]:
        """
        Redistribute weights from failed/excluded methods to active methods.
        Weights are redistributed proportionally based on remaining method weights.
        """
        if not active_methods:
            return {}
        
        # Sum of weights for active methods
        active_weight_sum = sum(default_weights.get(m, 0) for m in active_methods)
        
        # Sum of weights to redistribute
        inactive_weight_sum = sum(default_weights.get(m, 0) for m in inactive_methods)
        
        if active_weight_sum == 0:
            # Equal distribution if no weights
            return {m: 1.0 / len(active_methods) for m in active_methods}
        
        # Redistribute proportionally
        redistributed = {}
        for method in active_methods:
            original = default_weights.get(method, 0)
            proportion = original / active_weight_sum
            redistributed[method] = original + (inactive_weight_sum * proportion)
        
        # Normalize to sum to 1.0
        total = sum(redistributed.values())
        return {m: w / total for m, w in redistributed.items()}
    
    def _detect_method_outliers(
        self,
        successful_methods: Dict[str, Dict[str, Any]]
    ) -> Tuple[Dict, Dict]:
        """
        Detect if one method's value is an outlier compared to others.
        Uses relative deviation from median.
        """
        if len(successful_methods) < 3:
            # Need at least 3 methods to detect outliers
            return successful_methods, {'outlier_detected': False}
        
        values = {
            method: result['indicated_value'] 
            for method, result in successful_methods.items()
        }
        
        median_value = statistics.median(values.values())
        
        # Check each method's deviation
        MAX_DEVIATION_PCT = 0.40  # 40% deviation threshold
        
        outlier_method = None
        max_deviation = 0
        
        for method, value in values.items():
            if median_value > 0:
                deviation_pct = abs(value - median_value) / median_value
                if deviation_pct > MAX_DEVIATION_PCT and deviation_pct > max_deviation:
                    max_deviation = deviation_pct
                    outlier_method = method
        
        if outlier_method:
            return successful_methods, {
                'outlier_detected': True,
                'outlier_method': outlier_method,
                'outlier_value': values[outlier_method],
                'median_value': median_value,
                'deviation_pct': max_deviation,
                'message': f'{outlier_method} value deviates {max_deviation*100:.1f}% from median'
            }
        
        return successful_methods, {'outlier_detected': False}
```

---

## Part 3: Cross-Approach Value Flow

### 3.1 Architecture: Land Value as Shared Input

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      LAND VALUE CALCULATION                               │
│                                                                           │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│    │ Comparable  │    │  Residual   │    │    User     │                │
│    │ Land Sales  │    │   (GDV)     │    │   Entered   │                │
│    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                │
│           │                  │                  │                        │
│           └──────────────────┼──────────────────┘                        │
│                              ▼                                           │
│                    ┌───────────────────┐                                │
│                    │  RECONCILED LAND  │                                │
│                    │      VALUE        │                                │
│                    │ (Weighted Average)│                                │
│                    └─────────┬─────────┘                                │
│                              │                                           │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │
        ┌──────────────────────┼───────────────────────┐
        │                      │                        │
        ▼                      ▼                        ▼
┌───────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ COST APPROACH │    │ INCOME APPROACH │    │ RESIDUAL METHOD  │
│               │    │                 │    │                  │
│ Land Value    │    │ (Not directly   │    │ (Circular check -│
│    +          │    │  used, but      │    │  compare input   │
│ RCN - Dep     │    │  can compare)   │    │  vs output)      │
│    =          │    │                 │    │                  │
│ Property Value│    │                 │    │                  │
└───────────────┘    └─────────────────┘    └──────────────────┘
```

### 3.2 Backend Service: Land Value Provider

```python
# backend/src/services/valuation-engine/python/app/services/land_value_provider.py

"""
Centralized Land Value Provider
Single source of truth for land value across all valuation approaches
"""

from typing import Dict, Any, Optional
from datetime import date
import logging

from .land_comparable_sales import LandComparableSalesService
from .residual_method import ResidualMethodService
from ..schemas import Property

logger = logging.getLogger(__name__)


class LandValueProvider:
    """
    Provides reconciled land value for use across valuation approaches.
    
    Usage:
        provider = LandValueProvider(market_adapter)
        land_value = await provider.get_land_value(property, valuation_id)
        
        # Use in Cost Approach
        cost_result = cost_approach.calculate(property, land_value=land_value)
        
        # Use in Residual Method (for comparison)
        residual_result = residual_method.calculate(property)
        # Compare: residual_result.land_value vs land_value.final_land_value
    """
    
    def __init__(self, market_data_adapter):
        self.comparable_service = LandComparableSalesService(market_data_adapter)
        self.residual_service = ResidualMethodService(market_data_adapter)
        self.reconciliation_service = LandValueReconciliationService()
        
        self._cache = {}  # Simple in-memory cache
    
    async def get_land_value(
        self,
        property: Property,
        valuation_id: str,
        user_entered_value: Optional[float] = None,
        user_justification: Optional[str] = None,
        property_use_case: str = 'developed_property',
        force_recalculate: bool = False
    ) -> Dict[str, Any]:
        """
        Get reconciled land value from all available methods.
        
        Returns:
            {
                'final_land_value': float,
                'final_land_value_per_sqm': float,
                'land_area_sqm': float,
                'confidence_score': float,
                'primary_method': str,
                'methods': {
                    'comparable_land_sales': {...},
                    'residual_gdv': {...},
                    'user_entered': {...}
                },
                'reconciliation': {...},
                'disclosure_required': bool,
                'disclosure_text': str
            }
        """
        
        cache_key = f"{valuation_id}_{property_use_case}"
        if cache_key in self._cache and not force_recalculate:
            return self._cache[cache_key]
        
        method_results = {}
        
        # Method 1: Comparable Land Sales
        try:
            comp_result = await self.comparable_service.calculate_land_value(
                property, date.today()
            )
            method_results['comparable_land_sales'] = comp_result
        except Exception as e:
            logger.warning(f"Comparable land sales failed: {e}")
            method_results['comparable_land_sales'] = {
                'success': False,
                'error': str(e)
            }
        
        # Method 2: Residual (GDV-Based)
        try:
            residual_result = await self.residual_service.calculate(
                valuation_id=valuation_id,
                property_data=property
            )
            method_results['residual_gdv'] = {
                'success': residual_result.success,
                'indicated_value': residual_result.residual_land_value if residual_result.success else 0,
                'confidence_score': 0.75 if residual_result.success else 0,
                'details': residual_result.dict() if residual_result.success else None,
                'error': residual_result.error if not residual_result.success else None
            }
        except Exception as e:
            logger.warning(f"Residual method failed: {e}")
            method_results['residual_gdv'] = {
                'success': False,
                'error': str(e)
            }
        
        # Method 3: User Entered
        if user_entered_value and user_entered_value > 0:
            method_results['user_entered'] = {
                'success': True,
                'indicated_value': user_entered_value,
                'confidence_score': 0.60,  # Lower confidence for user entry
                'justification': user_justification
            }
        else:
            method_results['user_entered'] = {
                'success': False,
                'error': 'No user value provided'
            }
        
        # Reconcile
        reconciliation = self.reconciliation_service.reconcile_land_value(
            method_results, property_use_case
        )
        
        if not reconciliation['success']:
            return {
                'success': False,
                'error': reconciliation['error'],
                'methods': method_results
            }
        
        land_area = property.specifications.land_size_sqm or 0
        final_value = reconciliation['final_land_value']
        value_per_sqm = final_value / land_area if land_area > 0 else 0
        
        # Determine primary method (highest weight)
        primary_method = max(
            reconciliation['method_weights'].items(),
            key=lambda x: x[1]
        )[0] if reconciliation['method_weights'] else 'unknown'
        
        # Determine disclosure requirements
        disclosure_required = (
            len(reconciliation['methods_failed']) > 0 or
            reconciliation['outlier_info'].get('outlier_detected', False) or
            'user_entered' in reconciliation['methods_used']
        )
        
        disclosure_text = self._generate_disclosure(
            reconciliation, method_results, property_use_case
        )
        
        result = {
            'success': True,
            'final_land_value': round(final_value, 2),
            'final_land_value_per_sqm': round(value_per_sqm, 2),
            'land_area_sqm': land_area,
            'confidence_score': reconciliation['confidence_score'],
            'primary_method': primary_method,
            'methods': method_results,
            'reconciliation': reconciliation,
            'disclosure_required': disclosure_required,
            'disclosure_text': disclosure_text
        }
        
        self._cache[cache_key] = result
        return result
    
    def _generate_disclosure(
        self,
        reconciliation: Dict,
        method_results: Dict,
        use_case: str
    ) -> str:
        """Generate RICS-compliant disclosure text for land value"""
        
        parts = []
        
        # Method summary
        methods_used = reconciliation.get('methods_used', [])
        if len(methods_used) == 1:
            parts.append(f"Land value determined using {methods_used[0].replace('_', ' ')} method only.")
        else:
            parts.append(f"Land value determined by reconciling {len(methods_used)} methods: {', '.join(m.replace('_', ' ') for m in methods_used)}.")
        
        # Failed methods
        methods_failed = reconciliation.get('methods_failed', [])
        if methods_failed:
            parts.append(f"Note: {', '.join(m.replace('_', ' ') for m in methods_failed)} method(s) could not be applied due to insufficient data.")
        
        # Outlier
        outlier_info = reconciliation.get('outlier_info', {})
        if outlier_info.get('outlier_detected'):
            parts.append(f"The {outlier_info['outlier_method'].replace('_', ' ')} result was excluded from reconciliation due to significant deviation ({outlier_info['deviation_pct']*100:.0f}%) from other methods.")
        
        # User override
        if 'user_entered' in methods_used:
            justification = method_results.get('user_entered', {}).get('justification', '')
            parts.append(f"User-entered land value included with justification: {justification or 'Not provided'}")
        
        return " ".join(parts)
```

### 3.3 API Endpoints

```typescript
// Backend routes: backend/src/routes/valuations.ts

// GET /api/v1/valuations/:id/land-value
// Calculate and return reconciled land value

// POST /api/v1/valuations/:id/land-value
// Save land value with method inputs and user override

// GET /api/v1/valuations/:id/land-value/comparables
// Get land comparables with scores and adjustments

// POST /api/v1/valuations/:id/land-value/user-override
// Submit user-entered land value with justification
```

---

## Part 4: Frontend Integration

### 4.1 Land Value Panel Component

```typescript
// frontend/src/components/valuation/LandValuePanel.tsx

interface LandValuePanelProps {
  valuationId: string
  plotSizeSqm: number
  region: string
  propertyType: string
  onLandValueChange: (value: number, method: string) => void
}

interface MethodResult {
  method: string
  value: number | null
  confidence: number | null
  weight: number
  status: 'success' | 'failed' | 'loading' | 'excluded'
  error?: string
  details?: any
}

// Component shows:
// 1. Three method cards (Comparable, Residual, User-Entered)
// 2. Status indicators for each method
// 3. Weight distribution visualization
// 4. Final reconciled value
// 5. Confidence indicator
// 6. Expandable details for each method
```

### 4.2 UI Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│ LAND VALUE                                                       [?]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ ◉ COMPARABLE    │  │ ○ RESIDUAL      │  │ ○ USER-ENTERED  │         │
│  │   LAND SALES    │  │   (GDV-BASED)   │  │                 │         │
│  │                 │  │                 │  │                 │         │
│  │ ₵ 450,000       │  │ ₵ 520,000       │  │ ₵ ——            │         │
│  │                 │  │                 │  │                 │         │
│  │ Weight: 52%     │  │ Weight: 48%     │  │ Weight: —       │         │
│  │ Conf: 0.82      │  │ Conf: 0.75      │  │                 │         │
│  │ 5 comps used    │  │                 │  │ [Enter Value]   │         │
│  │                 │  │                 │  │                 │         │
│  │ [View Details]  │  │ [View Details]  │  │ [+ Add]         │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ RECONCILED LAND VALUE                                            │   │
│  │                                                                   │   │
│  │   ₵ 483,600                    Confidence: ████████░░ 0.79       │   │
│  │                                                                   │   │
│  │   ₵ 1,612/sqm × 300 sqm                                          │   │
│  │                                                                   │   │
│  │   Methods: Comparable (52%) + Residual (48%)                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ⚠️ Disclosure: Land value determined by reconciling 2 methods...      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Data Dependencies

### 5.1 Required Data Sources

| Data | Source | Status | Notes |
|------|--------|--------|-------|
| Land transactions | `properties` table | ⚠️ Partial | Filter by `property_type = 'land'` |
| Sale prices | `transactions` table | ✅ Exists | Need to join with properties |
| Regional multipliers | `residual_method.py` | ✅ Exists | `SALE_PRICES_PER_SQM` |
| Construction costs | Data Hub API | ✅ Live | For residual method |
| Developer profit margins | `residual_method.py` | ✅ Exists | `DEVELOPER_PROFIT_MARGINS` |
| Zoning data | `properties.zoning` | ⚠️ Sparse | Need to enhance scraping |
| Infrastructure data | `properties` | ⚠️ Sparse | Need additional fields |

### 5.2 Fallback Strategy (When Data Missing)

```python
FALLBACK_PRIORITY = {
    'comparable_land_sales': [
        # Try: Database land transactions
        # Then: Scraped land listings (with discount for asking vs sale)
        # Then: Regional benchmark rates
    ],
    'residual_gdv': [
        # Uses existing Python service - already has fallbacks
    ],
    'user_entered': [
        # Always available - user provides value + justification
    ]
}
```

---

## Part 6: Implementation Phases

### Phase 1: Land Comparable Sales Service (Day 1-2)
- [ ] Create `LandComparableSalesService` Python class
- [ ] Implement land-specific scoring algorithm
- [ ] Implement land-specific adjustments
- [ ] Add outlier detection (IQR + Modified Z-Score)
- [ ] Create `valuation_land_comparables` database table

### Phase 2: Multi-Method Reconciliation (Day 2-3)
- [ ] Create `LandValueReconciliationService`
- [ ] Implement weight redistribution on method failure
- [ ] Implement cross-method outlier detection
- [ ] Add confidence calculation

### Phase 3: Land Value Provider (Day 3)
- [ ] Create `LandValueProvider` service
- [ ] Integrate all three methods
- [ ] Add caching layer
- [ ] Generate disclosure text

### Phase 4: Backend API (Day 3-4)
- [ ] Create land value routes
- [ ] Connect to Python services
- [ ] Add storage in `valuation_method_inputs`
- [ ] Add validation

### Phase 5: Frontend Integration (Day 4-5)
- [ ] Create `LandValuePanel` component
- [ ] Replace current simple toggle with 3-method UI
- [ ] Add method detail modals
- [ ] Add confidence visualization
- [ ] Add disclosure display

### Phase 6: Testing & Refinement (Day 5-6)
- [ ] End-to-end testing
- [ ] Edge case handling
- [ ] Performance optimization
- [ ] Documentation

---

## Part 7: Acceptance Criteria

### Comparable Land Sales
- [ ] Searches within 10km and 2 years
- [ ] Scores on 6 factors: location, size, zoning, infrastructure, time, data quality
- [ ] Applies land-specific adjustments
- [ ] Detects and excludes outliers
- [ ] Returns weighted average with confidence score

### Reconciliation
- [ ] Handles 1, 2, or 3 successful methods
- [ ] Redistributes weights when methods fail
- [ ] Detects cross-method outliers (>40% deviation)
- [ ] Generates RICS-compliant disclosure text

### Cross-Approach Flow
- [ ] Land value available to Cost Approach
- [ ] Can compare Residual output vs input land value
- [ ] Stored in `valuation_method_inputs` with full audit trail

### Frontend
- [ ] Shows all three method cards
- [ ] Visual status indicators
- [ ] Weight breakdown
- [ ] Confidence bar
- [ ] Disclosure message when applicable

---

## Part 8: Depreciation Calculation Architecture

### 8.1 Overview: RICS/GhIS/GREDA Compliant Depreciation

Depreciation in the Cost Approach represents the loss in value from Reproduction/Replacement Cost New (RCN). Per **RICS Red Book** (IVS 105), **GhIS Valuation Standards**, and **GREDA guidelines**, depreciation comprises three components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TOTAL ACCRUED DEPRECIATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │    PHYSICAL      │  │   FUNCTIONAL     │  │    EXTERNAL      │          │
│  │  DEPRECIATION    │  │  OBSOLESCENCE    │  │  OBSOLESCENCE    │          │
│  │                  │  │                  │  │                  │          │
│  │ Wear & tear from │  │ Loss from design │  │ Loss from factors│          │
│  │ age, weather,    │  │ deficiencies,    │  │ external to the  │          │
│  │ use, deferred    │  │ superadequacies, │  │ property itself  │          │
│  │ maintenance      │  │ outdated features│  │                  │          │
│  │                  │  │                  │  │                  │          │
│  │ Methods:         │  │ Methods:         │  │ Methods:         │          │
│  │ • Age-Life       │  │ • Cost-to-Cure   │  │ • Market         │          │
│  │ • Modified Age   │  │ • Capitalized    │  │   Extraction     │          │
│  │ • Breakdown      │  │   Rent Loss      │  │ • Income Loss    │          │
│  │ • Observed       │  │ • Market         │  │   Capitalization │          │
│  │   Condition      │  │   Extraction     │  │                  │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                     │                     │
│           └─────────────────────┼─────────────────────┘                     │
│                                 ▼                                           │
│           ┌─────────────────────────────────────────┐                      │
│           │        DEPRECIATED VALUE                │                      │
│           │  RCN - (Physical + Functional + External)                      │
│           │  = Depreciated Building Value           │                      │
│           └─────────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 8.2 Physical Depreciation

#### 8.2.1 Definition (per RICS/GhIS)

Physical depreciation is the loss in value due to:
- **Wear and tear** from normal use
- **Age deterioration** from weathering, chemical reactions, structural fatigue
- **Deferred maintenance** (curable physical deterioration)
- **Incurable physical deterioration** (short-lived and long-lived components)

#### 8.2.2 Methods for Calculation

**Method 1: Age-Life Method (Primary - Auto-Calculated)**

$$\text{Physical Depreciation \%} = \frac{\text{Effective Age}}{\text{Total Economic Life}} \times 100$$

Where:
- **Actual Age** = Valuation Year - Year Built
- **Effective Age** = Adjusted age based on condition (can be < or > actual age)
- **Economic Life** = Total useful life expectancy by construction type

**Economic Life by Construction Type (Ghana Market):**

| Construction Type | Economic Life | Annual Rate |
|-------------------|---------------|-------------|
| Reinforced Concrete Frame | 70-80 years | 1.25-1.43% |
| Concrete Block (Load-Bearing) | 50-60 years | 1.67-2.0% |
| Sandcrete Block | 40-50 years | 2.0-2.5% |
| Mud Brick (Improved) | 25-35 years | 2.86-4.0% |
| Timber Frame | 30-40 years | 2.5-3.33% |
| Steel Frame | 60-70 years | 1.43-1.67% |

**Method 2: Modified Age-Life (Condition-Adjusted)**

$$\text{Effective Age} = \text{Actual Age} \times \text{Condition Factor}$$

| Condition Rating | Description | Condition Factor | Effect |
|------------------|-------------|------------------|--------|
| Excellent | Like new, superior maintenance | 0.60 - 0.75 | Reduces effective age |
| Good | Normal wear, regular maintenance | 0.85 - 1.00 | Slight reduction |
| Average/Fair | Visible wear, some deferred maintenance | 1.00 - 1.20 | Normal to slight increase |
| Poor | Significant deterioration, major deferred maintenance | 1.30 - 1.60 | Increases effective age |
| Very Poor | Severe deterioration, approaching end of life | 1.70 - 2.00+ | Major increase |

**Method 3: Breakdown Method (Component-Based)**

For detailed analysis, depreciate each building component separately:

| Component | % of RCN | Typical Life | Notes |
|-----------|----------|--------------|-------|
| Foundation | 10-15% | 80-100 years | Long-lived, minimal depreciation |
| Structure/Frame | 25-30% | 60-80 years | Long-lived |
| Roof | 8-12% | 20-30 years | Short-lived, replace periodically |
| Electrical | 8-10% | 25-35 years | Short-lived |
| Plumbing | 6-8% | 25-35 years | Short-lived |
| HVAC/Mechanical | 5-8% | 15-25 years | Short-lived |
| Finishes (Interior) | 15-20% | 10-20 years | Short-lived |
| Finishes (Exterior) | 8-12% | 15-25 years | Short-lived |
| Fixtures/Fittings | 5-8% | 10-15 years | Short-lived |

#### 8.2.3 Auto-Calculation Logic

```python
class PhysicalDepreciationCalculator:
    """
    Auto-calculate physical depreciation from subject property data.
    User can override with justification.
    """
    
    ECONOMIC_LIFE = {
        'reinforced_concrete': 75,
        'concrete_block': 55,
        'sandcrete_block': 45,
        'mud_brick': 30,
        'timber': 35,
        'steel_frame': 65,
        'mixed': 50,  # Default
    }
    
    CONDITION_FACTORS = {
        'excellent': 0.70,
        'good': 0.90,
        'average': 1.00,
        'fair': 1.15,
        'poor': 1.45,
        'very_poor': 1.80,
    }
    
    def calculate(
        self,
        year_built: int,
        valuation_date: date,
        construction_type: str,
        condition: str,
        last_renovation_year: Optional[int] = None,
        renovation_scope: Optional[str] = None,  # 'minor', 'major', 'complete'
    ) -> DepreciationResult:
        """
        Calculate physical depreciation with full audit trail.
        """
        # Step 1: Calculate actual age
        actual_age = valuation_date.year - year_built
        
        # Step 2: Get economic life
        economic_life = self.ECONOMIC_LIFE.get(construction_type, 50)
        
        # Step 3: Calculate base effective age
        condition_factor = self.CONDITION_FACTORS.get(condition, 1.0)
        effective_age = actual_age * condition_factor
        
        # Step 4: Adjust for renovations
        if last_renovation_year and renovation_scope:
            years_since_reno = valuation_date.year - last_renovation_year
            reset_factors = {'minor': 0.15, 'major': 0.35, 'complete': 0.60}
            reset = reset_factors.get(renovation_scope, 0)
            effective_age = effective_age - (effective_age * reset) + years_since_reno
        
        # Step 5: Calculate depreciation rate
        effective_age = max(0, min(effective_age, economic_life * 0.95))
        depreciation_rate = effective_age / economic_life
        remaining_life = economic_life - effective_age
        
        return DepreciationResult(
            depreciation_type='physical',
            depreciation_rate=round(depreciation_rate, 4),
            depreciation_percent=round(depreciation_rate * 100, 2),
            actual_age=actual_age,
            effective_age=round(effective_age, 1),
            economic_life=economic_life,
            remaining_life=round(remaining_life, 1),
            method='modified_age_life',
            inputs_used={
                'year_built': year_built,
                'construction_type': construction_type,
                'condition': condition,
                'condition_factor': condition_factor,
                'last_renovation_year': last_renovation_year,
                'renovation_scope': renovation_scope,
            },
            auto_calculated=True,
            confidence=0.85 if condition != 'average' else 0.75,
        )
```

---

### 8.3 Functional Obsolescence

#### 8.3.1 Definition (per RICS/GhIS)

Functional obsolescence is the loss in value due to:
- **Deficiencies**: Missing features expected in modern buildings (e.g., no en-suite bathrooms, inadequate electrical capacity)
- **Superadequacies**: Over-improvements that don't add proportional value (e.g., gold-plated fixtures in a modest neighborhood)
- **Outdated Design**: Floor plans, ceiling heights, or layouts that don't meet current market preferences

#### 8.3.2 Types and Calculation Methods

**Type A: Curable Functional Obsolescence (Deficiencies)**

$$\text{Obsolescence} = \text{Cost to Cure}$$

Examples:
- Adding missing bathroom: Cost of installation
- Upgrading electrical panel: Cost of upgrade
- Adding air conditioning: Installation cost

**Type B: Incurable Functional Obsolescence (Deficiencies)**

$$\text{Obsolescence} = \text{Capitalized Rent Loss}$$

$$= \frac{\text{Monthly Rent Difference} \times 12}{\text{Capitalization Rate}}$$

Examples:
- Inadequate bedroom count that can't be changed
- Poor room layout (structural)
- Insufficient natural light

**Type C: Superadequacy**

$$\text{Obsolescence} = \text{Cost of Feature} - \text{Value Added by Feature}$$

Examples:
- Commercial-grade kitchen in modest residential
- Excessive ceiling heights (costly to heat/cool)
- Over-sized swimming pool

#### 8.3.3 Auto-Detection Indicators

| Indicator | Data Source | Detection Rule | Obsolescence Impact |
|-----------|-------------|----------------|---------------------|
| Low bathroom ratio | Property specs | bedrooms/bathrooms > 2.0 | 3-8% |
| No en-suite master | Property specs | master_ensuite = false AND year > 2000 | 2-4% |
| Outdated design era | Year built | year_built < 1980 | 3-7% |
| Small room sizes | Floor plan | avg_room_size < 12 sqm | 2-5% |
| No garage/parking | Property specs | parking_spaces = 0 AND property_type = 'house' | 3-6% |
| Single-story in multi-story area | Property + market | stories = 1 AND area_avg_stories > 2 | 2-4% |
| No air conditioning | Amenities | has_ac = false AND region = 'greater_accra' | 2-4% |
| Outdated kitchen | Year built + renovation | kitchen_renovated = false AND age > 20 | 3-6% |
| Poor energy efficiency | Building specs | no_insulation AND no_solar | 1-3% |

#### 8.3.4 Auto-Calculation Logic

```python
class FunctionalObsolescenceCalculator:
    """
    Auto-detect and calculate functional obsolescence from property data.
    """
    
    OBSOLESCENCE_FACTORS = {
        # Deficiencies (curable and incurable)
        'low_bathroom_ratio': {
            'condition': lambda p: p.bathrooms / max(p.bedrooms, 1) < 0.5,
            'rate_range': (0.03, 0.08),
            'type': 'deficiency',
            'curable': True,
            'description': 'Insufficient bathrooms for bedroom count',
        },
        'no_ensuite': {
            'condition': lambda p: not p.has_master_ensuite and p.year_built > 2000,
            'rate_range': (0.02, 0.04),
            'type': 'deficiency',
            'curable': True,
            'description': 'No en-suite bathroom in master bedroom',
        },
        'outdated_design_1980s': {
            'condition': lambda p: p.year_built and p.year_built < 1980,
            'rate_range': (0.05, 0.10),
            'type': 'outdated',
            'curable': False,
            'description': 'Pre-1980 design standards',
        },
        'outdated_design_1990s': {
            'condition': lambda p: p.year_built and 1980 <= p.year_built < 1995,
            'rate_range': (0.03, 0.06),
            'type': 'outdated',
            'curable': False,
            'description': 'Dated 1980s-1990s design',
        },
        'no_parking': {
            'condition': lambda p: p.parking_spaces == 0 and p.property_type in ['house', 'townhouse'],
            'rate_range': (0.03, 0.06),
            'type': 'deficiency',
            'curable': True,  # Can add parking if space permits
            'description': 'No dedicated parking provision',
        },
        'no_ac_hot_region': {
            'condition': lambda p: not p.has_ac and p.region in ['greater_accra', 'volta', 'western'],
            'rate_range': (0.02, 0.04),
            'type': 'deficiency',
            'curable': True,
            'description': 'No air conditioning in hot climate region',
        },
        'small_rooms': {
            'condition': lambda p: p.avg_room_size and p.avg_room_size < 12,
            'rate_range': (0.02, 0.05),
            'type': 'deficiency',
            'curable': False,
            'description': 'Below-standard room sizes',
        },
        'no_modern_kitchen': {
            'condition': lambda p: p.year_built and p.year_built < 2005 and not p.kitchen_renovated,
            'rate_range': (0.02, 0.05),
            'type': 'outdated',
            'curable': True,
            'description': 'Outdated kitchen without renovation',
        },
        # Superadequacies
        'oversized_pool': {
            'condition': lambda p: p.has_pool and p.pool_size_sqm and p.pool_size_sqm > 80 and p.land_area_sqm < 1000,
            'rate_range': (0.01, 0.03),
            'type': 'superadequacy',
            'curable': False,
            'description': 'Over-sized pool relative to property',
        },
        'excess_luxury_finishes': {
            'condition': lambda p: p.finish_level == 'ultra_luxury' and p.neighborhood_class in ['middle', 'working'],
            'rate_range': (0.03, 0.08),
            'type': 'superadequacy',
            'curable': False,
            'description': 'Luxury finishes in non-luxury neighborhood',
        },
    }
    
    def calculate(self, property_data: PropertyData) -> FunctionalObsolescenceResult:
        """
        Detect and calculate functional obsolescence items.
        """
        detected_items = []
        total_rate = 0.0
        
        for factor_name, factor_config in self.OBSOLESCENCE_FACTORS.items():
            try:
                if factor_config['condition'](property_data):
                    # Use midpoint of range as default
                    rate = sum(factor_config['rate_range']) / 2
                    
                    detected_items.append(FunctionalObsolescenceItem(
                        item=factor_name,
                        type=factor_config['type'],
                        curable=factor_config['curable'],
                        description=factor_config['description'],
                        rate=rate,
                        rate_range=factor_config['rate_range'],
                    ))
                    total_rate += rate
            except (AttributeError, TypeError):
                # Missing data - skip this factor
                continue
        
        # Cap at reasonable maximum
        total_rate = min(total_rate, 0.25)  # Max 25% functional obsolescence
        
        return FunctionalObsolescenceResult(
            depreciation_type='functional',
            depreciation_rate=round(total_rate, 4),
            depreciation_percent=round(total_rate * 100, 2),
            items_detected=detected_items,
            total_items=len(detected_items),
            curable_amount=sum(i.rate for i in detected_items if i.curable),
            incurable_amount=sum(i.rate for i in detected_items if not i.curable),
            auto_calculated=True,
            confidence=0.70,  # Lower confidence - requires valuer review
            requires_review=len(detected_items) > 3,
        )
```

---

### 8.4 External Obsolescence

#### 8.4.1 Definition (per RICS/GhIS)

External (economic) obsolescence is the loss in value from factors **outside the property boundaries**:
- **Locational factors**: Neighborhood decline, proximity to nuisances
- **Economic factors**: Market oversupply, reduced demand, recession
- **Environmental factors**: Pollution, noise, flooding risk
- **Regulatory factors**: Zoning changes, building restrictions

**Key Characteristic**: External obsolescence is **always incurable** by the property owner.

#### 8.4.2 Calculation Methods

**Method 1: Market Extraction**

Compare sale prices of affected vs. unaffected similar properties:

$$\text{External Obsolescence} = \frac{\text{Value (Unaffected)} - \text{Value (Affected)}}{\text{Value (Unaffected)}}$$

**Method 2: Income Loss Capitalization**

$$\text{External Obsolescence} = \frac{\text{Rental Income Loss (Annual)}}{\text{Capitalization Rate}}$$

**Method 3: Paired Sales Analysis**

Compare specific transactions:
- Property A: Sold for ₵500,000 (near airport noise zone)
- Property B: Identical, sold for ₵580,000 (quiet area)
- External Obsolescence = (580,000 - 500,000) / 580,000 = 13.8%

#### 8.4.3 External Obsolescence Factors (Ghana Context)

| Factor Category | Specific Factor | Impact Range | Data Source |
|-----------------|-----------------|--------------|-------------|
| **Environmental** | Airport noise zone | 5-15% | GIS proximity |
| | Flooding risk (high) | 10-20% | Ghana Flood Map |
| | Industrial pollution proximity | 5-15% | GIS analysis |
| | Quarry/mining operations nearby | 8-15% | Mining registry |
| | Waste dump proximity | 10-25% | Municipal data |
| **Locational** | Neighborhood decline | 5-15% | Crime stats, property values trend |
| | High crime area | 5-12% | Police data |
| | Poor road access | 3-8% | Infrastructure data |
| | Traffic congestion | 2-6% | Traffic data |
| | Distance from amenities | 2-5% | GIS analysis |
| **Economic** | Market oversupply (>15%) | 3-10% | Vacancy rates |
| | Economic recession | 5-15% | GDP indicators |
| | Currency depreciation impact | 2-8% | BOG data |
| | High interest rates | 2-5% | BOG rates |
| **Regulatory** | Zoning restrictions | 5-20% | Land Use data |
| | Building height limits | 3-10% | Municipal planning |
| | Heritage/conservation area | 2-8% | LCC/KMA data |
| | Road widening threat | 5-15% | Municipal plans |

#### 8.4.4 Auto-Calculation Logic

```python
class ExternalObsolescenceCalculator:
    """
    Calculate external obsolescence from location and market data.
    Integrates with Data Hub for real-time indicators.
    """
    
    EXTERNAL_FACTORS = {
        # Environmental factors
        'flood_risk': {
            'data_field': 'flood_risk_level',
            'impact_map': {
                'low': 0.0,
                'moderate': 0.05,
                'high': 0.12,
                'very_high': 0.20,
            },
            'category': 'environmental',
            'description': 'Flood risk zone classification',
        },
        'airport_proximity': {
            'data_field': 'distance_to_airport_km',
            'condition': lambda d: d < 5,
            'impact_calc': lambda d: max(0, 0.15 - (d * 0.03)) if d < 5 else 0,
            'category': 'environmental',
            'description': 'Proximity to airport noise zone',
        },
        'industrial_proximity': {
            'data_field': 'distance_to_industrial_km',
            'condition': lambda d: d < 2,
            'impact_calc': lambda d: max(0, 0.12 - (d * 0.06)) if d < 2 else 0,
            'category': 'environmental',
            'description': 'Proximity to industrial area',
        },
        
        # Locational factors
        'neighborhood_trend': {
            'data_field': 'property_value_trend_3yr',
            'impact_map': {
                'strong_growth': 0.0,
                'growth': 0.0,
                'stable': 0.0,
                'declining': 0.05,
                'strong_decline': 0.12,
            },
            'category': 'locational',
            'description': '3-year neighborhood value trend',
        },
        'crime_rate': {
            'data_field': 'crime_rate_index',
            'condition': lambda c: c > 1.5,  # Above average
            'impact_calc': lambda c: min(0.12, (c - 1.0) * 0.08) if c > 1.0 else 0,
            'category': 'locational',
            'description': 'Crime rate relative to city average',
        },
        'road_condition': {
            'data_field': 'road_access_quality',
            'impact_map': {
                'paved_good': 0.0,
                'paved_fair': 0.02,
                'paved_poor': 0.05,
                'unpaved': 0.08,
                'no_access': 0.15,
            },
            'category': 'locational',
            'description': 'Road access and condition',
        },
        
        # Economic factors
        'vacancy_rate': {
            'data_field': 'area_vacancy_rate',
            'condition': lambda v: v > 0.15,
            'impact_calc': lambda v: min(0.10, (v - 0.10) * 0.5) if v > 0.10 else 0,
            'category': 'economic',
            'description': 'Local market vacancy rate',
        },
        'market_condition': {
            'data_field': 'market_condition_index',
            'impact_map': {
                'strong_seller': 0.0,
                'balanced': 0.0,
                'buyer': 0.03,
                'weak': 0.08,
                'distressed': 0.15,
            },
            'category': 'economic',
            'description': 'Current market conditions',
        },
        
        # Regulatory factors
        'zoning_restriction': {
            'data_field': 'zoning_constraint_level',
            'impact_map': {
                'none': 0.0,
                'minor': 0.03,
                'moderate': 0.08,
                'severe': 0.15,
            },
            'category': 'regulatory',
            'description': 'Zoning restrictions affecting use/development',
        },
    }
    
    def calculate(
        self,
        property_location: PropertyLocation,
        market_data: MarketDataSnapshot,
    ) -> ExternalObsolescenceResult:
        """
        Calculate external obsolescence from location and market data.
        """
        detected_factors = []
        category_totals = {
            'environmental': 0.0,
            'locational': 0.0,
            'economic': 0.0,
            'regulatory': 0.0,
        }
        
        combined_data = {**property_location.__dict__, **market_data.__dict__}
        
        for factor_name, config in self.EXTERNAL_FACTORS.items():
            value = combined_data.get(config['data_field'])
            
            if value is None:
                continue
            
            impact = 0.0
            
            if 'impact_map' in config:
                impact = config['impact_map'].get(value, 0.0)
            elif 'impact_calc' in config:
                if 'condition' in config and config['condition'](value):
                    impact = config['impact_calc'](value)
                elif 'condition' not in config:
                    impact = config['impact_calc'](value)
            
            if impact > 0:
                detected_factors.append(ExternalObsolescenceItem(
                    factor=factor_name,
                    category=config['category'],
                    description=config['description'],
                    data_value=value,
                    impact_rate=round(impact, 4),
                ))
                category_totals[config['category']] += impact
        
        # Cap each category and total
        for cat in category_totals:
            category_totals[cat] = min(category_totals[cat], 0.20)
        
        total_rate = min(sum(category_totals.values()), 0.30)  # Max 30% external
        
        return ExternalObsolescenceResult(
            depreciation_type='external',
            depreciation_rate=round(total_rate, 4),
            depreciation_percent=round(total_rate * 100, 2),
            factors_detected=detected_factors,
            category_breakdown=category_totals,
            data_sources_used=list(set(f.factor for f in detected_factors)),
            auto_calculated=True,
            confidence=0.65,  # Lower confidence - external factors complex
            requires_review=total_rate > 0.10,
        )
```

---

### 8.5 User Override with Justification

#### 8.5.1 Override Requirements (GhIS Compliance)

Per GhIS and RICS standards, valuers may override auto-calculated depreciation but **must provide**:

1. **Specific justification** for the override
2. **Supporting evidence** (photos, inspection notes, market data)
3. **Variance explanation** when deviation > 20% from auto-calculated

#### 8.5.2 Override Schema

```python
@dataclass
class DepreciationOverride:
    """User override for depreciation component"""
    component: str  # 'physical', 'functional', 'external'
    auto_calculated_rate: float
    override_rate: float
    variance_percent: float
    justification: str
    evidence_type: str  # 'inspection', 'photo', 'market_data', 'expert_opinion'
    evidence_reference: Optional[str]  # File path or reference ID
    approved_by: Optional[str]  # Supervisor approval if variance > 20%
    override_date: datetime
    
    def requires_approval(self) -> bool:
        """Check if override requires supervisor approval"""
        return abs(self.variance_percent) > 20
    
    def is_valid(self) -> bool:
        """Validate override has required justification"""
        if not self.justification or len(self.justification) < 20:
            return False
        if self.requires_approval() and not self.approved_by:
            return False
        return True
```

#### 8.5.3 Frontend Override UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHYSICAL DEPRECIATION                                          [? HELP]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ SYSTEM CALCULATED                                                    │   │
│  │                                                                       │   │
│  │ Actual Age:        12 years                                          │   │
│  │ Condition:         Good (factor: 0.90)                               │   │
│  │ Effective Age:     10.8 years                                        │   │
│  │ Economic Life:     55 years (Sandcrete Block)                        │   │
│  │ Remaining Life:    44.2 years                                        │   │
│  │                                                                       │   │
│  │ ────────────────────────────────────────────────────────────────────  │   │
│  │ CALCULATED RATE:   19.6%                       ₵215,600 of RCN       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─ OVERRIDE ─────────────────────────────────────────────────────────┐    │
│  │ ☐ Override system calculation                                       │    │
│  │                                                                      │    │
│  │ Custom Rate: [____] %                                                │    │
│  │                                                                      │    │
│  │ Justification (required): *                                         │    │
│  │ ┌────────────────────────────────────────────────────────────────┐  │    │
│  │ │                                                                  │  │    │
│  │ │                                                                  │  │    │
│  │ └────────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │ Evidence: [Upload Photo] [Link Inspection] [Market Data Ref]        │    │
│  │                                                                      │    │
│  │ ⚠️ Variance >20% requires supervisor approval                       │    │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 8.6 Total Depreciation Reconciliation

```python
class DepreciationReconciliationService:
    """
    Combine all depreciation components with caps and validation.
    """
    
    # Maximum total depreciation by property age
    MAX_DEPRECIATION_SCHEDULE = {
        (0, 5): 0.15,      # New: max 15%
        (5, 15): 0.35,     # Young: max 35%
        (15, 30): 0.55,    # Mature: max 55%
        (30, 50): 0.75,    # Old: max 75%
        (50, 999): 0.90,   # Very old: max 90%
    }
    
    def reconcile(
        self,
        physical: DepreciationResult,
        functional: FunctionalObsolescenceResult,
        external: ExternalObsolescenceResult,
        property_age: int,
        rcn: float,
    ) -> TotalDepreciationResult:
        """
        Combine depreciation components with reasonableness checks.
        """
        # Sum rates
        raw_total = (
            physical.depreciation_rate +
            functional.depreciation_rate +
            external.depreciation_rate
        )
        
        # Get age-based cap
        max_rate = 0.90
        for (min_age, max_age), cap in self.MAX_DEPRECIATION_SCHEDULE.items():
            if min_age <= property_age < max_age:
                max_rate = cap
                break
        
        # Apply cap
        capped_total = min(raw_total, max_rate)
        was_capped = capped_total < raw_total
        
        # Calculate amounts
        total_amount = rcn * capped_total
        
        # Proportionally allocate if capped
        if was_capped and raw_total > 0:
            scale = capped_total / raw_total
            physical_amount = rcn * physical.depreciation_rate * scale
            functional_amount = rcn * functional.depreciation_rate * scale
            external_amount = rcn * external.depreciation_rate * scale
        else:
            physical_amount = rcn * physical.depreciation_rate
            functional_amount = rcn * functional.depreciation_rate
            external_amount = rcn * external.depreciation_rate
        
        return TotalDepreciationResult(
            physical_rate=physical.depreciation_rate,
            physical_amount=round(physical_amount, 2),
            functional_rate=functional.depreciation_rate,
            functional_amount=round(functional_amount, 2),
            external_rate=external.depreciation_rate,
            external_amount=round(external_amount, 2),
            total_rate=round(capped_total, 4),
            total_percent=round(capped_total * 100, 2),
            total_amount=round(total_amount, 2),
            was_capped=was_capped,
            cap_applied=max_rate if was_capped else None,
            depreciated_value=round(rcn - total_amount, 2),
            components={
                'physical': physical,
                'functional': functional,
                'external': external,
            },
            confidence=min(
                physical.confidence,
                functional.confidence,
                external.confidence
            ),
            methodology_notes=self._generate_notes(
                physical, functional, external, was_capped
            ),
        )
```

---

### 8.7 Implementation Phases (Depreciation)

| Phase | Task | Priority | Days | Status |
|-------|------|----------|------|--------|
| **D1** | Create `PhysicalDepreciationCalculator` | High | 1 | ✅ Complete |
| **D2** | Create `FunctionalObsolescenceCalculator` with auto-detection | High | 1-2 | ✅ Complete |
| **D3** | Create `ExternalObsolescenceCalculator` with Data Hub integration | Medium | 1-2 | ✅ Complete |
| **D4** | Create `DepreciationReconciliationService` | High | 0.5 | ✅ Complete |
| **D5** | Add override schema and validation | High | 0.5 | ✅ Complete |
| **D6** | Frontend: Auto-calc display with inputs | High | 1 | ✅ Complete |
| **D7** | Frontend: Override UI with justification | High | 1 | ⬜ Pending |
| **D8** | API endpoints for depreciation | Medium | 0.5 | ⬜ Pending |
| **D9** | Integration testing | High | 1 | ⬜ Pending |

---

### 8.8 Depreciation Integration (Cost Approach & DRC)

The depreciation calculators are now fully integrated into both the **Cost Approach** and **DRC Method** services.

#### 8.8.1 Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPRECIATION SERVICE INTEGRATION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              depreciation.py (Centralized Calculators)               │   │
│  │                                                                       │   │
│  │  ┌──────────────────────────┐  ┌──────────────────────────┐         │   │
│  │  │ PhysicalDepreciation     │  │ FunctionalObsolescence   │         │   │
│  │  │ Calculator               │  │ Calculator               │         │   │
│  │  │                          │  │                          │         │   │
│  │  │ • Modified Age-Life      │  │ • Auto-detection rules   │         │   │
│  │  │ • Condition factors      │  │ • Curable/Incurable      │         │   │
│  │  │ • Economic life by type  │  │ • 25% cap                │         │   │
│  │  │ • Renovation adjustment  │  │ • Ghana-specific rules   │         │   │
│  │  └────────────┬─────────────┘  └────────────┬─────────────┘         │   │
│  │               │                              │                        │   │
│  └───────────────┼──────────────────────────────┼────────────────────────┘   │
│                  │                              │                            │
│         ┌────────┴──────────────────────────────┴────────┐                  │
│         │                                                │                   │
│         ▼                                                ▼                   │
│  ┌─────────────────────────┐               ┌─────────────────────────┐      │
│  │    cost_approach.py     │               │     drc_method.py       │      │
│  │                         │               │                         │      │
│  │ _calculate_depreciation │               │ _calculate_depreciation │      │
│  │ • Uses calculators      │               │ • Uses calculators      │      │
│  │ • Falls back to legacy  │               │ • Asset-specific life   │      │
│  │ • Full audit trail      │               │ • Specialized factors   │      │
│  │ • Property type mapping │               │ • Construction mapping  │      │
│  └───────────┬─────────────┘               └───────────┬─────────────┘      │
│              │                                          │                    │
│              ▼                                          ▼                    │
│  ┌─────────────────────────┐               ┌─────────────────────────┐      │
│  │   Cost Approach Value   │               │      DRC Value          │      │
│  │   = Land + (RCN - Dep)  │               │   = Land + (GRC - Dep)  │      │
│  └─────────────────────────┘               └─────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 8.8.2 Files Modified

| File | Changes | Lines Changed |
|------|---------|---------------|
| `depreciation.py` | **NEW** - Centralized depreciation calculators | ~800 lines |
| `cost_approach.py` | Imports depreciation, new `_calculate_depreciation()` | ~100 lines |
| `drc_method.py` | Imports depreciation, new `_calculate_depreciation()` with schema conversion | ~150 lines |
| `services/__init__.py` | **NEW** - Exports depreciation classes | ~30 lines |

#### 8.8.3 Key Integration Features

**Cost Approach Integration:**
```python
# cost_approach.py - _calculate_depreciation()
from .depreciation import calculate_physical_depreciation, calculate_functional_obsolescence

physical_result = calculate_physical_depreciation(
    property_data=property,
    valuation_date=valuation_date,
    construction_type=self._infer_construction_type(property),
)
functional_result = calculate_functional_obsolescence(property)

# Falls back to legacy if calculator fails (missing data)
# Returns full audit trail in depreciation_details
```

**DRC Method Integration:**
```python
# drc_method.py - _calculate_depreciation()
from .depreciation import PhysicalDepreciationCalculator, FunctionalObsolescenceCalculator

# Convert PropertyForValuation → Property schema
property_schema = self._convert_to_property_schema(property_data)

# Map asset type to construction type for economic life
construction_type = self._map_asset_to_construction_type(asset_analysis.asset_type)

# Use standardized calculators
physical_result = PhysicalDepreciationCalculator().calculate(...)
functional_result = FunctionalObsolescenceCalculator().calculate(...)

# Add specialized factors for tech-dependent assets (substations, etc.)
```

#### 8.8.4 Depreciation Output Structure

Both services now return enhanced depreciation details:

```python
depreciation_details = {
    'physical': {
        'rate': 0.196,
        'amount': 215600,
        'actual_age': 12,
        'effective_age': 10.8,
        'economic_life': 55,
        'remaining_life': 44.2,
    },
    'functional': {
        'rate': 0.05,
        'amount': 55000,
        'items_detected': 2,
        'curable_rate': 0.03,
        'incurable_rate': 0.02,
    },
    'external': {
        'rate': 0.0,
        'amount': 0,
    },
    'total': {
        'rate': 0.246,
        'amount': 270600,
        'capped': False,
    },
    'physical_result': { ... },  # Full PhysicalDepreciationResult
    'functional_result': { ... },  # Full FunctionalObsolescenceResult
    'method': 'integrated_depreciation_calculators',
}
```

---

### 8.9 Acceptance Criteria (Depreciation)

- [x] Physical depreciation auto-calculates from year_built, condition, construction_type
- [x] Functional obsolescence auto-detects from property specifications
- [x] External obsolescence uses location/market data when available
- [x] User can override each component with required justification
- [x] Variance >20% requires supervisor approval flag
- [x] Total depreciation capped by age-based schedule
- [x] All calculations have full audit trail
- [x] Frontend displays auto-calculated values with breakdown
- [ ] Override UI requires minimum justification text (D7)
- [ ] API stores both auto-calculated and override values (D8)

---

## Appendix: Existing Code References

| Component | File | Lines |
|-----------|------|-------|
| Sales Comparison Scoring | `sales_comparison.py` | 263-310 |
| Sales Comparison Adjustments | `sales_comparison.py` | 350-710 |
| Comparable Weight Calc | `sales_comparison.py` | 714-740 |
| Residual Method | `residual_method.py` | 1-350 |
| Reconciliation Service | `reconciliation.py` | 150-450 |
| Standard Property Weights | `reconciliation.py` | 170-193 |
| Confidence Calculation | `reconciliation.py` | 446-500 |
| Cost Approach Land Value | `cost_approach.py` | 320-360 |
| **Physical Depreciation Calculator** | `depreciation.py` | 142-350 |
| **Functional Obsolescence Calculator** | `depreciation.py` | 400-700 |
| **Cost Approach Depreciation (integrated)** | `cost_approach.py` | 440-540 |
| **DRC Depreciation (integrated)** | `drc_method.py` | 403-580 |
| Depreciation Types (types.ts) | `types.ts` | 492-520 |
