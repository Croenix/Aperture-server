const mongoose = require('mongoose');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { formatTitle, deriveFontFamily } = require('./utils/fileId');

// Initialize Mongoose Schema for MongoDB Atlas
const fileSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  originalName: { type: String, required: true },
  filename: { type: String, required: true },
  title: { type: String },
  fontFamily: { type: String, index: true },
  language: { type: String, default: 'English', index: true },
  orientation: { type: String, index: true },
  keywords: [{ type: String, index: true }],
  mainCategory: { type: String, default: 'image', index: true },
  subCategory: { type: String, default: 'general', index: true },
  category: { type: String, default: 'general', index: true },
  format: { type: String },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  storageProvider: { type: String, default: 'cloudinary' },
  storagePath: { type: String, required: true },
  directUrl: { type: String },
  storageMetadata: { type: mongoose.Schema.Types.Mixed },
  isPremium: { type: Boolean, default: false, index: true },
  uploadedAt: { type: String, default: () => new Date().toISOString(), index: true },
  createdBy: { type: String },
  isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, collection: 'files' });

const apiKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  permissions: [{ type: String }],
  createdAt: { type: String, default: () => new Date().toISOString() },
  lastUsedAt: { type: String },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true, collection: 'api_keys' });

const FileModel = mongoose.model('File', fileSchema);
const ApiKeyModel = mongoose.model('ApiKey', apiKeySchema);

if (config.mongodbUri) {
  const mongoOpts = {
    tls: true,
    tlsAllowInvalidCertificates: true,
    family: 4,
    serverSelectionTimeoutMS: 10000
  };

  logger.debug('Connecting to MongoDB Atlas...', { uri: config.mongodbUri.replace(/:[^:@]+@/, ':****@') });
  mongoose.connect(config.mongodbUri, mongoOpts)
    .then(() => {
      logger.info('🍃 MongoDB Atlas Connected Successfully!');
      seedMongoApiKeys();
      syncSqliteToMongo();
    })
    .catch(err => {
      logger.warn('⚠️ MongoDB Atlas Connection Warning:', err.message);
      logger.info('🔄 Operating with local database engine & Cloudinary storage fallback.');
    });
}

// Fallback SQLite Initialization
const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -64000');
db.pragma('mmap_size = 268435456');
db.pragma('temp_store = MEMORY');

// Pre-compiled statement handles
let stmtGetFileById;
let stmtGetApiKey;
let stmtUpdateApiKeyUsage;
let stmtSoftDelete;
let stmtHardDelete;
let stmtListCategories;
let stmtListFontLanguages;
let stmtListApiKeys;
let stmtDeleteApiKey;
let stmtInsertApiKey;
let stmtCreateFile;

function initPreparedStatements() {
  stmtGetFileById = db.prepare('SELECT * FROM files WHERE id = ? AND is_deleted = 0');
  stmtGetApiKey = db.prepare('SELECT * FROM api_keys WHERE key = ? AND is_active = 1');
  stmtUpdateApiKeyUsage = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE key = ?');
  stmtSoftDelete = db.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?');
  stmtHardDelete = db.prepare('DELETE FROM files WHERE id = ?');
  stmtListCategories = db.prepare(`
    SELECT main_category, sub_category, COUNT(*) as count 
    FROM files 
    WHERE is_deleted = 0 
    GROUP BY main_category, sub_category 
    ORDER BY main_category ASC, count DESC, sub_category ASC
  `);
  stmtListFontLanguages = db.prepare(`SELECT DISTINCT language FROM files WHERE is_deleted = 0 AND main_category = 'font'`);
  stmtListApiKeys = db.prepare('SELECT key, name, permissions, created_at, last_used_at, is_active FROM api_keys ORDER BY created_at DESC');
  stmtDeleteApiKey = db.prepare('DELETE FROM api_keys WHERE key = ?');
  stmtInsertApiKey = db.prepare('INSERT INTO api_keys (key, name, permissions, created_at, is_active) VALUES (?, ?, ?, ?, 1)');
  stmtCreateFile = db.prepare(`
    INSERT OR REPLACE INTO files (
      id, original_name, filename, title, font_family, language, orientation, keywords, main_category, sub_category, category, format, mime_type, size,
      storage_provider, storage_path, direct_url, storage_metadata, is_premium,
      uploaded_at, created_by, is_deleted
    ) VALUES (
      @id, @originalName, @filename, @title, @fontFamily, @language, @orientation, @keywordsStr, @mainCategory, @subCategory, @category, @format, @mimeType, @size,
      @storageProvider, @storagePath, @directUrl, @storageMetadata, @isPremium,
      @uploadedAt, @createdBy, 0
    )
  `);
}

// In-Memory RAM Caches
const apiKeyCache = new Map();
const API_KEY_CACHE_TTL = 60 * 1000;

let categoryCache = null;
let categoryCacheExpiry = 0;

let fontLangCache = null;
let fontLangCacheExpiry = 0;

function invalidateMetadataCache() {
  categoryCache = null;
  categoryCacheExpiry = 0;
  fontLangCache = null;
  fontLangCacheExpiry = 0;
}

function clearApiKeyCache(key = null) {
  if (key) {
    apiKeyCache.delete(key);
  } else {
    apiKeyCache.clear();
  }
}

function initSqliteSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      filename TEXT NOT NULL,
      title TEXT,
      font_family TEXT,
      language TEXT NOT NULL DEFAULT 'English',
      orientation TEXT,
      keywords TEXT,
      main_category TEXT NOT NULL DEFAULT 'image',
      sub_category TEXT NOT NULL DEFAULT 'general',
      category TEXT NOT NULL DEFAULT 'general',
      format TEXT,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_path TEXT NOT NULL,
      direct_url TEXT,
      storage_metadata TEXT,
      is_premium INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL,
      created_by TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      permissions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_files_is_deleted_uploaded ON files (is_deleted, uploaded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_files_main_sub ON files (is_deleted, main_category, sub_category);
    CREATE INDEX IF NOT EXISTS idx_files_main_lang ON files (is_deleted, main_category, language);
    CREATE INDEX IF NOT EXISTS idx_files_main_ori ON files (is_deleted, main_category, orientation);
    CREATE INDEX IF NOT EXISTS idx_files_is_premium ON files (is_deleted, is_premium);
    CREATE INDEX IF NOT EXISTS idx_files_font_family ON files (is_deleted, font_family);
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (key, is_active);
  `);

  // Migration check: Ensure missing columns are added if an existing sqlite DB was initialized with an older schema
  const existingColumns = db.prepare(`PRAGMA table_info(files)`).all().map(c => c.name);
  const requiredColumns = [
    { name: 'title', type: 'TEXT' },
    { name: 'font_family', type: 'TEXT' },
    { name: 'language', type: "TEXT NOT NULL DEFAULT 'English'" },
    { name: 'orientation', type: 'TEXT' },
    { name: 'keywords', type: 'TEXT' },
    { name: 'main_category', type: "TEXT NOT NULL DEFAULT 'image'" },
    { name: 'sub_category', type: "TEXT NOT NULL DEFAULT 'general'" },
    { name: 'category', type: "TEXT NOT NULL DEFAULT 'general'" },
    { name: 'format', type: 'TEXT' },
    { name: 'direct_url', type: 'TEXT' },
    { name: 'storage_metadata', type: 'TEXT' },
    { name: 'is_premium', type: 'INTEGER NOT NULL DEFAULT 0' }
  ];

  for (const col of requiredColumns) {
    if (!existingColumns.includes(col.name)) {
      try {
        db.exec(`ALTER TABLE files ADD COLUMN ${col.name} ${col.type}`);
        logger.info(`Migrated SQLite table 'files': Added missing column '${col.name}'`);
      } catch (colErr) {
        logger.warn(`Failed to alter table files for column '${col.name}':`, colErr.message);
      }
    }
  }

  initPreparedStatements();
  seedSqliteApiKeys();
}

function seedSqliteApiKeys() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM api_keys').get().count;
  if (count === 0) {
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO api_keys (key, name, permissions, created_at, is_active)
      VALUES (@key, @name, @permissions, @createdAt, 1)
    `);

    const defaultKeys = [
      { key: config.seedKeys.admin, name: 'Administrator Master Key', permissions: 'files:read,files:upload,files:delete,files:manage', createdAt: now },
      { key: config.seedKeys.upload, name: 'Upload & Read Service Key', permissions: 'files:read,files:upload', createdAt: now },
      { key: config.seedKeys.read, name: 'Read-Only Key', permissions: 'files:read', createdAt: now }
    ];

    const transaction = db.transaction((keys) => {
      for (const k of keys) insert.run(k);
    });
    transaction(defaultKeys);
  }
}

async function seedMongoApiKeys() {
  try {
    const count = await ApiKeyModel.countDocuments();
    if (count === 0) {
      const now = new Date().toISOString();
      const defaultKeys = [
        { key: config.seedKeys.admin, name: 'Administrator Master Key', permissions: ['files:read', 'files:upload', 'files:delete', 'files:manage'], createdAt: now },
        { key: config.seedKeys.upload, name: 'Upload & Read Service Key', permissions: ['files:read', 'files:upload'], createdAt: now },
        { key: config.seedKeys.read, name: 'Read-Only Key', permissions: ['files:read'], createdAt: now }
      ];
      await ApiKeyModel.insertMany(defaultKeys);
    }
  } catch (err) {
    // Non-blocking
  }
}

async function syncSqliteToMongo() {
  try {
    const sqliteRows = db.prepare('SELECT * FROM files WHERE is_deleted = 0').all();
    for (const r of sqliteRows) {
      const exists = await FileModel.exists({ id: r.id });
      if (!exists) {
        await FileModel.create({
          id: r.id,
          originalName: r.original_name,
          filename: r.filename,
          title: r.title || r.original_name,
          fontFamily: r.font_family || (r.main_category === 'font' ? deriveFontFamily(r.title || r.original_name, r.original_name) : null),
          language: r.language || 'English',
          orientation: r.orientation || null,
          keywords: r.keywords ? (typeof r.keywords === 'string' ? (r.keywords.startsWith('[') ? JSON.parse(r.keywords) : r.keywords.split(',').map(k => k.trim())) : r.keywords) : [],
          mainCategory: r.main_category || 'image',
          subCategory: r.sub_category || r.category || 'general',
          category: r.sub_category || r.category || 'general',
          format: r.format,
          mimeType: r.mime_type,
          size: r.size,
          storageProvider: r.storage_provider || 'local',
          storagePath: r.storage_path,
          directUrl: r.direct_url,
          storageMetadata: r.storage_metadata ? JSON.parse(r.storage_metadata) : null,
          isPremium: Boolean(r.is_premium),
          uploadedAt: r.uploaded_at,
          createdBy: r.created_by,
          isDeleted: Boolean(r.is_deleted)
        });
      }
    }
  } catch (err) {
    // Sync non-blocking
  }
}

function escapeRegex(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isMongoActive() {
  return Boolean(config.mongodbUri) && mongoose.connection.readyState === 1;
}

initSqliteSchema();

function _mapRecord(docOrRow) {
  if (!docOrRow) return null;
  const isMongo = Boolean(docOrRow._id || docOrRow.toObject);
  const data = isMongo ? (docOrRow.toObject ? docOrRow.toObject() : docOrRow) : docOrRow;

  const mainCategory = data.mainCategory || data.main_category || 'image';
  const subCategory = data.subCategory || data.sub_category || data.category || 'general';
  const isPremium = Boolean(data.isPremium || data.is_premium);

  const origName = data.originalName || data.original_name;
  const cleanTitle = formatTitle(data.title || origName, origName);
  const fontFamily = data.fontFamily || data.font_family || (mainCategory === 'font' ? deriveFontFamily(cleanTitle, origName) : null);
  const language = data.language || 'English';

  let parsedKeywords = [];
  if (data.keywords) {
    if (Array.isArray(data.keywords)) {
      parsedKeywords = data.keywords.map(k => String(k).trim()).filter(Boolean);
    } else if (typeof data.keywords === 'string') {
      try {
        parsedKeywords = JSON.parse(data.keywords);
      } catch (e) {
        parsedKeywords = data.keywords.split(',').map(k => k.trim()).filter(Boolean);
      }
    }
  }

  const orientation = data.orientation ? String(data.orientation).trim().toLowerCase() : null;

  return {
    id: data.id,
    originalName: origName,
    filename: data.filename,
    title: cleanTitle,
    fontFamily: fontFamily,
    language: language,
    orientation: orientation,
    keywords: parsedKeywords,
    mainCategory,
    subCategory,
    category: subCategory,
    format: data.format,
    isPremium,
    premium: isPremium ? 'Yes' : 'No',
    pricing: isPremium ? 'Paid' : 'Free',
    mimeType: data.mimeType || data.mime_type,
    size: data.size,
    storageProvider: data.storageProvider || data.storage_provider,
    storagePath: data.storagePath || data.storage_path,
    directUrl: data.directUrl || data.direct_url,
    storageMetadata: typeof data.storageMetadata === 'string' ? JSON.parse(data.storageMetadata) : (data.storageMetadata || data.storage_metadata),
    uploadedAt: data.uploadedAt || data.uploaded_at,
    createdBy: data.createdBy || data.created_by,
    isDeleted: Boolean(data.isDeleted || data.is_deleted)
  };
}

const dbOperations = {
  async createFile(fileRecord) {
    const mainCategory = (fileRecord.mainCategory || fileRecord.main_category || 'image').trim().toLowerCase();
    const subCategory = (fileRecord.subCategory || fileRecord.sub_category || fileRecord.category || 'general').trim();

    let formatVal = fileRecord.format || fileRecord.stickerFormat || null;
    if (formatVal && typeof formatVal === 'string') {
      formatVal = formatVal.trim().toUpperCase();
    }

    const isPrem = Boolean(fileRecord.isPremium || fileRecord.is_premium || fileRecord.pricing === 'Paid' || fileRecord.pricing === 'paid');
    const titleVal = formatTitle(fileRecord.title || fileRecord.originalName, fileRecord.originalName);
    const fontFamilyVal = fileRecord.fontFamily || fileRecord.font_family || (mainCategory === 'font' ? deriveFontFamily(titleVal, fileRecord.originalName, fileRecord.fontFamily || fileRecord.font_family) : null);
    const languageVal = (fileRecord.language || fileRecord.lang || 'English').trim() || 'English';

    let orientationVal = fileRecord.orientation || fileRecord.aspectRatio || null;
    if (orientationVal && typeof orientationVal === 'string') {
      orientationVal = orientationVal.trim().toLowerCase();
    }

    let keywordsVal = [];
    if (fileRecord.keywords) {
      if (Array.isArray(fileRecord.keywords)) {
        keywordsVal = fileRecord.keywords.map(k => String(k).trim()).filter(Boolean);
      } else if (typeof fileRecord.keywords === 'string') {
        keywordsVal = fileRecord.keywords.split(',').map(k => k.trim()).filter(Boolean);
      }
    }
    keywordsVal = keywordsVal.slice(0, 20);

    const recordData = {
      id: fileRecord.id,
      originalName: fileRecord.originalName,
      filename: fileRecord.filename,
      title: titleVal,
      fontFamily: fontFamilyVal,
      language: languageVal,
      orientation: orientationVal,
      keywords: keywordsVal,
      mainCategory,
      subCategory,
      category: subCategory,
      format: formatVal,
      mimeType: fileRecord.mimeType,
      size: fileRecord.size,
      storageProvider: fileRecord.storageProvider || config.storageProvider || 'cloudinary',
      storagePath: fileRecord.storagePath,
      directUrl: fileRecord.directUrl || null,
      storageMetadata: fileRecord.storageMetadata || null,
      isPremium: isPrem,
      uploadedAt: fileRecord.uploadedAt || new Date().toISOString(),
      createdBy: fileRecord.createdBy || null,
      isDeleted: false
    };

    if (isMongoActive()) {
      try {
        await FileModel.create(recordData);
      } catch (err) {
        console.warn('⚠️ MongoDB createFile failed, continuing with SQLite:', err.message);
      }
    }

    stmtCreateFile.run({
      ...recordData,
      keywordsStr: JSON.stringify(keywordsVal),
      isPremium: isPrem ? 1 : 0,
      storageMetadata: recordData.storageMetadata ? JSON.stringify(recordData.storageMetadata) : null
    });

    invalidateMetadataCache();
    return await this.getFileById(fileRecord.id);
  },

  async getFileById(id) {
    if (!id) return null;
    if (isMongoActive()) {
      try {
        const doc = await FileModel.findOne({ id, isDeleted: false }).lean();
        if (doc) return _mapRecord(doc);
      } catch (err) {
        console.warn('⚠️ MongoDB getFileById failed, falling back to SQLite:', err.message);
      }
    }
    const row = stmtGetFileById.get(id);
    if (row) return _mapRecord(row);
    return null;
  },

  async listFiles({ page = 1, limit = 20, search = '', category = '', mainCategory = '', subCategory = '', isPremium, pricing, language, orientation, keyword } = {}) {
    if (isMongoActive()) {
      try {
        const query = { isDeleted: false };

        if (mainCategory && mainCategory.trim() && mainCategory.trim().toLowerCase() !== 'all') {
          query.mainCategory = new RegExp(`^${escapeRegex(mainCategory.trim())}$`, 'i');
        }

        const activeSub = (subCategory || category || '').trim();
        if (activeSub && activeSub.toLowerCase() !== 'all') {
          const safeSub = escapeRegex(activeSub);
          query.$or = [
            { subCategory: new RegExp(`^${safeSub}$`, 'i') },
            { category: new RegExp(`^${safeSub}$`, 'i') }
          ];
        }

        const activeLang = (language || '').trim();
        if (activeLang && activeLang.toLowerCase() !== 'all') {
          query.language = new RegExp(`^${escapeRegex(activeLang)}$`, 'i');
        }

        const activeOri = (orientation || '').trim();
        if (activeOri && activeOri.toLowerCase() !== 'all') {
          query.orientation = new RegExp(`^${escapeRegex(activeOri)}$`, 'i');
        }

        const activeKw = (keyword || '').trim();
        if (activeKw && activeKw.toLowerCase() !== 'all') {
          query.keywords = new RegExp(escapeRegex(activeKw), 'i');
        }

        const targetPremium = isPremium !== undefined ? isPremium : (pricing !== undefined ? (pricing === 'Paid' || pricing === 'paid' || pricing === 'true' || pricing === '1') : undefined);
        if (targetPremium !== undefined && targetPremium !== null && targetPremium !== 'all') {
          query.isPremium = (targetPremium === true || targetPremium === 'true' || targetPremium === 1 || targetPremium === '1');
        }

        if (search && search.trim()) {
          const safeSearch = escapeRegex(search.trim());
          const regex = new RegExp(safeSearch, 'i');
          const searchOr = [
            { originalName: regex },
            { title: regex },
            { id: regex },
            { subCategory: regex },
            { mainCategory: regex },
            { category: regex },
            { mimeType: regex },
            { language: regex },
            { orientation: regex },
            { keywords: regex }
          ];
          if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: searchOr }];
            delete query.$or;
          } else {
            query.$or = searchOr;
          }
        }

        const skip = Math.max(0, (page - 1) * limit);
        const total = await FileModel.countDocuments(query);
        const docs = await FileModel.find(query).sort({ uploadedAt: -1 }).skip(skip).limit(limit).lean();

        return {
          files: docs.map(d => _mapRecord(d)),
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit) || 1
          }
        };
      } catch (err) {
        console.warn('⚠️ MongoDB listFiles query error, falling back to SQLite:', err.message);
      }
    }

    const offset = Math.max(0, (page - 1) * limit);
    let countSql = 'SELECT COUNT(*) as total FROM files WHERE is_deleted = 0';
    let querySql = 'SELECT * FROM files WHERE is_deleted = 0';
    const params = [];
    const countParams = [];

    if (mainCategory && mainCategory.trim() && mainCategory.trim().toLowerCase() !== 'all') {
      const cleanMain = mainCategory.trim().toLowerCase();
      countSql += ' AND LOWER(main_category) = LOWER(?)';
      querySql += ' AND LOWER(main_category) = LOWER(?)';
      countParams.push(cleanMain);
      params.push(cleanMain);
    }

    const activeSub = (subCategory || category || '').trim();
    if (activeSub && activeSub.toLowerCase() !== 'all') {
      countSql += ' AND (LOWER(sub_category) = LOWER(?) OR LOWER(category) = LOWER(?))';
      querySql += ' AND (LOWER(sub_category) = LOWER(?) OR LOWER(category) = LOWER(?))';
      countParams.push(activeSub, activeSub);
      params.push(activeSub, activeSub);
    }

    const activeLang = (language || '').trim();
    if (activeLang && activeLang.toLowerCase() !== 'all') {
      countSql += ' AND LOWER(language) = LOWER(?)';
      querySql += ' AND LOWER(language) = LOWER(?)';
      countParams.push(activeLang);
      params.push(activeLang);
    }

    const activeOri = (orientation || '').trim();
    if (activeOri && activeOri.toLowerCase() !== 'all') {
      countSql += ' AND LOWER(orientation) = LOWER(?)';
      querySql += ' AND LOWER(orientation) = LOWER(?)';
      countParams.push(activeOri.toLowerCase());
      params.push(activeOri.toLowerCase());
    }

    const activeKw = (keyword || '').trim();
    if (activeKw && activeKw.toLowerCase() !== 'all') {
      const kwPattern = `%${activeKw}%`;
      countSql += ' AND keywords LIKE ?';
      querySql += ' AND keywords LIKE ?';
      countParams.push(kwPattern);
      params.push(kwPattern);
    }

    const targetPremium = isPremium !== undefined ? isPremium : (pricing !== undefined ? (pricing === 'Paid' || pricing === 'paid' || pricing === 'true' || pricing === '1') : undefined);
    if (targetPremium !== undefined && targetPremium !== null && targetPremium !== 'all') {
      const premVal = (targetPremium === true || targetPremium === 'true' || targetPremium === 1 || targetPremium === '1') ? 1 : 0;
      countSql += ' AND is_premium = ?';
      querySql += ' AND is_premium = ?';
      countParams.push(premVal);
      params.push(premVal);
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      countSql += ' AND (original_name LIKE ? OR title LIKE ? OR id LIKE ? OR sub_category LIKE ? OR main_category LIKE ? OR category LIKE ? OR mime_type LIKE ? OR language LIKE ? OR orientation LIKE ? OR keywords LIKE ?)';
      querySql += ' AND (original_name LIKE ? OR title LIKE ? OR id LIKE ? OR sub_category LIKE ? OR main_category LIKE ? OR category LIKE ? OR mime_type LIKE ? OR language LIKE ? OR orientation LIKE ? OR keywords LIKE ?)';
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    querySql += ' ORDER BY uploaded_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const total = db.prepare(countSql).get(...countParams).total;
    const rows = db.prepare(querySql).all(...params);

    return {
      files: rows.map(r => _mapRecord(r)),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  },

  async listCategories() {
    const now = Date.now();
    if (categoryCache && now < categoryCacheExpiry) {
      return categoryCache;
    }

    let result;
    if (isMongoActive()) {
      try {
        const docs = await FileModel.aggregate([
          { $match: { isDeleted: false } },
          { $group: { _id: { mainCategory: "$mainCategory", subCategory: "$subCategory" }, count: { $sum: 1 } } },
          { $sort: { "_id.mainCategory": 1, count: -1 } }
        ]);

        const hierarchy = { image: [], text: [], font: [], sticker: [] };
        const raw = [];

        docs.forEach(d => {
          const main = d._id.mainCategory || 'image';
          const sub = d._id.subCategory || 'general';
          if (!hierarchy[main]) hierarchy[main] = [];
          hierarchy[main].push({ subCategory: sub, count: d.count });
          raw.push({ main_category: main, sub_category: sub, count: d.count });
        });

        result = { raw, hierarchy };
      } catch (err) {
        console.warn('⚠️ MongoDB listCategories failed, falling back to SQLite:', err.message);
      }
    }

    if (!result) {
      const rows = stmtListCategories.all();
      const hierarchy = { image: [], text: [], font: [], sticker: [] };
      rows.forEach(r => {
        const main = r.main_category || 'image';
        if (!hierarchy[main]) hierarchy[main] = [];
        hierarchy[main].push({ subCategory: r.sub_category, count: r.count });
      });
      result = { raw: rows, hierarchy };
    }

    categoryCache = result;
    categoryCacheExpiry = now + 15000; // Cache for 15s
    return result;
  },

  async listFontLanguages() {
    const now = Date.now();
    if (fontLangCache && now < fontLangCacheExpiry) {
      return fontLangCache;
    }

    const defaultLangs = ['English', 'Malayalam', 'Tamil'];
    let result;

    if (isMongoActive()) {
      try {
        const distincts = await FileModel.distinct('language', { isDeleted: false, mainCategory: 'font' });
        const set = new Set([...defaultLangs, ...(distincts || []).filter(Boolean)]);
        result = Array.from(set);
      } catch (err) {
        console.warn('⚠️ MongoDB listFontLanguages failed, falling back to SQLite:', err.message);
      }
    }

    if (!result) {
      try {
        const rows = stmtListFontLanguages.all();
        const set = new Set([...defaultLangs, ...rows.map(r => r.language).filter(Boolean)]);
        result = Array.from(set);
      } catch (err) {
        result = defaultLangs;
      }
    }

    fontLangCache = result;
    fontLangCacheExpiry = now + 15000; // Cache for 15s
    return result;
  },

  async updateFile(id, updates = {}) {
    const fields = [];
    const params = [];
    const mongoUpdates = {};

    const targetLang = updates.language || updates.lang;
    if (targetLang !== undefined && typeof targetLang === 'string' && targetLang.trim()) {
      const cleanLang = targetLang.trim();
      fields.push('language = ?');
      params.push(cleanLang);
      mongoUpdates.language = cleanLang;
    }

    if (updates.orientation !== undefined) {
      const ori = updates.orientation ? String(updates.orientation).trim().toLowerCase() : null;
      fields.push('orientation = ?');
      params.push(ori);
      mongoUpdates.orientation = ori;
    }

    if (updates.keywords !== undefined) {
      let kw = [];
      if (Array.isArray(updates.keywords)) {
        kw = updates.keywords.map(k => String(k).trim()).filter(Boolean);
      } else if (typeof updates.keywords === 'string') {
        kw = updates.keywords.split(',').map(k => k.trim()).filter(Boolean);
      }
      kw = kw.slice(0, 20);
      fields.push('keywords = ?');
      params.push(JSON.stringify(kw));
      mongoUpdates.keywords = kw;
    }

    const targetFontFamily = updates.fontFamily || updates.font_family || updates.family;
    if (targetFontFamily !== undefined && typeof targetFontFamily === 'string' && targetFontFamily.trim()) {
      const formattedFamily = formatTitle(targetFontFamily.trim(), '');
      fields.push('font_family = ?');
      params.push(formattedFamily);
      mongoUpdates.fontFamily = formattedFamily;
    }

    if (updates.title !== undefined && typeof updates.title === 'string' && updates.title.trim()) {
      fields.push('title = ?');
      params.push(updates.title.trim());
      mongoUpdates.title = updates.title.trim();
      
      if (!targetFontFamily) {
        const existing = await this.getFileById(id);
        if (existing && existing.mainCategory === 'font') {
          const reDerived = deriveFontFamily(updates.title.trim(), existing.originalName);
          fields.push('font_family = ?');
          params.push(reDerived);
          mongoUpdates.fontFamily = reDerived;
        }
      }
    }

    if (updates.mainCategory !== undefined && typeof updates.mainCategory === 'string' && updates.mainCategory.trim()) {
      fields.push('main_category = ?');
      params.push(updates.mainCategory.trim().toLowerCase());
      mongoUpdates.mainCategory = updates.mainCategory.trim().toLowerCase();
    }

    const newSub = updates.subCategory || updates.category;
    if (newSub !== undefined && typeof newSub === 'string' && newSub.trim()) {
      fields.push('sub_category = ?');
      fields.push('category = ?');
      params.push(newSub.trim());
      params.push(newSub.trim());
      mongoUpdates.subCategory = newSub.trim();
      mongoUpdates.category = newSub.trim();
    }

    if (updates.isPremium !== undefined || updates.pricing !== undefined) {
      const premVal = (updates.isPremium === true || updates.isPremium === 'true' || updates.pricing === 'Paid' || updates.pricing === 'paid') ? 1 : 0;
      fields.push('is_premium = ?');
      params.push(premVal);
      mongoUpdates.isPremium = Boolean(premVal);
    }

    if (updates.format !== undefined || updates.stickerFormat !== undefined) {
      const fmtVal = (updates.format || updates.stickerFormat || '').trim().toUpperCase();
      if (fmtVal) {
        fields.push('format = ?');
        params.push(fmtVal);
        mongoUpdates.format = fmtVal;
      }
    }

    if (isMongoActive() && Object.keys(mongoUpdates).length > 0) {
      try {
        await FileModel.updateOne({ id }, { $set: mongoUpdates });
      } catch (err) {
        console.warn('⚠️ MongoDB updateFile failed, continuing with SQLite:', err.message);
      }
    }

    if (fields.length > 0) {
      params.push(id);
      const sql = `UPDATE files SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`;
      db.prepare(sql).run(...params);
    }

    invalidateMetadataCache();
    return await this.getFileById(id);
  },

  async softDeleteFile(id) {
    if (isMongoActive()) {
      try {
        await FileModel.updateOne({ id }, { $set: { isDeleted: true } });
      } catch (err) {
        console.warn('⚠️ MongoDB softDeleteFile failed:', err.message);
      }
    }
    const res = stmtSoftDelete.run(id).changes > 0;
    invalidateMetadataCache();
    return res;
  },

  async hardDeleteFile(id) {
    if (isMongoActive()) {
      try {
        await FileModel.deleteOne({ id });
      } catch (err) {
        console.warn('⚠️ MongoDB hardDeleteFile failed:', err.message);
      }
    }
    const res = stmtHardDelete.run(id).changes > 0;
    invalidateMetadataCache();
    return res;
  },

  async getApiKey(key) {
    if (!key) return null;
    const now = Date.now();
    const cached = apiKeyCache.get(key);
    if (cached && (now - cached.timestamp < API_KEY_CACHE_TTL)) {
      return cached.data;
    }

    if (isMongoActive()) {
      try {
        const doc = await ApiKeyModel.findOne({ key, isActive: true }).lean();
        if (doc) {
          const res = {
            key: doc.key,
            name: doc.name,
            permissions: doc.permissions,
            createdAt: doc.createdAt,
            lastUsedAt: doc.lastUsedAt,
            isActive: doc.isActive
          };
          apiKeyCache.set(key, { data: res, timestamp: now });
          return res;
        }
      } catch (err) {
        console.warn('⚠️ MongoDB getApiKey failed, falling back to SQLite:', err.message);
      }
    }

    const row = stmtGetApiKey.get(key);
    if (!row) {
      apiKeyCache.delete(key);
      return null;
    }
    const res = {
      key: row.key,
      name: row.name,
      permissions: row.permissions.split(',').map(p => p.trim()),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      isActive: Boolean(row.is_active)
    };
    apiKeyCache.set(key, { data: res, timestamp: now });
    return res;
  },

  async updateApiKeyUsage(key) {
    const nowStr = new Date().toISOString();
    setImmediate(async () => {
      if (isMongoActive()) {
        try {
          await ApiKeyModel.updateOne({ key }, { $set: { lastUsedAt: nowStr } });
        } catch (err) {}
      }
      try {
        stmtUpdateApiKeyUsage.run(nowStr, key);
      } catch (err) {}
    });
  },

  async listApiKeys() {
    if (isMongoActive()) {
      try {
        const docs = await ApiKeyModel.find({}).sort({ createdAt: -1 }).lean();
        return docs.map(d => ({
          key: d.key,
          name: d.name,
          permissions: d.permissions,
          createdAt: d.createdAt,
          lastUsedAt: d.lastUsedAt,
          isActive: d.isActive
        }));
      } catch (err) {
        console.warn('⚠️ MongoDB listApiKeys failed, falling back to SQLite:', err.message);
      }
    }

    const rows = stmtListApiKeys.all();
    return rows.map(r => ({
      key: r.key,
      name: r.name,
      permissions: r.permissions.split(',').map(p => p.trim()),
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      isActive: Boolean(r.is_active)
    }));
  },

  async createApiKey({ key, name, permissions }) {
    const nowStr = new Date().toISOString();
    if (isMongoActive()) {
      try {
        await ApiKeyModel.create({ key, name, permissions, createdAt: nowStr, isActive: true });
      } catch (err) {}
    }
    stmtInsertApiKey.run(key, name, permissions.join(','), nowStr);
    clearApiKeyCache();
    return await this.getApiKey(key);
  },

  async deleteApiKey(key) {
    if (isMongoActive()) {
      try {
        await ApiKeyModel.deleteOne({ key });
      } catch (err) {}
    }
    const res = stmtDeleteApiKey.run(key).changes > 0;
    clearApiKeyCache(key);
    return res;
  }
};

module.exports = {
  db,
  FileModel,
  ApiKeyModel,
  ...dbOperations
};
