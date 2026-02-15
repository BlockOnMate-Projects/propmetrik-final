# Redis Configuration
# PROPMETRIK Platform

## Overview

Redis is used for multiple purposes in the PROPMETRIK platform:
- Session management
- Caching
- Job queues (Bull)
- Pub/Sub for real-time features

## Database Partitions

The Redis instance uses database partitions to separate different data types:

| Database | Purpose | Key Prefix | TTL |
|----------|---------|------------|-----|
| 0 | Authentication & Sessions | `propmetrik:auth:*` | Variable |
| 1 | Application Cache | `propmetrik:cache:*` | Variable |
| 2 | Job Queues (Bull) | `propmetrik:queue:*` | Until processed |
| 3 | Pub/Sub Channels | N/A | N/A |

## Connection Details

```
Host: redis.cedynhq.com
Port: 6379
Database: 2 (default)
Username: propmetrik_redis (pending update from propmgtiq_redis)
Password: <configured in .env>
TLS: Enabled for production
```

## Key Naming Conventions

### Authentication (DB 0)
```
propmetrik:auth:session:{session_id}     # User session data
propmetrik:auth:refresh:{user_id}        # Refresh token tracking
propmetrik:auth:otp:{phone/email}        # OTP codes
propmetrik:token:blacklist:{token_id}    # Revoked tokens
```

### Cache (DB 1)
```
propmetrik:cache:user:{user_id}          # User profile cache
propmetrik:cache:property:{property_id}  # Property details cache
propmetrik:cache:search:{query_hash}     # Search results cache
propmetrik:cache:config:{key}            # System config cache
propmetrik:cache:neighborhood:{id}       # Neighborhood data cache
propmetrik:cache:stats:{region}          # Regional statistics cache
```

### Rate Limiting
```
propmetrik:ratelimit:default:{key}       # Default rate limits
propmetrik:ratelimit:auth:{key}          # Auth endpoint limits
propmetrik:ratelimit:search:{key}        # Search rate limits
propmetrik:ratelimit:upload:{key}        # Upload rate limits
propmetrik:ratelimit:passwordReset:{key} # Password reset limits
```

### Job Queues (DB 2)
```
propmetrik:queue:email                   # Email sending queue
propmetrik:queue:sms                     # SMS sending queue
propmetrik:queue:notification            # Push notifications
propmetrik:queue:image-processing        # Image resize/optimize
propmetrik:queue:data-import             # Bulk data imports
propmetrik:queue:analytics               # Analytics processing
propmetrik:queue:search-index            # OpenSearch indexing
propmetrik:queue:report-generation       # Report generation
```

### Pub/Sub Channels (DB 3)
```
propmetrik:pubsub:property-updates       # Property listing changes
propmetrik:pubsub:price-changes          # Price change alerts
propmetrik:pubsub:new-listings           # New listing notifications
propmetrik:pubsub:user-activity          # User activity events
propmetrik:pubsub:system-events          # System-wide events
```

## TTL Strategy

| Data Type | TTL | Notes |
|-----------|-----|-------|
| User sessions | 24 hours | Extended on activity |
| OTP codes | 5 minutes | One-time use |
| Token blacklist | 1 hour | Until token naturally expires |
| Property cache | 15 minutes | Invalidated on update |
| User cache | 30 minutes | Invalidated on profile update |
| Search cache | 5 minutes | Short TTL for fresh results |
| Config cache | 1 hour | Invalidated on admin change |
| Rate limits | 60-3600 seconds | Based on limit type |

## Memory Management

### Eviction Policy
- Policy: `volatile-lru` (evict least recently used keys with TTL)
- Max memory: Configured per environment

### Key Expiration
- All cached data must have TTL set
- Use `SETEX` or `SET ... EX` for cache entries
- Periodic cleanup via Redis built-in expiration

## Usage Examples

### Session Management
```typescript
// Store session
await redisAuth.setex(`propmetrik:auth:session:${sessionId}`, 86400, JSON.stringify(sessionData));

// Get session
const session = await redisAuth.get(`propmetrik:auth:session:${sessionId}`);

// Delete session (logout)
await redisAuth.del(`propmetrik:auth:session:${sessionId}`);
```

### Caching
```typescript
// Cache with TTL
await cache.set(`user:${userId}`, userData, 1800); // 30 minutes

// Get from cache
const user = await cache.get(`user:${userId}`);

// Invalidate cache
await cache.del(`user:${userId}`);
```

### Rate Limiting
```typescript
const rateLimiter = new RateLimiterRedis({
  storeClient: redisCache,
  keyPrefix: 'propmetrik:ratelimit:api',
  points: 100,
  duration: 60,
});
```

### Pub/Sub
```typescript
// Publish
await pubsub.publish('property-updates', { propertyId, action: 'updated' });

// Subscribe
await pubsub.subscribe('property-updates', (message) => {
  console.log('Property updated:', message);
});
```

## Monitoring

### Key Metrics to Monitor
- Memory usage
- Connected clients
- Keys with TTL vs without
- Hit rate
- Evicted keys
- Slow log entries

### Commands for Debugging
```bash
# Check database size
redis-cli -h redis.cedynhq.com -p 6379 DBSIZE

# List keys with pattern
redis-cli -h redis.cedynhq.com -p 6379 KEYS "propmetrik:cache:*"

# Check TTL
redis-cli -h redis.cedynhq.com -p 6379 TTL "propmetrik:cache:user:123"

# Memory usage
redis-cli -h redis.cedynhq.com -p 6379 INFO memory

# Client list
redis-cli -h redis.cedynhq.com -p 6379 CLIENT LIST
```

## Failover & High Availability

For production:
- Configure Redis Sentinel or Redis Cluster
- Enable AOF persistence
- Set up replica nodes
- Configure automatic failover

## Security

- Require authentication (AUTH)
- Use TLS for connections
- Restrict network access
- Disable dangerous commands (FLUSHALL, KEYS in production)
- Use separate credentials per environment
