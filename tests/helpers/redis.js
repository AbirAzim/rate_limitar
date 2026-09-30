import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

const TEST_REDIS_URL = process.env.REDIS_TEST_URL || 'redis://localhost:6379';

/**
 * Connects to a test Redis/Valkey, or returns null if none is reachable so
 * Redis-backed tests are skipped instead of failing.
 */
export const connectTestRedis = async () => {
  const client = new Redis(TEST_REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 500,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  client.on('error', () => {});

  try {
    await client.connect();
    await client.ping();
    return client;
  } catch {
    client.disconnect();
    return null;
  }
};

// Unique per run, so tests never touch real data or each other's keys
export const testPrefix = () => `test:${randomUUID()}:`;

export const deleteKeys = async (client, prefix) => {
  let cursor = '0';
  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
    if (keys.length) await client.del(...keys);
    cursor = next;
  } while (cursor !== '0');
};
