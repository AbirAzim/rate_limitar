import config from '../config/index.js';
import logger from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  // Malformed JSON body from express.json()
  if (err.type === 'entity.parse.failed') {
    err.statusCode = 400;
    err.message = 'Malformed JSON in request body';
    err.isOperational = true;
  }

  const statusCode = err.statusCode || err.status || 500;
  const isOperational = err.isOperational || statusCode < 500;

  if (!isOperational || statusCode >= 500) {
    logger.error(err.message, { requestId: req.id, stack: err.stack });
  }

  res.status(statusCode).json({
    success: false,
    message: isOperational ? err.message : 'Internal Server Error',
    ...(err.details && { errors: err.details }),
    ...(!config.isProduction && statusCode >= 500 && { stack: err.stack }),
    requestId: req.id,
    timestamp: new Date().toISOString(),
  });
};

export default errorHandler;
