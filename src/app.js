import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import config from './config/index.js';
import {
  errorHandler,
  notFound,
  rateLimiter,
  requestId,
  requestLogger,
} from './middlewares/index.js';
import healthRoutes from './routes/health.routes.js';
import apiRoutes from './routes/index.js';

const createApp = () => {
  const app = express();

  // Hop count of trusted reverse proxies, so req.ip is the real client IP
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  // Security & performance
  app.use(helmet());
  app.use(cors({ origin: config.cors.origin }));
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Observability
  app.use(requestId);
  app.use(requestLogger);

  // Routes
  app.use('/health', healthRoutes);
  app.use(config.apiPrefix, rateLimiter, apiRoutes);

  // 404 + centralized error handling (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default createApp;
