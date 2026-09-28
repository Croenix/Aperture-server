/**
 * Middleware generator to enforce specific permission scopes.
 * Supported scopes:
 * - 'files:read'
 * - 'files:upload'
 * - 'files:delete'
 * - 'files:manage' (Admin super-scope that grants all permissions)
 *
 * @param {string|string[]} requiredScopes - Single scope or array of scopes (any match satisfies)
 */
function requirePermission(requiredScopes) {
  const scopesList = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];

  return (req, res, next) => {
    if (!req.apiKeyInfo) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required before checking permissions.'
        }
      });
    }

    const userPermissions = req.apiKeyInfo.permissions || [];

    // 'files:manage' or '*' grants universal access to all endpoints
    const hasAdmin = userPermissions.includes('files:manage') || userPermissions.includes('*');
    if (hasAdmin) {
      return next();
    }

    // Check if user has at least one of the required scopes
    const hasPermission = scopesList.some(scope => userPermissions.includes(scope));

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `API key lacks required permission. Required: [${scopesList.join(', ')}]. Granted: [${userPermissions.join(', ')}]`
        }
      });
    }

    next();
  };
}

module.exports = {
  requirePermission
};
