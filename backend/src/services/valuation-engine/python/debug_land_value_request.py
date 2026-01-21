import asyncio
import logging
import os
import sys

# Add current directory to path so we can import app modules
sys.path.append(os.getcwd())

from app.adapters.data_hub_adapter import PostgreSQLMarketDataAdapter as MarketDataAdapter
from app.config import Settings
import aiohttp
import asyncpg

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROPERTY_ID = "37160d21-91a2-4051-a9c9-983d457f06c8"
VALUATION_ID = "5df33bf7-28f3-44cb-b99b-e8cba8210115"

async def main():
    logger.info("Connecting to database...")
    settings = Settings()
    pool = await asyncpg.create_pool(settings.database_url)
    adapter = MarketDataAdapter(pool)
    # await adapter.connect() # PostgreSQLMarketDataAdapter doesn't have connect() usually if passed pool, but base might.
    # Base class MarketDataAdapter defines connect? No, it's ABC without it in the snippet I saw.
    # But PostgreSQLMarketDataAdapter __init__ just sets self.db = db_pool.
    # So we don't need to call connect() if we passed a connected pool.
    
    try:
        logger.info(f"Fetching property {PROPERTY_ID}...")
        prop = await adapter.get_property_by_id(PROPERTY_ID)
        if not prop:
            logger.error(f"Property {PROPERTY_ID} not found!")
            return

        logger.info(f"Property found: {prop.id}")
        logger.info(f"Region: {prop.location.region}")
        logger.info(f"Coordinates: {prop.location.coordinates}")
        
        # Construct Payload
        # We need to manually construct this because schemas might be slightly different or mapped
        property_payload = {
            "id": prop.id,
            "property_type": prop.property_type.value if hasattr(prop.property_type, 'value') else str(prop.property_type),
            "region": prop.location.region.value if hasattr(prop.location.region, 'value') else str(prop.location.region),
            "address_city": prop.location.address_city,
            "address_street": prop.location.address_raw,
            "latitude": prop.location.coordinates[0] if prop.location.coordinates else None,
            "longitude": prop.location.coordinates[1] if prop.location.coordinates else None,
            "land_area_sqm": prop.specifications.land_size_sqm or 0,
            "building_size_sqm": prop.specifications.built_area_sqm or 0,
            "bedrooms": prop.specifications.bedrooms,
            "bathrooms": prop.specifications.bathrooms,
            "year_built": prop.specifications.year_built,
            "condition": prop.specifications.condition.value if prop.specifications.condition else "good",
            # Add defaults for other fields
            "current_price_ghs": 0 
        }

        payload = {
            "property": property_payload,
            "valuation_id": VALUATION_ID,
            "force_recalculate": True,
            "valuation_date": "2026-01-16"
        }
        
        print("\n--- Sending Request to Local API ---")
        print(f"Payload: {payload}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post("http://localhost:8001/api/v1/methods/land-value", json=payload) as resp:
                print(f"Status: {resp.status}")
                result = await resp.json()
                print(f"Response: {result}")
                
    except Exception as e:
        logger.error(f"Error: {e}")
    finally:
        await pool.close()

if __name__ == "__main__":
    asyncio.run(main())