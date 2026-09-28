const db = require('../database');

/**
 * Middleware to authenticate requests using an API Key.
 * Accepts API key via:
 * 1. Authorization header: "Bearer <YOUR_API_KEY>"
 * 2. Header: "x-api-key: <YOUR_API_KEY>"
 */
function authenticateApiKey(req, res, next) {
  let apiKey = null;

  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7).trim();
  } else if (req.headers['x-api-key']) {
    apiKey = String(req.headers['x-api-key']).trim();
  }

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide an API key via Bearer token in the Authorization header.'
      }
    });
  }

  const keyRecord = db.getApiKey(apiKey);
  if (!keyRecord || !keyRecord.isActive) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'The provided API key is invalid or inactive.'
      }
    });
  }

  // Update key last used timestamp asynchronously
  try {
    db.updateApiKeyUsage(apiKey);
  } catch (err) {
    // Non-critical, do not block request
  }

  // Attach key information to request
  req.apiKey = apiKey;
  req.apiKeyInfo = keyRecord;

  next();
}

/**
 * Optional authentication middleware.
 * If an API key is provided and valid, it attaches it to req.apiKeyInfo.
 * If no key is provided, request continues as unauthenticated.
 */
function optionalAuth(req, res, next) {
  let apiKey = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7).trim();
  } else if (req.headers['x-api-key']) {
    apiKey = String(req.headers['x-api-key']).trim();
  }

  if (apiKey) {
    const keyRecord = db.getApiKey(apiKey);
    if (keyRecord && keyRecord.isActive) {
      req.apiKey = apiKey;
      req.apiKeyInfo = keyRecord;
      try {
        db.updateApiKeyUsage(apiKey);
      } catch (err) {}
    }
  }

  next();
}

module.exports = {
  authenticateApiKey,
  optionalAuth
};
