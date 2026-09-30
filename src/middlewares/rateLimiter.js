import config from '../config/index.js';
import { createRateLimiter } from '../lib/rateLimiter/index.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

const rateLimiter = createRateLimiter({
  algorithm: config.rateLimit.algorithm,
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  onLimitReached: (req, res, next, { key, retryAfterSeconds }) => {
    logger.warn('Rate limit exceeded', { requestId: req.id, key, retryAfterSeconds });
    next(ApiError.tooManyRequests(`Too many requests, retry after ${retryAfterSeconds}s`));
  },
});

export default rateLimiter;
