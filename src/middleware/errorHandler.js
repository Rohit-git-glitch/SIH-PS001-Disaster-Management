const config = require('../config/env');

/**
 * Centralized Global Error Handling Middleware
 * Intercepts errors passed via next(err) and formats a consistent JSON error response.
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  const response = {
    status: 'error',
    statusCode,
    message
  };

  // Include stack trace only during local development
  if (config.nodeEnv === 'development') {
    response.stack = err.stack;
  }

  console.error(`[Error] ${statusCode} - ${message}`);
  if (err.stack && config.nodeEnv === 'development') {
    console.error(err.stack);
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
