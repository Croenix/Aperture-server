const path = require('path');
const config = require('../config');
const db = require('../database');
const { getStorageProvider } = require('./storageService');
const { generateFileId, isValidFileId, sanitizeOriginalFilename } = require('../utils/fileId');
const { getBaseUrl } = require('../utils/urlHelper');

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
   * Includes title, mainCategory, subCategory, and direct access URLs.
   * @param {Object} record - Database file record
   * @param {Object|string} [reqOrBase] - Express request or custom base URL
   * @returns {Object} Standardized file JSON
   */
  formatFileResponse(record, reqOrBase = null) {
    if (!record) return null;
    const base = getBaseUrl(reqOrBase);
    const sizeFormatted = this._formatBytes(record.size);
    const mainCategory = record.mainCategory || record.main_category || 'image';
    const subCategory = record.subCategory || record.sub_category || record.category || 'general';

    return {
      id: record.id,
      title: record.title || record.originalName,
      mainCategory,
      subCategory,
      category: subCategory, // synced alias
      originalName: record.originalName,
      filename: record.filename,
      mimeType: record.mimeType,
      size: record.size,
      sizeFormatted: sizeFormatted,
      uploadedAt: record.uploadedAt,
      // Direct access & streaming endpoints
      fileUrl: `${base}/files/${record.id}`,
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
   * @param {Object} metadata - Optional custom metadata { title, mainCategory, subCategory, category }
   * @param {Object} apiKeyInfo - API Key details (if authenticated)
   * @param {Object|string} [reqOrBase] - Express request or custom base URL
   * @returns {Promise<Object>} Formatted file object
   */
  async processUpload(multerFile, metadata = {}, apiKeyInfo = null, reqOrBase = null) {
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

    // Custom title and two-level category handling
    const customTitle = (metadata && metadata.title && typeof metadata.title === 'string' && metadata.title.trim())
      ? metadata.title.trim()
      : originalName;

    const mainCategory = (metadata && metadata.mainCategory && typeof metadata.mainCategory === 'string' && metadata.mainCategory.trim())
      ? metadata.mainCategory.trim().toLowerCase()
      : 'image';

    const subCategory = (metadata && (metadata.subCategory || metadata.category) && typeof (metadata.subCategory || metadata.category) === 'string' && (metadata.subCategory || metadata.category).trim())
      ? (metadata.subCategory || metadata.category).trim()
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
      mainCategory,
      subCategory,
      mimeType,
      size: saveResult.size || multerFile.size,
      storageProvider: config.storageProvider,
      storagePath: saveResult.storagePath,
      storageMetadata: saveResult.storageMetadata,
      uploadedAt: new Date().toISOString(),
      createdBy: apiKeyInfo ? apiKeyInfo.name : 'api'
    });

    return this.formatFileResponse(fileRecord, reqOrBase);
  }

  /**
   * Retrieves file metadata by ID.
   * @param {string} fileId
   * @param {Object|string} [reqOrBase]
   * @returns {Object}
   */
  getFileMetadata(fileId, reqOrBase = null) {
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

    return this.formatFileResponse(fileRecord, reqOrBase);
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
   * Lists files with pagination, search, and two-level category filtering.
   * @param {Object} queryParams
   * @param {Object|string} [reqOrBase]
   * @returns {Object}
   */
  listFiles({ page = 1, limit = 20, search = '', category = '', mainCategory = '', subCategory = '' } = {}, reqOrBase = null) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));

    const result = db.listFiles({ page: pageNum, limit: limitNum, search, category, mainCategory, subCategory });
    return {
      files: result.files.map(f => this.formatFileResponse(f, reqOrBase)),
      pagination: result.pagination
    };
  }

  /**
   * Returns categories hierarchy.
   */
  listCategories() {
    return db.listCategories();
  }

  /**
   * Retrieves files/presets grouped by main and subcategories.
   * @param {Object} queryParams
   * @param {Object|string} [reqOrBase]
   * @returns {Object} Grouped presets structure
   */
  getGroupedPresets({ search = '', mainCategory = '' } = {}, reqOrBase = null) {
    const allFilesResult = db.listFiles({ page: 1, limit: 1000, search, mainCategory });
    const formatted = allFilesResult.files.map(f => this.formatFileResponse(f, reqOrBase));

    const grouped = {
      image: {},
      text: {}
    };

    formatted.forEach(file => {
      const main = file.mainCategory || 'image';
      const sub = file.subCategory || 'general';
      if (!grouped[main]) {
        grouped[main] = {};
      }
      if (!grouped[main][sub]) {
        grouped[main][sub] = [];
      }
      grouped[main][sub].push(file);
    });

    return {
      total: formatted.length,
      grouped
    };
  }

  /**
   * Updates metadata (title, mainCategory, subCategory) for an existing file.
   * @param {string} fileId 
   * @param {Object} updates { title, mainCategory, subCategory, category }
   * @param {Object|string} [reqOrBase]
   * @returns {Object} Updated file response
   */
  updateFile(fileId, updates = {}, reqOrBase = null) {
    this.getFileRecord(fileId); // ensure file exists and valid ID

    const updated = db.updateFile(fileId, updates);
    if (!updated) {
      const error = new Error(`File '${fileId}' could not be updated.`);
      error.code = 'UPDATE_FAILED';
      error.status = 500;
      throw error;
    }
    return this.formatFileResponse(updated, reqOrBase);
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
