"""
Multi-Source Tracking Integration for Scrapy Pipeline

This module provides functions to integrate multi-source tracking with the
Scrapy pipeline. Since Scrapy runs in Python and our services are in TypeScript,
we implement direct database operations here that mirror the TypeScript service.
"""

import json
import logging
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any, List
from decimal import Decimal

import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

# Source type trust scores (mirrors TypeScript service)
SOURCE_TYPE_TRUST = {
    'tier1_government': 0.95,
    'tier2_financial': 0.85,
    'tier3_partner': 0.75,
    'tier3c_construction': 0.70,
    'tier4_user': 0.60,
    'tier5_web': 0.55,
    'manual_entry': 0.50,
    'api_import': 0.65,
}

# Fields to track for multi-source comparison
TRACKABLE_FIELDS = [
    'title', 'description', 'address', 'city', 'region',
    'latitude', 'longitude', 'price', 'currency',
    'bedrooms', 'bathrooms', 'building_size_sqm', 'land_size_sqm',
    'total_area_sqm', 'property_type', 'listing_type',
    'amenities', 'images', 'agent_name', 'agent_phone',
    'year_built', 'floor_count', 'parking_spaces',
]

# Field name mappings from Scrapy item fields to standard fields
FIELD_MAPPINGS = {
    'title': ['title', 'name', 'listing_title'],
    'description': ['description', 'details', 'summary'],
    'address': ['address', 'address_raw', 'address_street', 'location_text'],
    'city': ['city', 'location_city', 'area'],
    'region': ['region', 'state', 'location_region'],
    'latitude': ['latitude', 'lat', 'geo_lat'],
    'longitude': ['longitude', 'lng', 'lon', 'geo_lng'],
    'price': ['price', 'price_usd', 'price_value', 'asking_price'],
    'currency': ['currency', 'price_currency'],
    'bedrooms': ['bedrooms', 'beds', 'bedroom_count', 'num_bedrooms'],
    'bathrooms': ['bathrooms', 'baths', 'bathroom_count', 'num_bathrooms'],
    'building_size_sqm': ['building_size_sqm', 'built_area', 'floor_area', 'total_area_sqm'],
    'land_size_sqm': ['land_size_sqm', 'plot_size', 'land_area'],
    'property_type': ['property_type', 'type', 'category'],
    'listing_type': ['listing_type', 'transaction_type', 'for_sale', 'for_rent'],
    'amenities': ['amenities', 'features', 'facilities'],
    'images': ['images', 'photos', 'image_urls', 'gallery'],
    'agent_name': ['agent_name', 'agent', 'broker_name', 'seller_name'],
    'agent_phone': ['agent_phone', 'phone', 'contact_phone'],
    'year_built': ['year_built', 'construction_year', 'built_year'],
    'floor_count': ['floor_count', 'floors', 'stories', 'levels'],
    'parking_spaces': ['parking_spaces', 'parking', 'garage_spaces'],
}


class MultiSourceTracker:
    """
    Python implementation of multi-source tracking for Scrapy integration.
    Directly populates property_data_sources table during scraping.
    """
    
    def __init__(self, conn):
        """
        Initialize with a psycopg2 connection.
        
        Args:
            conn: Active psycopg2 connection
        """
        self.conn = conn
        self._data_source_cache = {}
    
    def track_contribution(
        self,
        property_id: str,
        source_slug: str,
        source_type: str,
        item_data: Dict[str, Any],
        source_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Track a data contribution from a source for a property.
        
        Args:
            property_id: UUID of the property
            source_slug: Identifier for the data source (e.g., 'meqasa', 'gpc')
            source_type: Type of source (e.g., 'tier5_web')
            item_data: Raw scraped item data
            source_url: Optional URL of the source listing
            
        Returns:
            Dictionary with tracking result details
        """
        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Get or create data source
                data_source_id = self._get_or_create_data_source(cur, source_slug, source_type)
                
                # Extract trackable fields
                data_fields = self._extract_trackable_fields(item_data)
                
                # Calculate reliability score
                reliability_score = self._calculate_reliability_score(data_fields, source_type)
                
                # Check if source contribution already exists
                cur.execute("""
                    SELECT id, data_fields, update_count 
                    FROM property_data_sources 
                    WHERE property_id = %s AND data_source_id = %s
                """, (property_id, data_source_id))
                
                existing = cur.fetchone()
                
                # Prepare raw data for storage
                raw_data = {
                    'source_url': source_url,
                    'scraped_at': datetime.utcnow().isoformat(),
                    'original_data': self._serialize_item(item_data),
                }
                
                if existing:
                    # Update existing contribution
                    result = self._update_contribution(
                        cur, property_id, data_source_id,
                        existing, data_fields, raw_data, reliability_score
                    )
                else:
                    # Insert new contribution
                    result = self._insert_contribution(
                        cur, property_id, data_source_id, source_type,
                        data_fields, raw_data, reliability_score
                    )
                
                self.conn.commit()
                return result
                
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Error tracking source contribution: {e}")
            raise
    
    def _get_or_create_data_source(self, cursor, source_slug: str, source_type: str) -> str:
        """Get data source ID from cache or database, creating if needed."""
        
        # Check cache
        if source_slug in self._data_source_cache:
            return self._data_source_cache[source_slug]
        
        # Query database
        cursor.execute(
            "SELECT id FROM data_sources WHERE slug = %s",
            (source_slug,)
        )
        result = cursor.fetchone()
        
        if result:
            data_source_id = str(result['id'])
        else:
            # Create new data source
            trust_score = SOURCE_TYPE_TRUST.get(source_type, 0.5)
            cursor.execute("""
                INSERT INTO data_sources (name, slug, source_type, trust_score, is_active)
                VALUES (%s, %s, %s, %s, true)
                ON CONFLICT (slug) DO UPDATE SET source_type = EXCLUDED.source_type
                RETURNING id
            """, (
                self._format_source_name(source_slug),
                source_slug,
                source_type,
                trust_score,
            ))
            data_source_id = str(cursor.fetchone()['id'])
        
        # Cache result
        self._data_source_cache[source_slug] = data_source_id
        return data_source_id
    
    def _format_source_name(self, slug: str) -> str:
        """Format source slug into readable name."""
        return ' '.join(word.capitalize() for word in slug.replace('-', '_').split('_'))
    
    def _extract_trackable_fields(self, item_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract trackable fields from raw item data."""
        fields = {}
        
        for target_field, source_fields in FIELD_MAPPINGS.items():
            for source_field in source_fields:
                value = item_data.get(source_field)
                if value is not None and value != '':
                    fields[target_field] = self._normalize_value(value)
                    break
        
        return fields
    
    def _normalize_value(self, value: Any) -> Any:
        """Normalize value for storage."""
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, (list, dict)):
            return value
        return value
    
    def _serialize_item(self, item_data: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize item data for JSON storage."""
        serialized = {}
        for key, value in item_data.items():
            try:
                serialized[key] = self._normalize_value(value)
            except Exception:
                serialized[key] = str(value)
        return serialized
    
    def _calculate_reliability_score(
        self,
        fields: Dict[str, Any],
        source_type: str
    ) -> float:
        """Calculate reliability score based on data completeness and source type."""
        
        # Base score from source type
        base_score = SOURCE_TYPE_TRUST.get(source_type, 0.5)
        
        # Completeness bonus
        total_possible = len(TRACKABLE_FIELDS)
        provided = len([k for k, v in fields.items() if v is not None and v != ''])
        completeness = provided / total_possible if total_possible > 0 else 0
        
        # Important fields bonus
        important_fields = ['address', 'price', 'bedrooms', 'latitude', 'longitude']
        important_provided = sum(1 for f in important_fields if fields.get(f))
        important_bonus = (important_provided / len(important_fields)) * 0.1
        
        # Final score = base * 0.7 + completeness * 0.2 + important * 0.1
        return min(1.0, base_score * 0.7 + completeness * 0.2 + important_bonus)
    
    def _insert_contribution(
        self,
        cursor,
        property_id: str,
        data_source_id: str,
        source_type: str,
        data_fields: Dict[str, Any],
        raw_data: Dict[str, Any],
        reliability_score: float
    ) -> Dict[str, Any]:
        """Insert new source contribution."""
        
        cursor.execute("""
            INSERT INTO property_data_sources (
                property_id, data_source_id, source_type,
                data_fields, raw_data, reliability_score,
                is_primary_source, first_seen_at, last_updated, update_count
            ) VALUES (%s, %s, %s, %s, %s, %s, false, NOW(), NOW(), 1)
        """, (
            property_id,
            data_source_id,
            source_type,
            json.dumps(data_fields),
            json.dumps(raw_data),
            reliability_score,
        ))
        
        return {
            'property_id': property_id,
            'source_id': data_source_id,
            'is_new_source': True,
            'fields_added': list(data_fields.keys()),
            'fields_updated': [],
            'reliability_score': reliability_score,
        }
    
    def _update_contribution(
        self,
        cursor,
        property_id: str,
        data_source_id: str,
        existing: Dict[str, Any],
        new_fields: Dict[str, Any],
        raw_data: Dict[str, Any],
        reliability_score: float
    ) -> Dict[str, Any]:
        """Update existing source contribution."""
        
        old_fields = existing.get('data_fields') or {}
        if isinstance(old_fields, str):
            old_fields = json.loads(old_fields)
        
        # Determine changes
        fields_added = []
        fields_updated = []
        
        for field, value in new_fields.items():
            if field not in old_fields:
                fields_added.append(field)
            elif json.dumps(old_fields.get(field)) != json.dumps(value):
                fields_updated.append(field)
        
        # Merge fields (new values take precedence)
        merged_fields = {**old_fields, **new_fields}
        
        cursor.execute("""
            UPDATE property_data_sources SET
                data_fields = %s,
                raw_data = %s,
                reliability_score = %s,
                last_updated = NOW(),
                update_count = update_count + 1
            WHERE property_id = %s AND data_source_id = %s
        """, (
            json.dumps(merged_fields),
            json.dumps(raw_data),
            reliability_score,
            property_id,
            data_source_id,
        ))
        
        return {
            'property_id': property_id,
            'source_id': data_source_id,
            'is_new_source': False,
            'fields_added': fields_added,
            'fields_updated': fields_updated,
            'reliability_score': reliability_score,
        }
    
    def get_source_summary(self, property_id: str) -> Dict[str, Any]:
        """Get summary of all sources for a property."""
        
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT 
                    pds.data_source_id,
                    ds.slug as source_slug,
                    pds.source_type,
                    pds.data_fields,
                    pds.reliability_score,
                    pds.is_primary_source,
                    pds.last_updated,
                    pds.update_count
                FROM property_data_sources pds
                LEFT JOIN data_sources ds ON ds.id = pds.data_source_id
                WHERE pds.property_id = %s
                ORDER BY pds.reliability_score DESC
            """, (property_id,))
            
            sources = cur.fetchall()
        
        if not sources:
            return {
                'property_id': property_id,
                'total_sources': 0,
                'sources': [],
            }
        
        return {
            'property_id': property_id,
            'total_sources': len(sources),
            'primary_source': next(
                (s['source_slug'] for s in sources if s['is_primary_source']),
                None
            ),
            'sources': [
                {
                    'source_id': s['source_slug'] or str(s['data_source_id']),
                    'source_type': s['source_type'],
                    'field_count': len(s['data_fields'] or {}),
                    'reliability_score': float(s['reliability_score']),
                    'is_primary': s['is_primary_source'],
                    'last_updated': s['last_updated'].isoformat() if s['last_updated'] else None,
                    'update_count': s['update_count'],
                }
                for s in sources
            ],
        }


def generate_source_data_hash(data: Dict[str, Any]) -> str:
    """Generate hash of source data for change detection."""
    sorted_keys = sorted(data.keys())
    normalized = {}
    
    for key in sorted_keys:
        if key in TRACKABLE_FIELDS:
            value = data.get(key)
            if value is None:
                normalized[key] = 'null'
            elif isinstance(value, str):
                normalized[key] = value.lower().strip()
            elif isinstance(value, (int, float, Decimal)):
                normalized[key] = str(value)
            else:
                normalized[key] = json.dumps(value, sort_keys=True)
    
    return hashlib.sha256(json.dumps(normalized, sort_keys=True).encode()).hexdigest()
