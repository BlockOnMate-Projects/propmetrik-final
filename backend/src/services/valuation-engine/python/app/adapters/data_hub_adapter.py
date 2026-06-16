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
            AND p.deleted_at IS NULL
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
            str(target_lng),
            str(target_lat), 
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
        """Fetch a specific property by ID - uses actual database schema columns"""
        
        query = """
        SELECT 
            p.id, p.property_type, p.region, 
            p.address_district as district, p.address_district as neighborhood,
            p.address_street as address_raw, p.address_city, 
            jsonb_build_object('lat', p.latitude, 'lng', p.longitude) as coordinates,
            p.digital_address as ghana_post_gps,
            p.bedrooms, p.bathrooms, 0 as parking_spaces, 
            COALESCE(p.land_area_sqm, p.total_area_sqm) as land_size_sqm, 
            p.built_area_sqm, p.year_built, p.condition, NULL::text as land_tenure,
            NULL::int as lease_years_remaining, 
            false as has_swimming_pool, false as has_garden,
            false as has_security, false as has_generator, false as has_borehole, 
            false as has_air_conditioning,
            p.price as current_price_ghs, NULL::numeric as previous_price_ghs, 
            p.created_at as price_date,
            NULL::numeric as rental_income_monthly_ghs, 
            NULL::numeric as operating_expenses_annual_ghs,
            NULL::numeric as property_taxes_annual_ghs, p.data_quality_score,
            0.8 as source_reliability_score, p.completeness_score, 0.8 as accuracy_score,
            0.8 as freshness_score, '[]'::jsonb as sources, NULL::timestamp as last_verified, 
            NULL::text as verification_method,
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
        1. Searches for land-only properties (property_type = 'land')
        2. Filters by region, distance, age, and size
        3. Extracts land size from title/description if land_size_sqm is NULL
        4. Returns properties with sale data for comparable analysis
        """
        
        # Get target property or use provided coordinates
        target_lat, target_lng = None, None
        
        if search_criteria.target_coordinates:
            target_lat, target_lng = search_criteria.target_coordinates
        elif search_criteria.target_property_id:
            target_property = await self.get_property_by_id(search_criteria.target_property_id)
            if target_property and target_property.location.coordinates:
                target_lat, target_lng = target_property.location.coordinates
        
        has_coordinates = target_lat is not None and target_lng is not None
        
        # Build the query for LAND properties
        # Extract land size from multiple patterns:
        # 1. NxM format: "70x100ft", "100 x 70"
        # 2. Acres: "5 acres", "0.33 acres", "2.7-acre"  
        # 3. Plots: "2 plots" (assume 1 plot = 650 sqm standard Ghana plot)
        # 4. Direct sqm/sqft values
        # Conversions:
        # - 1 acre = 4046.86 sqm
        # - 1 sqft = 0.0929 sqm
        # - 1 Ghana standard plot = ~650 sqm (70x100ft)
        #
        # NOTE: This query uses the actual database schema columns from properties table.
        # Column mappings:
        # - digital_address -> ghana_post_gps
        # - created_at -> listing_date/price_date
        # - No separate: parking_spaces, has_swimming_pool, etc (not in schema)
        query = r"""
        WITH land_with_extracted_size AS (
            SELECT 
                p.id, p.property_type, p.region, p.address_district, p.address_street, 
                p.address_city, p.latitude, p.longitude, p.digital_address,
                p.bedrooms, p.bathrooms, p.land_area_sqm, p.total_area_sqm,
                p.plot_size_acres, p.built_area_sqm, p.year_built, p.condition,
                p.price, p.data_quality_score, p.completeness_score, p.title, p.description,
                p.created_at, p.updated_at,
                CASE 
                    -- Priority 1: Direct land_area_sqm if available
                    WHEN p.land_area_sqm IS NOT NULL AND p.land_area_sqm > 0 
                        THEN p.land_area_sqm
                    
                    -- Priority 2: NxM format (70x100, 100 x 70, etc.) - assume feet
                    WHEN (COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')) ~ '\d+\s*[xX×]\s*\d+'
                        THEN (
                            (SELECT m[1]::numeric * m[2]::numeric * 0.0929 
                             FROM regexp_matches(COALESCE(p.title, '') || ' ' || COALESCE(p.description, ''), 
                                 '(\d+)\s*[xX×]\s*(\d+)', 'i') AS m LIMIT 1)
                        )
                    
                    -- Priority 3: Acres format ("5 acres", "0.33 acres", "2.7-acre", ".5 acre")
                    WHEN (COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')) ~* '\d*\.?\d+\s*-?\s*acres?'
                        THEN (
                            (SELECT m[1]::numeric * 4046.86 
                             FROM regexp_matches(COALESCE(p.title, '') || ' ' || COALESCE(p.description, ''), 
                                 '(\d*\.?\d+)\s*-?\s*acres?', 'i') AS m LIMIT 1)
                        )
                    
                    -- Priority 4: Plots format ("2 plots", "1 plot", "4 Plots Of Land") - 1 plot = 650 sqm
                    WHEN (COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')) ~* '\d+\.?\d*\s*plots?'
                        THEN (
                            (SELECT m[1]::numeric * 650 
                             FROM regexp_matches(COALESCE(p.title, '') || ' ' || COALESCE(p.description, ''), 
                                 '(\d+\.?\d*)\s*plots?', 'i') AS m LIMIT 1)
                        )
                    
                    -- Priority 5: Fallback columns
                    WHEN p.total_area_sqm IS NOT NULL AND p.total_area_sqm > 0 
                        THEN p.total_area_sqm
                    WHEN p.plot_size_acres IS NOT NULL AND p.plot_size_acres > 0 
                        THEN p.plot_size_acres * 4046.86
                    
                    ELSE NULL
                END AS extracted_land_size_sqm
            FROM properties p
            WHERE p.property_type::text = 'land'
              AND p.price IS NOT NULL AND p.price > 0
        )
        SELECT 
            l.id, l.property_type, l.region, 
            l.address_district as district, l.address_district as neighborhood,
            l.address_street as address_raw, l.address_city, 
            jsonb_build_object('lat', l.latitude, 'lng', l.longitude) as coordinates,
            l.digital_address as ghana_post_gps,
            l.bedrooms, l.bathrooms, 0 as parking_spaces, 
            l.extracted_land_size_sqm as land_size_sqm,
            l.built_area_sqm, l.year_built, l.condition, NULL::text as land_tenure,
            NULL::int as lease_years_remaining, 
            false as has_swimming_pool, false as has_garden, false as has_security, 
            false as has_generator, false as has_borehole, false as has_air_conditioning,
            l.price as current_price_ghs, NULL::numeric as previous_price_ghs, 
            l.created_at as price_date,
            NULL::numeric as rental_income_monthly_ghs, 
            NULL::numeric as operating_expenses_annual_ghs,
            NULL::numeric as property_taxes_annual_ghs, 
            l.data_quality_score,
            0.8 as source_reliability_score, l.completeness_score, 0.8 as accuracy_score,
            0.8 as freshness_score, '[]'::jsonb as sources, NULL::timestamp as last_verified, 
            NULL::text as verification_method,
            l.created_at, l.updated_at, NULL::text as created_by"""
        
        # Add distance calculation if we have coordinates
        if has_coordinates:
            query += f""",
            ST_Distance(
                ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
                ST_GeogFromText('POINT(' || l.longitude || ' ' || l.latitude || ')')
            ) / 1000 AS distance_km
        FROM land_with_extracted_size l
        WHERE 
            l.extracted_land_size_sqm IS NOT NULL
            AND l.extracted_land_size_sqm > 0
            AND l.region = $3
            AND l.created_at >= $4
            AND l.latitude IS NOT NULL
            AND l.longitude IS NOT NULL
            AND ST_DWithin(
                ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
                ST_GeogFromText('POINT(' || l.longitude || ' ' || l.latitude || ')'),
                $5 * 1000
            )
        """
            params = [
                str(target_lng),
                str(target_lat),
                search_criteria.target_region,
                date.today() - timedelta(days=search_criteria.max_age_days),
                search_criteria.max_distance_km
            ]
            param_count = 5
        else:
            # Fallback: search by region only when no coordinates
            query += """,
            0.0 AS distance_km
        FROM land_with_extracted_size l
        WHERE 
            l.extracted_land_size_sqm IS NOT NULL
            AND l.extracted_land_size_sqm > 0
            AND l.region = $1
            AND l.created_at >= $2
        """
            params = [
                search_criteria.target_region,
                date.today() - timedelta(days=search_criteria.max_age_days),
            ]
            param_count = 2
        
        # Exclude target property if provided
        if search_criteria.target_property_id:
            param_count += 1
            query += f" AND l.id != ${param_count}"
            params.append(search_criteria.target_property_id)
        
        # Add size tolerance filter
        if search_criteria.target_land_area_sqm and search_criteria.size_tolerance_pct:
            target_size = search_criteria.target_land_area_sqm
            tolerance = search_criteria.size_tolerance_pct
            min_size = target_size * (1 - tolerance)
            max_size = target_size * (1 + tolerance)
            
            param_count += 1
            query += f" AND l.extracted_land_size_sqm >= ${param_count}"
            params.append(min_size)
            
            param_count += 1
            query += f" AND l.extracted_land_size_sqm <= ${param_count}"
            params.append(max_size)
        
        # Order by distance and data quality
        param_count += 1
        query += f"""
        ORDER BY distance_km ASC, l.data_quality_score DESC NULLS LAST, l.created_at DESC NULLS LAST
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
            import json
            
            # Map database property_type to schema PropertyType
            property_type_map = {
                'land': PropertyType.LAND_RESIDENTIAL,
                'land_residential': PropertyType.LAND_RESIDENTIAL,
                'land_commercial': PropertyType.LAND_COMMERCIAL,
                'land_industrial': PropertyType.LAND_INDUSTRIAL,
                'land_agricultural': PropertyType.LAND_AGRICULTURAL,
                'house': PropertyType.RESIDENTIAL_HOUSE,
                'residential_house': PropertyType.RESIDENTIAL_HOUSE,
                'apartment': PropertyType.RESIDENTIAL_APARTMENT,
                'residential_apartment': PropertyType.RESIDENTIAL_APARTMENT,
                'townhouse': PropertyType.RESIDENTIAL_TOWNHOUSE,
                'residential_townhouse': PropertyType.RESIDENTIAL_TOWNHOUSE,
                'villa': PropertyType.RESIDENTIAL_VILLA,
                'residential_villa': PropertyType.RESIDENTIAL_VILLA,
                'office': PropertyType.COMMERCIAL_OFFICE,
                'commercial_office': PropertyType.COMMERCIAL_OFFICE,
                'retail': PropertyType.COMMERCIAL_RETAIL,
                'commercial_retail': PropertyType.COMMERCIAL_RETAIL,
                'warehouse': PropertyType.COMMERCIAL_WAREHOUSE,
                'commercial_warehouse': PropertyType.COMMERCIAL_WAREHOUSE,
                'other': PropertyType.OTHER,
            }
            
            db_property_type = str(row['property_type']).lower()
            property_type = property_type_map.get(db_property_type, PropertyType.OTHER)
            
            # Extract coordinates - handle string JSON or dict
            coordinates = None
            coord_data = row['coordinates']
            if coord_data:
                if isinstance(coord_data, str):
                    import json
                    try:
                        coord_data = json.loads(coord_data)
                    except:
                        coord_data = None
                if isinstance(coord_data, dict):
                    lat = coord_data.get('lat')
                    lng = coord_data.get('lng')
                    if lat is not None and lng is not None:
                        coordinates = (float(lat), float(lng))
            
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
                # Convert datetime to date if needed
                price_date_value = row.get('price_date')
                if price_date_value and hasattr(price_date_value, 'date'):
                    price_date_value = price_date_value.date()
                    
                financials = PropertyFinancials(
                    current_price_ghs=row.get('current_price_ghs'),
                    previous_price_ghs=row.get('previous_price_ghs'),
                    price_date=price_date_value,
                    rental_income_monthly_ghs=row.get('rental_income_monthly_ghs'),
                    operating_expenses_annual_ghs=row.get('operating_expenses_annual_ghs'),
                    property_taxes_annual_ghs=row.get('property_taxes_annual_ghs')
                )
            
            # Build data quality - handle None values and string sources
            sources_value = row.get('sources', [])
            if isinstance(sources_value, str):
                import json
                try:
                    sources_value = json.loads(sources_value)
                except:
                    sources_value = []
            
            data_quality = PropertyDataQuality(
                data_quality_score=float(row.get('data_quality_score') or 0.8),
                source_reliability_score=float(row.get('source_reliability_score') or 0.8),
                completeness_score=float(row.get('completeness_score') or 0.8),
                accuracy_score=float(row.get('accuracy_score') or 0.8),
                freshness_score=float(row.get('freshness_score') or 0.8),
                sources=sources_value if sources_value else [],
                last_verified=row.get('last_verified'),
                verification_method=row.get('verification_method')
            )
            
            # Create Property object
            # Convert timestamps to dates
            created_at_value = row.get('created_at')
            if created_at_value and hasattr(created_at_value, 'date'):
                created_at_value = created_at_value.date()
            
            updated_at_value = row.get('updated_at')
            if updated_at_value and hasattr(updated_at_value, 'date'):
                updated_at_value = updated_at_value.date()
            
            # Create Property object
            property_obj = Property(
                id=str(row['id']),  # Convert UUID to string
                property_type=property_type,  # Use mapped property type
                location=location,
                specifications=specifications,
                financials=financials,
                data_quality=data_quality,
                created_at=created_at_value,
                updated_at=updated_at_value,
                created_by=row.get('created_by')
            )
            
            return property_obj
            
        except Exception as e:
            logger.error(f"Error converting row to Property: {str(e)}")
            logger.error(f"Row data: {dict(row) if row else 'None'}")
            return None