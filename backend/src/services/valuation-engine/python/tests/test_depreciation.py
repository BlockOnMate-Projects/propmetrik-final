"""
Tests for Depreciation Calculators
PhysicalDepreciationCalculator and FunctionalObsolescenceCalculator
ExternalObsolescenceCalculator, DepreciationReconciliationService, and Override validation
"""

import pytest
from datetime import date
from app.services.depreciation import (
    PhysicalDepreciationCalculator,
    FunctionalObsolescenceCalculator,
    ExternalObsolescenceCalculator,
    DepreciationReconciliationService,
    ConstructionType,
    ExternalFactorCategory,
    EvidenceType,
    DepreciationComponent,
    DepreciationOverride,
    DepreciationWithOverrides,
    calculate_physical_depreciation,
    calculate_functional_obsolescence,
    calculate_external_obsolescence,
    calculate_total_depreciation,
    validate_override,
    create_override,
)
from app.schemas import (
    Property,
    PropertyType,
    PropertyCondition,
    PropertyLocation,
    PropertySpecifications,
    PropertyDataQuality,
    GhanaRegion,
)


# =============================================================================
# FIXTURES
# =============================================================================

def create_test_property(
    year_built: int = 2015,
    condition: PropertyCondition = PropertyCondition.GOOD,
    bedrooms: int = 4,
    bathrooms: int = 3,
    parking_spaces: int = 2,
    has_ac: bool = True,
    has_generator: bool = True,
    has_borehole: bool = True,
    land_size_sqm: float = 500,
    built_area_sqm: float = 200,
    property_type: PropertyType = PropertyType.RESIDENTIAL_HOUSE,
    region: GhanaRegion = GhanaRegion.GREATER_ACCRA,
) -> Property:
    """Create a test property with specified attributes."""
    return Property(
        id="test_property_001",
        property_type=property_type,
        location=PropertyLocation(
            region=region,
            district="Accra Metropolitan",
            neighborhood="East Legon",
            address_raw="Test Address, East Legon, Accra",
            address_city="Accra",
        ),
        specifications=PropertySpecifications(
            year_built=year_built,
            condition=condition,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            parking_spaces=parking_spaces,
            has_air_conditioning=has_ac,
            has_generator=has_generator,
            has_borehole=has_borehole,
            land_size_sqm=land_size_sqm,
            built_area_sqm=built_area_sqm,
        ),
        data_quality=PropertyDataQuality(
            data_quality_score=0.85,
            source_reliability_score=0.90,
            completeness_score=0.85,
            accuracy_score=0.85,
            freshness_score=0.80,
            sources=["test"],
        ),
    )


# =============================================================================
# PHYSICAL DEPRECIATION TESTS
# =============================================================================

class TestPhysicalDepreciationCalculator:
    """Tests for PhysicalDepreciationCalculator"""
    
    def test_new_property_zero_depreciation(self):
        """New property should have zero depreciation"""
        prop = create_test_property(
            year_built=2026,
            condition=PropertyCondition.NEW,
        )
        
        result = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        assert result.depreciation_rate == 0.0
        assert result.actual_age == 0
        assert result.effective_age == 0.0
        assert result.auto_calculated is True
        assert result.confidence > 0.6
    
    def test_good_condition_moderate_depreciation(self):
        """Good condition property should have condition factor 0.90"""
        prop = create_test_property(
            year_built=2015,
            condition=PropertyCondition.GOOD,
        )
        
        result = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        # 11 years actual age × 0.90 factor = 9.9 effective age
        # Default economic life for residential house = 50 years
        # Depreciation = 9.9 / 50 = 0.198 = 19.8%
        assert result.actual_age == 11
        assert 9.0 <= result.effective_age <= 10.5
        assert 0.15 <= result.depreciation_rate <= 0.25
        assert result.auto_calculated is True
    
    def test_poor_condition_higher_depreciation(self):
        """Poor condition should increase effective age"""
        prop = create_test_property(
            year_built=2015,
            condition=PropertyCondition.POOR,
        )
        
        result = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        # 11 years × 1.45 factor = 15.95 effective age
        assert result.actual_age == 11
        assert result.effective_age > 15
        assert result.depreciation_rate > 0.25
    
    def test_excellent_condition_lower_depreciation(self):
        """Excellent condition should reduce effective age"""
        prop = create_test_property(
            year_built=2010,
            condition=PropertyCondition.EXCELLENT,
        )
        
        result = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        # 16 years × 0.70 factor = 11.2 effective age
        assert result.actual_age == 16
        assert result.effective_age < result.actual_age
        assert 10 <= result.effective_age <= 12
    
    def test_construction_type_affects_economic_life(self):
        """Different construction types should use different economic lives"""
        prop = create_test_property(
            year_built=2000,
            condition=PropertyCondition.GOOD,
        )
        
        # Reinforced concrete: 75 years economic life
        result_concrete = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
            construction_type=ConstructionType.REINFORCED_CONCRETE,
        )
        
        # Mud brick: 30 years economic life
        result_mud = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
            construction_type=ConstructionType.MUD_BRICK,
        )
        
        # Same age, but mud brick should have higher depreciation rate
        assert result_mud.depreciation_rate > result_concrete.depreciation_rate
        assert result_concrete.economic_life == 75
        assert result_mud.economic_life == 30
    
    def test_renovation_reduces_effective_age(self):
        """Major renovation should reduce effective age"""
        prop = create_test_property(
            year_built=2000,
            condition=PropertyCondition.GOOD,
        )
        
        # Without renovation
        result_no_reno = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        # With major renovation in 2020
        result_with_reno = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
            last_renovation_year=2020,
            renovation_scope='major',
        )
        
        # Renovation should reduce effective age
        assert result_with_reno.effective_age < result_no_reno.effective_age
        assert result_with_reno.depreciation_rate < result_no_reno.depreciation_rate
    
    def test_missing_year_built_returns_error(self):
        """Missing year_built should return error result"""
        prop = create_test_property()
        prop.specifications.year_built = None
        
        result = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        assert result.auto_calculated is False
        assert result.confidence == 0.0
        assert 'year_built' in str(result.inputs_used.get('error', ''))
    
    def test_missing_condition_returns_error(self):
        """Missing condition should return error result"""
        prop = create_test_property()
        prop.specifications.condition = None
        
        result = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        assert result.auto_calculated is False
        assert result.confidence == 0.0
        assert 'condition' in str(result.inputs_used.get('error', ''))
    
    def test_depreciation_capped_at_95_percent(self):
        """Depreciation should be capped at 95% (buildings retain some value)"""
        prop = create_test_property(
            year_built=1950,  # 76 years old
            condition=PropertyCondition.RENOVATION_NEEDED,  # Factor 1.80
        )
        
        result = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        # Should be capped at 95% of economic life
        assert result.depreciation_rate <= 0.95
        assert result.remaining_life >= 0.05 * result.economic_life


# =============================================================================
# FUNCTIONAL OBSOLESCENCE TESTS
# =============================================================================

class TestFunctionalObsolescenceCalculator:
    """Tests for FunctionalObsolescenceCalculator"""
    
    def test_no_obsolescence_modern_property(self):
        """Modern well-equipped property should have minimal obsolescence"""
        prop = create_test_property(
            year_built=2020,
            bedrooms=4,
            bathrooms=4,  # 1:1 ratio
            parking_spaces=2,
            has_ac=True,
            has_generator=True,
        )
        
        result = calculate_functional_obsolescence(prop)
        
        # Should have very low or zero obsolescence
        assert result.depreciation_rate < 0.05
        assert result.total_items < 2
    
    def test_low_bathroom_ratio_detected(self):
        """Low bathroom ratio should be detected"""
        prop = create_test_property(
            year_built=2020,
            bedrooms=5,
            bathrooms=1,  # Very low ratio
        )
        
        result = calculate_functional_obsolescence(prop)
        
        # Should detect low bathroom ratio
        bathroom_items = [i for i in result.items_detected if 'bathroom' in i.item_key]
        assert len(bathroom_items) == 1
        assert bathroom_items[0].curable is True
        assert bathroom_items[0].rate >= 0.04
    
    def test_pre_1980_design_detected(self):
        """Pre-1980 buildings should have outdated design penalty"""
        prop = create_test_property(
            year_built=1975,
        )
        
        result = calculate_functional_obsolescence(prop)
        
        # Should detect outdated design
        design_items = [i for i in result.items_detected if 'outdated' in i.item_key or 'design' in i.item_key]
        assert len(design_items) >= 1
        assert design_items[0].curable is False
    
    def test_1980s_design_detected(self):
        """1980s buildings should have minor outdated design penalty"""
        prop = create_test_property(
            year_built=1988,
        )
        
        result = calculate_functional_obsolescence(prop)
        
        design_items = [i for i in result.items_detected if '1980s' in i.item_key]
        assert len(design_items) >= 1
        assert design_items[0].rate < 0.06  # Less than pre-1980
    
    def test_no_parking_detected(self):
        """Houses without parking should be flagged"""
        prop = create_test_property(
            property_type=PropertyType.RESIDENTIAL_HOUSE,
            parking_spaces=0,
            year_built=2020,
        )
        
        result = calculate_functional_obsolescence(prop)
        
        parking_items = [i for i in result.items_detected if 'parking' in i.item_key]
        assert len(parking_items) == 1
    
    def test_no_ac_hot_region_detected(self):
        """No AC in hot region should be flagged for modern properties"""
        prop = create_test_property(
            region=GhanaRegion.GREATER_ACCRA,
            has_ac=False,
            year_built=2015,
        )
        
        result = calculate_functional_obsolescence(prop)
        
        ac_items = [i for i in result.items_detected if 'ac' in i.item_key]
        assert len(ac_items) == 1
    
    def test_no_generator_premium_property_detected(self):
        """Premium properties without generator should be flagged"""
        prop = create_test_property(
            property_type=PropertyType.RESIDENTIAL_VILLA,
            has_generator=False,
        )
        
        result = calculate_functional_obsolescence(prop)
        
        gen_items = [i for i in result.items_detected if 'generator' in i.item_key]
        assert len(gen_items) == 1
    
    def test_small_apartment_size_detected(self):
        """Small apartment units should be flagged"""
        prop = create_test_property(
            property_type=PropertyType.RESIDENTIAL_APARTMENT,
            bedrooms=3,
            built_area_sqm=40,  # ~13 sqm per bedroom
        )
        
        result = calculate_functional_obsolescence(prop)
        
        size_items = [i for i in result.items_detected if 'size' in i.item_key]
        assert len(size_items) >= 1
    
    def test_obsolescence_capped_at_25_percent(self):
        """Total functional obsolescence should be capped at 25%"""
        # Create property with many issues
        prop = create_test_property(
            year_built=1970,
            bedrooms=6,
            bathrooms=1,
            parking_spaces=0,
            has_ac=False,
            has_generator=False,
            has_borehole=False,
            property_type=PropertyType.RESIDENTIAL_VILLA,  # Premium type
        )
        
        result = calculate_functional_obsolescence(prop)
        
        # Should be capped at 25%
        assert result.depreciation_rate <= 0.25
    
    def test_curable_vs_incurable_calculation(self):
        """Should correctly separate curable and incurable items"""
        prop = create_test_property(
            year_built=1975,  # Incurable: outdated design
            bedrooms=4,
            bathrooms=1,  # Curable: can add bathrooms
            parking_spaces=0,  # Curable: can add parking
        )
        
        result = calculate_functional_obsolescence(prop)
        
        # Should have both curable and incurable
        assert result.curable_rate > 0
        assert result.incurable_rate > 0
        
        # Rates should sum correctly
        total_from_items = sum(i.rate for i in result.items_detected)
        assert result.depreciation_rate <= total_from_items  # May be capped
    
    def test_requires_review_flag(self):
        """Many issues should trigger review flag"""
        prop = create_test_property(
            year_built=1975,
            bedrooms=5,
            bathrooms=1,
            parking_spaces=0,
            has_ac=False,
        )
        
        result = calculate_functional_obsolescence(prop)
        
        # Many items should trigger review
        if result.total_items > 3 or result.depreciation_rate > 0.15:
            assert result.requires_review is True
    
    def test_result_to_dict(self):
        """Result should be serializable to dict"""
        prop = create_test_property()
        
        result = calculate_functional_obsolescence(prop)
        result_dict = result.to_dict()
        
        assert 'depreciation_rate' in result_dict
        assert 'items_detected' in result_dict
        assert isinstance(result_dict['items_detected'], list)


# =============================================================================
# INTEGRATION TESTS
# =============================================================================

class TestDepreciationIntegration:
    """Integration tests for depreciation calculators"""
    
    def test_both_calculators_work_together(self):
        """Both calculators should work on the same property"""
        prop = create_test_property(
            year_built=2000,
            condition=PropertyCondition.FAIR,
            bedrooms=4,
            bathrooms=2,
        )
        
        physical_result = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        functional_result = calculate_functional_obsolescence(prop)
        
        # Both should calculate successfully
        assert physical_result.auto_calculated is True
        assert functional_result.auto_calculated is True
        
        # Combined depreciation for cost approach
        total_depreciation = physical_result.depreciation_rate + functional_result.depreciation_rate
        
        # Should be reasonable (less than 80% for 26 year old property in fair condition)
        assert total_depreciation < 0.80


# =============================================================================
# EXTERNAL OBSOLESCENCE TESTS (D3)
# =============================================================================

class TestExternalObsolescenceCalculator:
    """Tests for ExternalObsolescenceCalculator (D3)"""
    
    def test_no_external_factors_zero_obsolescence(self):
        """Property with no external issues should have zero obsolescence"""
        prop = create_test_property()
        
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={},
            market_data={},
        )
        
        # With no data, should return zero with appropriate confidence
        assert result.depreciation_rate == 0.0
        assert result.total_factors == 0
        assert result.auto_calculated is True
    
    def test_flood_zone_detected(self):
        """Property in flood zone should be penalized"""
        prop = create_test_property()
        
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={
                'flood_zone': True,
            },
            market_data={},
        )
        
        # Should detect flood zone factor
        flood_items = [f for f in result.factors_detected if 'flood' in f.factor_key]
        assert len(flood_items) == 1
        assert flood_items[0].category == ExternalFactorCategory.ENVIRONMENTAL
        assert result.depreciation_rate > 0
    
    def test_noise_pollution_detected(self):
        """High noise areas should be penalized"""
        prop = create_test_property()
        
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={
                'noise_level_db': 75,  # High noise
            },
            market_data={},
        )
        
        noise_items = [f for f in result.factors_detected if 'noise' in f.factor_key]
        assert len(noise_items) == 1
        assert noise_items[0].category == ExternalFactorCategory.ENVIRONMENTAL
    
    def test_industrial_proximity_detected(self):
        """Properties near industrial areas should be penalized"""
        prop = create_test_property()
        
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={
                'industrial_proximity_km': 0.3,  # Very close
            },
            market_data={},
        )
        
        industrial_items = [f for f in result.factors_detected if 'industrial' in f.factor_key]
        assert len(industrial_items) == 1
        assert industrial_items[0].category == ExternalFactorCategory.LOCATIONAL
    
    def test_poor_road_access_detected(self):
        """Properties with poor road access should be penalized"""
        prop = create_test_property()
        
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={
                'road_type': 'unpaved',
            },
            market_data={},
        )
        
        road_items = [f for f in result.factors_detected if 'road' in f.factor_key]
        assert len(road_items) >= 1
        assert road_items[0].category == ExternalFactorCategory.LOCATIONAL
    
    def test_economic_decline_detected(self):
        """Declining market conditions should be penalized"""
        prop = create_test_property()
        
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={},
            market_data={
                'vacancy_rate': 0.35,  # High vacancy
            },
        )
        
        economic_items = [f for f in result.factors_detected if f.category == ExternalFactorCategory.ECONOMIC]
        assert len(economic_items) >= 1
    
    def test_high_mortgage_rates_detected(self):
        """Very high mortgage rates should be penalized"""
        prop = create_test_property()
        
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={},
            market_data={
                'mortgage_rate': 0.35,  # 35% - very high
            },
        )
        
        rate_items = [f for f in result.factors_detected if 'mortgage' in f.factor_key or 'rate' in f.factor_key]
        assert len(rate_items) >= 1
    
    def test_zoning_restrictions_detected(self):
        """Zoning restrictions should be penalized"""
        prop = create_test_property()
        
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={
                'zoning_restrictions': ['height_limit', 'usage_restrictions'],
            },
            market_data={},
        )
        
        zoning_items = [f for f in result.factors_detected if 'zoning' in f.factor_key]
        assert len(zoning_items) >= 1
        assert zoning_items[0].category == ExternalFactorCategory.REGULATORY
    
    def test_category_cap_20_percent(self):
        """Each category should be capped at 20%"""
        prop = create_test_property()
        
        # Multiple environmental factors
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={
                'flood_zone': True,
                'noise_level_db': 85,
                'air_pollution_index': 200,
                'erosion_risk': True,
            },
            market_data={},
        )
        
        # Environmental category should be capped at 20%
        env_rate = result.category_breakdown.get('environmental', 0)
        assert env_rate <= 0.20
    
    def test_total_cap_30_percent(self):
        """Total external obsolescence should be capped at 30%"""
        prop = create_test_property()
        
        # Many factors across categories
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={
                'flood_zone': True,
                'noise_level_db': 85,
                'industrial_proximity_km': 0.2,
                'road_type': 'unpaved',
                'crime_rate': 'high',
                'zoning_restrictions': ['strict'],
            },
            market_data={
                'vacancy_rate': 0.40,
                'market_trend': 'declining',
            },
        )
        
        # Total should be capped at 30%
        assert result.depreciation_rate <= 0.30
    
    def test_result_serialization(self):
        """Result should serialize to dict correctly"""
        prop = create_test_property()
        
        result = calculate_external_obsolescence(
            property_data=prop,
            location_data={'flood_zone': True},
            market_data={},
        )
        
        result_dict = result.to_dict()
        
        assert 'depreciation_rate' in result_dict
        assert 'factors_detected' in result_dict
        assert 'category_breakdown' in result_dict
        assert isinstance(result_dict['factors_detected'], list)


# =============================================================================
# DEPRECIATION RECONCILIATION TESTS (D4)
# =============================================================================

class TestDepreciationReconciliationService:
    """Tests for DepreciationReconciliationService (D4)"""
    
    def test_new_property_cap_15_percent(self):
        """Properties 0-5 years should be capped at 15%"""
        prop = create_test_property(
            year_built=2023,
            condition=PropertyCondition.EXCELLENT,
        )
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        reconciliation = DepreciationReconciliationService()
        total = reconciliation.calculate_total(
            physical=physical,
            functional=functional,
            external=None,
            actual_age=3,
        )
        
        # Should not exceed 15%
        assert total.total_rate <= 0.15
    
    def test_mature_property_cap_50_percent(self):
        """Properties 26-40 years should be capped at 50%"""
        prop = create_test_property(
            year_built=1995,
            condition=PropertyCondition.FAIR,
        )
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        reconciliation = DepreciationReconciliationService()
        total = reconciliation.calculate_total(
            physical=physical,
            functional=functional,
            external=None,
            actual_age=31,
        )
        
        # Should not exceed 50%
        assert total.total_rate <= 0.50
    
    def test_old_property_cap_75_percent(self):
        """Properties 51-75 years should be capped at 75%"""
        prop = create_test_property(
            year_built=1965,
            condition=PropertyCondition.POOR,
        )
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        reconciliation = DepreciationReconciliationService()
        total = reconciliation.calculate_total(
            physical=physical,
            functional=functional,
            external=None,
            actual_age=61,
        )
        
        # Should not exceed 75%
        assert total.total_rate <= 0.75
    
    def test_very_old_property_cap_95_percent(self):
        """Properties 100+ years should be capped at 95%"""
        prop = create_test_property(
            year_built=1920,
            condition=PropertyCondition.RENOVATION_NEEDED,
        )
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        reconciliation = DepreciationReconciliationService()
        total = reconciliation.calculate_total(
            physical=physical,
            functional=functional,
            external=None,
            actual_age=106,
        )
        
        # Should not exceed 95%
        assert total.total_rate <= 0.95
        assert total.was_capped is True
    
    def test_proportional_allocation(self):
        """When capped, components should be proportionally reduced"""
        prop = create_test_property(
            year_built=2020,
            condition=PropertyCondition.POOR,  # High physical
            bedrooms=5,
            bathrooms=1,  # High functional
        )
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        reconciliation = DepreciationReconciliationService()
        total = reconciliation.calculate_total(
            physical=physical,
            functional=functional,
            external=None,
            actual_age=6,
        )
        
        # If capped, components should be proportionally reduced
        if total.was_capped:
            component_sum = sum(total.component_breakdown.values())
            assert abs(component_sum - total.total_rate) < 0.001
    
    def test_includes_all_three_components(self):
        """Should correctly include physical, functional, and external"""
        prop = create_test_property(
            year_built=2010,
            condition=PropertyCondition.FAIR,
        )
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        external = calculate_external_obsolescence(
            property_data=prop,
            location_data={'flood_zone': True},
            market_data={},
        )
        
        reconciliation = DepreciationReconciliationService()
        total = reconciliation.calculate_total(
            physical=physical,
            functional=functional,
            external=external,
            actual_age=16,
        )
        
        # Should have all components in breakdown
        assert 'physical' in total.component_breakdown
        assert 'functional' in total.component_breakdown
        assert 'external' in total.component_breakdown
    
    def test_methodology_notes_generated(self):
        """Should generate methodology notes"""
        prop = create_test_property(year_built=2010)
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        reconciliation = DepreciationReconciliationService()
        total = reconciliation.calculate_total(
            physical=physical,
            functional=functional,
            external=None,
            actual_age=16,
        )
        
        assert len(total.methodology_notes) > 0


# =============================================================================
# DEPRECIATION OVERRIDE VALIDATION TESTS (D5)
# =============================================================================

class TestDepreciationOverride:
    """Tests for DepreciationOverride (D5)"""
    
    def test_valid_override(self):
        """Valid override should pass validation"""
        override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.15,
            override_rate=0.18,
            justification="Based on detailed property inspection showing moderate wear and tear consistent with 18% depreciation. The standard calculation underestimates actual condition deterioration.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/inspection_report_001.pdf",
        )
        
        is_valid, errors = override.is_valid()
        
        assert is_valid is True
        assert len(errors) == 0
    
    def test_short_justification_fails(self):
        """Short justification should fail validation"""
        override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.15,
            override_rate=0.18,
            justification="Too short",  # Less than 50 chars
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/report.pdf",
        )
        
        is_valid, errors = override.is_valid()
        
        assert is_valid is False
        assert any('50 characters' in e for e in errors)
    
    def test_negative_rate_fails(self):
        """Negative override rate should fail"""
        override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.15,
            override_rate=-0.05,
            justification="This is a long justification that meets the minimum character requirement for validation.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/report.pdf",
        )
        
        is_valid, errors = override.is_valid()
        
        assert is_valid is False
        assert any('negative' in e.lower() for e in errors)
    
    def test_rate_over_100_fails(self):
        """Rate over 100% should fail"""
        override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.15,
            override_rate=1.5,  # 150%
            justification="This is a long justification that meets the minimum character requirement for validation.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/report.pdf",
        )
        
        is_valid, errors = override.is_valid()
        
        assert is_valid is False
        assert any('100%' in e or 'exceed' in e.lower() for e in errors)
    
    def test_requires_approval_over_20_percent(self):
        """Variance > 20% should require approval"""
        override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.15,
            override_rate=0.25,  # 66% variance
            justification="This is a long justification that meets the minimum character requirement for validation.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/report.pdf",
        )
        
        assert override.requires_approval() is True
    
    def test_no_approval_under_20_percent(self):
        """Variance < 20% should not require approval"""
        override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.15,
            override_rate=0.17,  # 13% variance
            justification="This is a long justification that meets the minimum character requirement for validation.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/report.pdf",
        )
        
        assert override.requires_approval() is False
    
    def test_missing_approval_fails(self):
        """High variance without approval should fail"""
        override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.15,
            override_rate=0.30,  # 100% variance
            justification="This is a long justification that meets the minimum character requirement for validation.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/report.pdf",
        )
        
        is_valid, errors = override.is_valid()
        
        assert is_valid is False
        assert any('approval' in e.lower() for e in errors)
    
    def test_with_approval_passes(self):
        """High variance with approval should pass"""
        override = DepreciationOverride(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.15,
            override_rate=0.30,
            justification="This is a long justification that meets the minimum character requirement for validation.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/report.pdf",
            approved_by="supervisor_001",
            approval_date=date.today(),
        )
        
        is_valid, errors = override.is_valid()
        
        assert is_valid is True
        assert override.has_approval() is True
    
    def test_expert_opinion_no_reference_required(self):
        """Expert opinion should not require evidence reference"""
        override = create_override(
            component=DepreciationComponent.FUNCTIONAL,
            auto_calculated_rate=0.05,
            override_rate=0.07,
            justification="Based on 25 years of professional valuation experience in Ghana residential market, the functional obsolescence is higher than detected by automated systems.",
            evidence_type=EvidenceType.EXPERT_OPINION,
            evidence_reference=None,  # No reference needed
        )
        
        is_valid, errors = override.is_valid()
        
        assert is_valid is True
    
    def test_non_expert_requires_reference(self):
        """Non-expert evidence should require reference"""
        override = create_override(
            component=DepreciationComponent.FUNCTIONAL,
            auto_calculated_rate=0.05,
            override_rate=0.07,
            justification="Based on detailed inspection showing wear and tear. The automated calculation does not reflect actual conditions observed on site.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference=None,  # Missing reference
        )
        
        is_valid, errors = override.is_valid()
        
        assert is_valid is False
        assert any('reference' in e.lower() for e in errors)
    
    def test_variance_calculation(self):
        """Variance should be calculated correctly"""
        override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.10,
            override_rate=0.15,
            justification="Test justification that is long enough to meet minimum character requirement.",
            evidence_type=EvidenceType.EXPERT_OPINION,
        )
        
        # (0.15 - 0.10) / 0.10 = 50%
        assert override.variance_percent == 50.0
        assert override.variance_absolute == 0.05
    
    def test_zero_auto_rate_variance(self):
        """Variance with zero auto rate should be 100% if override > 0"""
        override = create_override(
            component=DepreciationComponent.EXTERNAL,
            auto_calculated_rate=0.0,
            override_rate=0.05,
            justification="External factors detected on site that automated system did not identify from available data sources.",
            evidence_type=EvidenceType.EXPERT_OPINION,
        )
        
        assert override.variance_percent == 100.0
    
    def test_to_dict_serialization(self):
        """Override should serialize to dict correctly"""
        override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=0.15,
            override_rate=0.18,
            justification="Test justification that meets the minimum character requirement for proper validation.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/report.pdf",
        )
        
        result = override.to_dict()
        
        assert result['component'] == 'physical'
        assert result['auto_calculated_rate'] == 0.15
        assert result['override_rate'] == 0.18
        assert 'variance_percent' in result
        assert 'is_valid' in result


class TestDepreciationWithOverrides:
    """Tests for DepreciationWithOverrides container (D5)"""
    
    def test_effective_rate_without_override(self):
        """Effective rate should equal auto rate without override"""
        prop = create_test_property(year_built=2010)
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        container = DepreciationWithOverrides(
            physical_auto=physical,
            functional_auto=functional,
        )
        
        assert container.physical_rate == physical.depreciation_rate
        assert container.functional_rate == functional.depreciation_rate
        assert container.has_overrides is False
    
    def test_effective_rate_with_valid_override(self):
        """Effective rate should use override when valid"""
        prop = create_test_property(year_built=2010)
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        physical_override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=physical.depreciation_rate,
            override_rate=0.25,
            justification="Based on detailed inspection, the property shows more wear than age suggests due to poor maintenance history.",
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/inspection.pdf",
        )
        
        container = DepreciationWithOverrides(
            physical_auto=physical,
            functional_auto=functional,
            physical_override=physical_override,
        )
        
        assert container.has_overrides is True
        assert container.physical_rate == 0.25
        assert container.functional_rate == functional.depreciation_rate
    
    def test_effective_rate_ignores_invalid_override(self):
        """Effective rate should ignore invalid override"""
        prop = create_test_property(year_built=2010)
        
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        # Invalid override (too short justification)
        invalid_override = DepreciationOverride(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=physical.depreciation_rate,
            override_rate=0.25,
            justification="Short",  # Invalid
            evidence_type=EvidenceType.INSPECTION,
            evidence_reference="/uploads/inspection.pdf",
        )
        
        container = DepreciationWithOverrides(
            physical_auto=physical,
            functional_auto=functional,
            physical_override=invalid_override,
        )
        
        # Should fall back to auto rate
        assert container.physical_rate == physical.depreciation_rate


# =============================================================================
# FULL INTEGRATION TESTS
# =============================================================================

class TestFullDepreciationFlow:
    """Full integration tests covering D1-D5"""
    
    def test_complete_depreciation_calculation(self):
        """Test complete flow from property to final depreciation"""
        prop = create_test_property(
            year_built=2005,
            condition=PropertyCondition.FAIR,
            bedrooms=4,
            bathrooms=2,
            has_ac=False,
        )
        
        # Calculate all components
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        
        functional = calculate_functional_obsolescence(prop)
        
        external = calculate_external_obsolescence(
            property_data=prop,
            location_data={'road_type': 'unpaved'},
            market_data={},
        )
        
        # Reconcile
        reconciliation = DepreciationReconciliationService()
        total = reconciliation.calculate_total(
            physical=physical,
            functional=functional,
            external=external,
            actual_age=21,
        )
        
        # All should be calculated
        assert physical.auto_calculated is True
        assert functional.auto_calculated is True
        assert external.auto_calculated is True
        
        # Total should be within age cap (45% for 21-25 years)
        assert total.total_rate <= 0.45
        
        # Should have notes
        assert len(total.methodology_notes) > 0
    
    def test_complete_flow_with_override(self):
        """Test complete flow including user override"""
        prop = create_test_property(
            year_built=2010,
            condition=PropertyCondition.GOOD,
        )
        
        # Calculate
        physical = calculate_physical_depreciation(
            property_data=prop,
            valuation_date=date(2026, 1, 11),
        )
        functional = calculate_functional_obsolescence(prop)
        
        # User disagrees with physical - creates override
        physical_override = create_override(
            component=DepreciationComponent.PHYSICAL,
            auto_calculated_rate=physical.depreciation_rate,
            override_rate=physical.depreciation_rate * 1.15,  # 15% higher, no approval needed
            justification="Detailed site inspection revealed hidden water damage and foundation issues not visible in standard assessment.",
            evidence_type=EvidenceType.ENGINEERING_REPORT,
            evidence_reference="/uploads/structural_report_2024.pdf",
        )
        
        # Validate
        is_valid, errors = physical_override.is_valid()
        assert is_valid is True
        
        # Container with override
        container = DepreciationWithOverrides(
            physical_auto=physical,
            functional_auto=functional,
            physical_override=physical_override,
        )
        
        # Effective rate should use override
        assert container.physical_rate == physical_override.override_rate
        assert container.has_overrides is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
