const express = require('express');
const crypto = require('crypto');
const db = require('../database');
const { authenticateApiKey } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

router.get(
  '/',
  authenticateApiKey,
  requirePermission('files:manage'),
  async (req, res) => {
    const keys = await db.listApiKeys();
    return res.json({
      success: true,
      keys
    });
  }
);

router.post(
  '/',
  authenticateApiKey,
  requirePermission('files:manage'),
  async (req, res) => {
    const { name, permissions, customKey } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Key "name" is required.'
        }
      });
    }

    const validScopes = ['files:read', 'files:upload', 'files:delete', 'files:manage'];
    const assignedPermissions = Array.isArray(permissions)
      ? permissions.filter(p => validScopes.includes(p))
      : ['files:read', 'files:upload'];

    if (assignedPermissions.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PERMISSIONS',
          message: `At least one valid permission scope must be specified. Valid scopes: ${validScopes.join(', ')}`
        }
      });
    }

    const key = (customKey && typeof customKey === 'string' && customKey.trim().length >= 10)
      ? customKey.trim()
      : `apt_${crypto.randomBytes(16).toString('hex')}`;

    try {
      const createdKey = await db.createApiKey({
        key,
        name: name.trim(),
        permissions: assignedPermissions
      });

      return res.status(201).json({
        success: true,
        key: createdKey
      });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'KEY_ALREADY_EXISTS',
            message: 'An API key with this value already exists.'
          }
        });
      }
      throw err;
    }
  }
);

router.delete(
  '/:key',
  authenticateApiKey,
  requirePermission('files:manage'),
  async (req, res) => {
    const { key } = req.params;
    if (key === req.apiKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANNOT_DELETE_SELF',
          message: 'You cannot revoke the API key currently in use for this request.'
        }
      });
    }

    const deleted = await db.deleteApiKey(key);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'KEY_NOT_FOUND',
          message: 'API key not found.'
        }
      });
    }

    return res.json({
      success: true,
      message: 'API key successfully revoked.'
    });
  }
);

module.exports = router;
