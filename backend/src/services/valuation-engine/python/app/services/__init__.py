"""
Valuation Engine Services
"""

from .depreciation import (
    # Enums
    ConstructionType,
    FunctionalDeficiencyType,
    ExternalFactorCategory,
    EvidenceType,
    DepreciationComponent,
    # Data classes
    PhysicalDepreciationResult,
    FunctionalObsolescenceItem,
    FunctionalObsolescenceResult,
    ExternalObsolescenceItem,
    ExternalObsolescenceResult,
    TotalDepreciationResult,
    # Override classes (D5)
    DepreciationOverride,
    DepreciationWithOverrides,
    # Calculators
    PhysicalDepreciationCalculator,
    FunctionalObsolescenceCalculator,
    ExternalObsolescenceCalculator,
    # Reconciliation Service
    DepreciationReconciliationService,
    # Convenience functions
    calculate_physical_depreciation,
    calculate_functional_obsolescence,
    calculate_external_obsolescence,
    calculate_total_depreciation,
    # Override functions (D5)
    validate_override,
    create_override,
)

__all__ = [
    # Depreciation - Enums
    "ConstructionType",
    "FunctionalDeficiencyType",
    "ExternalFactorCategory",
    "EvidenceType",
    "DepreciationComponent",
    # Depreciation - Data Classes
    "PhysicalDepreciationResult",
    "FunctionalObsolescenceItem",
    "FunctionalObsolescenceResult",
    "ExternalObsolescenceItem",
    "ExternalObsolescenceResult",
    "TotalDepreciationResult",
    # Depreciation - Override Classes (D5)
    "DepreciationOverride",
    "DepreciationWithOverrides",
    # Depreciation - Calculators
    "PhysicalDepreciationCalculator",
    "FunctionalObsolescenceCalculator",
    "ExternalObsolescenceCalculator",
    # Depreciation - Reconciliation
    "DepreciationReconciliationService",
    # Depreciation - Convenience Functions
    "calculate_physical_depreciation",
    "calculate_functional_obsolescence",
    "calculate_external_obsolescence",
    "calculate_total_depreciation",
    # Depreciation - Override Functions (D5)
    "validate_override",
    "create_override",
]
