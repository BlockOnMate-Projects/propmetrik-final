"""
Land Value Provider
Centralized source of truth for land value across all valuation approaches

LAND VALUE can come from:
    A) Residual Land Value (GDV-based) - valuation method
    B) Comparable-Adjusted Land Value - valuation method  
    C) User-Entered Land Price - override (NOT a valuation method)

Only A and B are valuation-derived and reconciled via weighted average.
User-entered (C) is a 100% OVERRIDE that bypasses reconciliation.

Weight Distribution (per GhIS/RICS):
    | Scenario     | Residual | Comparable |
    |--------------|----------|------------|
    | Weak comps   | 70%      | 30%        |
    | Balanced     | 50%      | 50%        |
    | Strong comps | 30%      | 70%        |

Usage:
    provider = LandValueProvider(market_data_adapter)
    result = await provider.get_land_value(property, valuation_id)
    
    # Use in Cost Approach
    land_value = result.final_land_value
"""

import logging
import time
from datetime import date
from typing import Dict, Any, Optional
from dataclasses import dataclass, field

from .land_comparable_sales import LandComparableSalesService
from .land_value_reconciliation import LandValueReconciliationService, ReconciliationResult
from .residual_method import ResidualMethodService
from ..adapters.data_hub_adapter import MarketDataAdapter
from ..schemas import Property
from ..models.schemas import PropertyForValuation, ValuationOptions, RegionCode

logger = logging.getLogger(__name__)


# ============================================================================
# CACHE CONFIGURATION
# ============================================================================

# Cache TTL in seconds (default: 5 minutes)
DEFAULT_CACHE_TTL_SECONDS = 300


@dataclass
class CacheEntry:
    """Cache entry with timestamp for TTL expiration"""
    value: Dict[str, Any]
    created_at: float = field(default_factory=time.time)
    
    def is_expired(self, ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS) -> bool:
        """Check if cache entry has expired"""
        return (time.time() - self.created_at) > ttl_seconds


@dataclass
class LandValueResult:
    """Result from land value calculation"""
    success: bool
    final_land_value: float = 0.0
    final_land_value_per_sqm: float = 0.0
    land_area_sqm: float = 0.0
    confidence_score: float = 0.0
    primary_method: str = ""
    
    # User override info
    is_user_override: bool = False
    user_justification: str = ""
    
    # Method details
    methods: Dict[str, Any] = None
    reconciliation: Dict[str, Any] = None
    comparable_strength: str = ""  # 'weak', 'balanced', 'strong'
    
    # Disclosure
    disclosure_required: bool = False
    disclosure_text: str = ""
    
    error: str = None
    cached: bool = False
    
    def __post_init__(self):
        if self.methods is None:
            self.methods = {}
        if self.reconciliation is None:
            self.reconciliation = {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'success': self.success,
            'final_land_value': round(self.final_land_value, 2),
            'final_land_value_per_sqm': round(self.final_land_value_per_sqm, 2),
            'land_area_sqm': self.land_area_sqm,
            'confidence_score': round(self.confidence_score, 4),
            'primary_method': self.primary_method,
            'is_user_override': self.is_user_override,
            'user_justification': self.user_justification,
            'methods': self.methods,
            'reconciliation': self.reconciliation,
            'comparable_strength': self.comparable_strength,
            'disclosure_required': self.disclosure_required,
            'disclosure_text': self.disclosure_text,
            'error': self.error,
            'cached': self.cached,
        }


class LandValueProvider:
    """
    Centralized provider for reconciled land values.
    
    LAND VALUE Sources:
    A) Residual Land Value (GDV-based) - valuation method
    B) Comparable-Adjusted Land Value - valuation method
    C) User-Entered Land Price - 100% OVERRIDE (NOT a valuation method)
    
    Features:
    - In-memory caching with TTL
    - Automatic method orchestration
    - RICS-compliant disclosure generation
    - Cross-approach value flow support
    
    Usage:
        provider = LandValueProvider(market_adapter)
        result = await provider.get_land_value(
            property=property_obj,
            valuation_id="val-123",
            property_use_case='developed_property'
        )
        
        if result.success:
            print(f"Land Value: GHS {result.final_land_value:,.0f}")
            print(f"Confidence: {result.confidence_score:.0%}")
    """
    
    def __init__(
        self,
        market_data_adapter: MarketDataAdapter,
        cache_ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS
    ):
        """
        Initialize the Land Value Provider.
        
        Args:
            market_data_adapter: Adapter for market data access
            cache_ttl_seconds: Cache time-to-live in seconds (default: 300)
        """
        self.market_adapter = market_data_adapter
        self.cache_ttl = cache_ttl_seconds
        
        # Initialize services
        self.comparable_service = LandComparableSalesService(market_data_adapter)
        self.residual_service = ResidualMethodService(market_data_adapter)
        self.reconciliation_service = LandValueReconciliationService()
        
        # In-memory cache
        self._cache: Dict[str, CacheEntry] = {}
    
    async def get_land_value(
        self,
        property: Property,
        valuation_id: str,
        valuation_date: Optional[date] = None,
        user_entered_value: Optional[float] = None,
        user_justification: Optional[str] = None,
        force_recalculate: bool = False
    ) -> LandValueResult:
        """
        Get land value - either from user override or reconciled valuation methods.
        
        IMPORTANT: If user_entered_value is provided, it is a 100% OVERRIDE.
        User-entered values bypass the valuation methods entirely.
        
        Args:
            property: The property being valued
            valuation_id: Unique identifier for the valuation
            valuation_date: Date of valuation (defaults to today)
            user_entered_value: User-provided land value (100% OVERRIDE if provided)
            user_justification: Required justification for user override
            force_recalculate: If True, bypass cache and recalculate
        
        Returns:
            LandValueResult with land value and metadata
        """
        valuation_date = valuation_date or date.today()
        
        # Validate property has land area
        land_area = property.specifications.land_size_sqm
        if not land_area or land_area <= 0:
            return LandValueResult(
                success=False,
                error="Property has no land area specified"
            )
        
        # =====================================================================
        # USER OVERRIDE PATH (100% - bypasses valuation methods)
        # =====================================================================
        if user_entered_value and user_entered_value > 0:
            logger.info(
                f"User override for land value: GHS {user_entered_value:,.0f} "
                f"(bypasses valuation methods)"
            )
            
            return self._create_user_override_result(
                user_entered_value=user_entered_value,
                user_justification=user_justification or "",
                land_area=land_area
            )
        
        # =====================================================================
        # VALUATION PATH (Residual + Comparable reconciliation)
        # =====================================================================
        
        # Generate cache key
        cache_key = self._generate_cache_key(valuation_id, user_entered_value)
        
        # Check cache (unless force recalculate)
        if not force_recalculate:
            cached_result = self._get_from_cache(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for land value: {cache_key}")
                cached_result['cached'] = True
                return LandValueResult(**cached_result)
        
        logger.info(f"Calculating land value for valuation {valuation_id}")
        
        # Execute valuation methods (Residual and Comparable only)
        method_results = await self._execute_valuation_methods(
            property=property,
            valuation_id=valuation_id,
            valuation_date=valuation_date
        )
        
        # Determine comparable strength from comparable method result
        comparable_result = method_results.get('comparable_land_sales', {})
        comparable_strength = self.reconciliation_service.determine_comparable_strength(
            comparable_result
        )
        
        # Reconcile methods with comp-strength-based weighting
        reconciliation = self.reconciliation_service.reconcile_land_value(
            method_results, 
            comparable_strength=comparable_strength.value
        )
        
        # Handle reconciliation failure
        if not reconciliation.success:
            return LandValueResult(
                success=False,
                error=reconciliation.error,
                methods=self._serialize_method_results(method_results),
                reconciliation=reconciliation.to_dict(),
                comparable_strength=comparable_strength.value
            )
        
        # Calculate final values
        final_value = reconciliation.final_land_value
        value_per_sqm = final_value / land_area if land_area > 0 else 0
        
        # Determine primary method (highest weight)
        primary_method = self._get_primary_method(reconciliation)
        
        # Determine disclosure requirements
        disclosure_required = self._requires_disclosure(reconciliation, method_results)
        
        # Generate disclosure text
        disclosure_text = self.reconciliation_service.generate_disclosure_text(
            reconciliation,
            method_results
        )
        
        # Build result
        result = LandValueResult(
            success=True,
            final_land_value=round(final_value, 2),
            final_land_value_per_sqm=round(value_per_sqm, 2),
            land_area_sqm=land_area,
            confidence_score=reconciliation.confidence_score,
            primary_method=primary_method,
            is_user_override=False,
            methods=self._serialize_method_results(method_results),
            reconciliation=reconciliation.to_dict(),
            comparable_strength=comparable_strength.value,
            disclosure_required=disclosure_required,
            disclosure_text=disclosure_text,
            cached=False
        )
        
        # Store in cache
        self._store_in_cache(cache_key, result.to_dict())
        
        logger.info(
            f"Land value calculated: GHS {final_value:,.0f} "
            f"({value_per_sqm:,.0f}/sqm), confidence: {reconciliation.confidence_score:.2f}, "
            f"primary method: {primary_method}, comp strength: {comparable_strength.value}"
        )
        
        return result
    
    def _create_user_override_result(
        self,
        user_entered_value: float,
        user_justification: str,
        land_area: float
    ) -> LandValueResult:
        """
        Create result for user override (100% - bypasses valuation methods).
        
        User override is NOT a valuation method. It completely replaces
        the system-estimated value with the user-provided value.
        """
        value_per_sqm = user_entered_value / land_area if land_area > 0 else 0
        
        # Generate disclosure text for user override
        disclosure_text = (
            f"Land value has been overridden by user input: GHS {user_entered_value:,.0f}. "
            f"This value replaces system-estimated valuation methods. "
            f"Justification: {user_justification or 'Not provided'}. "
            "User-entered values should be verified against market evidence."
        )
        
        return LandValueResult(
            success=True,
            final_land_value=round(user_entered_value, 2),
            final_land_value_per_sqm=round(value_per_sqm, 2),
            land_area_sqm=land_area,
            confidence_score=1.0,  # User is confident in their value
            primary_method="user_override",
            is_user_override=True,
            user_justification=user_justification,
            methods={'user_override': {
                'success': True,
                'indicated_value': user_entered_value,
                'justification': user_justification,
                'note': 'User override bypasses valuation methods (100%)'
            }},
            reconciliation={},  # No reconciliation for user override
            comparable_strength="",  # N/A for user override
            disclosure_required=True,  # Always disclose user overrides
            disclosure_text=disclosure_text,
            cached=False
        )
    
    async def _execute_valuation_methods(
        self,
        property: Property,
        valuation_id: str,
        valuation_date: date
    ) -> Dict[str, Dict[str, Any]]:
        """
        Execute the TWO valuation methods (Residual and Comparable).
        
        User-entered is NOT a valuation method - it's handled separately
        as a 100% override in get_land_value().
        """
        method_results = {}
        
        # Method A: Comparable Land Sales
        method_results['comparable_land_sales'] = await self._execute_comparable_method(
            property, valuation_date
        )
        
        # Method B: Residual (GDV-Based)
        method_results['residual_gdv'] = await self._execute_residual_method(
            property, valuation_id
        )
        
        return method_results
    
    async def _execute_comparable_method(
        self,
        property: Property,
        valuation_date: date
    ) -> Dict[str, Any]:
        """Execute the Comparable Land Sales method"""
        try:
            result = await self.comparable_service.calculate_land_value(
                property, valuation_date
            )
            
            if result.success:
                return {
                    'success': True,
                    'indicated_value': result.indicated_value,
                    'confidence_score': result.confidence_score,
                    'value_per_sqm': result.value_per_sqm,
                    'comparables_used': result.comparables_used,
                    'comparables_found': result.comparables_found,
                    'outliers_excluded': result.outliers_excluded,
                    'methodology_notes': result.methodology_notes,
                    'basket': result.basket.model_dump() if result.basket else None
                }
            else:
                return {
                    'success': False,
                    'error': result.error
                }
                
        except Exception as e:
            logger.warning(f"Comparable land sales method failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _execute_residual_method(
        self,
        property: Property,
        valuation_id: str
    ) -> Dict[str, Any]:
        """Execute the Residual (GDV-Based) method"""
        try:
            # Map region
            region_mapping = {
                'greater_accra': RegionCode.GREATER_ACCRA,
                'kumasi_metro': RegionCode.KUMASI_METRO,
                'eastern': RegionCode.EASTERN,
                'western_cluster': RegionCode.WESTERN_CLUSTER,
                'northern_cluster': RegionCode.NORTHERN_CLUSTER,
            }
            
            region_value = property.location.region.value if hasattr(property.location.region, 'value') else str(property.location.region)
            region_code = region_mapping.get(region_value.lower(), RegionCode.GREATER_ACCRA)
            
            property_for_val = PropertyForValuation(
                id=property.id,
                region=region_code,
                property_type=property.property_type.value if hasattr(property.property_type, 'value') else str(property.property_type),
                built_area_sqm=property.specifications.built_area_sqm,
                land_area_sqm=property.specifications.land_size_sqm,
                bedrooms=property.specifications.bedrooms,
                bathrooms=property.specifications.bathrooms,
                year_built=property.specifications.year_built,
                condition=property.specifications.condition.value if property.specifications.condition and hasattr(property.specifications.condition, 'value') else None,
            )
            
            options = ValuationOptions(
                valuation_date=date.today()
            )
            
            result = await self.residual_service.calculate(property_for_val, options)
            
            # Residual method can return 0 or negative if development is not viable
            # This is a valid result - it means land has no development value at current costs
            if result.confidence > 0:
                residual_value = result.value
                gdv = result.details.get('calculation', {}).get('gross_development_value', 0)
                total_costs = result.details.get('calculation', {}).get('total_costs', 0)
                
                return {
                    'success': True,
                    'indicated_value': max(0, residual_value),  # Floor at 0 - land can't be negative
                    'confidence_score': min(result.confidence, 1.0),  # Cap at 1.0
                    'gdv': gdv,
                    'total_costs': total_costs,
                    'value_per_sqm': result.details.get('calculation', {}).get('land_value_per_sqm', 0),
                    'details': result.details,
                    'development_viable': residual_value > 0,
                    'note': 'Development not economically viable at current costs' if residual_value <= 0 else None
                }
            return {
                    'success': False,
                    'error': result.details.get('error', 'Residual method returned no result')
                }
                
        except Exception as e:
            logger.warning(f"Residual method failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _get_primary_method(self, reconciliation: ReconciliationResult) -> str:
        """Determine the primary method (highest weight)"""
        if not reconciliation.method_weights:
            return 'unknown'
        
        return max(
            reconciliation.method_weights.items(),
            key=lambda x: x[1]
        )[0]
    
    def _requires_disclosure(
        self,
        reconciliation: ReconciliationResult,
        method_results: Dict[str, Dict[str, Any]]
    ) -> bool:
        """Determine if GhIS/RICS disclosure is required"""
        # Disclosure required if:
        # 1. Any method failed (only one method available)
        # 2. Significant divergence between methods
        # Note: User override handled separately (always requires disclosure)
        
        if len(reconciliation.methods_failed) > 0:
            return True
        
        if reconciliation.outlier_info.get('significant_divergence', False):
            return True
        
        if len(reconciliation.methods_used) == 1:
            return True
        
        return False
    
    def _serialize_method_results(
        self,
        method_results: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Serialize method results for storage/transmission"""
        serialized = {}
        
        for method, result in method_results.items():
            # Create a clean copy without non-serializable objects
            clean_result = {}
            for key, value in result.items():
                if hasattr(value, 'to_dict'):
                    clean_result[key] = value.to_dict()
                elif isinstance(value, (str, int, float, bool, type(None), list, dict)):
                    clean_result[key] = value
                else:
                    clean_result[key] = str(value)
            serialized[method] = clean_result
        
        return serialized
    
    # =========================================================================
    # CACHE MANAGEMENT
    # =========================================================================
    
    def _generate_cache_key(
        self,
        valuation_id: str,
        user_entered_value: Optional[float]
    ) -> str:
        """Generate cache key for land value result"""
        # User override values are not cached (direct return)
        # This cache is only for valuation method results
        return f"land_value_{valuation_id}"
    
    def _get_from_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get value from cache if not expired"""
        entry = self._cache.get(cache_key)
        
        if entry is None:
            return None
        
        if entry.is_expired(self.cache_ttl):
            # Remove expired entry
            del self._cache[cache_key]
            return None
        
        return entry.value
    
    def _store_in_cache(self, cache_key: str, value: Dict[str, Any]) -> None:
        """Store value in cache"""
        self._cache[cache_key] = CacheEntry(value=value)
    
    def clear_cache(self, valuation_id: Optional[str] = None) -> int:
        """
        Clear cache entries.
        
        Args:
            valuation_id: If provided, only clear entries for this valuation.
                          If None, clear all entries.
        
        Returns:
            Number of entries cleared
        """
        if valuation_id is None:
            count = len(self._cache)
            self._cache.clear()
            return count
        
        # Clear specific valuation
        keys_to_remove = [
            key for key in self._cache.keys()
            if key.startswith(f"land_value_{valuation_id}_")
        ]
        
        for key in keys_to_remove:
            del self._cache[key]
        
        return len(keys_to_remove)
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = len(self._cache)
        expired = sum(
            1 for entry in self._cache.values()
            if entry.is_expired(self.cache_ttl)
        )
        
        return {
            'total_entries': total,
            'active_entries': total - expired,
            'expired_entries': expired,
            'ttl_seconds': self.cache_ttl
        }
    
    # =========================================================================
    # CONVENIENCE METHODS
    # =========================================================================
    
    async def get_land_value_for_cost_approach(
        self,
        property: Property,
        valuation_id: str,
        user_land_value: Optional[float] = None,
        user_justification: Optional[str] = None
    ) -> LandValueResult:
        """
        Convenience method for Cost Approach integration.
        
        If user_land_value is provided, it is a 100% override.
        Otherwise, reconciles Residual and Comparable methods.
        """
        return await self.get_land_value(
            property=property,
            valuation_id=valuation_id,
            user_entered_value=user_land_value,
            user_justification=user_justification
        )
    
    def compare_with_residual_output(
        self,
        provider_land_value: float,
        residual_output_land_value: float
    ) -> Dict[str, Any]:
        """
        Compare provider's reconciled land value with residual method output.
        Useful for circular reference checks.
        
        Args:
            provider_land_value: The reconciled land value from this provider
            residual_output_land_value: The land value output from residual method
        
        Returns:
            Comparison analysis
        """
        if provider_land_value <= 0 or residual_output_land_value <= 0:
            return {
                'comparable': False,
                'reason': 'Invalid values for comparison'
            }
        
        difference = abs(provider_land_value - residual_output_land_value)
        difference_pct = difference / provider_land_value
        
        # Flag significant discrepancies (>20%)
        is_significant = difference_pct > 0.20
        
        return {
            'comparable': True,
            'provider_value': provider_land_value,
            'residual_output_value': residual_output_land_value,
            'difference_ghs': round(difference, 2),
            'difference_pct': round(difference_pct, 4),
            'is_significant_discrepancy': is_significant,
            'recommendation': (
                "Consider reviewing development assumptions in residual method"
                if is_significant else
                "Values are reasonably aligned"
            )
        }
