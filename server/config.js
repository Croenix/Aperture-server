const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const parseNumber = (val, fallback) => {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
};

const port = parseNumber(process.env.PORT, 3000);

const config = {
  port,
  baseUrl: process.env.BASE_URL ? process.env.BASE_URL.replace(/\/+$/, '') : `http://localhost:${port}`,
  maxFileSizeMb: parseNumber(process.env.MAX_FILE_SIZE_MB, 100),
  get maxFileSizeBytes() {
    return this.maxFileSizeMb * 1024 * 1024;
  },
  uploadDirectory: path.resolve(process.env.UPLOAD_DIRECTORY || './storage/uploads'),
  databasePath: path.resolve(process.env.DATABASE_PATH || './storage/database.sqlite'),
  storageProvider: process.env.STORAGE_PROVIDER || 'local',
  
  // Rate limiting
  rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000), // 15 minutes
  rateLimitMax: parseNumber(process.env.RATE_LIMIT_MAX, 300), // 300 requests per window
  
  // Predefined default seed keys (used to seed SQLite if table is empty)
  seedKeys: {
    admin: process.env.ADMIN_API_KEY || 'aperture_adm_secret_key_2026',
    upload: process.env.UPLOAD_API_KEY || 'aperture_upl_secret_key_2026',
    read: process.env.READ_API_KEY || 'aperture_ro_secret_key_2026'
  },

  // Allowed MIME types or extensions (empty array allows all except dangerous blacklisted)
  allowedExtensions: process.env.ALLOWED_EXTENSIONS
    ? process.env.ALLOWED_EXTENSIONS.split(',').map(ext => ext.trim().toLowerCase().replace(/^\./, ''))
    : [],
  
  // Disallowed dangerous executable extensions
  blockedExtensions: [
    'exe', 'bat', 'cmd', 'sh', 'com', 'msi', 'vbs', 'ps1', 'scr', 'pif', 'jar'
  ]
};

module.exports = config;
