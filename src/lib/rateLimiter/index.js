import FixedWindow from './algorithms/FixedWindow.js';
import LeakyBucket from './algorithms/LeakyBucket.js';
import SlidingWindowCounter from './algorithms/SlidingWindowCounter.js';
import SlidingWindowLog from './algorithms/SlidingWindowLog.js';
import TokenBucket from './algorithms/TokenBucket.js';
import { ipToKey } from './ipKey.js';

export { ipToKey };

export const ALGORITHMS = Object.freeze({
  'fixed-window': FixedWindow,
  'sliding-window-log': SlidingWindowLog,
  'sliding-window-counter': SlidingWindowCounter,
  'token-bucket': TokenBucket,
  'leaky-bucket': LeakyBucket,
});

export const createAlgorithm = (name, options) => {
  const Algorithm = ALGORITHMS[name];
  if (!Algorithm) {
    throw new Error(
      `Unknown rate limit algorithm "${name}". Use one of: ${Object.keys(ALGORITHMS).join(', ')}`,
    );
  }
  return new Algorithm(options);
};

/**
 * Express middleware factory.
 *
 * @param {object} options
 * @param {string} options.algorithm   One of ALGORITHMS keys
 * @param {number} options.windowMs    Window length in ms
 * @param {number} options.max         Max requests per window per key
 * @param {(req) => string} [options.keyGenerator]  Defaults to normalized client IP
 * @param {number} [options.ipv6Subnet]  IPv6 prefix length used to group addresses (default 64)
 * @param {(req, res, next, info) => void} options.onLimitReached  Called when rejected
 */
export const createRateLimiter = ({
  algorithm,
  windowMs,
  max,
  ipv6Subnet = 64,
  keyGenerator = (req) => ipToKey(req.ip, ipv6Subnet),
  onLimitReached,
}) => {
  const limiter = createAlgorithm(algorithm, { windowMs, max });

  const middleware = (req, res, next) => {
    const key = keyGenerator(req);
    const { allowed, remaining, resetMs, delayMs = 0 } = limiter.consume(key);
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));

    // IETF RateLimit header fields (draft-ietf-httpapi-ratelimit-headers)
    res.setHeader('RateLimit-Policy', `${max};w=${Math.ceil(windowMs / 1000)}`);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (allowed) {
      if (delayMs <= 0) return next();

      // Leaky bucket: hold the request until its turn to leave the bucket.
      // Skip it if the client disconnected while waiting.
      const timer = setTimeout(() => {
        if (!res.destroyed && !res.writableEnded) next();
      }, delayMs);
      res.once('close', () => clearTimeout(timer));
      return;
    }

    res.setHeader('Retry-After', resetSeconds);
    onLimitReached(req, res, next, { key, retryAfterSeconds: resetSeconds });
  };

  // Exposed for graceful shutdown and tests
  middleware.limiter = limiter;
  return middleware;
};
