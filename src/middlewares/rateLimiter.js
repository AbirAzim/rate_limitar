import config from '../config/index.js';
import { createRateLimiter } from '../lib/rateLimiter/index.js';
import redis from '../lib/redis.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

const rateLimiter = createRateLimiter({
  algorithm: config.rateLimit.algorithm,
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  ipv6Subnet: config.rateLimit.ipv6Subnet,
  redis, // null -> in-memory store
  onStoreError: (err, req) => {
    logger.error('Rate limit store unavailable, allowing request', {
      requestId: req.id,
      error: err.message,
    });
  },
  onLimitReached: (req, res, next, { key, retryAfterSeconds }) => {
    logger.warn('Rate limit exceeded', { requestId: req.id, key, retryAfterSeconds });
    next(ApiError.tooManyRequests(`Too many requests, retry after ${retryAfterSeconds}s`));
  },
});

export default rateLimiter;
