import FixedWindow from './algorithms/FixedWindow.js';
import SlidingWindowCounter from './algorithms/SlidingWindowCounter.js';
import SlidingWindowLog from './algorithms/SlidingWindowLog.js';
import TokenBucket from './algorithms/TokenBucket.js';

export const ALGORITHMS = Object.freeze({
  'fixed-window': FixedWindow,
  'sliding-window-log': SlidingWindowLog,
  'sliding-window-counter': SlidingWindowCounter,
  'token-bucket': TokenBucket,
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
 * @param {(req) => string} [options.keyGenerator]  Defaults to client IP
 * @param {(req, res, next, info) => void} options.onLimitReached  Called when rejected
 */
export const createRateLimiter = ({
  algorithm,
  windowMs,
  max,
  keyGenerator = (req) => req.ip,
  onLimitReached,
}) => {
  const limiter = createAlgorithm(algorithm, { windowMs, max });

  const middleware = (req, res, next) => {
    const key = keyGenerator(req);
    const { allowed, remaining, resetMs } = limiter.consume(key);
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));

    // IETF RateLimit header fields (draft-ietf-httpapi-ratelimit-headers)
    res.setHeader('RateLimit-Policy', `${max};w=${Math.ceil(windowMs / 1000)}`);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (allowed) return next();

    res.setHeader('Retry-After', resetSeconds);
    onLimitReached(req, res, next, { key, retryAfterSeconds: resetSeconds });
  };

  // Exposed for graceful shutdown and tests
  middleware.limiter = limiter;
  return middleware;
};
