"""
Market Data Adapter
Abstract and concrete adapters for accessing market data
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import date, timedelta
import asyncio
import asyncpg
import logging

from ..schemas import (
    Property, 
    GhanaRegion, 
    PropertyType,
    MarketStatistics,
    ConstructionCosts,
    EconomicIndicator,
    RegionalMarketData,
    ComparableSearch,
    ComparablePropertyAnalysis
)
from ..schemas.land_comparable import LandComparableSearchCriteria


logger = logging.getLogger(__name__)


class MarketDataAdapter(ABC):
    """Abstract adapter for market data - keeps valuation logic pure"""
    
    @abstractmethod
    async def get_comparable_properties(
        self,
        search_criteria: ComparableSearch
    ) -> List[Property]:
        """Fetch comparable properties from data source"""
        pass
    
    @abstractmethod
    async def get_construction_costs(
        self,
        region: GhanaRegion,
        property_type: PropertyType,
        as_of_date: date
    ) -> Optional[ConstructionCosts]:
        """Fetch construction cost data"""
        pass
    
    @abstractmethod
    async def get_economic_indicators(
        self,
        region: GhanaRegion,
        as_of_date: date
    ) -> List[EconomicIndicator]:
        """Fetch economic indicators (inflation, interest rates, etc)"""
        pass
    
    @abstractmethod
    async def get_market_statistics(
        self,
        region: GhanaRegion,
        property_type: PropertyType,
        period_start: date,
        period_end: date
    ) -> Optional[MarketStatistics]:
        """Fetch market statistics for a region and property type"""
        pass
    
    @abstractmethod
    async def get_property_by_id(self, property_id: str) -> Optional[Property]:
        """Fetch a specific property by ID"""
        pass
    
    @abstractmethod
    async def get_regional_market_data(
        self,
        region: GhanaRegion,
        as_of_date: date
    ) -> Optional[RegionalMarketData]:
        """Fetch comprehensive market data for a region"""
        pass
    
    @abstractmethod
    async def get_land_comparables(
        self,
        search_criteria: LandComparableSearchCriteria
    ) -> List[Property]:
        """Fetch land comparables for land value estimation"""
        pass


class PostgreSQLMarketDataAdapter(MarketDataAdapter):
    """Concrete adapter using PostgreSQL + PostGIS"""
    
    def __init__(self, db_pool: asyncpg.Pool):
        self.db = db_pool
    
    async def get_comparable_properties(
        self,
        search_criteria: ComparableSearch
    ) -> List[Property]:
        """Use PostGIS to find nearby comparable properties"""
        
        # Get target property coordinates first
        target_property = await self.get_property_by_id(search_criteria.target_property_id)
        if not target_property or not target_property.location.coordinates:
            logger.warning(f"Target property {search_criteria.target_property_id} not found or missing coordinates")
            return []
        
        target_lat, target_lng = target_property.location.coordinates
        
        # Build the PostGIS query
        query = """
        SELECT 
            p.id, p.property_type, p.region, p.district, p.neighborhood,
            p.address_raw, p.address_city, p.coordinates,
            p.bedrooms, p.bathrooms, p.land_size_sqm, p.built_area_sqm,
            p.year_built, p.condition, p.current_price_ghs, p.price_date,
            p.data_quality_score, p.sources, p.created_at,
            ST_Distance(
                ST_GeogFromText('POINT(' || $2 || ' ' || $3 || ')'),
                ST_GeogFromText('POINT(' || (p.coordinates->>'lng') || ' ' || (p.coordinates->>'lat') || ')')
            ) / 1000 AS distance_km
        FROM properties p
        WHERE 
            p.id != $1
            AND p.property_type = $4
            AND p.region = $5
            AND p.current_price_ghs IS NOT NULL
            AND p.price_date >= $6
            AND ST_DWithin(
                ST_GeogFromText('POINT(' || $2 || ' ' || $3 || ')'),
                ST_GeogFromText('POINT(' || (p.coordinates->>'lng') || ' ' || (p.coordinates->>'lat') || ')'),
                $7 * 1000  -- Convert km to meters
            )
        """
        
        # Add size filters if specified
        params = [
            search_criteria.target_property_id,
            target_lng,
            target_lat, 
            search_criteria.property_type.value,
            search_criteria.region.value,
            date.today() - timedelta(days=search_criteria.max_age_days),
            search_criteria.max_distance_km
        ]
        param_count = 7
        
        # Add bedroom filters
        if search_criteria.min_bedrooms is not None:
            param_count += 1
            query += f" AND p.bedrooms >= ${param_count}"
            params.append(search_criteria.min_bedrooms)
        
        if search_criteria.max_bedrooms is not None:
            param_count += 1
            query += f" AND p.bedrooms <= ${param_count}"
            params.append(search_criteria.max_bedrooms)
        
        # Add price filters
        if search_criteria.min_price_ghs is not None:
            param_count += 1
            query += f" AND p.current_price_ghs >= ${param_count}"
            params.append(search_criteria.min_price_ghs)
        
        if search_criteria.max_price_ghs is not None:
            param_count += 1
            query += f" AND p.current_price_ghs <= ${param_count}"
            params.append(search_criteria.max_price_ghs)
        
        # Add size tolerance filter
        if target_property.specifications.built_area_sqm is not None:
            tolerance = search_criteria.size_tolerance_pct
            target_size = target_property.specifications.built_area_sqm
            min_size = target_size * (1 - tolerance)
            max_size = target_size * (1 + tolerance)
            
            param_count += 1
            query += f" AND p.built_area_sqm >= ${param_count}"
            params.append(min_size)
            
            param_count += 1
            query += f" AND p.built_area_sqm <= ${param_count}"
            params.append(max_size)
        
        # Finish query
        param_count += 1
        query += f"""
        ORDER BY distance_km ASC, p.data_quality_score DESC, p.price_date DESC
        LIMIT ${param_count}
        """
        params.append(search_criteria.max_results)
        
        try:
            async with self.db.acquire() as conn:
                rows = await conn.fetch(query, *params)
                
                properties = []
                for row in rows:
                    # Convert database row to Property object
                    property_data = await self._row_to_property(row)
                    if property_data:
                        properties.append(property_data)
                
                logger.info(f"Found {len(properties)} comparable properties for {search_criteria.target_property_id}")
                return properties
                
        except Exception as e:
            logger.error(f"Error fetching comparable properties: {str(e)}")
            return []
    
    async def get_property_by_id(self, property_id: str) -> Optional[Property]:
        """Fetch a specific property by ID"""
        
        query = """
        SELECT 
            p.id, p.property_type, p.region, p.district, p.neighborhood,
            p.address_raw, p.address_city, p.coordinates, p.ghana_post_gps,
            p.bedrooms, p.bathrooms, p.parking_spaces, p.land_size_sqm, 
            p.built_area_sqm, p.year_built, p.condition, p.land_tenure,
            p.lease_years_remaining, p.has_swimming_pool, p.has_garden,
            p.has_security, p.has_generator, p.has_borehole, p.has_air_conditioning,
            p.current_price_ghs, p.previous_price_ghs, p.price_date,
            p.rental_income_monthly_ghs, p.operating_expenses_annual_ghs,
            p.property_taxes_annual_ghs, p.data_quality_score,
            p.source_reliability_score, p.completeness_score, p.accuracy_score,
            p.freshness_score, p.sources, p.last_verified, p.verification_method,
            p.created_at, p.updated_at, p.created_by
        FROM properties p
        WHERE p.id = $1
        """
        
        try:
            async with self.db.acquire() as conn:
                row = await conn.fetchrow(query, property_id)
                if row:
                    return await self._row_to_property(row)
                return None
                
        except Exception as e:
            logger.error(f"Error fetching property {property_id}: {str(e)}")
            return None
    
    async def get_construction_costs(
        self,
        region: GhanaRegion,
        property_type: PropertyType,
        as_of_date: date
    ) -> Optional[ConstructionCosts]:
        """Fetch construction cost data"""
        
        query = """
        SELECT 
            cc.region, cc.effective_date, cc.currency,
            cc.cost_per_sqm_basic, cc.cost_per_sqm_standard,
            cc.cost_per_sqm_premium, cc.cost_per_sqm_luxury,
            cc.skilled_labor_rate_per_day, cc.unskilled_labor_rate_per_day,
            cc.utilities_connection_cost, cc.site_preparation_cost_per_sqm,
            cc.transport_cost_factor, cc.availability_factor,
            cc.data_source, cc.last_updated, cc.next_update_due,
            cc.material_costs  -- JSONB column
        FROM construction_costs cc
        WHERE 
            cc.region = $1 
            AND cc.effective_date <= $2
        ORDER BY cc.effective_date DESC
        LIMIT 1
        """
        
        try:
            async with self.db.acquire() as conn:
                row = await conn.fetchrow(query, region.value, as_of_date)
                if row:
                    # Convert row to ConstructionCosts object
                    # This would need proper mapping based on actual database schema
                    return None  # Placeholder - implement actual conversion
                return None
                
        except Exception as e:
            logger.error(f"Error fetching construction costs for {region}: {str(e)}")
            return None
    
    async def get_economic_indicators(
        self,
        region: GhanaRegion,
        as_of_date: date
    ) -> List[EconomicIndicator]:
        """Fetch economic indicators"""
        
        query = """
        SELECT 
            ei.indicator_type, ei.value, ei.effective_date, ei.currency,
            ei.unit, ei.data_source, ei.reliability_score,
            ei.collection_method, ei.frequency, ei.last_updated
        FROM economic_indicators ei
        WHERE 
            (ei.region = $1 OR ei.region IS NULL)  -- National indicators have NULL region
            AND ei.effective_date <= $2
            AND ei.effective_date >= $3  -- Get indicators from last 90 days
        ORDER BY ei.effective_date DESC, ei.indicator_type
        """
        
        try:
            async with self.db.acquire() as conn:
                start_date = as_of_date - timedelta(days=90)
                rows = await conn.fetch(query, region.value, as_of_date, start_date)
                
                # Convert rows to EconomicIndicator objects
                indicators = []
                for row in rows:
                    # This would need proper mapping
                    pass
                
                return indicators
                
        except Exception as e:
            logger.error(f"Error fetching economic indicators for {region}: {str(e)}")
            return []
    
    async def get_market_statistics(
        self,
        region: GhanaRegion,
        property_type: PropertyType,
        period_start: date,
        period_end: date
    ) -> Optional[MarketStatistics]:
        """Fetch market statistics for a region and property type"""
        
        # This would be a complex query aggregating property sales/listings data
        query = """
        WITH property_stats AS (
            SELECT 
                COUNT(*) FILTER (WHERE p.sale_date BETWEEN $3 AND $4) as total_sales,
                COUNT(*) FILTER (WHERE p.listing_date BETWEEN $3 AND $4) as total_listings,
                COUNT(*) as total_inventory,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.current_price_ghs) as median_price_ghs,
                AVG(p.current_price_ghs) as mean_price_ghs,
                MIN(p.current_price_ghs) as min_price_ghs,
                MAX(p.current_price_ghs) as max_price_ghs,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.current_price_ghs / NULLIF(p.built_area_sqm, 0)) as price_per_sqm_median,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.days_on_market) as days_on_market_median,
                AVG(p.days_on_market) as days_on_market_mean
            FROM properties p
            WHERE 
                p.region = $1 
                AND p.property_type = $2
                AND p.current_price_ghs IS NOT NULL
        )
        SELECT * FROM property_stats
        """
        
        try:
            async with self.db.acquire() as conn:
                row = await conn.fetchrow(query, region.value, property_type.value, period_start, period_end)
                if row:
                    # Convert to MarketStatistics object
                    # This needs proper implementation
                    return None
                return None
                
        except Exception as e:
            logger.error(f"Error fetching market statistics for {region}, {property_type}: {str(e)}")
            return None
    
    async def get_regional_market_data(
        self,
        region: GhanaRegion,
        as_of_date: date
    ) -> Optional[RegionalMarketData]:
        """Fetch comprehensive market data for a region"""
        
        try:
            # Aggregate data from multiple sources
            construction_costs = await self.get_construction_costs(region, PropertyType.RESIDENTIAL_HOUSE, as_of_date)
            economic_indicators = await self.get_economic_indicators(region, as_of_date)
            
            # This would need much more comprehensive implementation
            return None
                
        except Exception as e:
            logger.error(f"Error fetching regional market data for {region}: {str(e)}")
            return None
    
    async def get_land_comparables(
        self,
        search_criteria: LandComparableSearchCriteria
    ) -> List[Property]:
        """
        Fetch land comparables using PostGIS spatial queries.
        
        This method:
        1. Searches for land-only properties (LAND_* property types)
        2. Filters by region, distance, age, and size
        3. Returns properties with sale data for comparable analysis
        """
        
        # Get target property or use provided coordinates
        target_lat, target_lng = None, None
        
        if search_criteria.target_coordinates:
            target_lat, target_lng = search_criteria.target_coordinates
        elif search_criteria.target_property_id:
            target_property = await self.get_property_by_id(search_criteria.target_property_id)
            if target_property and target_property.location.coordinates:
                target_lat, target_lng = target_property.location.coordinates
        
        if target_lat is None or target_lng is None:
            logger.warning("No coordinates available for land comparable search")
            return []
        
        # Build the PostGIS query for LAND properties only
        query = """
        SELECT 
            p.id, p.property_type, p.region, p.district, p.neighborhood,
            p.address_raw, p.address_city, p.coordinates, p.ghana_post_gps,
            p.bedrooms, p.bathrooms, p.parking_spaces, p.land_size_sqm, 
            p.built_area_sqm, p.year_built, p.condition, p.land_tenure,
            p.lease_years_remaining, p.has_swimming_pool, p.has_garden,
            p.has_security, p.has_generator, p.has_borehole, p.has_air_conditioning,
            p.current_price_ghs, p.previous_price_ghs, p.price_date,
            p.rental_income_monthly_ghs, p.operating_expenses_annual_ghs,
            p.property_taxes_annual_ghs, p.data_quality_score,
            p.source_reliability_score, p.completeness_score, p.accuracy_score,
            p.freshness_score, p.sources, p.last_verified, p.verification_method,
            p.created_at, p.updated_at, p.created_by,
            ST_Distance(
                ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
                ST_GeogFromText('POINT(' || (p.coordinates->>'lng') || ' ' || (p.coordinates->>'lat') || ')')
            ) / 1000 AS distance_km
        FROM properties p
        WHERE 
            p.property_type IN ('LAND_RESIDENTIAL', 'LAND_COMMERCIAL', 'LAND_INDUSTRIAL', 'LAND_AGRICULTURAL')
            AND p.region = $3
            AND p.current_price_ghs IS NOT NULL
            AND p.land_size_sqm IS NOT NULL
            AND p.land_size_sqm > 0
            AND p.price_date >= $4
            AND (p.coordinates->>'lat') IS NOT NULL
            AND (p.coordinates->>'lng') IS NOT NULL
            AND ST_DWithin(
                ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
                ST_GeogFromText('POINT(' || (p.coordinates->>'lng') || ' ' || (p.coordinates->>'lat') || ')'),
                $5 * 1000  -- Convert km to meters
            )
        """
        
        # Calculate date cutoff
        date_cutoff = date.today() - timedelta(days=search_criteria.max_age_days)
        
        params = [
            target_lng,
            target_lat,
            search_criteria.target_region,
            date_cutoff,
            search_criteria.max_distance_km
        ]
        param_count = 5
        
        # Exclude target property if provided
        if search_criteria.target_property_id:
            param_count += 1
            query += f" AND p.id != ${param_count}"
            params.append(search_criteria.target_property_id)
        
        # Add size tolerance filter
        if search_criteria.target_land_area_sqm and search_criteria.size_tolerance_pct:
            target_size = search_criteria.target_land_area_sqm
            tolerance = search_criteria.size_tolerance_pct
            min_size = target_size * (1 - tolerance)
            max_size = target_size * (1 + tolerance)
            
            param_count += 1
            query += f" AND p.land_size_sqm >= ${param_count}"
            params.append(min_size)
            
            param_count += 1
            query += f" AND p.land_size_sqm <= ${param_count}"
            params.append(max_size)
        
        # Order by distance and data quality
        param_count += 1
        query += f"""
        ORDER BY distance_km ASC, p.data_quality_score DESC, p.price_date DESC
        LIMIT ${param_count}
        """
        params.append(search_criteria.max_results)
        
        try:
            async with self.db.acquire() as conn:
                rows = await conn.fetch(query, *params)
                
                properties = []
                for row in rows:
                    property_obj = await self._row_to_property(row)
                    if property_obj:
                        properties.append(property_obj)
                
                logger.info(
                    f"Found {len(properties)} land comparables for region {search_criteria.target_region} "
                    f"within {search_criteria.max_distance_km}km"
                )
                return properties
                
        except Exception as e:
            logger.error(f"Error fetching land comparables: {str(e)}")
            return []
    
    async def _row_to_property(self, row) -> Optional[Property]:
        """Convert database row to Property object"""
        try:
            # This is a simplified conversion - would need full implementation
            # based on actual database schema and Property model requirements
            
            from ..schemas import (
                Property, PropertyLocation, PropertySpecifications,
                PropertyFinancials, PropertyDataQuality
            )
            from ..schemas.property import PropertyType, GhanaRegion, PropertyCondition, LandTenureType
            
            # Extract coordinates
            coordinates = None
            if row['coordinates']:
                if isinstance(row['coordinates'], dict):
                    lat = row['coordinates'].get('lat')
                    lng = row['coordinates'].get('lng')
                    if lat is not None and lng is not None:
                        coordinates = (lat, lng)
            
            # Build location object
            location = PropertyLocation(
                region=GhanaRegion(row['region']),
                district=row['district'] or "",
                neighborhood=row.get('neighborhood'),
                address_raw=row['address_raw'] or "",
                address_city=row['address_city'] or "",
                coordinates=coordinates,
                ghana_post_gps=row.get('ghana_post_gps')
            )
            
            # Build specifications
            specifications = PropertySpecifications(
                bedrooms=row.get('bedrooms'),
                bathrooms=row.get('bathrooms'),
                parking_spaces=row.get('parking_spaces'),
                land_size_sqm=row.get('land_size_sqm'),
                built_area_sqm=row.get('built_area_sqm'),
                year_built=row.get('year_built'),
                condition=PropertyCondition(row['condition']) if row.get('condition') else None,
                land_tenure=LandTenureType(row['land_tenure']) if row.get('land_tenure') else None,
                lease_years_remaining=row.get('lease_years_remaining'),
                has_swimming_pool=row.get('has_swimming_pool'),
                has_garden=row.get('has_garden'),
                has_security=row.get('has_security'),
                has_generator=row.get('has_generator'),
                has_borehole=row.get('has_borehole'),
                has_air_conditioning=row.get('has_air_conditioning')
            )
            
            # Build financials
            financials = None
            if any([row.get('current_price_ghs'), row.get('rental_income_monthly_ghs')]):
                financials = PropertyFinancials(
                    current_price_ghs=row.get('current_price_ghs'),
                    previous_price_ghs=row.get('previous_price_ghs'),
                    price_date=row.get('price_date'),
                    rental_income_monthly_ghs=row.get('rental_income_monthly_ghs'),
                    operating_expenses_annual_ghs=row.get('operating_expenses_annual_ghs'),
                    property_taxes_annual_ghs=row.get('property_taxes_annual_ghs')
                )
            
            # Build data quality
            data_quality = PropertyDataQuality(
                data_quality_score=row.get('data_quality_score', 0.0),
                source_reliability_score=row.get('source_reliability_score', 0.0),
                completeness_score=row.get('completeness_score', 0.0),
                accuracy_score=row.get('accuracy_score', 0.0),
                freshness_score=row.get('freshness_score', 0.0),
                sources=row.get('sources', []) if row.get('sources') else [],
                last_verified=row.get('last_verified'),
                verification_method=row.get('verification_method')
            )
            
            # Create Property object
            property_obj = Property(
                id=row['id'],
                property_type=PropertyType(row['property_type']),
                location=location,
                specifications=specifications,
                financials=financials,
                data_quality=data_quality,
                created_at=row.get('created_at'),
                updated_at=row.get('updated_at'),
                created_by=row.get('created_by')
            )
            
            return property_obj
            
        except Exception as e:
            logger.error(f"Error converting row to Property: {str(e)}")
            logger.error(f"Row data: {dict(row) if row else 'None'}")
            return None