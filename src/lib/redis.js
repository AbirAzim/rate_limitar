import Redis from 'ioredis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Shared Redis/Valkey connection, or null when REDIS_URL isn't set
 * (the app then falls back to in-memory state).
 */
const createClient = () => {
  if (!config.redis.url) return null;

  const client = new Redis(config.redis.url, {
    // Fail fast so a slow/down Redis doesn't stall requests (limiter fails open)
    commandTimeout: config.redis.commandTimeoutMs,
    maxRetriesPerRequest: 1,
    // Reconnect with backoff: 50ms, 100ms, ... capped at 2s
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });

  client.on('ready', () => logger.info('Redis connected', { url: redactUrl(config.redis.url) }));
  client.on('error', (err) => logger.error('Redis error', { error: err.message }));

  return client;
};

// Never log passwords: redis://user:secret@host -> redis://user:***@host
const redactUrl = (url) => url.replace(/\/\/([^:@/]*):[^@/]*@/, '//$1:***@');

const redis = createClient();

export const closeRedis = async () => {
  if (!redis) return;
  try {
    await redis.quit();
    logger.info('Redis connection closed');
  } catch {
    redis.disconnect();
  }
};

export default redis;
