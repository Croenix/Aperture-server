const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl, ip, query } = req;

  const authHeader = req.headers.authorization;
  const maskedAuth = authHeader ? `${authHeader.slice(0, 15)}...` : (req.headers['x-api-key'] ? 'x-api-key' : 'None');

  logger.debug(`--> ${method} ${originalUrl}`, {
    ip,
    query: Object.keys(query).length > 0 ? query : undefined,
    auth: maskedAuth,
    contentType: req.headers['content-type']
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const logMsg = `<-- ${method} ${originalUrl} ${statusCode} (${duration}ms)`;

    if (statusCode >= 500) {
      logger.error(logMsg);
    } else if (statusCode >= 400) {
      logger.warn(logMsg);
    } else {
      logger.info(logMsg);
    }
  });

  next();
}

module.exports = {
  requestLogger
};
