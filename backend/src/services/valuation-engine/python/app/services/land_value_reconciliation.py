"""
Land Value Reconciliation Service
Two-method reconciliation with comp-strength-based weighting

This service:
1. Reconciles land values from TWO valuation methods only:
   - A) Residual Land Value (GDV-based)
   - B) Comparable-Adjusted Land Value
2. User-entered is NOT a valuation method - it's an override handled by LandValueProvider
3. Weights are determined by comparable strength (not property use case)
4. Detects cross-method outliers when values diverge significantly
5. Calculates confidence scores based on method agreement
6. Generates GhIS/RICS-compliant disclosure text

Weight Distribution (per GhIS/RICS):
    | Scenario     | Residual | Comparable |
    |--------------|----------|------------|
    | Weak comps   | 70%      | 30%        |
    | Balanced     | 50%      | 50%        |
    | Strong comps | 30%      | 70%        |
"""

import logging
import statistics
from typing import Dict, List, Any
from enum import Enum
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# ============================================================================
# CONSTANTS - Method Weights by Property Use Case
# ============================================================================

class ComparableStrength(str, Enum):
    """Comparable data strength - determines method weighting"""
    WEAK = "weak"          # Few comps, distant, old, or dissimilar
    BALANCED = "balanced"  # Adequate comps with reasonable similarity
    STRONG = "strong"      # Many recent, nearby, highly similar comps


# Weights by comparable strength (per GhIS/RICS standards)
# Only TWO valuation methods: Residual (GDV-based) and Comparable-Adjusted
# User-entered is an OVERRIDE, not a valuation method
LAND_VALUE_METHOD_WEIGHTS = {
    # Weak comps - rely more on residual/GDV analysis
    ComparableStrength.WEAK: {
        'residual_gdv': 0.70,
        'comparable_land_sales': 0.30,
    },
    
    # Balanced - equal weight to both methods
    ComparableStrength.BALANCED: {
        'residual_gdv': 0.50,
        'comparable_land_sales': 0.50,
    },
    
    # Strong comps - rely more on market evidence
    ComparableStrength.STRONG: {
        'residual_gdv': 0.30,
        'comparable_land_sales': 0.70,
    },
}

# Confidence thresholds (adjusted for 2-method system)
MIN_CONFIDENCE_SINGLE_METHOD = 0.50  # Only one method available
MAX_CONFIDENCE_SINGLE_METHOD = 0.70  # Cap when only one method
MIN_CONFIDENCE_TWO_METHODS = 0.70    # Both methods available
MAX_CONFIDENCE_TWO_METHODS = 0.90    # Max with both methods agreeing

# Divergence threshold (flags significant disagreement between methods)
MAX_DEVIATION_PCT = 0.40  # 40% divergence flags disagreement


@dataclass
class ReconciliationResult:
    """Result of land value reconciliation"""
    success: bool
    final_land_value: float = 0.0
    confidence_score: float = 0.0
    methods_used: List[str] = None
    methods_failed: List[str] = None
    method_weights: Dict[str, float] = None
    method_values: Dict[str, float] = None
    method_confidences: Dict[str, float] = None
    outlier_info: Dict[str, Any] = None
    value_range_low: float = 0.0
    value_range_high: float = 0.0
    error: str = None
    
    def __post_init__(self):
        if self.methods_used is None:
            self.methods_used = []
        if self.methods_failed is None:
            self.methods_failed = []
        if self.method_weights is None:
            self.method_weights = {}
        if self.method_values is None:
            self.method_values = {}
        if self.method_confidences is None:
            self.method_confidences = {}
        if self.outlier_info is None:
            self.outlier_info = {'outlier_detected': False}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'success': self.success,
            'final_land_value': round(self.final_land_value, 2),
            'confidence_score': round(self.confidence_score, 4),
            'methods_used': self.methods_used,
            'methods_failed': self.methods_failed,
            'method_weights': {k: round(v, 4) for k, v in self.method_weights.items()},
            'method_values': {k: round(v, 2) for k, v in self.method_values.items()},
            'method_confidences': {k: round(v, 4) for k, v in self.method_confidences.items()},
            'outlier_info': self.outlier_info,
            'value_range_low': round(self.value_range_low, 2),
            'value_range_high': round(self.value_range_high, 2),
            'error': self.error,
        }


class LandValueReconciliationService:
    """
    Reconcile two land valuation methods with comp-strength-based weighting.
    
    IMPORTANT: User-entered values are NOT handled here.
    User override is a 100% replacement handled by LandValueProvider.
    
    This service only reconciles:
    - A) Residual Land Value (GDV-based)
    - B) Comparable-Adjusted Land Value
    
    Features:
    - Comp-strength-based weight determination
    - Fallback to single method when one fails
    - Cross-method outlier detection (when both methods available)
    - Confidence scoring based on method agreement
    - GhIS/RICS-compliant disclosure generation
    
    Usage:
        service = LandValueReconciliationService()
        result = service.reconcile_land_value(
            method_results={
                'comparable_land_sales': {'success': True, 'indicated_value': 450000, 'confidence_score': 0.82},
                'residual_gdv': {'success': True, 'indicated_value': 520000, 'confidence_score': 0.75},
            },
            comparable_strength='balanced'  # 'weak', 'balanced', or 'strong'
        )
    """
    
    def __init__(self):
        self.max_deviation_pct = MAX_DEVIATION_PCT
    
    def determine_comparable_strength(
        self,
        comparable_result: Dict[str, Any]
    ) -> ComparableStrength:
        """
        Determine comparable strength from the comparable sales method result.
        
        Args:
            comparable_result: Result dict from LandComparableSalesService
        
        Returns:
            ComparableStrength enum value
        
        Criteria:
        - STRONG: confidence >= 0.75 AND comparables_used >= 5
        - BALANCED: confidence >= 0.55 AND comparables_used >= 3
        - WEAK: otherwise
        """
        if not comparable_result.get('success', False):
            return ComparableStrength.WEAK
        
        confidence = comparable_result.get('confidence_score', 0)
        comparables_used = comparable_result.get('comparables_used', 0)
        
        # Strong: High confidence with many comparable
        if confidence >= 0.75 and comparables_used >= 5:
            return ComparableStrength.STRONG
        
        # Balanced: Adequate confidence with sufficient comparables
        if confidence >= 0.55 and comparables_used >= 3:
            return ComparableStrength.BALANCED
        
        # Weak: Low confidence or few comparables
        return ComparableStrength.WEAK
    
    def reconcile_land_value(
        self,
        method_results: Dict[str, Dict[str, Any]],
        comparable_strength: str = 'balanced'
    ) -> ReconciliationResult:
        """
        Reconcile land values from two valuation methods.
        
        Args:
            method_results: Dictionary with results for 'residual_gdv' and 'comparable_land_sales':
                - success: bool - whether method succeeded
                - indicated_value: float - the land value estimate
                - confidence_score: float - method confidence (0-1)
                - error: str (optional) - error message if failed
            comparable_strength: One of 'weak', 'balanced', 'strong' - determines weighting
        
        Returns:
            ReconciliationResult with reconciled value and metadata
        
        Note: User-entered values are handled by LandValueProvider as 100% override,
              not reconciled here.
        """
        
        logger.info(f"Reconciling land value with comparable strength: {comparable_strength}")
        
        # Get weights based on comparable strength
        try:
            strength_enum = ComparableStrength(comparable_strength)
        except ValueError:
            strength_enum = ComparableStrength.BALANCED
        
        default_weights = LAND_VALUE_METHOD_WEIGHTS.get(
            strength_enum,
            LAND_VALUE_METHOD_WEIGHTS[ComparableStrength.BALANCED]
        )
        
        # Only process the two valuation methods (ignore user_entered if passed)
        valuation_methods = ['residual_gdv', 'comparable_land_sales']
        
        # Identify successful and failed methods
        successful_methods: Dict[str, Dict[str, Any]] = {}
        failed_methods: Dict[str, Dict[str, Any]] = {}
        
        for method in valuation_methods:
            result = method_results.get(method, {'success': False, 'error': 'Method not provided'})
            if result.get('success', False) and result.get('indicated_value', 0) > 0:
                successful_methods[method] = result
            else:
                failed_methods[method] = result
        
        logger.info(f"Successful methods: {list(successful_methods.keys())}, Failed: {list(failed_methods.keys())}")
        
        # Check if any methods succeeded
        if not successful_methods:
            return ReconciliationResult(
                success=False,
                error="Both land valuation methods failed - cannot determine land value",
                methods_failed=list(failed_methods.keys())
            )
        
        # Redistribute weights from failed method (if any) to active method
        active_weights = self._redistribute_weights(
            default_weights,
            list(successful_methods.keys()),
            list(failed_methods.keys())
        )
        
        # Detect outliers among successful methods
        outlier_info = self._detect_method_outliers(successful_methods)
        
        # If outlier detected, exclude it and recalculate weights
        excluded_method = None
        if outlier_info['outlier_detected']:
            excluded_method = outlier_info['outlier_method']
            logger.warning(f"Excluding outlier method: {excluded_method}")
            
            # Remove outlier from successful methods
            successful_methods.pop(excluded_method, None)
            
            # Recalculate weights
            active_weights = self._redistribute_weights(
                default_weights,
                list(successful_methods.keys()),
                list(failed_methods.keys()) + [excluded_method]
            )
        
        # Check again after outlier exclusion
        if not successful_methods:
            return ReconciliationResult(
                success=False,
                error="All methods failed or excluded as outliers",
                methods_failed=list(failed_methods.keys()),
                outlier_info=outlier_info
            )
        
        # Calculate weighted average
        weighted_sum = 0.0
        weighted_confidence = 0.0
        total_weight = 0.0
        method_values = {}
        method_confidences = {}
        
        for method, result in successful_methods.items():
            weight = active_weights.get(method, 0)
            value = result.get('indicated_value', 0)
            confidence = result.get('confidence_score', 0.5)
            
            weighted_sum += value * weight
            weighted_confidence += confidence * weight
            total_weight += weight
            
            method_values[method] = value
            method_confidences[method] = confidence
        
        if total_weight == 0:
            return ReconciliationResult(
                success=False,
                error="No method weights available for reconciliation",
                methods_used=list(successful_methods.keys()),
                methods_failed=list(failed_methods.keys())
            )
        
        # Calculate final values
        final_land_value = weighted_sum / total_weight
        final_method_confidence = weighted_confidence / total_weight
        
        # Calculate overall confidence (factors in method agreement)
        overall_confidence = self._calculate_overall_confidence(
            successful_methods,
            failed_methods,
            final_method_confidence,
            outlier_info
        )
        
        # Calculate value range
        values = list(method_values.values())
        value_range_low = min(values) if values else 0
        value_range_high = max(values) if values else 0
        
        logger.info(
            f"Reconciled land value: {final_land_value:,.0f} "
            f"(range: {value_range_low:,.0f} - {value_range_high:,.0f}), "
            f"confidence: {overall_confidence:.2f}"
        )
        
        return ReconciliationResult(
            success=True,
            final_land_value=final_land_value,
            confidence_score=overall_confidence,
            methods_used=list(successful_methods.keys()),
            methods_failed=list(failed_methods.keys()) + ([excluded_method] if excluded_method else []),
            method_weights=active_weights,
            method_values=method_values,
            method_confidences=method_confidences,
            outlier_info=outlier_info,
            value_range_low=value_range_low,
            value_range_high=value_range_high
        )
    
    def _redistribute_weights(
        self,
        default_weights: Dict[str, float],
        active_methods: List[str],
        inactive_methods: List[str]
    ) -> Dict[str, float]:
        """
        Redistribute weights from failed/excluded methods to active methods.
        Weights are redistributed proportionally based on remaining method weights.
        
        Example:
            Default: {comp: 0.45, residual: 0.35, user: 0.20}
            If user fails: {comp: 0.45 + (0.20 * 0.45/0.80) = 0.5625, 
                            residual: 0.35 + (0.20 * 0.35/0.80) = 0.4375}
        """
        if not active_methods:
            return {}
        
        # Sum of weights for active methods
        active_weight_sum = sum(default_weights.get(m, 0) for m in active_methods)
        
        # Sum of weights to redistribute
        inactive_weight_sum = sum(default_weights.get(m, 0) for m in inactive_methods)
        
        if active_weight_sum == 0:
            # Equal distribution if no weights defined
            equal_weight = 1.0 / len(active_methods)
            return {m: equal_weight for m in active_methods}
        
        # Redistribute proportionally
        redistributed = {}
        for method in active_methods:
            original = default_weights.get(method, 0)
            proportion = original / active_weight_sum
            redistributed[method] = original + (inactive_weight_sum * proportion)
        
        # Normalize to sum to 1.0 (handle floating point)
        total = sum(redistributed.values())
        if total > 0:
            redistributed = {m: w / total for m, w in redistributed.items()}
        
        return redistributed
    
    def _detect_method_outliers(
        self,
        successful_methods: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Detect significant divergence between the two valuation methods.
        
        With only 2 methods, we can't exclude one as an outlier.
        Instead, we flag divergence and reduce confidence.
        
        Flags when methods diverge by >40% (MAX_DEVIATION_PCT).
        """
        if len(successful_methods) < 2:
            # Only one method - no divergence to detect
            return {'outlier_detected': False, 'reason': 'Single method - no divergence check'}
        
        # Get values for the two methods
        values = {
            method: result['indicated_value']
            for method, result in successful_methods.items()
        }
        
        if len(values) != 2:
            return {'outlier_detected': False, 'reason': 'Unexpected method count'}
        
        value_list = list(values.values())
        method_list = list(values.keys())
        
        avg_value = sum(value_list) / 2
        if avg_value <= 0:
            return {'outlier_detected': False, 'reason': 'Invalid average value'}
        
        # Calculate divergence as percentage difference from average
        divergence_pct = abs(value_list[0] - value_list[1]) / avg_value
        
        if divergence_pct > self.max_deviation_pct:
            # Significant divergence - flag but don't exclude either method
            return {
                'outlier_detected': False,  # Not excluding, just flagging
                'significant_divergence': True,
                'divergence_pct': divergence_pct,
                'threshold_pct': self.max_deviation_pct,
                'method_1': method_list[0],
                'method_1_value': value_list[0],
                'method_2': method_list[1],
                'method_2_value': value_list[1],
                'average_value': avg_value,
                'message': (
                    f"Methods diverge by {divergence_pct*100:.1f}%: "
                    f"{method_list[0]}=GHS {value_list[0]:,.0f}, "
                    f"{method_list[1]}=GHS {value_list[1]:,.0f}"
                )
            }
        
        return {
            'outlier_detected': False,
            'significant_divergence': False,
            'divergence_pct': divergence_pct
        }
    
    def _calculate_overall_confidence(
        self,
        successful_methods: Dict[str, Dict[str, Any]],
        failed_methods: Dict[str, Dict[str, Any]],
        avg_method_confidence: float,
        outlier_info: Dict[str, Any]
    ) -> float:
        """
        Calculate overall confidence score for the reconciled value.
        
        Factors:
        1. Number of successful methods (2 = higher, 1 = lower)
        2. Average method confidence
        3. Method agreement (low divergence = higher)
        4. Penalties for method failure or significant divergence
        """
        confidence = 0.0
        
        num_successful = len(successful_methods)
        num_failed = len(failed_methods)
        
        # Factor 1: Base confidence by method count
        if num_successful == 1:
            # Single method - capped confidence
            confidence = MIN_CONFIDENCE_SINGLE_METHOD + (avg_method_confidence * 0.20)
            confidence = min(confidence, MAX_CONFIDENCE_SINGLE_METHOD)
        elif num_successful == 2:
            # Both methods available - higher base confidence
            confidence = MIN_CONFIDENCE_TWO_METHODS + (avg_method_confidence * 0.25)
        else:
            # Shouldn't happen with 2-method system, but handle gracefully
            confidence = 0.75 + (avg_method_confidence * 0.20)
        
        # Factor 2: Method agreement (for 2 methods)
        if num_successful == 2:
            values = [r['indicated_value'] for r in successful_methods.values()]
            mean_val = statistics.mean(values)
            if mean_val > 0:
                divergence = abs(values[0] - values[1]) / mean_val
                # Low divergence = high agreement = bonus; High divergence = penalty
                if divergence < 0.10:  # <10% divergence
                    confidence += 0.10
                elif divergence < 0.20:  # <20% divergence
                    confidence += 0.05
                elif divergence > 0.30:  # >30% divergence
                    confidence -= 0.10
        
        # Factor 3: Penalty for failed method
        if num_failed > 0:
            confidence -= 0.10  # Significant penalty - lost corroboration
        
        # Factor 4: Penalty for significant divergence (methods disagree)
        if outlier_info.get('significant_divergence', False):
            confidence -= 0.05
        
        # Cap confidence
        confidence = max(0.30, min(confidence, MAX_CONFIDENCE_TWO_METHODS + 0.15))
        
        return confidence
    
    def generate_disclosure_text(
        self,
        result: ReconciliationResult,
        method_results: Dict[str, Dict[str, Any]]
    ) -> str:
        """
        Generate GhIS/RICS-compliant disclosure text for land value methodology.
        
        Args:
            result: The reconciliation result
            method_results: Original method results (for additional context)
        
        Returns:
            Disclosure text suitable for valuation report
        """
        if not result.success:
            return f"Land value could not be determined: {result.error}"
        
        parts = []
        
        # Method summary
        methods_used = result.methods_used
        if len(methods_used) == 1:
            method_name = methods_used[0].replace('_', ' ').title()
            parts.append(f"Land value determined using {method_name} method only.")
        else:
            method_names = [m.replace('_', ' ').title() for m in methods_used]
            weights_text = ", ".join([
                f"{m} ({result.method_weights.get(methods_used[i], 0)*100:.0f}%)"
                for i, m in enumerate(method_names)
            ])
            parts.append(f"Land value determined by reconciling {len(methods_used)} methods: {weights_text}.")
        
        # Failed methods
        if result.methods_failed:
            failed_names = [m.replace('_', ' ').title() for m in result.methods_failed]
            parts.append(f"Note: {', '.join(failed_names)} method(s) could not be applied due to insufficient data.")
        
        # Divergence disclosure (for 2-method system)
        outlier_info = result.outlier_info or {}
        if outlier_info.get('significant_divergence'):
            divergence = outlier_info.get('divergence_pct', 0) * 100
            parts.append(
                f"The two valuation methods showed significant divergence ({divergence:.0f}%). "
                "This has been reflected in a reduced confidence score."
            )
        
        # Value range
        if result.value_range_low != result.value_range_high:
            parts.append(
                f"Method values ranged from GHS {result.value_range_low:,.0f} "
                f"to GHS {result.value_range_high:,.0f}."
            )
        
        # Confidence statement
        confidence = result.confidence_score
        if confidence >= 0.80:
            confidence_desc = "high"
        elif confidence >= 0.60:
            confidence_desc = "moderate"
        else:
            confidence_desc = "limited"
        parts.append(f"Confidence in the reconciled land value is {confidence_desc} ({confidence:.0%}).")
        
        return " ".join(parts)
