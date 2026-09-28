const path = require('path');
const config = require('../config');
const db = require('../database');
const { getStorageProvider } = require('./storageService');
const { generateFileId, isValidFileId, sanitizeOriginalFilename } = require('../utils/fileId');

class FileService {
  /**
   * Helper to format bytes
   */
  _formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Formats a database record into the standard public file JSON format.
   * Includes title, category, and direct access URLs for seamless client extraction.
   * @param {Object} record - Database file record
   * @returns {Object} Standardized file JSON
   */
  formatFileResponse(record) {
    if (!record) return null;
    const base = config.baseUrl;
    const sizeFormatted = this._formatBytes(record.size);
    return {
      id: record.id,
      title: record.title || record.originalName,
      category: record.category || 'general',
      originalName: record.originalName,
      filename: record.filename,
      mimeType: record.mimeType,
      size: record.size,
      sizeFormatted: sizeFormatted,
      uploadedAt: record.uploadedAt,
      // Direct access & streaming endpoints
      directUrl: `${base}/files/${record.id}`,
      downloadUrl: `${base}/files/${record.id}/download`,
      viewUrl: `${base}/files/${record.id}/view`,
      url: `${base}/files/${record.id}`,
      apiUrl: `${base}/api/v1/files/${record.id}`
    };
  }

  /**
   * Processes and stores an uploaded file.
   * @param {Object} multerFile - File object provided by Multer
   * @param {Object} metadata - Optional custom metadata { title, category }
   * @param {Object} apiKeyInfo - API Key details (if authenticated)
   * @returns {Promise<Object>} Formatted file object
   */
  async processUpload(multerFile, metadata = {}, apiKeyInfo = null) {
    if (!multerFile) {
      const error = new Error('No file was provided in the upload request.');
      error.code = 'NO_FILE_PROVIDED';
      error.status = 400;
      throw error;
    }

    const fileId = generateFileId();
    const originalName = sanitizeOriginalFilename(multerFile.originalname);
    const mimeType = multerFile.mimetype || 'application/octet-stream';
    const storageProvider = getStorageProvider();

    // Custom title and category handling
    const customTitle = (metadata && metadata.title && typeof metadata.title === 'string' && metadata.title.trim())
      ? metadata.title.trim()
      : originalName;

    const customCategory = (metadata && metadata.category && typeof metadata.category === 'string' && metadata.category.trim())
      ? metadata.category.trim()
      : 'general';

    // Save physical file via storage provider
    const saveResult = await storageProvider.saveFile({
      fileId,
      tempFilePath: multerFile.path,
      originalName,
      mimeType
    });

    // Record metadata in SQLite
    const fileRecord = db.createFile({
      id: fileId,
      originalName,
      filename: saveResult.storageFilename,
      title: customTitle,
      category: customCategory,
      mimeType,
      size: saveResult.size || multerFile.size,
      storageProvider: config.storageProvider,
      storagePath: saveResult.storagePath,
      storageMetadata: saveResult.storageMetadata,
      uploadedAt: new Date().toISOString(),
      createdBy: apiKeyInfo ? apiKeyInfo.name : 'api'
    });

    return this.formatFileResponse(fileRecord);
  }

  /**
   * Retrieves file metadata by ID.
   * @param {string} fileId
   * @returns {Object}
   */
  getFileMetadata(fileId) {
    if (!isValidFileId(fileId)) {
      const error = new Error('Invalid file ID format.');
      error.code = 'INVALID_FILE_ID';
      error.status = 400;
      throw error;
    }

    const fileRecord = db.getFileById(fileId);
    if (!fileRecord) {
      const error = new Error(`File with ID '${fileId}' was not found.`);
      error.code = 'FILE_NOT_FOUND';
      error.status = 404;
      throw error;
    }

    return this.formatFileResponse(fileRecord);
  }

  /**
   * Retrieves the raw file record from database.
   * @param {string} fileId 
   * @returns {Object}
   */
  getFileRecord(fileId) {
    if (!isValidFileId(fileId)) {
      const error = new Error('Invalid file ID format.');
      error.code = 'INVALID_FILE_ID';
      error.status = 400;
      throw error;
    }

    const fileRecord = db.getFileById(fileId);
    if (!fileRecord) {
      const error = new Error(`File with ID '${fileId}' was not found.`);
      error.code = 'FILE_NOT_FOUND';
      error.status = 404;
      throw error;
    }

    return fileRecord;
  }

  /**
   * Retrieves a readable stream for a file.
   * @param {string} fileId 
   * @param {Object} options - Range stream options
   * @returns {Promise<{ stream: stream.Readable, fileRecord: Object }>}
   */
  async getFileStream(fileId, options = {}) {
    const fileRecord = this.getFileRecord(fileId);
    const storageProvider = getStorageProvider(fileRecord.storageProvider || 'local');
    const stream = await storageProvider.getReadStream(fileRecord, options);
    return { stream, fileRecord };
  }

  /**
   * Lists files with pagination, search, and category filtering.
   * @param {Object} queryParams
   * @returns {Object}
   */
  listFiles({ page = 1, limit = 20, search = '', category = '' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const result = db.listFiles({ page: pageNum, limit: limitNum, search, category });
    return {
      files: result.files.map(f => this.formatFileResponse(f)),
      pagination: result.pagination
    };
  }

  /**
   * Returns list of all unique categories with counts.
   */
  listCategories() {
    return db.listCategories();
  }

  /**
   * Retrieves files/presets grouped by category for instant mobile/client consumption.
   * @param {Object} queryParams
   * @returns {Object} Grouped presets structure
   */
  getGroupedPresets({ search = '' } = {}) {
    const allFilesResult = db.listFiles({ page: 1, limit: 1000, search });
    const formatted = allFilesResult.files.map(f => this.formatFileResponse(f));
    const categories = db.listCategories().map(c => c.category);

    const grouped = {};
    formatted.forEach(file => {
      const cat = file.category || 'general';
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(file);
    });

    return {
      total: formatted.length,
      categories,
      grouped
    };
  }

  /**
   * Updates metadata (title, category) for an existing file.
   * @param {string} fileId 
   * @param {Object} updates { title, category }
   * @returns {Object} Updated file response
   */
  updateFile(fileId, updates = {}) {
    this.getFileRecord(fileId); // ensure file exists and valid ID

    const updated = db.updateFile(fileId, updates);
    if (!updated) {
      const error = new Error(`File '${fileId}' could not be updated.`);
      error.code = 'UPDATE_FAILED';
      error.status = 500;
      throw error;
    }
    return this.formatFileResponse(updated);
  }

  /**
   * Deletes a file completely from physical storage and SQLite database.
   * @param {string} fileId 
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileId) {
    const fileRecord = this.getFileRecord(fileId);
    const storageProvider = getStorageProvider(fileRecord.storageProvider || 'local');

    // Remove from disk / cloud storage
    await storageProvider.deleteFile(fileRecord);

    // Hard delete from database
    db.hardDeleteFile(fileId);
    return true;
  }
}

module.exports = new FileService();
