#!/usr/bin/env python3
"""
Simple script to query property counts from the database using same config as scrapers.
"""
import os
import sys
import psycopg2
from urllib.parse import urlparse

def get_database_config():
    """Get database configuration from environment."""
    database_url = os.getenv("DATABASE_URL", "")
    
    if database_url:
        # Parse DATABASE_URL
        parsed = urlparse(database_url)
        return {
            'host': parsed.hostname,
            'database': parsed.path[1:],  # Remove leading '/'
            'user': parsed.username,
            'password': parsed.password,
            'port': parsed.port or 5432
        }
    else:
        # Fallback to individual environment variables
        return {
            'host': os.getenv('POSTGRES_HOST', 'localhost'),
            'database': os.getenv('POSTGRES_DB', 'propmetrik'),
            'user': os.getenv('POSTGRES_USER', 'postgres'),
            'password': os.getenv('POSTGRES_PASSWORD', 'postgres'),
            'port': int(os.getenv('POSTGRES_PORT', 5432))
        }

def main():
    """Query and display property counts."""
    config = get_database_config()
    
    try:
        print(f"Connecting to database: {config['host']}:{config['port']}/{config['database']}")
        conn = psycopg2.connect(**config)
        cursor = conn.cursor()
        
        # Get properties by source
        cursor.execute('SELECT source_slug, COUNT(*) FROM properties GROUP BY source_slug ORDER BY COUNT(*) DESC;')
        results = cursor.fetchall()
        
        print('\nProperties by source:')
        total = 0
        for source, count in results:
            print(f'  {source}: {count:,}')
            total += count
        
        print(f'\nTotal properties: {total:,}')
        
        # Get latest Meqasa properties
        cursor.execute("""
            SELECT COUNT(*), MAX(scraped_at) 
            FROM properties 
            WHERE source_slug = 'meqasa'
        """)
        meqasa_count, latest_scraped = cursor.fetchone()
        
        if meqasa_count > 0:
            print(f"\nLatest Meqasa scrape: {latest_scraped}")
            
            # Get sample Meqasa properties
            cursor.execute("""
                SELECT title, price, price_usd, listing_type
                FROM properties 
                WHERE source_slug = 'meqasa'
                ORDER BY scraped_at DESC
                LIMIT 5
            """)
            samples = cursor.fetchall()
            
            print("\nSample Meqasa properties:")
            for title, price, price_usd, listing_type in samples:
                print(f"  {title[:50]}... - {listing_type} - GHS {price} (${price_usd})")
        
    except Exception as e:
        print(f'Error: {e}')
        return 1
    finally:
        if 'conn' in locals():
            conn.close()
    
    return 0

if __name__ == "__main__":
    sys.exit(main())