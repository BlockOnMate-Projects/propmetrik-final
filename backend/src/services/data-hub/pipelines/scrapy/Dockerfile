# PROPMETRIK Scrapy Worker
# Python-based web scraping service for property data collection
#
# This service runs scheduled Scrapy spiders to collect property listings
# from Ghana real estate portals (Meqasa, Ghana Property Centre, etc.)

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    cron \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy scrapy project requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy scrapy project
COPY . .

# Create directories
RUN mkdir -p /app/items /app/logs /var/log/cron

# Create a non-root user
RUN useradd -m -s /bin/bash scrapy && \
    chown -R scrapy:scrapy /app /var/log/cron

# Copy entrypoint and cron configuration
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create cron jobs for different spider schedules
# These align with the Node.js scrapyScheduler settings
RUN cat > /etc/cron.d/scrapy-jobs << 'EOF'
# Scrapy cron jobs
# Format: minute hour day month weekday user command

# Weekly full scrape - Sunday 2 AM (all spiders)
0 2 * * 0 scrapy cd /app && python run_spider.py all --scrape-type full >> /var/log/cron/weekly.log 2>&1

# Daily update scrape - 3 AM (recent listings only)
0 3 * * * scrapy cd /app && python run_spider.py all --scrape-type update --max-pages 10 >> /var/log/cron/daily.log 2>&1

# Hourly retry for failed jobs
0 * * * * scrapy cd /app && python retry_failed.py >> /var/log/cron/retry.log 2>&1

EOF

RUN chmod 0644 /etc/cron.d/scrapy-jobs && \
    crontab /etc/cron.d/scrapy-jobs

# Expose API port
EXPOSE 5000

# Health check - hit the Flask /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${SCRAPY_API_PORT:-5000}/health || exit 1

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV SCRAPY_LOG_ENABLED=true
ENV SCRAPY_LOG_LEVEL=INFO
ENV ETL_TRACKING_ENABLED=true
ENV SCRAPY_MODE=api
ENV SCRAPY_API_PORT=5000

# Run as root for cron, but spiders run as scrapy user
USER root

ENTRYPOINT ["/entrypoint.sh"]
CMD []
