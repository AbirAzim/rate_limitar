import createApp from './app.js';
import config from './config/index.js';
import logger from './utils/logger.js';

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  logger.info(`Server running in ${config.env} mode`, {
    url: `http://${config.host}:${config.port}${config.apiPrefix}`,
  });
});

let shuttingDown = false;

const shutdown = (signal, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully`);

  server.close((err) => {
    if (err) {
      logger.error('Error while closing server', { error: err.message });
      process.exit(1);
    }
    logger.info('HTTP server closed');
    process.exit(exitCode);
  });

  server.closeIdleConnections();

  // Force exit if connections don't drain in time
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, config.shutdownTimeoutMs).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException', 1);
});
