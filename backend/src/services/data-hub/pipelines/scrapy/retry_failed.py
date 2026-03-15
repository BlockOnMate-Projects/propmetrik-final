#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapers - Retry Failed Jobs

This script checks for failed ETL jobs and retries them.
Designed to be run via cron as part of the scrapy worker.

Usage:
    python retry_failed.py
    python retry_failed.py --max-retries 3
"""
import os
import sys
import logging
import argparse
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment
_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_env = os.path.join(_script_dir, '..', '..', '..', '..', '..', '.env')
load_dotenv(os.path.normpath(_backend_env), override=False)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def get_db_connection():
    """Get database connection from environment."""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable not set")
    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)


def get_failed_jobs(conn, hours_back: int = 6, max_retries: int = 3) -> list:
    """Fetch failed ETL jobs that are eligible for retry."""
    cutoff = datetime.utcnow() - timedelta(hours=hours_back)
    
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, job_name, job_type, source_id, retry_count, config
            FROM data_hub.etl_jobs
            WHERE status = 'failed'
              AND job_type = 'scrape'
              AND completed_at >= %s
              AND retry_count < %s
            ORDER BY priority DESC, created_at ASC
            LIMIT 10
        """, (cutoff, max_retries))
        return cur.fetchall()


def reset_job_for_retry(conn, job_id: str, retry_count: int):
    """Reset a failed job to queued status for retry."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE data_hub.etl_jobs
            SET status = 'queued',
                retry_count = %s,
                started_at = NULL,
                completed_at = NULL,
                last_error = NULL,
                updated_at = NOW()
            WHERE id = %s
        """, (retry_count + 1, job_id))
        
        # Add log entry
        cur.execute("""
            INSERT INTO data_hub.etl_job_logs (job_id, level, message, data, created_at)
            VALUES (%s, 'info', 'Job queued for retry', %s, NOW())
        """, (job_id, '{"retry_count": ' + str(retry_count + 1) + ', "scheduler": "retry_failed.py"}'))
        
    conn.commit()


def main():
    parser = argparse.ArgumentParser(description='Retry failed ETL scrape jobs')
    parser.add_argument('--max-retries', type=int, default=3, help='Maximum retry attempts')
    parser.add_argument('--hours-back', type=int, default=6, help='Hours to look back for failed jobs')
    parser.add_argument('--dry-run', action='store_true', help='Log but do not reset jobs')
    args = parser.parse_args()

    logger.info(f"Checking for failed jobs (last {args.hours_back} hours, max retries: {args.max_retries})")

    try:
        conn = get_db_connection()
        failed_jobs = get_failed_jobs(conn, args.hours_back, args.max_retries)

        if not failed_jobs:
            logger.info("No failed jobs eligible for retry")
            return 0

        logger.info(f"Found {len(failed_jobs)} failed jobs eligible for retry")

        retried = 0
        for job in failed_jobs:
            job_id = job['id']
            job_name = job['job_name']
            retry_count = job['retry_count']

            logger.info(f"Retrying job: {job_name} (id={job_id}, attempt {retry_count + 2})")

            if not args.dry_run:
                reset_job_for_retry(conn, job_id, retry_count)
                retried += 1

        logger.info(f"Queued {retried} jobs for retry")
        conn.close()
        return 0

    except Exception as e:
        logger.error(f"Error retrying failed jobs: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
