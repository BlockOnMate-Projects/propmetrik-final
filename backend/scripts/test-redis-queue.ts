/**
 * Test Redis Queue Connection
 * Verifies that Bull queues can connect to Redis using REDIS_URL
 */

import Bull from 'bull';
import { config } from '../src/config';

function parseRedisUrl(url: string, db: number) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db,
  };
}

async function main() {
  const redisUrl = config.redis.url;
  if (!redisUrl) {
    console.error('REDIS_URL not set');
    process.exit(1);
  }

  console.log('REDIS_URL configured:', redisUrl.replace(/:([^@]+)@/, ':***@'));
  
  const redisConfig = parseRedisUrl(redisUrl, config.redis.databases.queue);
  console.log('Parsed Redis config:', { 
    host: redisConfig.host, 
    port: redisConfig.port,
    username: redisConfig.username,
    db: redisConfig.db,
    password: redisConfig.password ? '***' : undefined 
  });

  const queue = new Bull('test-queue', {
    redis: redisConfig,
    prefix: 'propmetrik:datahub',
    settings: {
      stalledInterval: 0,
    },
  });

  queue.on('error', (err) => console.error('Queue error:', err.message));

  try {
    console.log('\nAdding test job...');
    const job = await queue.add({ test: 'data', timestamp: new Date().toISOString() });
    console.log('✅ Job added successfully:', job.id);
    
    const counts = await queue.getJobCounts();
    console.log('Queue counts:', counts);
    
    // Clean up test job
    await job.remove();
    console.log('Test job removed');
    
    await queue.close();
    console.log('\n✅ Redis queue connection successful!');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Failed:', err.message);
    await queue.close();
    process.exit(1);
  }
}

main();
