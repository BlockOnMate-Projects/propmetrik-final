import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

// Redis connection options
const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  username: config.redis.username,
  password: config.redis.password,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: false, // Disabled due to limited Redis ACL permissions
  lazyConnect: true,
};

// Create Redis clients for different purposes
export const redisAuth = new Redis({
  ...redisOptions,
  db: config.redis.databases.auth,
  keyPrefix: 'propmetrik:auth:',
});

export const redisCache = new Redis({
  ...redisOptions,
  db: config.redis.databases.cache,
  keyPrefix: 'propmetrik:cache:',
});

export const redisQueue = new Redis({
  ...redisOptions,
  db: config.redis.databases.queue,
  keyPrefix: 'propmetrik:queue:',
});

export const redisPubSub = new Redis({
  ...redisOptions,
  db: config.redis.databases.pubsub,
  keyPrefix: 'propmetrik:pubsub:',
});

// Event handlers for all clients
const clients = [
  { name: 'auth', client: redisAuth },
  { name: 'cache', client: redisCache },
  { name: 'queue', client: redisQueue },
  { name: 'pubsub', client: redisPubSub },
];

clients.forEach(({ name, client }) => {
  client.on('connect', () => {
    logger.debug(`Redis ${name} client connected`);
  });

  client.on('ready', () => {
    logger.info(`Redis ${name} client ready`);
  });

  client.on('error', (err) => {
    logger.error(`Redis ${name} client error`, { error: err.message });
  });

  client.on('close', () => {
    logger.debug(`Redis ${name} client connection closed`);
  });
});

/**
 * Cache service for application data
 * Gracefully handles Redis connection failures
 */
export const cache = {
  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redisCache.get(key);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      logger.debug('Cache get failed, Redis may be unavailable', { key });
      return null;
    }
  },

  /**
   * Set a value in cache with optional TTL (in seconds)
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds) {
        await redisCache.setex(key, ttlSeconds, serialized);
      } else {
        await redisCache.set(key, serialized);
      }
    } catch (error) {
      logger.debug('Cache set failed, Redis may be unavailable', { key });
    }
  },

  /**
   * Delete a key from cache
   */
  async del(key: string): Promise<void> {
    try {
      await redisCache.del(key);
    } catch (error) {
      logger.debug('Cache del failed, Redis may be unavailable', { key });
    }
  },

  /**
   * Delete keys matching a pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await redisCache.keys(pattern);
      if (keys.length === 0) return 0;
      return await redisCache.del(...keys);
    } catch (error) {
      logger.debug('Cache delPattern failed, Redis may be unavailable', { pattern });
      return 0;
    }
  },

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      return (await redisCache.exists(key)) === 1;
    } catch (error) {
      return false;
    }
  },

  /**
   * Set TTL on existing key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return (await redisCache.expire(key, ttlSeconds)) === 1;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get remaining TTL of a key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await redisCache.ttl(key);
    } catch (error) {
      return -1;
    }
  },
};

/**
 * Session management for authentication
 */
export const sessions = {
  /**
   * Store a session
   */
  async set(sessionId: string, data: Record<string, unknown>, ttlSeconds: number = 86400): Promise<void> {
    await redisAuth.setex(sessionId, ttlSeconds, JSON.stringify(data));
  },

  /**
   * Get a session
   */
  async get<T = Record<string, unknown>>(sessionId: string): Promise<T | null> {
    const value = await redisAuth.get(sessionId);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },

  /**
   * Delete a session
   */
  async del(sessionId: string): Promise<void> {
    await redisAuth.del(sessionId);
  },

  /**
   * Extend session TTL
   */
  async touch(sessionId: string, ttlSeconds: number): Promise<boolean> {
    return (await redisAuth.expire(sessionId, ttlSeconds)) === 1;
  },
};

/**
 * Pub/Sub for real-time events
 */
export const pubsub = {
  /**
   * Publish a message to a channel
   */
  async publish(channel: string, message: unknown): Promise<number> {
    const serialized = typeof message === 'string' ? message : JSON.stringify(message);
    return await redisPubSub.publish(channel, serialized);
  },

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string, callback: (message: string) => void): void {
    const subscriber = redisPubSub.duplicate();
    subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
  },
};

/**
 * Check Redis health
 */
export async function checkHealth(): Promise<{
  connected: boolean;
  latency: number;
  databases: Record<string, boolean>;
  clients: string[];
}> {
  const start = Date.now();
  const databases: Record<string, boolean> = {};
  const connectedClients: string[] = [];

  for (const { name, client } of clients) {
    try {
      await client.ping();
      databases[name] = true;
      connectedClients.push(name);
    } catch {
      databases[name] = false;
    }
  }

  return {
    connected: Object.values(databases).every(Boolean),
    latency: Date.now() - start,
    databases,
    clients: connectedClients,
  };
}

/**
 * Connect all Redis clients
 */
export async function connectAll(): Promise<void> {
  await Promise.all(clients.map(({ client }) => client.connect()));
  logger.info('All Redis clients connected');
}

/**
 * Disconnect all Redis clients
 */
export async function disconnectAll(): Promise<void> {
  await Promise.all(clients.map(({ client }) => client.quit()));
  logger.info('All Redis clients disconnected');
}

// Alias for backward compatibility
export const closeAllConnections = disconnectAll;

export default {
  auth: redisAuth,
  cache: redisCache,
  queue: redisQueue,
  pubsub: redisPubSub,
  cacheService: cache,
  sessions,
  pubsubService: pubsub,
  checkHealth,
  connectAll,
  disconnectAll,
  closeAllConnections,
};
