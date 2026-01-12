"""
Depreciation Calculation Services
RICS/GhIS/GREDA Compliant Depreciation for Cost Approach

This module provides:
- PhysicalDepreciationCalculator: Age-Life method with condition adjustment
- FunctionalObsolescenceCalculator: Auto-detection from property specifications

Reference Standards:
- RICS Red Book (IVS 105)
- Ghana Institution of Surveyors (GhIS) Valuation Standards
- GREDA Construction Guidelines
"""

from typing import Optional, List, Dict, Any
from datetime import date
from dataclasses import dataclass, field
from enum import Enum
import logging

from ..schemas import (
    Property,
    PropertyCondition,
    PropertyType,
    GhanaRegion,
)


logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS AND DATA CLASSES
# =============================================================================

class ConstructionType(str, Enum):
    """Construction types with associated economic life spans"""
    REINFORCED_CONCRETE = "reinforced_concrete"
    CONCRETE_BLOCK = "concrete_block"
    SANDCRETE_BLOCK = "sandcrete_block"
    MUD_BRICK = "mud_brick"
    TIMBER = "timber"
    STEEL_FRAME = "steel_frame"
    MIXED = "mixed"


class FunctionalDeficiencyType(str, Enum):
    """Types of functional obsolescence"""
    DEFICIENCY_CURABLE = "deficiency_curable"
    DEFICIENCY_INCURABLE = "deficiency_incurable"
    SUPERADEQUACY = "superadequacy"
    OUTDATED_DESIGN = "outdated_design"


@dataclass
class PhysicalDepreciationResult:
    """Result of physical depreciation calculation"""
    depreciation_rate: float
    depreciation_percent: float
    actual_age: int
    effective_age: float
    economic_life: int
    remaining_life: float
    method: str
    inputs_used: Dict[str, Any]
    auto_calculated: bool
    confidence: float
    notes: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'depreciation_rate': self.depreciation_rate,
            'depreciation_percent': self.depreciation_percent,
            'actual_age': self.actual_age,
            'effective_age': self.effective_age,
            'economic_life': self.economic_life,
            'remaining_life': self.remaining_life,
            'method': self.method,
            'inputs_used': self.inputs_used,
            'auto_calculated': self.auto_calculated,
            'confidence': self.confidence,
            'notes': self.notes,
        }


@dataclass
class FunctionalObsolescenceItem:
    """Individual functional obsolescence item detected"""
    item_key: str
    type: FunctionalDeficiencyType
    curable: bool
    description: str
    rate: float
    rate_range: tuple[float, float]
    detection_logic: str
    data_used: Dict[str, Any]


@dataclass
class FunctionalObsolescenceResult:
    """Result of functional obsolescence calculation"""
    depreciation_rate: float
    depreciation_percent: float
    items_detected: List[FunctionalObsolescenceItem]
    total_items: int
    curable_rate: float
    incurable_rate: float
    auto_calculated: bool
    confidence: float
    requires_review: bool
    notes: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'depreciation_rate': self.depreciation_rate,
            'depreciation_percent': self.depreciation_percent,
            'items_detected': [
                {
                    'item_key': item.item_key,
                    'type': item.type.value,
                    'curable': item.curable,
                    'description': item.description,
                    'rate': item.rate,
                    'rate_range': item.rate_range,
                    'detection_logic': item.detection_logic,
                    'data_used': item.data_used,
                }
                for item in self.items_detected
            ],
            'total_items': self.total_items,
            'curable_rate': self.curable_rate,
            'incurable_rate': self.incurable_rate,
            'auto_calculated': self.auto_calculated,
            'confidence': self.confidence,
            'requires_review': self.requires_review,
            'notes': self.notes,
        }


# =============================================================================
# DEPRECIATION OVERRIDE SCHEMA (D5)
# =============================================================================

class EvidenceType(str, Enum):
    """Types of evidence for depreciation overrides"""
    INSPECTION = "inspection"
    PHOTO = "photo"
    MARKET_DATA = "market_data"
    EXPERT_OPINION = "expert_opinion"
    COMPARABLE_ANALYSIS = "comparable_analysis"
    ENGINEERING_REPORT = "engineering_report"
    INSURANCE_ASSESSMENT = "insurance_assessment"


class DepreciationComponent(str, Enum):
    """Depreciation components that can be overridden"""
    PHYSICAL = "physical"
    FUNCTIONAL = "functional"
    EXTERNAL = "external"


@dataclass
class DepreciationOverride:
    """
    User override for depreciation component.
    
    Per GhIS and RICS standards, valuers may override auto-calculated 
    depreciation but must provide:
    1. Specific justification for the override
    2. Supporting evidence (photos, inspection notes, market data)
    3. Variance explanation when deviation > 20% from auto-calculated
    
    Reference: RICS Red Book PS 2, GhIS Valuation Standards Section 5
    """
    component: DepreciationComponent
    auto_calculated_rate: float
    override_rate: float
    justification: str
    evidence_type: EvidenceType
    evidence_reference: Optional[str] = None  # File path or reference ID
    approved_by: Optional[str] = None  # Supervisor approval if variance > 20%
    approval_date: Optional[date] = None
    override_date: date = field(default_factory=date.today)
    valuer_id: Optional[str] = None
    
    # Minimum justification length (characters)
    MIN_JUSTIFICATION_LENGTH = 50
    # Variance threshold requiring approval
    APPROVAL_THRESHOLD_PERCENT = 20.0
    
    @property
    def variance_percent(self) -> float:
        """Calculate variance between override and auto-calculated rate."""
        if self.auto_calculated_rate == 0:
            return 100.0 if self.override_rate > 0 else 0.0
        return abs((self.override_rate - self.auto_calculated_rate) / self.auto_calculated_rate) * 100
    
    @property
    def variance_absolute(self) -> float:
        """Absolute difference between rates."""
        return abs(self.override_rate - self.auto_calculated_rate)
    
    def requires_approval(self) -> bool:
        """
        Check if override requires supervisor approval.
        Required when variance exceeds 20% per GhIS standards.
        """
        return self.variance_percent > self.APPROVAL_THRESHOLD_PERCENT
    
    def has_approval(self) -> bool:
        """Check if required approval has been obtained."""
        if not self.requires_approval():
            return True  # No approval needed
        return self.approved_by is not None and len(self.approved_by.strip()) > 0
    
    def is_valid(self) -> tuple[bool, List[str]]:
        """
        Validate override has required justification and approvals.
        
        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []
        
        # Check justification length
        if not self.justification or len(self.justification.strip()) < self.MIN_JUSTIFICATION_LENGTH:
            errors.append(
                f"Justification must be at least {self.MIN_JUSTIFICATION_LENGTH} characters. "
                f"Current: {len(self.justification.strip()) if self.justification else 0} characters."
            )
        
        # Check override rate is reasonable
        if self.override_rate < 0:
            errors.append("Override rate cannot be negative.")
        if self.override_rate > 1.0:
            errors.append("Override rate cannot exceed 100% (1.0).")
        
        # Check approval if required
        if self.requires_approval() and not self.has_approval():
            errors.append(
                f"Variance of {self.variance_percent:.1f}% exceeds {self.APPROVAL_THRESHOLD_PERCENT}% threshold. "
                f"Supervisor approval is required."
            )
        
        # Check evidence is provided
        if not self.evidence_reference and self.evidence_type != EvidenceType.EXPERT_OPINION:
            errors.append(
                "Evidence reference is required for non-expert-opinion overrides."
            )
        
        return len(errors) == 0, errors
    
    def to_dict(self) -> Dict[str, Any]:
        is_valid, validation_errors = self.is_valid()
        return {
            'component': self.component.value,
            'auto_calculated_rate': self.auto_calculated_rate,
            'override_rate': self.override_rate,
            'variance_percent': round(self.variance_percent, 2),
            'variance_absolute': round(self.variance_absolute, 4),
            'justification': self.justification,
            'evidence_type': self.evidence_type.value,
            'evidence_reference': self.evidence_reference,
            'requires_approval': self.requires_approval(),
            'has_approval': self.has_approval(),
            'approved_by': self.approved_by,
            'approval_date': self.approval_date.isoformat() if self.approval_date else None,
            'override_date': self.override_date.isoformat(),
            'valuer_id': self.valuer_id,
            'is_valid': is_valid,
            'validation_errors': validation_errors,
        }


@dataclass
class DepreciationWithOverrides:
    """
    Container for depreciation calculation with optional overrides.
    Used when presenting final depreciation values to users.
    """
    # Auto-calculated results
    physical_auto: PhysicalDepreciationResult
    functional_auto: FunctionalObsolescenceResult
    external_auto: Optional[Any] = None  # ExternalObsolescenceResult - forward ref
    
    # User overrides (if any)
    physical_override: Optional[DepreciationOverride] = None
    functional_override: Optional[DepreciationOverride] = None
    external_override: Optional[DepreciationOverride] = None
    
    @property
    def physical_rate(self) -> float:
        """Get effective physical rate (override if valid, else auto)."""
        if self.physical_override:
            is_valid, _ = self.physical_override.is_valid()
            if is_valid:
                return self.physical_override.override_rate
        return self.physical_auto.depreciation_rate
    
    @property
    def functional_rate(self) -> float:
        """Get effective functional rate (override if valid, else auto)."""
        if self.functional_override:
            is_valid, _ = self.functional_override.is_valid()
            if is_valid:
                return self.functional_override.override_rate
        return self.functional_auto.depreciation_rate
    
    @property
    def external_rate(self) -> float:
        """Get effective external rate (override if valid, else auto)."""
        if self.external_override:
            is_valid, _ = self.external_override.is_valid()
            if is_valid:
                return self.external_override.override_rate
        if self.external_auto:
            return self.external_auto.depreciation_rate
        return 0.0
    
    @property
    def has_overrides(self) -> bool:
        """Check if any overrides are applied."""
        return any([
            self.physical_override is not None,
            self.functional_override is not None,
            self.external_override is not None,
        ])
    
    @property
    def all_overrides_valid(self) -> tuple[bool, Dict[str, List[str]]]:
        """Check if all applied overrides are valid."""
        all_valid = True
        errors_by_component = {}
        
        if self.physical_override:
            is_valid, errors = self.physical_override.is_valid()
            if not is_valid:
                all_valid = False
                errors_by_component['physical'] = errors
        
        if self.functional_override:
            is_valid, errors = self.functional_override.is_valid()
            if not is_valid:
                all_valid = False
                errors_by_component['functional'] = errors
        
        if self.external_override:
            is_valid, errors = self.external_override.is_valid()
            if not is_valid:
                all_valid = False
                errors_by_component['external'] = errors
        
        return all_valid, errors_by_component
    
    def to_dict(self) -> Dict[str, Any]:
        all_valid, validation_errors = self.all_overrides_valid
        return {
            'physical': {
                'auto_calculated': self.physical_auto.to_dict(),
                'override': self.physical_override.to_dict() if self.physical_override else None,
                'effective_rate': self.physical_rate,
                'is_overridden': self.physical_override is not None,
            },
            'functional': {
                'auto_calculated': self.functional_auto.to_dict(),
                'override': self.functional_override.to_dict() if self.functional_override else None,
                'effective_rate': self.functional_rate,
                'is_overridden': self.functional_override is not None,
            },
            'external': {
                'auto_calculated': self.external_auto.to_dict() if self.external_auto else None,
                'override': self.external_override.to_dict() if self.external_override else None,
                'effective_rate': self.external_rate,
                'is_overridden': self.external_override is not None,
            },
            'summary': {
                'has_overrides': self.has_overrides,
                'all_overrides_valid': all_valid,
                'validation_errors': validation_errors,
                'total_effective_rate': self.physical_rate + self.functional_rate + self.external_rate,
            },
        }


def validate_override(override: DepreciationOverride) -> tuple[bool, List[str]]:
    """
    Validate a depreciation override.
    
    Args:
        override: DepreciationOverride to validate
    
    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    return override.is_valid()


def create_override(
    component: str,
    auto_calculated_rate: float,
    override_rate: float,
    justification: str,
    evidence_type: str,
    evidence_reference: Optional[str] = None,
    valuer_id: Optional[str] = None,
) -> tuple[DepreciationOverride, bool, List[str]]:
    """
    Create and validate a depreciation override.
    
    Args:
        component: 'physical', 'functional', or 'external'
        auto_calculated_rate: System-calculated rate
        override_rate: User-provided override rate
        justification: Reason for override
        evidence_type: Type of supporting evidence
        evidence_reference: Reference to evidence (file path, URL, etc.)
        valuer_id: ID of valuer making the override
    
    Returns:
        Tuple of (DepreciationOverride, is_valid, errors)
    """
    override = DepreciationOverride(
        component=DepreciationComponent(component),
        auto_calculated_rate=auto_calculated_rate,
        override_rate=override_rate,
        justification=justification,
        evidence_type=EvidenceType(evidence_type),
        evidence_reference=evidence_reference,
        valuer_id=valuer_id,
    )
    
    is_valid, errors = override.is_valid()
    return override, is_valid, errors


# =============================================================================
# PHYSICAL DEPRECIATION CALCULATOR
# =============================================================================

class PhysicalDepreciationCalculator:
    """
    Calculate physical depreciation using Modified Age-Life Method.
    
    Physical depreciation represents loss in value due to:
    - Wear and tear from normal use
    - Age deterioration from weathering, chemical reactions
    - Deferred maintenance
    
    Formula:
        Physical Depreciation % = Effective Age / Economic Life
        
    Where:
        Effective Age = Actual Age × Condition Factor
        (adjusted for renovations if applicable)
    
    Reference: RICS Red Book, GhIS Valuation Standards
    """
    
    # Economic life by construction type (years)
    # Based on Ghana market conditions and GhIS guidelines
    ECONOMIC_LIFE: Dict[ConstructionType, int] = {
        ConstructionType.REINFORCED_CONCRETE: 75,
        ConstructionType.CONCRETE_BLOCK: 55,
        ConstructionType.SANDCRETE_BLOCK: 45,
        ConstructionType.MUD_BRICK: 30,
        ConstructionType.TIMBER: 35,
        ConstructionType.STEEL_FRAME: 65,
        ConstructionType.MIXED: 50,
    }
    
    # Condition factors for effective age calculation
    # Factor < 1.0 = Better maintained = Lower effective age
    # Factor > 1.0 = Poorly maintained = Higher effective age
    CONDITION_FACTORS: Dict[PropertyCondition, float] = {
        PropertyCondition.NEW: 0.0,  # Brand new = 0 effective age
        PropertyCondition.EXCELLENT: 0.70,
        PropertyCondition.GOOD: 0.90,
        PropertyCondition.FAIR: 1.15,
        PropertyCondition.POOR: 1.45,
        PropertyCondition.RENOVATION_NEEDED: 1.80,
    }
    
    # Renovation scope impact on effective age reset
    # Value = proportion of effective age that gets "reset"
    RENOVATION_RESET_FACTORS: Dict[str, float] = {
        'minor': 0.15,     # Paint, minor repairs
        'major': 0.35,     # Roof, plumbing, electrical upgrades
        'complete': 0.60,  # Full renovation
    }
    
    # Default economic life by property type (if construction type unknown)
    DEFAULT_ECONOMIC_LIFE_BY_PROPERTY_TYPE: Dict[PropertyType, int] = {
        PropertyType.RESIDENTIAL_HOUSE: 50,
        PropertyType.RESIDENTIAL_APARTMENT: 55,
        PropertyType.RESIDENTIAL_TOWNHOUSE: 50,
        PropertyType.RESIDENTIAL_VILLA: 55,
        PropertyType.RESIDENTIAL_PENTHOUSE: 55,
        PropertyType.COMMERCIAL_OFFICE: 50,
        PropertyType.COMMERCIAL_RETAIL: 45,
        PropertyType.COMMERCIAL_WAREHOUSE: 40,
        PropertyType.COMMERCIAL_MIXED_USE: 50,
        PropertyType.INDUSTRIAL_WAREHOUSE: 40,
        PropertyType.INDUSTRIAL_FACTORY: 40,
        PropertyType.HOSPITALITY_HOTEL: 50,
        PropertyType.INSTITUTIONAL_SCHOOL: 50,
        PropertyType.INSTITUTIONAL_HOSPITAL: 50,
        PropertyType.INSTITUTIONAL_RELIGIOUS: 60,
        PropertyType.OTHER: 50,
    }
    
    def calculate(
        self,
        property_data: Property,
        valuation_date: date,
        construction_type: Optional[ConstructionType] = None,
        last_renovation_year: Optional[int] = None,
        renovation_scope: Optional[str] = None,
    ) -> PhysicalDepreciationResult:
        """
        Calculate physical depreciation from property data.
        
        Args:
            property_data: Property schema with specifications
            valuation_date: Date of valuation
            construction_type: Type of construction (if known)
            last_renovation_year: Year of last major renovation (if any)
            renovation_scope: Scope of renovation ('minor', 'major', 'complete')
        
        Returns:
            PhysicalDepreciationResult with full calculation details
        """
        notes: List[str] = []
        
        # Step 1: Get year built - REQUIRED, no fallback
        year_built = property_data.specifications.year_built
        if year_built is None:
            return PhysicalDepreciationResult(
                depreciation_rate=0.0,
                depreciation_percent=0.0,
                actual_age=0,
                effective_age=0.0,
                economic_life=50,
                remaining_life=50.0,
                method='modified_age_life',
                inputs_used={
                    'year_built': None,
                    'error': 'year_built is required for physical depreciation calculation',
                },
                auto_calculated=False,
                confidence=0.0,
                notes=['Cannot calculate: year_built not provided'],
            )
        
        # Step 2: Calculate actual age
        actual_age = valuation_date.year - year_built
        if actual_age < 0:
            actual_age = 0
            notes.append(f'Year built ({year_built}) is after valuation date, using age = 0')
        
        # Step 3: Determine economic life
        if construction_type:
            economic_life = self.ECONOMIC_LIFE.get(construction_type, 50)
            notes.append(f'Economic life from construction type ({construction_type.value}): {economic_life} years')
        else:
            # Use property type default if construction type not known
            economic_life = self.DEFAULT_ECONOMIC_LIFE_BY_PROPERTY_TYPE.get(
                property_data.property_type, 50
            )
            notes.append(f'Economic life from property type ({property_data.property_type.value}): {economic_life} years')
        
        # Step 4: Get condition and calculate condition factor
        condition = property_data.specifications.condition
        if condition is None:
            # Cannot calculate without condition
            return PhysicalDepreciationResult(
                depreciation_rate=0.0,
                depreciation_percent=0.0,
                actual_age=actual_age,
                effective_age=0.0,
                economic_life=economic_life,
                remaining_life=float(economic_life),
                method='modified_age_life',
                inputs_used={
                    'year_built': year_built,
                    'actual_age': actual_age,
                    'condition': None,
                    'error': 'condition is required for physical depreciation calculation',
                },
                auto_calculated=False,
                confidence=0.0,
                notes=['Cannot calculate: condition not provided'],
            )
        
        condition_factor = self.CONDITION_FACTORS.get(condition, 1.0)
        notes.append(f'Condition: {condition.value}, factor: {condition_factor}')
        
        # Step 5: Calculate base effective age
        if condition == PropertyCondition.NEW:
            effective_age = 0.0
            notes.append('New property: effective age = 0')
        else:
            effective_age = float(actual_age) * condition_factor
        
        # Step 6: Adjust for renovations if provided
        if last_renovation_year is not None and renovation_scope is not None:
            years_since_renovation = valuation_date.year - last_renovation_year
            
            if years_since_renovation >= 0:
                reset_factor = self.RENOVATION_RESET_FACTORS.get(renovation_scope, 0.0)
                
                if reset_factor > 0:
                    # Calculate the age reset from renovation
                    age_at_renovation = effective_age - years_since_renovation
                    if age_at_renovation > 0:
                        age_reset = age_at_renovation * reset_factor
                        effective_age = effective_age - age_reset
                        notes.append(
                            f'Renovation ({renovation_scope}) in {last_renovation_year}: '
                            f'reset {age_reset:.1f} years, effective age now {effective_age:.1f}'
                        )
        
        # Step 7: Ensure effective age is within bounds
        effective_age = max(0.0, effective_age)
        # Cap at 95% of economic life (buildings retain some value)
        max_effective_age = economic_life * 0.95
        if effective_age > max_effective_age:
            effective_age = max_effective_age
            notes.append(f'Effective age capped at {max_effective_age:.1f} years (95% of economic life)')
        
        # Step 8: Calculate depreciation rate
        depreciation_rate = effective_age / economic_life
        remaining_life = economic_life - effective_age
        
        # Step 9: Determine confidence based on data quality
        confidence = self._calculate_confidence(
            has_year_built=True,
            has_condition=True,
            has_construction_type=construction_type is not None,
            has_renovation_info=last_renovation_year is not None,
            condition=condition,
        )
        
        return PhysicalDepreciationResult(
            depreciation_rate=round(depreciation_rate, 4),
            depreciation_percent=round(depreciation_rate * 100, 2),
            actual_age=actual_age,
            effective_age=round(effective_age, 1),
            economic_life=economic_life,
            remaining_life=round(remaining_life, 1),
            method='modified_age_life',
            inputs_used={
                'year_built': year_built,
                'valuation_date': valuation_date.isoformat(),
                'actual_age': actual_age,
                'condition': condition.value if condition else None,
                'condition_factor': condition_factor,
                'construction_type': construction_type.value if construction_type else None,
                'last_renovation_year': last_renovation_year,
                'renovation_scope': renovation_scope,
            },
            auto_calculated=True,
            confidence=confidence,
            notes=notes,
        )
    
    def _calculate_confidence(
        self,
        has_year_built: bool,
        has_condition: bool,
        has_construction_type: bool,
        has_renovation_info: bool,
        condition: Optional[PropertyCondition],
    ) -> float:
        """Calculate confidence score based on data availability"""
        confidence = 0.0
        
        # Base confidence from required fields
        if has_year_built:
            confidence += 0.35
        if has_condition:
            confidence += 0.35
        
        # Bonus for additional data
        if has_construction_type:
            confidence += 0.15
        if has_renovation_info:
            confidence += 0.10
        
        # Adjust based on condition specificity
        # Extreme conditions (new, poor) are more reliable indicators
        if condition in [PropertyCondition.NEW, PropertyCondition.POOR, PropertyCondition.RENOVATION_NEEDED]:
            confidence += 0.05
        
        return min(confidence, 1.0)


# =============================================================================
# FUNCTIONAL OBSOLESCENCE CALCULATOR
# =============================================================================

class FunctionalObsolescenceCalculator:
    """
    Calculate functional obsolescence by auto-detecting deficiencies and superadequacies.
    
    Functional obsolescence represents loss in value due to:
    - Deficiencies: Missing features expected in modern buildings
    - Superadequacies: Over-improvements that don't add proportional value
    - Outdated Design: Floor plans, layouts that don't meet current preferences
    
    Detection is based on property specifications compared to market expectations.
    
    Reference: RICS Red Book, GhIS Valuation Standards
    """
    
    # Maximum total functional obsolescence (cap)
    MAX_FUNCTIONAL_OBSOLESCENCE = 0.25  # 25%
    
    def __init__(self):
        """Initialize with detection rules based on Ghana market standards."""
        pass
    
    def calculate(self, property_data: Property) -> FunctionalObsolescenceResult:
        """
        Calculate functional obsolescence from property specifications.
        
        Detects various deficiencies and superadequacies based on:
        - Bathroom/bedroom ratio
        - Design era (year built)
        - Missing amenities for region/property type
        - Room configuration issues
        
        Args:
            property_data: Property schema with full specifications
            
        Returns:
            FunctionalObsolescenceResult with detected items and total rate
        """
        detected_items: List[FunctionalObsolescenceItem] = []
        notes: List[str] = []
        
        specs = property_data.specifications
        region = property_data.location.region
        property_type = property_data.property_type
        
        # =================================================================
        # DETECTION: Low Bathroom Ratio
        # =================================================================
        bedrooms = specs.bedrooms
        bathrooms = specs.bathrooms
        
        if bedrooms is not None and bathrooms is not None and bedrooms > 0:
            bathroom_ratio = bathrooms / bedrooms
            
            if bathroom_ratio < 0.5:  # Less than 1 bathroom per 2 bedrooms
                # Determine rate based on severity
                if bathroom_ratio < 0.33:
                    rate = 0.08  # Severe: < 1 bathroom per 3 bedrooms
                elif bathroom_ratio < 0.4:
                    rate = 0.06
                else:
                    rate = 0.04
                
                detected_items.append(FunctionalObsolescenceItem(
                    item_key='low_bathroom_ratio',
                    type=FunctionalDeficiencyType.DEFICIENCY_CURABLE,
                    curable=True,
                    description=f'Insufficient bathrooms: {bathrooms} bathrooms for {bedrooms} bedrooms (ratio: {bathroom_ratio:.2f})',
                    rate=rate,
                    rate_range=(0.03, 0.08),
                    detection_logic='bedrooms/bathrooms ratio < 0.5',
                    data_used={'bedrooms': bedrooms, 'bathrooms': bathrooms, 'ratio': round(bathroom_ratio, 2)},
                ))
                notes.append(f'Low bathroom ratio detected: {bathroom_ratio:.2f}')
        
        # =================================================================
        # DETECTION: Outdated Design Era
        # =================================================================
        year_built = specs.year_built
        
        if year_built is not None:
            current_year = 2026  # Hardcoded as per context
            age = current_year - year_built
            
            if year_built < 1980:
                # Pre-1980: Significantly outdated design
                detected_items.append(FunctionalObsolescenceItem(
                    item_key='outdated_design_pre_1980',
                    type=FunctionalDeficiencyType.OUTDATED_DESIGN,
                    curable=False,
                    description=f'Pre-1980 design standards (built {year_built}): outdated floor plans, ceiling heights, room layouts',
                    rate=0.07,
                    rate_range=(0.05, 0.10),
                    detection_logic='year_built < 1980',
                    data_used={'year_built': year_built, 'age': age},
                ))
                notes.append(f'Pre-1980 design detected (built {year_built})')
                
            elif year_built < 1995:
                # 1980-1994: Dated design
                detected_items.append(FunctionalObsolescenceItem(
                    item_key='outdated_design_1980s',
                    type=FunctionalDeficiencyType.OUTDATED_DESIGN,
                    curable=False,
                    description=f'1980s-1990s design (built {year_built}): dated floor plans and configurations',
                    rate=0.04,
                    rate_range=(0.03, 0.06),
                    detection_logic='1980 <= year_built < 1995',
                    data_used={'year_built': year_built, 'age': age},
                ))
                notes.append(f'1980s-1990s dated design detected (built {year_built})')
        
        # =================================================================
        # DETECTION: No Parking (for houses/townhouses)
        # =================================================================
        parking_spaces = specs.parking_spaces
        
        residential_with_parking_expectation = [
            PropertyType.RESIDENTIAL_HOUSE,
            PropertyType.RESIDENTIAL_TOWNHOUSE,
            PropertyType.RESIDENTIAL_VILLA,
        ]
        
        if property_type in residential_with_parking_expectation:
            if parking_spaces is not None and parking_spaces == 0:
                detected_items.append(FunctionalObsolescenceItem(
                    item_key='no_parking',
                    type=FunctionalDeficiencyType.DEFICIENCY_CURABLE,
                    curable=True,  # Can add parking if land permits
                    description='No dedicated parking provision for residential house',
                    rate=0.04,
                    rate_range=(0.03, 0.06),
                    detection_logic='parking_spaces == 0 AND property_type in [house, townhouse, villa]',
                    data_used={'parking_spaces': parking_spaces, 'property_type': property_type.value},
                ))
                notes.append('No parking detected for residential property')
        
        # =================================================================
        # DETECTION: No Air Conditioning in Hot Climate Regions
        # =================================================================
        has_ac = specs.has_air_conditioning
        
        # Regions where AC is expected for modern properties
        hot_climate_regions = [
            GhanaRegion.GREATER_ACCRA,
            GhanaRegion.WESTERN_CLUSTER,
            GhanaRegion.EASTERN,
        ]
        
        # Only check for residential and commercial properties
        ac_expected_types = [
            PropertyType.RESIDENTIAL_HOUSE,
            PropertyType.RESIDENTIAL_APARTMENT,
            PropertyType.RESIDENTIAL_TOWNHOUSE,
            PropertyType.RESIDENTIAL_VILLA,
            PropertyType.RESIDENTIAL_PENTHOUSE,
            PropertyType.COMMERCIAL_OFFICE,
            PropertyType.COMMERCIAL_RETAIL,
        ]
        
        if has_ac is False and region in hot_climate_regions and property_type in ac_expected_types:
            # Only flag if year_built suggests it should have AC
            if year_built is None or year_built >= 2005:
                detected_items.append(FunctionalObsolescenceItem(
                    item_key='no_ac_hot_region',
                    type=FunctionalDeficiencyType.DEFICIENCY_CURABLE,
                    curable=True,
                    description=f'No air conditioning in {region.value} region',
                    rate=0.03,
                    rate_range=(0.02, 0.04),
                    detection_logic='has_ac == False AND region in hot_climate_regions AND (year_built >= 2005 OR year_built is None)',
                    data_used={'has_ac': has_ac, 'region': region.value, 'year_built': year_built},
                ))
                notes.append(f'No AC in hot climate region ({region.value})')
        
        # =================================================================
        # DETECTION: No Generator (for premium properties in Ghana)
        # =================================================================
        has_generator = specs.has_generator
        
        # Premium property types where generator is expected
        premium_types = [
            PropertyType.RESIDENTIAL_VILLA,
            PropertyType.RESIDENTIAL_PENTHOUSE,
            PropertyType.HOSPITALITY_HOTEL,
            PropertyType.COMMERCIAL_OFFICE,
        ]
        
        if has_generator is False and property_type in premium_types:
            detected_items.append(FunctionalObsolescenceItem(
                item_key='no_generator_premium',
                type=FunctionalDeficiencyType.DEFICIENCY_CURABLE,
                curable=True,
                description='No backup generator for premium property type',
                rate=0.02,
                rate_range=(0.01, 0.03),
                detection_logic='has_generator == False AND property_type in premium_types',
                data_used={'has_generator': has_generator, 'property_type': property_type.value},
            ))
            notes.append('No generator for premium property type')
        
        # =================================================================
        # DETECTION: Small Unit Size (for apartments)
        # =================================================================
        built_area = specs.built_area_sqm
        
        if property_type == PropertyType.RESIDENTIAL_APARTMENT and bedrooms is not None and built_area is not None:
            # Calculate average area per bedroom
            if bedrooms > 0:
                area_per_bedroom = built_area / bedrooms
                
                # Ghana market expectation: at least 18-20 sqm per bedroom for adequate apartment
                if area_per_bedroom < 15:
                    detected_items.append(FunctionalObsolescenceItem(
                        item_key='small_unit_size',
                        type=FunctionalDeficiencyType.DEFICIENCY_INCURABLE,
                        curable=False,
                        description=f'Small unit size: {area_per_bedroom:.1f} sqm per bedroom (below 15 sqm threshold)',
                        rate=0.04,
                        rate_range=(0.02, 0.05),
                        detection_logic='built_area / bedrooms < 15 sqm',
                        data_used={'built_area': built_area, 'bedrooms': bedrooms, 'area_per_bedroom': round(area_per_bedroom, 1)},
                    ))
                    notes.append(f'Small unit size: {area_per_bedroom:.1f} sqm/bedroom')
                elif area_per_bedroom < 18:
                    detected_items.append(FunctionalObsolescenceItem(
                        item_key='below_average_unit_size',
                        type=FunctionalDeficiencyType.DEFICIENCY_INCURABLE,
                        curable=False,
                        description=f'Below-average unit size: {area_per_bedroom:.1f} sqm per bedroom',
                        rate=0.02,
                        rate_range=(0.01, 0.03),
                        detection_logic='15 <= built_area / bedrooms < 18 sqm',
                        data_used={'built_area': built_area, 'bedrooms': bedrooms, 'area_per_bedroom': round(area_per_bedroom, 1)},
                    ))
                    notes.append(f'Below-average unit size: {area_per_bedroom:.1f} sqm/bedroom')
        
        # =================================================================
        # DETECTION: No Borehole in areas with water supply issues
        # =================================================================
        has_borehole = specs.has_borehole
        
        # For houses/villas in suburban areas, borehole is increasingly expected
        borehole_expected_types = [
            PropertyType.RESIDENTIAL_HOUSE,
            PropertyType.RESIDENTIAL_VILLA,
        ]
        
        if has_borehole is False and property_type in borehole_expected_types:
            # Only flag for larger properties (land > 400 sqm suggests suburban)
            land_size = specs.land_size_sqm
            if land_size is not None and land_size > 400:
                detected_items.append(FunctionalObsolescenceItem(
                    item_key='no_borehole_suburban',
                    type=FunctionalDeficiencyType.DEFICIENCY_CURABLE,
                    curable=True,
                    description='No borehole for suburban residential property with adequate land',
                    rate=0.02,
                    rate_range=(0.01, 0.03),
                    detection_logic='has_borehole == False AND land_size > 400 sqm AND property_type in [house, villa]',
                    data_used={'has_borehole': has_borehole, 'land_size': land_size, 'property_type': property_type.value},
                ))
                notes.append('No borehole for suburban property')
        
        # =================================================================
        # CALCULATE TOTALS
        # =================================================================
        total_rate = sum(item.rate for item in detected_items)
        
        # Apply cap
        if total_rate > self.MAX_FUNCTIONAL_OBSOLESCENCE:
            notes.append(f'Total rate {total_rate*100:.1f}% capped at {self.MAX_FUNCTIONAL_OBSOLESCENCE*100:.0f}%')
            total_rate = self.MAX_FUNCTIONAL_OBSOLESCENCE
        
        # Calculate curable vs incurable
        curable_rate = sum(item.rate for item in detected_items if item.curable)
        incurable_rate = sum(item.rate for item in detected_items if not item.curable)
        
        # Determine confidence
        confidence = self._calculate_confidence(property_data, detected_items)
        
        # Flag for review if many items detected or high rate
        requires_review = len(detected_items) > 3 or total_rate > 0.15
        
        return FunctionalObsolescenceResult(
            depreciation_rate=round(total_rate, 4),
            depreciation_percent=round(total_rate * 100, 2),
            items_detected=detected_items,
            total_items=len(detected_items),
            curable_rate=round(curable_rate, 4),
            incurable_rate=round(incurable_rate, 4),
            auto_calculated=True,
            confidence=confidence,
            requires_review=requires_review,
            notes=notes,
        )
    
    def _calculate_confidence(
        self,
        property_data: Property,
        detected_items: List[FunctionalObsolescenceItem],
    ) -> float:
        """Calculate confidence based on data completeness"""
        specs = property_data.specifications
        
        # Count how many key fields are populated
        key_fields_populated = 0
        total_key_fields = 7
        
        if specs.bedrooms is not None:
            key_fields_populated += 1
        if specs.bathrooms is not None:
            key_fields_populated += 1
        if specs.year_built is not None:
            key_fields_populated += 1
        if specs.parking_spaces is not None:
            key_fields_populated += 1
        if specs.has_air_conditioning is not None:
            key_fields_populated += 1
        if specs.built_area_sqm is not None:
            key_fields_populated += 1
        if specs.has_generator is not None:
            key_fields_populated += 1
        
        # Base confidence from data completeness
        data_completeness = key_fields_populated / total_key_fields
        
        # Functional obsolescence is inherently less certain than physical
        # Start with lower base confidence
        base_confidence = 0.50 + (data_completeness * 0.30)
        
        # Reduce confidence if many items detected (more room for error)
        if len(detected_items) > 4:
            base_confidence -= 0.10
        elif len(detected_items) > 2:
            base_confidence -= 0.05
        
        return min(max(base_confidence, 0.40), 0.85)


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def calculate_physical_depreciation(
    property_data: Property,
    valuation_date: date,
    construction_type: Optional[ConstructionType] = None,
    last_renovation_year: Optional[int] = None,
    renovation_scope: Optional[str] = None,
) -> PhysicalDepreciationResult:
    """
    Convenience function to calculate physical depreciation.
    
    Args:
        property_data: Property schema
        valuation_date: Date of valuation
        construction_type: Optional construction type
        last_renovation_year: Optional year of last renovation
        renovation_scope: Optional scope ('minor', 'major', 'complete')
    
    Returns:
        PhysicalDepreciationResult
    """
    calculator = PhysicalDepreciationCalculator()
    return calculator.calculate(
        property_data=property_data,
        valuation_date=valuation_date,
        construction_type=construction_type,
        last_renovation_year=last_renovation_year,
        renovation_scope=renovation_scope,
    )


def calculate_functional_obsolescence(
    property_data: Property,
) -> FunctionalObsolescenceResult:
    """
    Convenience function to calculate functional obsolescence.
    
    Args:
        property_data: Property schema with specifications
    
    Returns:
        FunctionalObsolescenceResult
    """
    calculator = FunctionalObsolescenceCalculator()
    return calculator.calculate(property_data=property_data)


# =============================================================================
# EXTERNAL OBSOLESCENCE DATA CLASSES
# =============================================================================

class ExternalFactorCategory(str, Enum):
    """Categories of external obsolescence factors"""
    ENVIRONMENTAL = "environmental"
    LOCATIONAL = "locational"
    ECONOMIC = "economic"
    REGULATORY = "regulatory"


@dataclass
class ExternalObsolescenceItem:
    """Individual external obsolescence factor detected"""
    factor_key: str
    category: ExternalFactorCategory
    description: str
    rate: float
    rate_range: tuple[float, float]
    data_field: str
    data_value: Any
    threshold_used: str
    data_source: str


@dataclass
class ExternalObsolescenceResult:
    """Result of external obsolescence calculation"""
    depreciation_rate: float
    depreciation_percent: float
    factors_detected: List[ExternalObsolescenceItem]
    category_breakdown: Dict[str, float]
    total_factors: int
    auto_calculated: bool
    confidence: float
    requires_review: bool
    data_sources_used: List[str]
    notes: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'depreciation_rate': self.depreciation_rate,
            'depreciation_percent': self.depreciation_percent,
            'factors_detected': [
                {
                    'factor_key': item.factor_key,
                    'category': item.category.value,
                    'description': item.description,
                    'rate': item.rate,
                    'rate_range': item.rate_range,
                    'data_field': item.data_field,
                    'data_value': item.data_value,
                    'threshold_used': item.threshold_used,
                    'data_source': item.data_source,
                }
                for item in self.factors_detected
            ],
            'category_breakdown': self.category_breakdown,
            'total_factors': self.total_factors,
            'auto_calculated': self.auto_calculated,
            'confidence': self.confidence,
            'requires_review': self.requires_review,
            'data_sources_used': self.data_sources_used,
            'notes': self.notes,
        }


# =============================================================================
# EXTERNAL OBSOLESCENCE CALCULATOR
# =============================================================================

class ExternalObsolescenceCalculator:
    """
    Calculate external obsolescence from location and market data.
    
    External obsolescence represents loss in value from factors
    OUTSIDE the property boundaries:
    - Environmental factors (flooding, pollution, noise)
    - Locational factors (neighborhood decline, access)
    - Economic factors (market conditions, vacancy)
    - Regulatory factors (zoning, restrictions)
    
    Key: External obsolescence is ALWAYS incurable by the property owner.
    
    Integrates with Data Hub for real-time economic indicators.
    
    Reference: RICS Red Book, GhIS Valuation Standards
    """
    
    # Maximum obsolescence by category (prevent unrealistic totals)
    MAX_CATEGORY_RATE = 0.20  # 20% max per category
    MAX_TOTAL_RATE = 0.30     # 30% max total external obsolescence
    
    # External obsolescence factors with detection rules
    # Each factor has: data_field, category, thresholds, rates, description
    EXTERNAL_FACTORS: Dict[str, Dict[str, Any]] = {
        # ===== ENVIRONMENTAL FACTORS =====
        'flood_risk': {
            'data_field': 'flood_risk_level',
            'category': ExternalFactorCategory.ENVIRONMENTAL,
            'thresholds': {
                'high': (0.15, 0.20),      # 15-20% for high flood risk
                'medium': (0.08, 0.12),    # 8-12% for medium
                'low': (0.02, 0.05),       # 2-5% for low
            },
            'description': 'Flood risk zone classification',
        },
        'airport_noise': {
            'data_field': 'distance_to_airport_km',
            'category': ExternalFactorCategory.ENVIRONMENTAL,
            'thresholds': {
                (0, 2): (0.10, 0.15),      # Within 2km: 10-15%
                (2, 5): (0.05, 0.08),      # 2-5km: 5-8%
                (5, 10): (0.02, 0.04),     # 5-10km: 2-4%
            },
            'description': 'Proximity to airport noise zone',
        },
        'industrial_proximity': {
            'data_field': 'distance_to_industrial_km',
            'category': ExternalFactorCategory.ENVIRONMENTAL,
            'thresholds': {
                (0, 0.5): (0.10, 0.15),    # Within 500m: 10-15%
                (0.5, 1): (0.05, 0.08),    # 500m-1km: 5-8%
                (1, 2): (0.02, 0.04),      # 1-2km: 2-4%
            },
            'description': 'Proximity to industrial area',
        },
        'waste_dump_proximity': {
            'data_field': 'distance_to_waste_dump_km',
            'category': ExternalFactorCategory.ENVIRONMENTAL,
            'thresholds': {
                (0, 0.5): (0.15, 0.25),    # Very close: major impact
                (0.5, 1): (0.08, 0.12),
                (1, 2): (0.03, 0.06),
            },
            'description': 'Proximity to waste disposal site',
        },
        
        # ===== LOCATIONAL FACTORS =====
        'neighborhood_trend': {
            'data_field': 'property_value_trend_3yr',
            'category': ExternalFactorCategory.LOCATIONAL,
            'thresholds': {
                'declining_severe': (0.10, 0.15),   # >15% decline
                'declining_moderate': (0.05, 0.08), # 5-15% decline
                'declining_slight': (0.02, 0.04),   # 0-5% decline
            },
            'description': '3-year neighborhood property value trend',
        },
        'crime_rate': {
            'data_field': 'crime_rate_index',
            'category': ExternalFactorCategory.LOCATIONAL,
            'thresholds': {
                'very_high': (0.08, 0.12),  # Index > 150
                'high': (0.04, 0.07),       # Index 120-150
                'elevated': (0.02, 0.04),   # Index 100-120
            },
            'description': 'Crime rate relative to city average',
        },
        'road_access': {
            'data_field': 'road_access_quality',
            'category': ExternalFactorCategory.LOCATIONAL,
            'thresholds': {
                'poor': (0.05, 0.08),       # Unpaved, poor condition
                'fair': (0.02, 0.04),       # Paved but poorly maintained
            },
            'description': 'Road access and condition quality',
        },
        'amenity_distance': {
            'data_field': 'distance_to_amenities_km',
            'category': ExternalFactorCategory.LOCATIONAL,
            'thresholds': {
                (5, 10): (0.02, 0.03),      # 5-10km from amenities
                (10, 20): (0.03, 0.05),     # 10-20km
            },
            'description': 'Distance from key amenities (schools, shops, hospitals)',
        },
        
        # ===== ECONOMIC FACTORS =====
        'vacancy_rate': {
            'data_field': 'area_vacancy_rate',
            'category': ExternalFactorCategory.ECONOMIC,
            'thresholds': {
                (0.20, 1.0): (0.06, 0.10),  # >20% vacancy: significant
                (0.15, 0.20): (0.03, 0.06), # 15-20% vacancy
                (0.10, 0.15): (0.01, 0.03), # 10-15% vacancy
            },
            'description': 'Local area vacancy rate',
        },
        'market_condition': {
            'data_field': 'market_condition_index',
            'category': ExternalFactorCategory.ECONOMIC,
            'thresholds': {
                'recession': (0.08, 0.15),    # Market in recession
                'slow': (0.04, 0.08),         # Slow market
                'declining': (0.02, 0.05),    # Declining market
            },
            'description': 'Current market conditions affecting values',
        },
        'economic_recession': {
            'data_field': 'gdp_growth',
            'category': ExternalFactorCategory.ECONOMIC,
            'thresholds': {
                (-1.0, -0.02): (0.05, 0.10),  # Negative GDP growth
                (-0.02, 0.01): (0.02, 0.05),  # Stagnant growth
            },
            'description': 'Economic recession impact on property values',
        },
        'high_interest_rates': {
            'data_field': 'mortgage_rate_avg',
            'category': ExternalFactorCategory.ECONOMIC,
            'thresholds': {
                (0.35, 1.0): (0.03, 0.05),    # >35% mortgage rate
                (0.30, 0.35): (0.01, 0.03),   # 30-35% mortgage rate
            },
            'description': 'High interest rates depressing demand',
        },
        
        # ===== REGULATORY FACTORS =====
        'zoning_restriction': {
            'data_field': 'zoning_constraint_level',
            'category': ExternalFactorCategory.REGULATORY,
            'thresholds': {
                'severe': (0.10, 0.20),     # Severe restrictions
                'moderate': (0.05, 0.10),   # Moderate restrictions
                'minor': (0.02, 0.05),      # Minor restrictions
            },
            'description': 'Zoning restrictions affecting use/development',
        },
        'height_limit': {
            'data_field': 'building_height_limit_floors',
            'category': ExternalFactorCategory.REGULATORY,
            'thresholds': {
                (1, 2): (0.05, 0.10),       # Limited to 1-2 floors
                (2, 4): (0.02, 0.05),       # Limited to 2-4 floors
            },
            'description': 'Building height restrictions limiting development',
        },
        'road_widening': {
            'data_field': 'road_widening_planned',
            'category': ExternalFactorCategory.REGULATORY,
            'thresholds': {
                'confirmed': (0.08, 0.15),  # Confirmed road widening
                'proposed': (0.03, 0.08),   # Proposed widening
            },
            'description': 'Planned road widening affecting property',
        },
        'heritage_designation': {
            'data_field': 'heritage_designation',
            'category': ExternalFactorCategory.REGULATORY,
            'thresholds': {
                'listed': (0.03, 0.08),     # Listed heritage building
                'conservation_area': (0.02, 0.05),  # In conservation area
            },
            'description': 'Heritage/conservation restrictions on modifications',
        },
    }
    
    # Region-specific default risk factors (used when specific data unavailable)
    REGIONAL_DEFAULTS: Dict[GhanaRegion, Dict[str, float]] = {
        GhanaRegion.GREATER_ACCRA: {
            'traffic_congestion_rate': 0.02,
            'base_environmental_risk': 0.01,
        },
        GhanaRegion.KUMASI_METRO: {
            'traffic_congestion_rate': 0.01,
            'base_environmental_risk': 0.01,
        },
        GhanaRegion.EASTERN: {
            'base_environmental_risk': 0.01,
        },
        GhanaRegion.WESTERN_CLUSTER: {
            'base_environmental_risk': 0.02,  # Mining areas
        },
        GhanaRegion.NORTHERN_CLUSTER: {
            'base_environmental_risk': 0.01,
        },
    }
    
    def __init__(self, data_hub_adapter=None):
        """
        Initialize calculator with optional Data Hub adapter.
        
        Args:
            data_hub_adapter: Optional DataHubAPIAdapter for fetching live data
        """
        self.data_hub = data_hub_adapter
    
    async def calculate_async(
        self,
        property_data: Property,
        location_data: Optional[Dict[str, Any]] = None,
        market_data: Optional[Dict[str, Any]] = None,
    ) -> ExternalObsolescenceResult:
        """
        Async calculation that fetches live data from Data Hub.
        
        Args:
            property_data: Property schema with location
            location_data: Optional pre-fetched location factors
            market_data: Optional pre-fetched market data
        
        Returns:
            ExternalObsolescenceResult
        """
        # Fetch economic data if Data Hub available and not provided
        if self.data_hub and not market_data:
            try:
                economic_snapshot = await self.data_hub.get_economic_snapshot()
                market_data = {
                    'gdp_growth': economic_snapshot.get('gdp_growth'),
                    'mortgage_rate_avg': economic_snapshot.get('mortgage_rate_avg'),
                    'inflation_rate': economic_snapshot.get('inflation_rate'),
                }
            except Exception as e:
                logger.warning(f"Failed to fetch economic data: {e}")
                market_data = {}
        
        return self.calculate(
            property_data=property_data,
            location_data=location_data or {},
            market_data=market_data or {},
        )
    
    def calculate(
        self,
        property_data: Property,
        location_data: Optional[Dict[str, Any]] = None,
        market_data: Optional[Dict[str, Any]] = None,
    ) -> ExternalObsolescenceResult:
        """
        Calculate external obsolescence from available data.
        
        Args:
            property_data: Property schema with location
            location_data: Location-specific factors (flood risk, crime, etc.)
            market_data: Market/economic factors (vacancy, GDP, rates)
        
        Returns:
            ExternalObsolescenceResult with factors detected and rates
        """
        location_data = location_data or {}
        market_data = market_data or {}
        
        # Combine all available data
        combined_data = {
            **location_data,
            **market_data,
        }
        
        # Add region-specific defaults where specific data missing
        region = property_data.location.region
        regional_defaults = self.REGIONAL_DEFAULTS.get(region, {})
        for key, value in regional_defaults.items():
            if key not in combined_data:
                combined_data[key] = value
        
        detected_factors: List[ExternalObsolescenceItem] = []
        category_totals: Dict[str, float] = {
            ExternalFactorCategory.ENVIRONMENTAL.value: 0.0,
            ExternalFactorCategory.LOCATIONAL.value: 0.0,
            ExternalFactorCategory.ECONOMIC.value: 0.0,
            ExternalFactorCategory.REGULATORY.value: 0.0,
        }
        data_sources_used: List[str] = []
        notes: List[str] = []
        
        # Evaluate each factor
        for factor_key, config in self.EXTERNAL_FACTORS.items():
            data_field = config['data_field']
            category = config['category']
            
            # Get value from combined data
            value = combined_data.get(data_field)
            
            if value is None:
                continue
            
            # Evaluate thresholds
            rate, rate_range, threshold_used = self._evaluate_threshold(
                value, config['thresholds']
            )
            
            if rate > 0:
                factor_item = ExternalObsolescenceItem(
                    factor_key=factor_key,
                    category=category,
                    description=config['description'],
                    rate=rate,
                    rate_range=rate_range,
                    data_field=data_field,
                    data_value=value,
                    threshold_used=threshold_used,
                    data_source='location_data' if data_field in location_data else 'market_data',
                )
                detected_factors.append(factor_item)
                category_totals[category.value] += rate
                
                if factor_item.data_source not in data_sources_used:
                    data_sources_used.append(factor_item.data_source)
        
        # Apply category caps
        for cat_key in category_totals:
            if category_totals[cat_key] > self.MAX_CATEGORY_RATE:
                notes.append(
                    f"{cat_key} obsolescence capped from "
                    f"{category_totals[cat_key]*100:.1f}% to {self.MAX_CATEGORY_RATE*100:.0f}%"
                )
                category_totals[cat_key] = self.MAX_CATEGORY_RATE
        
        # Calculate total with cap
        raw_total = sum(category_totals.values())
        total_rate = min(raw_total, self.MAX_TOTAL_RATE)
        
        if total_rate < raw_total:
            notes.append(
                f"Total external obsolescence capped from "
                f"{raw_total*100:.1f}% to {self.MAX_TOTAL_RATE*100:.0f}%"
            )
        
        # Calculate confidence
        confidence = self._calculate_confidence(combined_data, detected_factors)
        
        # Flag for review if significant external obsolescence detected
        requires_review = total_rate > 0.10 or len(detected_factors) > 3
        
        if len(detected_factors) == 0:
            notes.append("No external obsolescence factors detected from available data")
        
        return ExternalObsolescenceResult(
            depreciation_rate=round(total_rate, 4),
            depreciation_percent=round(total_rate * 100, 2),
            factors_detected=detected_factors,
            category_breakdown=category_totals,
            total_factors=len(detected_factors),
            auto_calculated=True,
            confidence=confidence,
            requires_review=requires_review,
            data_sources_used=data_sources_used,
            notes=notes,
        )
    
    def _evaluate_threshold(
        self,
        value: Any,
        thresholds: Dict[Any, tuple[float, float]],
    ) -> tuple[float, tuple[float, float], str]:
        """
        Evaluate value against thresholds to determine obsolescence rate.
        
        Returns: (rate, rate_range, threshold_key_used)
        """
        # Handle string-based thresholds (e.g., 'high', 'medium', 'low')
        if isinstance(value, str):
            value_lower = value.lower()
            for threshold_key, rate_range in thresholds.items():
                if isinstance(threshold_key, str) and threshold_key.lower() == value_lower:
                    # Use midpoint of range
                    rate = (rate_range[0] + rate_range[1]) / 2
                    return rate, rate_range, threshold_key
        
        # Handle boolean thresholds
        elif isinstance(value, bool):
            for threshold_key, rate_range in thresholds.items():
                if threshold_key == value or (isinstance(threshold_key, str) and 
                    ((threshold_key == 'true' and value) or (threshold_key == 'false' and not value))):
                    rate = (rate_range[0] + rate_range[1]) / 2
                    return rate, rate_range, str(threshold_key)
        
        # Handle numeric range thresholds
        elif isinstance(value, (int, float)):
            for threshold_key, rate_range in thresholds.items():
                if isinstance(threshold_key, tuple) and len(threshold_key) == 2:
                    min_val, max_val = threshold_key
                    if min_val <= value < max_val:
                        rate = (rate_range[0] + rate_range[1]) / 2
                        return rate, rate_range, f"{min_val}-{max_val}"
        
        return 0.0, (0.0, 0.0), 'none'
    
    def _calculate_confidence(
        self,
        combined_data: Dict[str, Any],
        detected_factors: List[ExternalObsolescenceItem],
    ) -> float:
        """Calculate confidence based on data availability and quality."""
        
        # Count how many key data fields are populated
        key_fields = [
            'flood_risk_level', 'crime_rate_index', 'area_vacancy_rate',
            'road_access_quality', 'property_value_trend_3yr', 'gdp_growth',
        ]
        fields_populated = sum(1 for f in key_fields if combined_data.get(f) is not None)
        
        # Base confidence from data completeness (lower for external - harder to quantify)
        data_completeness = fields_populated / len(key_fields)
        base_confidence = 0.40 + (data_completeness * 0.30)
        
        # Reduce confidence if many factors detected (more uncertainty)
        if len(detected_factors) > 4:
            base_confidence -= 0.10
        elif len(detected_factors) > 2:
            base_confidence -= 0.05
        
        # Increase confidence if using live market data
        if combined_data.get('gdp_growth') is not None:
            base_confidence += 0.05
        
        return min(max(base_confidence, 0.35), 0.75)


# =============================================================================
# TOTAL DEPRECIATION RECONCILIATION DATA CLASSES
# =============================================================================

@dataclass
class TotalDepreciationResult:
    """Result of total depreciation reconciliation"""
    # Component rates
    physical_rate: float
    physical_amount: float
    functional_rate: float
    functional_amount: float
    external_rate: float
    external_amount: float
    
    # Total
    total_rate: float
    total_percent: float
    total_amount: float
    
    # Capping info
    was_capped: bool
    cap_applied: Optional[float]
    
    # Final value
    depreciated_value: float
    rcn: float
    
    # Component results
    physical_result: Optional[PhysicalDepreciationResult]
    functional_result: Optional[FunctionalObsolescenceResult]
    external_result: Optional[ExternalObsolescenceResult]
    
    # Metadata
    auto_calculated: bool
    confidence: float
    requires_review: bool
    methodology_notes: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'physical': {
                'rate': self.physical_rate,
                'amount': self.physical_amount,
            },
            'functional': {
                'rate': self.functional_rate,
                'amount': self.functional_amount,
            },
            'external': {
                'rate': self.external_rate,
                'amount': self.external_amount,
            },
            'total': {
                'rate': self.total_rate,
                'percent': self.total_percent,
                'amount': self.total_amount,
            },
            'was_capped': self.was_capped,
            'cap_applied': self.cap_applied,
            'depreciated_value': self.depreciated_value,
            'rcn': self.rcn,
            'auto_calculated': self.auto_calculated,
            'confidence': self.confidence,
            'requires_review': self.requires_review,
            'methodology_notes': self.methodology_notes,
            'components': {
                'physical': self.physical_result.to_dict() if self.physical_result else None,
                'functional': self.functional_result.to_dict() if self.functional_result else None,
                'external': self.external_result.to_dict() if self.external_result else None,
            },
        }


# =============================================================================
# DEPRECIATION RECONCILIATION SERVICE
# =============================================================================

class DepreciationReconciliationService:
    """
    Combine all depreciation components with caps and validation.
    
    This service:
    1. Takes results from Physical, Functional, and External calculators
    2. Applies age-based maximum depreciation caps
    3. Proportionally allocates when capping is needed
    4. Generates methodology notes for compliance
    
    Reference: RICS Red Book, GhIS Valuation Standards
    """
    
    # Maximum total depreciation by property age
    # Prevents unrealistic depreciation for newer properties
    MAX_DEPRECIATION_SCHEDULE: Dict[tuple[int, int], float] = {
        (0, 5): 0.15,      # New properties: max 15%
        (5, 15): 0.35,     # Young properties: max 35%
        (15, 30): 0.55,    # Mature properties: max 55%
        (30, 50): 0.75,    # Older properties: max 75%
        (50, 100): 0.90,   # Very old: max 90%
        (100, 999): 0.95,  # Historic: max 95%
    }
    
    # Minimum remaining value (buildings never depreciate to zero)
    MIN_REMAINING_VALUE_RATE = 0.05  # 5% residual value
    
    def reconcile(
        self,
        physical: PhysicalDepreciationResult,
        functional: FunctionalObsolescenceResult,
        external: ExternalObsolescenceResult,
        property_age: int,
        rcn: float,
    ) -> TotalDepreciationResult:
        """
        Combine depreciation components with reasonableness checks.
        
        Args:
            physical: Physical depreciation result
            functional: Functional obsolescence result
            external: External obsolescence result
            property_age: Age of property in years
            rcn: Replacement Cost New (base for depreciation amounts)
        
        Returns:
            TotalDepreciationResult with reconciled depreciation
        """
        notes: List[str] = []
        
        # 1. Get individual rates
        physical_rate = physical.depreciation_rate if physical.auto_calculated else 0.0
        functional_rate = functional.depreciation_rate if functional.auto_calculated else 0.0
        external_rate = external.depreciation_rate if external.auto_calculated else 0.0
        
        # 2. Calculate raw total
        raw_total = physical_rate + functional_rate + external_rate
        
        notes.append(
            f"Raw depreciation: Physical {physical_rate*100:.1f}% + "
            f"Functional {functional_rate*100:.1f}% + "
            f"External {external_rate*100:.1f}% = {raw_total*100:.1f}%"
        )
        
        # 3. Get age-based maximum cap
        max_rate = self._get_age_based_cap(property_age)
        notes.append(f"Age-based cap for {property_age}-year property: {max_rate*100:.0f}%")
        
        # 4. Apply absolute maximum (never exceed 95%)
        max_rate = min(max_rate, 1.0 - self.MIN_REMAINING_VALUE_RATE)
        
        # 5. Apply cap if needed
        was_capped = raw_total > max_rate
        capped_total = min(raw_total, max_rate)
        
        if was_capped:
            notes.append(
                f"Total depreciation capped from {raw_total*100:.1f}% to {capped_total*100:.1f}%"
            )
        
        # 6. Calculate amounts (proportionally allocate if capped)
        if was_capped and raw_total > 0:
            scale = capped_total / raw_total
            physical_amount = rcn * physical_rate * scale
            functional_amount = rcn * functional_rate * scale
            external_amount = rcn * external_rate * scale
            notes.append(f"Component amounts scaled by {scale:.3f} due to capping")
        else:
            physical_amount = rcn * physical_rate
            functional_amount = rcn * functional_rate
            external_amount = rcn * external_rate
        
        # 7. Calculate total amount and depreciated value
        total_amount = physical_amount + functional_amount + external_amount
        depreciated_value = rcn - total_amount
        
        # 8. Calculate combined confidence
        confidences = []
        if physical.auto_calculated:
            confidences.append(physical.confidence)
        if functional.auto_calculated:
            confidences.append(functional.confidence)
        if external.auto_calculated:
            confidences.append(external.confidence)
        
        combined_confidence = min(confidences) if confidences else 0.5
        
        # 9. Determine if review required
        requires_review = (
            was_capped or
            capped_total > 0.50 or
            physical.requires_review if hasattr(physical, 'requires_review') else False or
            functional.requires_review or
            external.requires_review
        )
        
        # 10. Add validation notes
        if not physical.auto_calculated:
            notes.append("⚠️ Physical depreciation not auto-calculated - missing required data")
        if not functional.auto_calculated:
            notes.append("⚠️ Functional obsolescence not auto-calculated")
        if not external.auto_calculated:
            notes.append("⚠️ External obsolescence not auto-calculated")
        
        if capped_total > 0.60:
            notes.append("⚠️ High total depreciation (>60%) - verify inputs and consider inspection")
        
        return TotalDepreciationResult(
            physical_rate=round(physical_rate, 4),
            physical_amount=round(physical_amount, 2),
            functional_rate=round(functional_rate, 4),
            functional_amount=round(functional_amount, 2),
            external_rate=round(external_rate, 4),
            external_amount=round(external_amount, 2),
            total_rate=round(capped_total, 4),
            total_percent=round(capped_total * 100, 2),
            total_amount=round(total_amount, 2),
            was_capped=was_capped,
            cap_applied=max_rate if was_capped else None,
            depreciated_value=round(depreciated_value, 2),
            rcn=round(rcn, 2),
            physical_result=physical,
            functional_result=functional,
            external_result=external,
            auto_calculated=all([
                physical.auto_calculated,
                functional.auto_calculated,
                external.auto_calculated,
            ]),
            confidence=round(combined_confidence, 2),
            requires_review=requires_review,
            methodology_notes=notes,
        )
    
    def _get_age_based_cap(self, property_age: int) -> float:
        """Get maximum depreciation rate based on property age."""
        for (min_age, max_age), cap in self.MAX_DEPRECIATION_SCHEDULE.items():
            if min_age <= property_age < max_age:
                return cap
        return 0.90  # Default for very old properties
    
    def reconcile_from_property(
        self,
        property_data: Property,
        rcn: float,
        valuation_date: date,
        construction_type: Optional[ConstructionType] = None,
        location_data: Optional[Dict[str, Any]] = None,
        market_data: Optional[Dict[str, Any]] = None,
    ) -> TotalDepreciationResult:
        """
        Convenience method to calculate and reconcile all depreciation from property data.
        
        Args:
            property_data: Property schema
            rcn: Replacement Cost New
            valuation_date: Valuation date
            construction_type: Optional construction type
            location_data: Optional location factors for external obsolescence
            market_data: Optional market data for external obsolescence
        
        Returns:
            TotalDepreciationResult
        """
        # Calculate physical depreciation
        physical_result = calculate_physical_depreciation(
            property_data=property_data,
            valuation_date=valuation_date,
            construction_type=construction_type,
        )
        
        # Calculate functional obsolescence
        functional_result = calculate_functional_obsolescence(
            property_data=property_data,
        )
        
        # Calculate external obsolescence
        external_calculator = ExternalObsolescenceCalculator()
        external_result = external_calculator.calculate(
            property_data=property_data,
            location_data=location_data,
            market_data=market_data,
        )
        
        # Get property age
        if property_data.specifications.year_built:
            property_age = valuation_date.year - property_data.specifications.year_built
        else:
            property_age = 20  # Default assumption
        
        # Reconcile
        return self.reconcile(
            physical=physical_result,
            functional=functional_result,
            external=external_result,
            property_age=property_age,
            rcn=rcn,
        )


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def calculate_external_obsolescence(
    property_data: Property,
    location_data: Optional[Dict[str, Any]] = None,
    market_data: Optional[Dict[str, Any]] = None,
) -> ExternalObsolescenceResult:
    """
    Convenience function to calculate external obsolescence.
    
    Args:
        property_data: Property schema with location
        location_data: Optional location-specific factors
        market_data: Optional market/economic factors
    
    Returns:
        ExternalObsolescenceResult
    """
    calculator = ExternalObsolescenceCalculator()
    return calculator.calculate(
        property_data=property_data,
        location_data=location_data,
        market_data=market_data,
    )


def calculate_total_depreciation(
    property_data: Property,
    rcn: float,
    valuation_date: date,
    construction_type: Optional[ConstructionType] = None,
    location_data: Optional[Dict[str, Any]] = None,
    market_data: Optional[Dict[str, Any]] = None,
) -> TotalDepreciationResult:
    """
    Convenience function to calculate and reconcile all depreciation.
    
    Args:
        property_data: Property schema
        rcn: Replacement Cost New
        valuation_date: Valuation date
        construction_type: Optional construction type
        location_data: Optional location factors
        market_data: Optional market data
    
    Returns:
        TotalDepreciationResult with all components reconciled
    """
    service = DepreciationReconciliationService()
    return service.reconcile_from_property(
        property_data=property_data,
        rcn=rcn,
        valuation_date=valuation_date,
        construction_type=construction_type,
        location_data=location_data,
        market_data=market_data,
    )
