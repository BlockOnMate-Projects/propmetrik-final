"""
Database Connection Pool for ML Services

Provides async and sync database access for ML/NLP services
using the same PostgreSQL instance as the Node.js backend.
"""

import logging
from typing import Optional, Any, Dict, List

import asyncpg
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

from .config import db_config

logger = logging.getLogger(__name__)


class AsyncDatabasePool:
    """Async connection pool for FastAPI endpoints."""

    def __init__(self):
        self._pool: Optional[asyncpg.Pool] = None

    async def initialize(self) -> None:
        """Create the async connection pool."""
        try:
            self._pool = await asyncpg.create_pool(
                dsn=db_config.url,
                min_size=2,
                max_size=10,
                command_timeout=30,
            )
            logger.info("Async database pool initialized")
        except Exception as e:
            logger.error(f"Failed to initialize async database pool: {e}")
            raise

    async def close(self) -> None:
        """Close the async connection pool."""
        if self._pool:
            await self._pool.close()
            logger.info("Async database pool closed")

    async def fetch(self, query: str, *args: Any) -> List[asyncpg.Record]:
        """Execute a query and return all rows."""
        if not self._pool:
            raise RuntimeError("Database pool not initialized")
        async with self._pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args: Any) -> Optional[asyncpg.Record]:
        """Execute a query and return the first row."""
        if not self._pool:
            raise RuntimeError("Database pool not initialized")
        async with self._pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args: Any) -> Any:
        """Execute a query and return a single value."""
        if not self._pool:
            raise RuntimeError("Database pool not initialized")
        async with self._pool.acquire() as conn:
            return await conn.fetchval(query, *args)

    async def execute(self, query: str, *args: Any) -> str:
        """Execute a query (INSERT/UPDATE/DELETE)."""
        if not self._pool:
            raise RuntimeError("Database pool not initialized")
        async with self._pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def executemany(self, query: str, args: List[tuple]) -> None:
        """Execute a query with multiple parameter sets."""
        if not self._pool:
            raise RuntimeError("Database pool not initialized")
        async with self._pool.acquire() as conn:
            await conn.executemany(query, args)


class SyncDatabaseConnection:
    """Synchronous database access for training pipelines."""

    @contextmanager
    def get_connection(self):
        """Get a synchronous database connection."""
        conn = psycopg2.connect(
            host=db_config.host,
            port=db_config.port,
            dbname=db_config.name,
            user=db_config.user,
            password=db_config.password,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def fetch_all(self, query: str, params: Optional[tuple] = None) -> List[Dict]:
        """Execute a query and return all rows as dicts."""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return [dict(row) for row in cur.fetchall()]

    def fetch_one(self, query: str, params: Optional[tuple] = None) -> Optional[Dict]:
        """Execute a query and return first row as dict."""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                row = cur.fetchone()
                return dict(row) if row else None

    def execute(self, query: str, params: Optional[tuple] = None) -> None:
        """Execute a write query."""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)


# Singleton instances
async_db = AsyncDatabasePool()
sync_db = SyncDatabaseConnection()
