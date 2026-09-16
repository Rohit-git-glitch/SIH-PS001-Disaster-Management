/**
 * 404 Not Found Middleware
 * Catches any unhandled route requests and returns a standard JSON error response.
 */
const notFound = (req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
};

module.exports = notFound;
