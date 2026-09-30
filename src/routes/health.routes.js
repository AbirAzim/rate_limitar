import { Router } from 'express';
import redis from '../lib/redis.js';

const router = Router();

// Liveness probe: process is up. Also reports which rate limit store is in use.
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    rateLimitStore: redis ? 'redis' : 'memory',
    ...(redis && { redis: redis.status }), // "ready" when connected
    timestamp: new Date().toISOString(),
  });
});

export default router;
