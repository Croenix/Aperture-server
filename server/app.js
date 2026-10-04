const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const filesRouter = require('./routes/files');
const presetsRouter = require('./routes/presets');
const fontsRouter = require('./routes/fonts');
const stickersRouter = require('./routes/stickers');
const { streamFileResponse } = require('./routes/files');
const healthRouter = require('./routes/health');
const keysRouter = require('./routes/keys');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/loggerMiddleware');

const app = express();

// Trust reverse proxies (e.g. Nginx, Cloudflare, Heroku, Traefik, Caddy)
app.set('trust proxy', true);

// Request Debug Logging Middleware
app.use(requestLogger);

// Security HTTP Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "*"],
        mediaSrc: ["'self'", "blob:", "*"],
        connectSrc: ["'self'", "*"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false, // Allow cross-origin media embedding
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// Cross-Origin Resource Sharing (CORS)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition']
  })
);

// Body Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global Rate Limiting for API routes
const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP. Please try again later.'
      }
    });
  }
});

// Serve Favicon (avoid 404 console errors)
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Serve Static Frontend UI
app.use(express.static(path.join(__dirname, '../public')));

// Public File Access Endpoints (spec: /files/f_8a72c91e4f2b)
app.get('/files/:id', (req, res, next) => {
  streamFileResponse(req, res, next, false);
});
app.get('/files/:id/view', (req, res, next) => {
  streamFileResponse(req, res, next, false);
});
app.get('/files/:id/download', (req, res, next) => {
  streamFileResponse(req, res, next, true);
});

// API Routes
app.use('/api/v1/presets', apiLimiter, presetsRouter);
app.use('/api/v1/preset', apiLimiter, presetsRouter);
app.use('/api/presets', apiLimiter, presetsRouter);
app.use('/api/preset', apiLimiter, presetsRouter);
app.use('/presets', apiLimiter, presetsRouter);
app.use('/preset', apiLimiter, presetsRouter);

app.use('/api/v1/fonts', apiLimiter, fontsRouter);
app.use('/api/v1/font', apiLimiter, fontsRouter);
app.use('/api/fonts', apiLimiter, fontsRouter);
app.use('/api/font', apiLimiter, fontsRouter);
app.use('/fonts', apiLimiter, fontsRouter);
app.use('/font', apiLimiter, fontsRouter);

app.use('/api/v1/stickers', apiLimiter, stickersRouter);
app.use('/api/v1/sticker', apiLimiter, stickersRouter);
app.use('/api/stickers', apiLimiter, stickersRouter);
app.use('/api/sticker', apiLimiter, stickersRouter);
app.use('/stickers', apiLimiter, stickersRouter);
app.use('/sticker', apiLimiter, stickersRouter);

app.use('/api/v1/files', apiLimiter, filesRouter);
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/keys', apiLimiter, keysRouter);

// Fallback for SPA or unknown routes
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

// Start Server if invoked directly
if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(`🚀 Aperture File Server running on ${config.baseUrl}`);
    console.log(`📁 Web UI:          ${config.baseUrl}/`);
    console.log(`🏥 Health Check:    ${config.baseUrl}/api/v1/health`);
    console.log(`📦 Max Upload Size: ${config.maxFileSizeMb} MB`);
    console.log(`🔑 Master Admin Key: ${config.seedKeys.admin}`);
    console.log(`🔑 Upload Key:       ${config.seedKeys.upload}`);
    console.log(`🔑 Read-Only Key:    ${config.seedKeys.read}`);
    console.log(`====================================================`);
  });

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    console.log(`\nReceived ${signal}. Gracefully terminating Aperture server...`);
    server.close(() => {
      console.log('Server closed successfully.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forced shutdown after 10s timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;
