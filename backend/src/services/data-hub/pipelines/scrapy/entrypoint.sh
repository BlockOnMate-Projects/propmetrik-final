#!/bin/bash
# Scrapy Worker Entrypoint
# Initializes environment and starts cron daemon for scheduled scraping

set -e

echo "=== PROPMETRIK Scrapy Worker ==="
echo "Starting at $(date)"
echo "Worker hostname: $(hostname)"

# Export environment variables for cron jobs
printenv | grep -E '^(DATABASE_URL|REDIS_|ETL_|SCRAPY_|API_URL|PORT)' > /etc/environment

# Ensure log directories exist with correct permissions
mkdir -p /var/log/cron /app/logs /app/items
chmod 755 /var/log/cron /app/logs /app/items

# Test database connectivity
echo "Testing database connection..."
python -c "
import os
import psycopg2
from dotenv import load_dotenv
load_dotenv()
try:
    conn = psycopg2.connect(os.environ.get('DATABASE_URL'))
    conn.close()
    print('Database connection: OK')
except Exception as e:
    print(f'Database connection: FAILED - {e}')
    exit(1)
"

# Log enabled spiders
echo "Enabled spiders: ${SCRAPY_ENABLED_SPIDERS:-meqasa,gpc,housemaster,realtor}"
echo "Auto start: ${SCRAPY_AUTO_START:-true}"
echo "ETL tracking: ${ETL_TRACKING_ENABLED:-true}"

# Run initial scrape if configured
if [ "${SCRAPY_AUTO_START}" = "true" ] && [ "${SCRAPY_INITIAL_SCRAPE}" = "true" ]; then
    echo "Running initial scrape..."
    su - scrapy -c "cd /app && python run_spider.py all --scrape-type update --max-pages 5" || true
fi

# Start mode: HTTP API server (default) or legacy cron
SCRAPY_MODE="${SCRAPY_MODE:-api}"
if [ "${SCRAPY_MODE}" = "cron" ]; then
    echo "Starting in CRON mode..."
    exec cron -f
else
    echo "Starting in API mode on port ${SCRAPY_API_PORT:-5000}..."
    # Start cron in background for fallback scheduling
    cron
    # Start the Flask API server as main process
    exec python /app/api_server.py
fi
