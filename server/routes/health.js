const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const config = require('../config');
const db = require('../database');
const { getBaseUrl } = require('../utils/urlHelper');

const router = express.Router();

/**
 * GET /api/v1/health & /api/health
 * Returns server health, MongoDB Atlas status, Cloudinary status, storage status, and metrics.
 */
router.get('/', async (req, res) => {
  let dbStatus = 'healthy';
  let totalFiles = 0;
  let totalApiKeys = 0;

  try {
    const list = await db.listFiles({ limit: 1 });
    totalFiles = list.pagination ? list.pagination.total : 0;
    const keys = await db.listApiKeys();
    totalApiKeys = keys.length;
  } catch (err) {
    dbStatus = 'degraded';
  }

  // MongoDB Atlas Live Status Check
  const mongoConnected = mongoose.connection.readyState === 1;
  const mongoStatus = mongoConnected ? 'connected' : (mongoose.connection.readyState === 2 ? 'connecting' : 'disconnected');

  // Cloudinary Live Status Check
  let cloudinaryStatus = 'not_configured';
  let cloudinaryCloudName = config.cloudinary.cloudName || null;
  if (config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret) {
    cloudinaryStatus = 'configured';
    try {
      cloudinary.config({
        cloud_name: config.cloudinary.cloudName,
        api_key: config.cloudinary.apiKey,
        api_secret: config.cloudinary.apiSecret
      });
      const ping = await cloudinary.api.ping();
      if (ping && ping.status === 'ok') {
        cloudinaryStatus = 'connected';
      }
    } catch (err) {
      cloudinaryStatus = 'error';
    }
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
    status: (mongoConnected && dbStatus === 'healthy') ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: {
      name: 'Aperture File Server',
      version: '1.0.0',
      baseUrl: getBaseUrl(req),
      storageProvider: config.storageProvider,
      maxFileSizeMb: config.maxFileSizeMb
    },
    connections: {
      mongodb: {
        status: mongoStatus,
        connected: mongoConnected,
        uriConfigured: Boolean(config.mongodbUri)
      },
      cloudinary: {
        status: cloudinaryStatus,
        connected: cloudinaryStatus === 'connected' || cloudinaryStatus === 'configured',
        cloudName: cloudinaryCloudName,
        folder: config.cloudinary.folder
      },
      server: {
        status: 'online',
        port: config.port
      }
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
