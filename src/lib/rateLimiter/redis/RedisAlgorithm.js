import { readFileSync } from 'node:fs';

const readScript = (name) =>
  readFileSync(new URL(`./scripts/${name}.lua`, import.meta.url), 'utf8');

const COMMON = readScript('_common');

export const REDIS_ALGORITHMS = Object.freeze([
  'fixed-window',
  'sliding-window-log',
  'sliding-window-counter',
  'token-bucket',
  'leaky-bucket',
]);

// Loaded once at startup, not per request
const SCRIPTS = Object.fromEntries(
  REDIS_ALGORITHMS.map((name) => [name, `${COMMON}\n${readScript(name)}`]),
);

/**
 * Redis/Valkey-backed rate limiter. Same contract as the in-memory algorithms,
 * but `consume` is async and state is shared by every app instance.
 *
 * Each algorithm runs as a single Lua script, so read-check-update is atomic:
 * concurrent requests from different instances can't race each other.
 */
export default class RedisAlgorithm {
  constructor(algorithm, { redis, windowMs, max, prefix = 'ratelimit:' }) {
    if (!SCRIPTS[algorithm]) throw new Error(`Unknown rate limit algorithm "${algorithm}"`);
    if (!Number.isInteger(max) || max <= 0) throw new TypeError('max must be a positive integer');
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new TypeError('windowMs must be a positive number');
    }

    this.redis = redis;
    this.windowMs = windowMs;
    this.max = max;
    // Algorithm in the key so switching algorithms never reads another's data shape
    this.prefix = `${prefix}${algorithm}:`;
    this.command = `rateLimit_${algorithm.replaceAll('-', '_')}`;

    // ioredis sends the script with EVALSHA (by hash) and falls back to EVAL once
    if (typeof redis[this.command] !== 'function') {
      redis.defineCommand(this.command, { numberOfKeys: 1, lua: SCRIPTS[algorithm] });
    }
  }

  /**
   * @param {string} key
   * @param {number} [now] Injectable clock for tests; defaults to the Redis server time
   */
  async consume(key, now) {
    const [allowed, remaining, resetMs, delayMs] = await this.redis[this.command](
      this.prefix + key,
      this.windowMs,
      this.max,
      now ?? '',
    );
    return { allowed: allowed === 1, remaining, resetMs, delayMs };
  }

  // Redis expires keys itself; nothing to clean up
  stop() {}
}
