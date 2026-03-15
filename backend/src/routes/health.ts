import { Router, Request, Response } from 'express';
import { pool, checkHealth as checkDbHealth, checkPostGIS } from '../database';
import { checkHealth as checkRedisHealth } from '../database/redis';
import { checkHealth as checkOpenSearchHealth } from '../database/opensearch';
import { checkHealth as checkMinioHealth } from '../database/minio';
import { asyncHandler } from '../middleware/errorHandler';
import { getStartupReport } from '../utils/startupReport';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    [key: string]: {
      status: 'up' | 'down' | 'degraded';
      latency?: number;
      details?: unknown;
    };
  };
}

/**
 * Kubernetes liveness probe - basic check that app is running
 * GET /health/live
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Kubernetes readiness probe - checks if app can handle requests
 * GET /health/ready
 */
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Check critical services only
  const [dbHealth, redisHealth] = await Promise.all([
    checkDbHealth(),
    checkRedisHealth(),
  ]);
  
  const isReady = dbHealth.connected && redisHealth.connected;
  
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    checks: {
      database: dbHealth.connected ? 'pass' : 'fail',
      redis: redisHealth.connected ? 'pass' : 'fail',
    },
    latency: Date.now() - startTime,
  });
}));

/**
 * Detailed health check with all services
 * GET /health
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Run all health checks in parallel
  const [dbHealth, postgisHealth, redisHealth, osHealth, minioHealth] = await Promise.allSettled([
    (async () => {
      const start = Date.now();
      const healthy = await checkDbHealth();
      return { healthy, latency: Date.now() - start };
    })(),
    (async () => {
      const start = Date.now();
      const available = await checkPostGIS();
      return { available, latency: Date.now() - start };
    })(),
    (async () => {
      const start = Date.now();
      const health = await checkRedisHealth();
      return { ...health, latency: Date.now() - start };
    })(),
    (async () => {
      const start = Date.now();
      const healthy = await checkOpenSearchHealth();
      return { healthy, latency: Date.now() - start };
    })(),
    (async () => {
      const start = Date.now();
      const health = await checkMinioHealth();
      return { ...health, latency: Date.now() - start };
    })(),
  ]);
  
  // Process results
  const services: HealthStatus['services'] = {};
  
  // PostgreSQL
  if (dbHealth.status === 'fulfilled') {
    services.postgresql = {
      status: dbHealth.value.healthy ? 'up' : 'down',
      latency: dbHealth.value.latency,
    };
  } else {
    services.postgresql = { status: 'down' };
  }
  
  // PostGIS
  if (postgisHealth.status === 'fulfilled') {
    services.postgis = {
      status: postgisHealth.value.available ? 'up' : 'down',
      latency: postgisHealth.value.latency,
    };
  } else {
    services.postgis = { status: 'down' };
  }
  
  // Redis
  if (redisHealth.status === 'fulfilled') {
    services.redis = {
      status: redisHealth.value.connected ? 'up' : 'down',
      latency: redisHealth.value.latency,
      details: { clients: redisHealth.value.clients },
    };
  } else {
    services.redis = { status: 'down' };
  }
  
  // OpenSearch
  if (osHealth.status === 'fulfilled') {
    services.opensearch = {
      status: osHealth.value.healthy ? 'up' : 'down',
      latency: osHealth.value.latency,
    };
  } else {
    services.opensearch = { status: 'down' };
  }
  
  // MinIO
  if (minioHealth.status === 'fulfilled') {
    services.minio = {
      status: minioHealth.value.connected ? 'up' : 'down',
      latency: minioHealth.value.latency,
      details: { buckets: minioHealth.value.buckets },
    };
  } else {
    services.minio = { status: 'down' };
  }
  
  // Determine overall status
  const criticalServices = ['postgresql', 'redis'];
  const allServicesUp = Object.values(services).every((s) => s.status === 'up');
  const criticalServicesUp = criticalServices.every(
    (name) => services[name]?.status === 'up'
  );
  
  let overallStatus: HealthStatus['status'];
  if (allServicesUp) {
    overallStatus = 'healthy';
  } else if (criticalServicesUp) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'unhealthy';
  }
  
  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    services,
  };
  
  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;
  res.status(httpStatus).json(healthStatus);
}));

/**
 * Database pool statistics
 * GET /health/db
 */
router.get('/db', asyncHandler(async (req: Request, res: Response) => {
  const poolStats = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
  
  res.json({
    status: 'ok',
    pool: poolStats,
  });
}));

/**
 * Bootstrap startup report — shows every step, timing, and errors.
 * GET /health/startup
 */
router.get('/startup', (req: Request, res: Response) => {
  const report = getStartupReport();
  const httpStatus = report.overallStatus === 'failed' ? 503 : 200;
  res.status(httpStatus).json(report);
});

export default router;
