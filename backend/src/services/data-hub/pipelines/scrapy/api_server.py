#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PROPMETRIK Scrapy Worker — HTTP API Server

Exposes a lightweight Flask API so the Node.js backend can trigger spider
runs and check status.  Scrapy's CrawlerProcess owns the Twisted reactor,
which can only start once per process, so each /run request spawns
run_spider.py as a subprocess.

Endpoints:
    POST /run          — start a spider (or "all")
    GET  /status/<pid> — poll a running spider
    GET  /health       — liveness probe
"""

import os
import sys
import json
import signal
import subprocess
import threading
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from flask import Flask, request, jsonify
from dotenv import load_dotenv

# ── Environment ──────────────────────────────────────────────────────────
_script_dir = os.path.dirname(os.path.abspath(__file__))
_backend_env = os.path.join(_script_dir, '..', '..', '..', '..', '..', '.env')
load_dotenv(os.path.normpath(_backend_env), override=False)

# ── Logging ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('scrapy_api')

# ── App ──────────────────────────────────────────────────────────────────
app = Flask(__name__)

# In-memory job tracker  {pid: {spider, status, started_at, ...}}
_jobs: Dict[int, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()

# Path to the runner script (co-located)
RUN_SPIDER_PATH = os.path.join(_script_dir, 'run_spider.py')

AVAILABLE_SPIDERS = [
    'meqasa', 'gpc', 'housemaster', 'realtor_international',
    'airbnb_ghana', 'daily_graphic_legal', 'tonaton',
]

SPIDER_ALIASES = {'realtor': 'realtor_international'}


def _resolve_spider(name: str) -> str:
    return SPIDER_ALIASES.get(name, name)


def _reap_finished() -> None:
    """Check all tracked processes and update status for finished ones."""
    with _jobs_lock:
        for pid, info in list(_jobs.items()):
            if info['status'] != 'running':
                continue
            proc: Optional[subprocess.Popen] = info.get('_proc')
            if proc is None:
                continue
            retcode = proc.poll()
            if retcode is not None:
                stdout = proc.stdout.read() if proc.stdout else ''
                stderr = proc.stderr.read() if proc.stderr else ''
                info['status'] = 'completed' if retcode == 0 else 'failed'
                info['exit_code'] = retcode
                info['finished_at'] = datetime.now(timezone.utc).isoformat()
                info['stdout_tail'] = stdout[-4000:] if stdout else ''
                info['stderr_tail'] = stderr[-4000:] if stderr else ''


# ── Routes ───────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    """Liveness / readiness probe."""
    _reap_finished()
    running = sum(1 for j in _jobs.values() if j['status'] == 'running')
    return jsonify({
        'status': 'ok',
        'running_jobs': running,
        'available_spiders': AVAILABLE_SPIDERS,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })


@app.route('/run', methods=['POST'])
def run_spider():
    """
    Start a spider run.

    Body (JSON):
        spider:      str   — spider name or "all"
        scrape_type: str   — "full" | "update"  (default "update")
        max_pages:   int   — 0 = unlimited       (default 0)
        etl_job_id:  str   — optional ETL job id for tracking
    """
    body = request.get_json(silent=True) or {}
    spider_raw = body.get('spider', '').strip()

    if not spider_raw:
        return jsonify({'error': 'missing required field: spider'}), 400

    scrape_type = body.get('scrape_type', 'update')
    max_pages = body.get('max_pages', 0)
    etl_job_id = body.get('etl_job_id')

    # Resolve spider name
    if spider_raw == 'all':
        spider_args = ['all']
    else:
        resolved = _resolve_spider(spider_raw)
        if resolved not in AVAILABLE_SPIDERS:
            return jsonify({'error': f'unknown spider: {spider_raw}'}), 400
        spider_args = [resolved]

    # Build command
    cmd = [sys.executable, RUN_SPIDER_PATH] + spider_args
    cmd += ['--scrape-type', scrape_type]
    if max_pages and int(max_pages) > 0:
        cmd += ['--max-pages', str(int(max_pages))]

    logger.info('Starting spider: %s (type=%s, max_pages=%s, etl_job=%s)',
                spider_raw, scrape_type, max_pages, etl_job_id)

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=_script_dir,
            env={**os.environ},
        )
    except Exception as exc:
        logger.error('Failed to spawn spider process: %s', exc)
        return jsonify({'error': str(exc)}), 500

    job_info = {
        'pid': proc.pid,
        'spider': spider_raw,
        'scrape_type': scrape_type,
        'max_pages': max_pages,
        'etl_job_id': etl_job_id,
        'status': 'running',
        'started_at': datetime.now(timezone.utc).isoformat(),
        '_proc': proc,  # internal — not serialised
    }

    with _jobs_lock:
        _jobs[proc.pid] = job_info

    return jsonify({
        'pid': proc.pid,
        'spider': spider_raw,
        'status': 'running',
        'started_at': job_info['started_at'],
    }), 202


@app.route('/status/<int:pid>', methods=['GET'])
def job_status(pid: int):
    """Poll the status of a spider run by PID."""
    _reap_finished()

    with _jobs_lock:
        info = _jobs.get(pid)

    if info is None:
        return jsonify({'error': 'job not found'}), 404

    # Return a serialisable copy (drop _proc)
    out = {k: v for k, v in info.items() if not k.startswith('_')}
    return jsonify(out)


@app.route('/run-sync', methods=['POST'])
def run_spider_sync():
    """
    Synchronous spider run — blocks until the spider finishes.
    Use for single spiders or when the caller wants the result immediately.

    Same body as /run.  Returns full result including stdout/stderr tails.
    Timeout: controlled by SCRAPY_SYNC_TIMEOUT env (default 3600s / 1h).
    """
    body = request.get_json(silent=True) or {}
    spider_raw = body.get('spider', '').strip()

    if not spider_raw:
        return jsonify({'error': 'missing required field: spider'}), 400

    scrape_type = body.get('scrape_type', 'update')
    max_pages = body.get('max_pages', 0)
    etl_job_id = body.get('etl_job_id')

    if spider_raw == 'all':
        spider_args = ['all']
    else:
        resolved = _resolve_spider(spider_raw)
        if resolved not in AVAILABLE_SPIDERS:
            return jsonify({'error': f'unknown spider: {spider_raw}'}), 400
        spider_args = [resolved]

    cmd = [sys.executable, RUN_SPIDER_PATH] + spider_args
    cmd += ['--scrape-type', scrape_type]
    if max_pages and int(max_pages) > 0:
        cmd += ['--max-pages', str(int(max_pages))]

    timeout = int(os.environ.get('SCRAPY_SYNC_TIMEOUT', '3600'))

    logger.info('Starting SYNC spider: %s (type=%s, max_pages=%s, etl_job=%s)',
                spider_raw, scrape_type, max_pages, etl_job_id)

    started_at = datetime.now(timezone.utc).isoformat()
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=_script_dir,
            env={**os.environ},
        )

        status = 'completed' if result.returncode == 0 else 'failed'
        return jsonify({
            'spider': spider_raw,
            'status': status,
            'exit_code': result.returncode,
            'started_at': started_at,
            'finished_at': datetime.now(timezone.utc).isoformat(),
            'stdout_tail': (result.stdout or '')[-4000:],
            'stderr_tail': (result.stderr or '')[-4000:],
        }), 200 if status == 'completed' else 500

    except subprocess.TimeoutExpired:
        logger.error('Spider %s timed out after %ds', spider_raw, timeout)
        return jsonify({
            'spider': spider_raw,
            'status': 'timeout',
            'started_at': started_at,
            'timeout_seconds': timeout,
        }), 504


# ── Main ─────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('SCRAPY_API_PORT', '5000'))
    logger.info('Scrapy API server starting on port %d', port)
    app.run(host='0.0.0.0', port=port, threaded=True)
