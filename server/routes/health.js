const express = require('express');
const fs = require('fs');
const config = require('../config');
const { db } = require('../database');

const router = express.Router();

/**
 * GET /api/v1/health
 * Returns server health, database connectivity, storage status, and runtime metrics.
 */
router.get('/', (req, res) => {
  let dbStatus = 'healthy';
  let totalFiles = 0;
  let totalApiKeys = 0;

  try {
    const fileCountRow = db.prepare('SELECT COUNT(*) as count FROM files WHERE is_deleted = 0').get();
    totalFiles = fileCountRow ? fileCountRow.count : 0;

    const keyCountRow = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1').get();
    totalApiKeys = keyCountRow ? keyCountRow.count : 0;
  } catch (err) {
    dbStatus = 'degraded';
  }

  let storageStatus = 'healthy';
  try {
    fs.accessSync(config.uploadDirectory, fs.constants.W_OK | fs.constants.R_OK);
  } catch (err) {
    storageStatus = 'storage_directory_unavailable';
  }

  const memory = process.memoryUsage();

  return res.json({
    success: true,
    status: (dbStatus === 'healthy' && storageStatus === 'healthy') ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: {
      name: 'Aperture File Server',
      version: '1.0.0',
      baseUrl: config.baseUrl,
      storageProvider: config.storageProvider,
      maxFileSizeMb: config.maxFileSizeMb
    },
    components: {
      database: {
        status: dbStatus,
        activeFiles: totalFiles,
        activeApiKeys: totalApiKeys
      },
      storage: {
        status: storageStatus,
        provider: config.storageProvider
      }
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024))
      }
    }
  });
});

module.exports = router;
