const mongoose = require('mongoose');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Initialize Mongoose Schema for MongoDB Atlas
const fileSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  originalName: { type: String, required: true },
  filename: { type: String, required: true },
  title: { type: String },
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

  mongoose.connect(config.mongodbUri, mongoOpts)
    .then(() => {
      console.log('🍃 MongoDB Atlas Connected Successfully!');
      seedMongoApiKeys();
      syncSqliteToMongo();
    })
    .catch(err => {
      console.error('⚠️ MongoDB Atlas Connection Warning:', err.message);
      console.log('🔄 Operating with local database engine & Cloudinary storage fallback.');
    });
}

// Fallback SQLite Initialization
const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSqliteSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      filename TEXT NOT NULL,
      title TEXT,
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
  `);
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

initSqliteSchema();

function _mapRecord(docOrRow) {
  if (!docOrRow) return null;
  const isMongo = Boolean(docOrRow._id || docOrRow.toObject);
  const data = isMongo ? (docOrRow.toObject ? docOrRow.toObject() : docOrRow) : docOrRow;

  const mainCategory = data.mainCategory || data.main_category || 'image';
  const subCategory = data.subCategory || data.sub_category || data.category || 'general';
  const isPremium = Boolean(data.isPremium || data.is_premium);

  return {
    id: data.id,
    originalName: data.originalName || data.original_name,
    filename: data.filename,
    title: data.title || data.originalName || data.original_name,
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

    const recordData = {
      id: fileRecord.id,
      originalName: fileRecord.originalName,
      filename: fileRecord.filename,
      title: fileRecord.title || fileRecord.originalName,
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

    if (mongoose.connection.readyState === 1) {
      await FileModel.create(recordData);
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO files (
        id, original_name, filename, title, main_category, sub_category, category, format, mime_type, size,
        storage_provider, storage_path, direct_url, storage_metadata, is_premium,
        uploaded_at, created_by, is_deleted
      ) VALUES (
        @id, @originalName, @filename, @title, @mainCategory, @subCategory, @category, @format, @mimeType, @size,
        @storageProvider, @storagePath, @directUrl, @storageMetadata, @isPremium,
        @uploadedAt, @createdBy, 0
      )
    `);

    stmt.run({
      ...recordData,
      isPremium: isPrem ? 1 : 0,
      storageMetadata: recordData.storageMetadata ? JSON.stringify(recordData.storageMetadata) : null
    });

    return await this.getFileById(fileRecord.id);
  },

  async getFileById(id) {
    if (mongoose.connection.readyState === 1) {
      const doc = await FileModel.findOne({ id, isDeleted: false });
      if (doc) return _mapRecord(doc);
    }
    const stmt = db.prepare(`SELECT * FROM files WHERE id = ? AND is_deleted = 0`);
    const row = stmt.get(id);
    if (row) return _mapRecord(row);
    return null;
  },

  async listFiles({ page = 1, limit = 20, search = '', category = '', mainCategory = '', subCategory = '', isPremium, pricing } = {}) {
    if (mongoose.connection.readyState === 1) {
      const query = { isDeleted: false };

      if (mainCategory && mainCategory.trim() && mainCategory.trim().toLowerCase() !== 'all') {
        query.mainCategory = new RegExp(`^${mainCategory.trim()}$`, 'i');
      }

      const activeSub = (subCategory || category || '').trim();
      if (activeSub && activeSub.toLowerCase() !== 'all') {
        query.$or = [
          { subCategory: new RegExp(`^${activeSub}$`, 'i') },
          { category: new RegExp(`^${activeSub}$`, 'i') }
        ];
      }

      const targetPremium = isPremium !== undefined ? isPremium : (pricing !== undefined ? (pricing === 'Paid' || pricing === 'paid' || pricing === 'true' || pricing === '1') : undefined);
      if (targetPremium !== undefined && targetPremium !== null && targetPremium !== 'all') {
        query.isPremium = (targetPremium === true || targetPremium === 'true' || targetPremium === 1 || targetPremium === '1');
      }

      if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        const searchOr = [
          { originalName: regex },
          { title: regex },
          { id: regex },
          { subCategory: regex },
          { mainCategory: regex },
          { category: regex },
          { mimeType: regex }
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
      const docs = await FileModel.find(query).sort({ uploadedAt: -1 }).skip(skip).limit(limit);

      return {
        files: docs.map(d => _mapRecord(d)),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / limit) || 1
        }
      };
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
      countSql += ' AND (original_name LIKE ? OR title LIKE ? OR id LIKE ? OR sub_category LIKE ? OR main_category LIKE ? OR category LIKE ? OR mime_type LIKE ?)';
      querySql += ' AND (original_name LIKE ? OR title LIKE ? OR id LIKE ? OR sub_category LIKE ? OR main_category LIKE ? OR category LIKE ? OR mime_type LIKE ?)';
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
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
    if (mongoose.connection.readyState === 1) {
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

      return { raw, hierarchy };
    }

    const stmt = db.prepare(`
      SELECT main_category, sub_category, COUNT(*) as count 
      FROM files 
      WHERE is_deleted = 0 
      GROUP BY main_category, sub_category 
      ORDER BY main_category ASC, count DESC, sub_category ASC
    `);
    const rows = stmt.all();
    const hierarchy = { image: [], text: [], font: [], sticker: [] };
    rows.forEach(r => {
      const main = r.main_category || 'image';
      if (!hierarchy[main]) hierarchy[main] = [];
      hierarchy[main].push({ subCategory: r.sub_category, count: r.count });
    });
    return { raw: rows, hierarchy };
  },

  async updateFile(id, updates = {}) {
    const fields = [];
    const params = [];
    const mongoUpdates = {};

    if (updates.title !== undefined && typeof updates.title === 'string' && updates.title.trim()) {
      fields.push('title = ?');
      params.push(updates.title.trim());
      mongoUpdates.title = updates.title.trim();
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

    if (mongoose.connection.readyState === 1 && Object.keys(mongoUpdates).length > 0) {
      await FileModel.updateOne({ id }, { $set: mongoUpdates });
    }

    if (fields.length > 0) {
      params.push(id);
      const sql = `UPDATE files SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`;
      db.prepare(sql).run(...params);
    }

    return await this.getFileById(id);
  },

  async softDeleteFile(id) {
    if (mongoose.connection.readyState === 1) {
      await FileModel.updateOne({ id }, { $set: { isDeleted: true } });
    }
    const stmt = db.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?');
    return stmt.run(id).changes > 0;
  },

  async hardDeleteFile(id) {
    if (mongoose.connection.readyState === 1) {
      await FileModel.deleteOne({ id });
    }
    const stmt = db.prepare('DELETE FROM files WHERE id = ?');
    return stmt.run(id).changes > 0;
  },

  async getApiKey(key) {
    if (!key) return null;
    if (mongoose.connection.readyState === 1) {
      const doc = await ApiKeyModel.findOne({ key, isActive: true });
      if (doc) {
        return {
          key: doc.key,
          name: doc.name,
          permissions: doc.permissions,
          createdAt: doc.createdAt,
          lastUsedAt: doc.lastUsedAt,
          isActive: doc.isActive
        };
      }
    }

    const stmt = db.prepare('SELECT * FROM api_keys WHERE key = ? AND is_active = 1');
    const row = stmt.get(key);
    if (!row) return null;
    return {
      key: row.key,
      name: row.name,
      permissions: row.permissions.split(',').map(p => p.trim()),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      isActive: Boolean(row.is_active)
    };
  },

  async updateApiKeyUsage(key) {
    const now = new Date().toISOString();
    if (mongoose.connection.readyState === 1) {
      await ApiKeyModel.updateOne({ key }, { $set: { lastUsedAt: now } });
    }
    const stmt = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE key = ?');
    stmt.run(now, key);
  },

  async listApiKeys() {
    if (mongoose.connection.readyState === 1) {
      const docs = await ApiKeyModel.find({}).sort({ createdAt: -1 });
      return docs.map(d => ({
        key: d.key,
        name: d.name,
        permissions: d.permissions,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
        isActive: d.isActive
      }));
    }

    const stmt = db.prepare('SELECT key, name, permissions, created_at, last_used_at, is_active FROM api_keys ORDER BY created_at DESC');
    const rows = stmt.all();
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
    const now = new Date().toISOString();
    if (mongoose.connection.readyState === 1) {
      await ApiKeyModel.create({ key, name, permissions, createdAt: now, isActive: true });
    }
    const stmt = db.prepare(`
      INSERT INTO api_keys (key, name, permissions, created_at, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    stmt.run(key, name, permissions.join(','), now);
    return await this.getApiKey(key);
  },

  async deleteApiKey(key) {
    if (mongoose.connection.readyState === 1) {
      await ApiKeyModel.deleteOne({ key });
    }
    const stmt = db.prepare('DELETE FROM api_keys WHERE key = ?');
    return stmt.run(key).changes > 0;
  }
};

module.exports = {
  db,
  FileModel,
  ApiKeyModel,
  ...dbOperations
};
