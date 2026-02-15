# -*- coding: utf-8 -*-
"""
ETL Job Tracker Extension for Scrapy

This extension integrates scrapy spiders with the PROPMETRIK ETL jobs tracking system.
It creates an ETL job record when a spider starts, tracks progress during execution,
and marks the job as complete/failed when the spider finishes.

This ensures all data ingestion flows through the unified Data Hub ETL pipeline.
"""
import logging
import socket
import os
from typing import Optional, Dict, Any
from datetime import datetime

import requests
from scrapy import signals
from scrapy.exceptions import NotConfigured
from scrapy.crawler import Crawler
from scrapy.spiders import Spider
from scrapy.statscollectors import StatsCollector

logger = logging.getLogger(__name__)


class EtlJobTrackerExtension:
    """
    Scrapy extension that integrates with the PROPMETRIK ETL job tracking system.
    
    This extension:
    1. Creates an ETL job record when a spider starts
    2. Marks the job as 'running' when crawling begins
    3. Tracks item counts and progress during execution
    4. Logs errors and warnings to the ETL job logs
    5. Completes or fails the job when the spider finishes
    
    Configuration (in settings.py):
        ETL_API_URL: Backend API URL (default: http://localhost:4000/api/v1)
        ETL_TRACKING_ENABLED: Enable/disable tracking (default: True)
        ETL_LOG_LEVEL: Minimum log level to send to API (default: 'warning')
        ETL_PROGRESS_INTERVAL: Items between progress updates (default: 50)
    """
    
    def __init__(
        self,
        api_url: str,
        enabled: bool = True,
        log_level: str = 'warning',
        progress_interval: int = 50,
        stats: Optional[StatsCollector] = None,
    ):
        self.api_url = api_url.rstrip('/')
        self.enabled = enabled
        self.log_level = log_level.lower()
        self.progress_interval = progress_interval
        self.stats = stats
        
        # Job tracking state
        self.job_id: Optional[str] = None
        self.source_slug: Optional[str] = None
        self.spider_name: Optional[str] = None
        
        # Counters
        self.items_scraped = 0
        self.items_dropped = 0
        self.items_saved = 0
        self.items_updated = 0
        self.items_deduplicated = 0
        self.last_progress_update = 0
        
        # Worker identification
        self.worker_id = f"scrapy-{os.getpid()}"
        self.worker_hostname = socket.gethostname()
        
        # Log levels mapping
        self.log_levels = {
            'debug': 10,
            'info': 20,
            'warning': 30,
            'error': 40,
            'critical': 50,
        }
        
        logger.info(f"ETL Tracker initialized: api_url={api_url}, enabled={enabled}")
    
    @classmethod
    def from_crawler(cls, crawler: Crawler) -> 'EtlJobTrackerExtension':
        """Create extension from crawler settings."""
        api_url = crawler.settings.get('ETL_API_URL', 'http://localhost:4000/api/v1')
        enabled = crawler.settings.getbool('ETL_TRACKING_ENABLED', True)
        log_level = crawler.settings.get('ETL_LOG_LEVEL', 'warning')
        progress_interval = crawler.settings.getint('ETL_PROGRESS_INTERVAL', 50)
        
        if not enabled:
            raise NotConfigured("ETL tracking is disabled")
        
        ext = cls(
            api_url=api_url,
            enabled=enabled,
            log_level=log_level,
            progress_interval=progress_interval,
            stats=crawler.stats,
        )
        
        # Connect signals
        crawler.signals.connect(ext.spider_opened, signal=signals.spider_opened)
        crawler.signals.connect(ext.spider_closed, signal=signals.spider_closed)
        crawler.signals.connect(ext.item_scraped, signal=signals.item_scraped)
        crawler.signals.connect(ext.item_dropped, signal=signals.item_dropped)
        crawler.signals.connect(ext.spider_error, signal=signals.spider_error)
        
        return ext
    
    # =========================================================================
    # API Communication
    # =========================================================================
    
    def _api_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        timeout: int = 10,
    ) -> Optional[Dict[str, Any]]:
        """Make a request to the ETL API."""
        url = f"{self.api_url}{endpoint}"
        
        try:
            response = requests.request(
                method=method,
                url=url,
                json=data,
                timeout=timeout,
                headers={'Content-Type': 'application/json'},
            )
            
            if response.status_code >= 400:
                logger.error(f"ETL API error: {response.status_code} - {response.text}")
                return None
            
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"ETL API request failed: {e}")
            return None
    
    def _create_job(self, spider: Spider) -> Optional[str]:
        """Create an ETL job for this spider run."""
        # Determine source slug from spider
        self.source_slug = getattr(spider, 'source_slug', None)
        if not self.source_slug:
            # Try to infer from spider name
            name_to_slug = {
                'gpc': 'gpc',
                'ghana_property_centre': 'gpc',
                'meqasa': 'meqasa',
                'meqasa_properties': 'meqasa',
                'housemaster': 'housemaster',
                'housemaster_ghana': 'housemaster',
                'realtor_international': 'realtor-international',
                'realtor_ghana': 'realtor-international',
                'jiji': 'jiji',
                'jiji_ghana': 'jiji',
                'facebook': 'facebook-groups',
                'facebook_groups': 'facebook-groups',
            }
            self.source_slug = name_to_slug.get(spider.name.lower())
        
        data = {
            'source_slug': self.source_slug,
            'job_type': 'extract',
            'job_name': f"Scrapy: {spider.name}",
            'priority': 0,
            'config': {
                'spider_name': spider.name,
                'spider_class': spider.__class__.__name__,
                'start_urls': getattr(spider, 'start_urls', [])[:5],  # First 5 URLs
                'worker_id': self.worker_id,
                'worker_hostname': self.worker_hostname,
            },
            'max_retries': 0,  # Spider handles its own retries
        }
        
        result = self._api_request('POST', '/data-hub/jobs', data)
        if result and result.get('success'):
            job_id = result['data']['id']
            logger.info(f"Created ETL job: {job_id}")
            return job_id
        
        logger.warning("Failed to create ETL job - continuing without tracking")
        return None
    
    def _start_job(self) -> bool:
        """Mark the ETL job as running."""
        if not self.job_id:
            return False
        
        data = {'worker_id': self.worker_id}
        result = self._api_request('POST', f'/data-hub/jobs/{self.job_id}/start', data)
        return result is not None and result.get('success', False)
    
    def _update_progress(self, force: bool = False) -> None:
        """Update job progress (throttled unless forced)."""
        if not self.job_id:
            return
        
        # Throttle updates
        total_items = self.items_scraped + self.items_dropped
        if not force and (total_items - self.last_progress_update) < self.progress_interval:
            return
        
        self.last_progress_update = total_items
        
        data = {
            'records_processed': self.items_scraped,
            'records_successful': self.items_saved,
            'records_failed': self.items_dropped,
            'properties_created': self.items_saved,
            'properties_updated': self.items_updated,
            'properties_deduplicated': self.items_deduplicated,
        }
        
        # Calculate progress percentage if we have a total estimate
        if self.stats:
            response_count = self.stats.get_value('downloader/response_count', 0)
            if response_count > 0:
                # Rough estimate: items per response
                items_per_response = max(1, self.items_scraped / response_count)
                pending = self.stats.get_value('scheduler/pending_requests', 0)
                estimated_total = self.items_scraped + (pending * items_per_response)
                if estimated_total > 0:
                    data['records_total'] = int(estimated_total)
                    data['progress_percentage'] = min(100, int((self.items_scraped / estimated_total) * 100))
        
        self._api_request('PATCH', f'/data-hub/jobs/{self.job_id}', data)
    
    def _complete_job(self, stats: Dict[str, Any]) -> None:
        """Mark the ETL job as completed."""
        if not self.job_id:
            return
        
        data = {
            'records_processed': self.items_scraped,
            'records_successful': self.items_saved,
            'records_failed': self.items_dropped,
            'records_skipped': self.items_deduplicated,
            'properties_created': self.items_saved,
            'properties_updated': self.items_updated,
            'properties_deduplicated': self.items_deduplicated,
            'result': {
                'scrapy_stats': {
                    'item_scraped_count': stats.get('item_scraped_count', 0),
                    'item_dropped_count': stats.get('item_dropped_count', 0),
                    'response_received_count': stats.get('downloader/response_count', 0),
                    'response_status_count': {
                        k.replace('downloader/response_status_count/', ''): v
                        for k, v in stats.items()
                        if k.startswith('downloader/response_status_count/')
                    },
                    'log_count_error': stats.get('log_count/ERROR', 0),
                    'log_count_warning': stats.get('log_count/WARNING', 0),
                    'finish_reason': stats.get('finish_reason', 'unknown'),
                    'elapsed_time_seconds': stats.get('elapsed_time_seconds', 0),
                },
                'source_slug': self.source_slug,
                'spider_name': self.spider_name,
            },
        }
        
        result = self._api_request('POST', f'/data-hub/jobs/{self.job_id}/complete', data)
        if result and result.get('success'):
            logger.info(f"Completed ETL job: {self.job_id}")
        else:
            logger.warning(f"Failed to complete ETL job: {self.job_id}")
    
    def _fail_job(self, error: str) -> None:
        """Mark the ETL job as failed."""
        if not self.job_id:
            return
        
        data = {
            'error': error,
            'should_retry': False,
        }
        
        result = self._api_request('POST', f'/data-hub/jobs/{self.job_id}/fail', data)
        if result and result.get('success'):
            logger.info(f"Failed ETL job: {self.job_id}")
        else:
            logger.warning(f"Failed to fail ETL job: {self.job_id}")
    
    def _add_log(
        self,
        level: str,
        message: str,
        step: Optional[str] = None,
        record_id: Optional[str] = None,
        error_stack: Optional[str] = None,
    ) -> None:
        """Add a log entry to the ETL job."""
        if not self.job_id:
            return
        
        # Check log level threshold
        if self.log_levels.get(level, 0) < self.log_levels.get(self.log_level, 0):
            return
        
        data = {
            'level': level,
            'message': message[:1000],  # Truncate long messages
            'step': step,
            'record_id': record_id,
            'error_stack': error_stack[:2000] if error_stack else None,
        }
        
        # Fire and forget - don't block on log entries
        try:
            self._api_request('POST', f'/data-hub/jobs/{self.job_id}/log', data, timeout=5)
        except Exception:
            pass  # Ignore log failures
    
    # =========================================================================
    # Signal Handlers
    # =========================================================================
    
    def spider_opened(self, spider: Spider) -> None:
        """Called when spider is opened."""
        self.spider_name = spider.name
        logger.info(f"Spider opened: {spider.name}")
        
        # Create ETL job
        self.job_id = self._create_job(spider)
        
        if self.job_id:
            # Start the job
            if self._start_job():
                self._add_log('info', f'Spider {spider.name} started', step='spider_opened')
            else:
                logger.warning(f"Failed to start ETL job: {self.job_id}")
    
    def spider_closed(self, spider: Spider, reason: str) -> None:
        """Called when spider is closed."""
        logger.info(f"Spider closed: {spider.name}, reason: {reason}")
        
        if not self.job_id:
            return
        
        # Get final stats
        stats = self.stats.get_stats() if self.stats else {}
        
        # Update final progress
        self._update_progress(force=True)
        
        # Complete or fail based on reason
        if reason == 'finished':
            self._add_log('info', f'Spider {spider.name} finished successfully', step='spider_closed')
            self._complete_job(stats)
        else:
            self._add_log('error', f'Spider {spider.name} closed: {reason}', step='spider_closed')
            self._fail_job(f'Spider closed: {reason}')
    
    def item_scraped(self, item: Dict[str, Any], response, spider: Spider) -> None:
        """Called when an item is scraped."""
        self.items_scraped += 1
        
        # Check if item was saved (created) or updated
        # This is set by the PostgresPipeline
        if item.get('_etl_created'):
            self.items_saved += 1
        elif item.get('_etl_updated'):
            self.items_updated += 1
        elif item.get('_etl_deduplicated'):
            self.items_deduplicated += 1
        else:
            # Assume saved if no flag set
            self.items_saved += 1
        
        # Update progress periodically
        self._update_progress()
    
    def item_dropped(self, item: Dict[str, Any], response, exception, spider: Spider) -> None:
        """Called when an item is dropped."""
        self.items_dropped += 1
        
        # Log the dropped item
        self._add_log(
            'warning',
            f'Item dropped: {str(exception)[:200]}',
            step='item_validation',
            record_id=item.get('source_id'),
        )
    
    def spider_error(self, failure, response, spider: Spider) -> None:
        """Called when a spider error occurs."""
        error_msg = str(failure.value) if hasattr(failure, 'value') else str(failure)
        
        self._add_log(
            'error',
            f'Spider error: {error_msg[:200]}',
            step='spider_error',
            error_stack=failure.getTraceback() if hasattr(failure, 'getTraceback') else None,
        )


# Convenience function to get job ID in pipelines
def get_current_job_id(spider: Spider) -> Optional[str]:
    """Get the current ETL job ID from the spider's crawler."""
    if hasattr(spider, 'crawler') and spider.crawler:
        for ext in spider.crawler.extensions.middlewares:
            if isinstance(ext, EtlJobTrackerExtension):
                return ext.job_id
    return None
