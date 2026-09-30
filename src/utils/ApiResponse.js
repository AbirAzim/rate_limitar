export const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null } = {}) =>
  res.status(statusCode).json({
    success: true,
    message,
    data,
    requestId: res.locals.requestId,
    timestamp: new Date().toISOString(),
  });
