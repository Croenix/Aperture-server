const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Ensure parent storage directory exists
const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.databasePath);

// Enable WAL mode for high-concurrency performance and reliability
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      filename TEXT NOT NULL,
      title TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_path TEXT NOT NULL,
      storage_metadata TEXT,
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

  // Migrate existing database if columns are missing
  try {
    const tableInfo = db.prepare("PRAGMA table_info(files)").all();
    const columnNames = tableInfo.map(c => c.name);
    if (!columnNames.includes('title')) {
      db.exec("ALTER TABLE files ADD COLUMN title TEXT;");
    }
    if (!columnNames.includes('category')) {
      db.exec("ALTER TABLE files ADD COLUMN category TEXT NOT NULL DEFAULT 'general';");
    }
  } catch (err) {
    // Ignore migration error
  }

  // Create indexes safely after tables and columns are guaranteed
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files (uploaded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_files_category ON files (category);
    CREATE INDEX IF NOT EXISTS idx_files_is_deleted ON files (is_deleted);
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (is_active);
  `);

  // Seed default API keys if none exist
  seedInitialApiKeys();
}

function seedInitialApiKeys() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM api_keys').get().count;
  if (count === 0) {
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO api_keys (key, name, permissions, created_at, is_active)
      VALUES (@key, @name, @permissions, @createdAt, 1)
    `);

    const defaultKeys = [
      {
        key: config.seedKeys.admin,
        name: 'Administrator Master Key',
        permissions: 'files:read,files:upload,files:delete,files:manage',
        createdAt: now
      },
      {
        key: config.seedKeys.upload,
        name: 'Upload & Read Service Key',
        permissions: 'files:read,files:upload',
        createdAt: now
      },
      {
        key: config.seedKeys.read,
        name: 'Read-Only Key',
        permissions: 'files:read',
        createdAt: now
      }
    ];

    const transaction = db.transaction((keys) => {
      for (const k of keys) {
        insert.run(k);
      }
    });

    transaction(defaultKeys);
  }
}

// Database helper operations
const dbOperations = {
  // File operations
  createFile(fileRecord) {
    const stmt = db.prepare(`
      INSERT INTO files (
        id, original_name, filename, title, category, mime_type, size,
        storage_provider, storage_path, storage_metadata,
        uploaded_at, created_by, is_deleted
      ) VALUES (
        @id, @originalName, @filename, @title, @category, @mimeType, @size,
        @storageProvider, @storagePath, @storageMetadata,
        @uploadedAt, @createdBy, 0
      )
    `);
    stmt.run({
      id: fileRecord.id,
      originalName: fileRecord.originalName,
      filename: fileRecord.filename,
      title: fileRecord.title || fileRecord.originalName,
      category: fileRecord.category || 'general',
      mimeType: fileRecord.mimeType,
      size: fileRecord.size,
      storageProvider: fileRecord.storageProvider || 'local',
      storagePath: fileRecord.storagePath,
      storageMetadata: fileRecord.storageMetadata ? JSON.stringify(fileRecord.storageMetadata) : null,
      uploadedAt: fileRecord.uploadedAt || new Date().toISOString(),
      createdBy: fileRecord.createdBy || null
    });
    return this.getFileById(fileRecord.id);
  },

  getFileById(id) {
    const stmt = db.prepare(`
      SELECT * FROM files WHERE id = ? AND is_deleted = 0
    `);
    const row = stmt.get(id);
    if (!row) return null;
    return this._mapFileRow(row);
  },

  listFiles({ page = 1, limit = 20, search = '', category = '' } = {}) {
    const offset = Math.max(0, (page - 1) * limit);
    let countSql = 'SELECT COUNT(*) as total FROM files WHERE is_deleted = 0';
    let querySql = 'SELECT * FROM files WHERE is_deleted = 0';
    const params = [];
    const countParams = [];

    if (category && category.trim() && category.trim().toLowerCase() !== 'all') {
      const cleanCat = category.trim();
      countSql += ' AND LOWER(category) = LOWER(?)';
      querySql += ' AND LOWER(category) = LOWER(?)';
      countParams.push(cleanCat);
      params.push(cleanCat);
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      countSql += ' AND (original_name LIKE ? OR title LIKE ? OR id LIKE ? OR category LIKE ? OR mime_type LIKE ?)';
      querySql += ' AND (original_name LIKE ? OR title LIKE ? OR id LIKE ? OR category LIKE ? OR mime_type LIKE ?)';
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    querySql += ' ORDER BY uploaded_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const total = db.prepare(countSql).get(...countParams).total;
    const rows = db.prepare(querySql).all(...params);

    return {
      files: rows.map(r => this._mapFileRow(r)),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  },

  listCategories() {
    const stmt = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM files 
      WHERE is_deleted = 0 
      GROUP BY category 
      ORDER BY count DESC, category ASC
    `);
    return stmt.all();
  },

  updateFile(id, updates = {}) {
    const fields = [];
    const params = [];

    if (updates.title !== undefined && typeof updates.title === 'string' && updates.title.trim()) {
      fields.push('title = ?');
      params.push(updates.title.trim());
    }

    if (updates.category !== undefined && typeof updates.category === 'string' && updates.category.trim()) {
      fields.push('category = ?');
      params.push(updates.category.trim());
    }

    if (fields.length === 0) {
      return this.getFileById(id);
    }

    params.push(id);
    const sql = `UPDATE files SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`;
    const result = db.prepare(sql).run(...params);
    if (result.changes === 0) {
      return null;
    }
    return this.getFileById(id);
  },

  softDeleteFile(id) {
    const stmt = db.prepare('UPDATE files SET is_deleted = 1 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  hardDeleteFile(id) {
    const stmt = db.prepare('DELETE FROM files WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  // API Key operations
  getApiKey(key) {
    if (!key) return null;
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

  updateApiKeyUsage(key) {
    const stmt = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE key = ?');
    stmt.run(new Date().toISOString(), key);
  },

  listApiKeys() {
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

  createApiKey({ key, name, permissions }) {
    const stmt = db.prepare(`
      INSERT INTO api_keys (key, name, permissions, created_at, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    stmt.run(key, name, permissions.join(','), new Date().toISOString());
    return this.getApiKey(key);
  },

  deleteApiKey(key) {
    const stmt = db.prepare('DELETE FROM api_keys WHERE key = ?');
    return stmt.run(key).changes > 0;
  },

  _mapFileRow(row) {
    return {
      id: row.id,
      originalName: row.original_name,
      filename: row.filename,
      title: row.title || row.original_name,
      category: row.category || 'general',
      mimeType: row.mime_type,
      size: row.size,
      storageProvider: row.storage_provider,
      storagePath: row.storage_path,
      storageMetadata: row.storage_metadata ? JSON.parse(row.storage_metadata) : null,
      uploadedAt: row.uploaded_at,
      createdBy: row.created_by,
      isDeleted: Boolean(row.is_deleted)
    };
  }
};

// Initialize schema on load
initSchema();

module.exports = {
  db,
  ...dbOperations
};
