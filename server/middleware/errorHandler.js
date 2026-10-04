const multer = require('multer');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Global 404 Not Found Middleware for unmatched routes.
 */
function notFoundHandler(req, res, next) {
  logger.warn(`Route Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint '${req.method} ${req.originalUrl}' does not exist.`
    }
  });
}

/**
 * Global Central Error Handler Middleware.
 */
function errorHandler(err, req, res, next) {
  // Log full error stack & request details
  logger.error(`Error processing ${req.method} ${req.originalUrl}: ${err.message}`, err);

  // If response headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle Multer upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `The uploaded file exceeds the maximum allowed size of ${config.maxFileSizeMb}MB.`
        }
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNEXPECTED_FIELD',
          message: `Unexpected form field '${err.field}'. Please upload using the 'file' field.`
        }
      });
    }
    return res.status(400).json({
      success: false,
      error: {
        code: `UPLOAD_${err.code}`,
        message: err.message || 'File upload error.'
      }
    });
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload in request body.'
      }
    });
  }

  // Handle custom application errors with predefined status and code
  const statusCode = err.status || err.statusCode || 500;
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  const message = err.message || 'An unexpected error occurred on the server.';

  const isProduction = process.env.NODE_ENV === 'production';
  const responseMessage = (statusCode === 500 && isProduction)
    ? 'An internal server error occurred.'
    : message;

  const errorResponse = {
    code: errorCode,
    message: responseMessage
  };

  // Add stack trace in debug mode or non-production
  if (config.debug || process.env.DEBUG === 'true' || !isProduction) {
    errorResponse.stack = err.stack ? err.stack.split('\n') : undefined;
  }

  return res.status(statusCode).json({
    success: false,
    error: errorResponse
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
