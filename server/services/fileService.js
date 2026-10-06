const path = require('path');
const config = require('../config');
const db = require('../database');
const { getStorageProvider } = require('./storageService');
const { generateFileId, isValidFileId, sanitizeOriginalFilename, formatTitle, deriveFontFamily } = require('../utils/fileId');
const { getBaseUrl } = require('../utils/urlHelper');

class FileService {
  _formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  formatFileResponse(record, reqOrBase = null) {
    if (!record) return null;
    const base = getBaseUrl(reqOrBase);
    const sizeFormatted = this._formatBytes(record.size);
    const mainCategory = record.mainCategory || record.main_category || 'image';
    const subCategory = record.subCategory || record.sub_category || record.category || 'general';
    const isPremium = Boolean(record.isPremium || record.is_premium);

    const directCloudinaryUrl = record.directUrl || record.direct_url || (record.storageMetadata && record.storageMetadata.secureUrl) || null;
    const formattedTitle = formatTitle(record.title || record.originalName, record.originalName);

    const fontFamily = record.fontFamily || record.font_family || (mainCategory === 'font' ? deriveFontFamily(formattedTitle, record.originalName) : null);
    const language = record.language || 'English';
    const orientation = record.orientation || null;
    const keywords = record.keywords || [];

    return {
      id: record.id,
      title: formattedTitle,
      fontFamily: fontFamily,
      language: language,
      orientation: orientation,
      keywords: keywords,
      mainCategory,
      subCategory,
      category: subCategory,
      isPremium,
      premium: isPremium ? 'Yes' : 'No',
      pricing: isPremium ? 'Paid' : 'Free',
      originalName: record.originalName,
      filename: record.filename,
      mimeType: record.mimeType,
      size: record.size,
      sizeFormatted: sizeFormatted,
      uploadedAt: record.uploadedAt,
      fileUrl: directCloudinaryUrl || `${base}/files/${record.id}`,
      directUrl: directCloudinaryUrl || `${base}/files/${record.id}`,
      cloudinaryUrl: directCloudinaryUrl || null,
      downloadUrl: `${base}/files/${record.id}/download`,
      viewUrl: directCloudinaryUrl || `${base}/files/${record.id}/view`,
      url: directCloudinaryUrl || `${base}/files/${record.id}`,
      apiUrl: `${base}/api/v1/files/${record.id}`
    };
  }

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

    const customTitle = formatTitle(metadata ? metadata.title : '', originalName);

    const mainCategory = (metadata && metadata.mainCategory && typeof metadata.mainCategory === 'string' && metadata.mainCategory.trim())
      ? metadata.mainCategory.trim().toLowerCase()
      : 'image';

    const subCategory = (metadata && (metadata.subCategory || metadata.category) && typeof (metadata.subCategory || metadata.category) === 'string' && (metadata.subCategory || metadata.category).trim())
      ? (metadata.subCategory || metadata.category).trim()
      : 'general';

    const rawFontFamily = metadata ? (metadata.fontFamily || metadata.font_family || metadata.family) : null;
    const fontFamily = (mainCategory === 'font' || rawFontFamily)
      ? deriveFontFamily(customTitle, originalName, rawFontFamily)
      : null;

    const language = (metadata && (metadata.language || metadata.lang) && typeof (metadata.language || metadata.lang) === 'string' && (metadata.language || metadata.lang).trim())
      ? (metadata.language || metadata.lang).trim()
      : 'English';

    const orientation = (metadata && (metadata.orientation || metadata.aspectRatio) && typeof (metadata.orientation || metadata.aspectRatio) === 'string')
      ? (metadata.orientation || metadata.aspectRatio).trim().toLowerCase()
      : null;

    let keywords = [];
    if (metadata && metadata.keywords) {
      if (Array.isArray(metadata.keywords)) keywords = metadata.keywords;
      else if (typeof metadata.keywords === 'string') keywords = metadata.keywords.split(',').map(k => k.trim()).filter(Boolean);
    }

    // Save physical asset via Cloudinary
    const saveResult = await storageProvider.saveFile({
      fileId,
      tempFilePath: multerFile.path,
      originalName,
      mimeType,
      mainCategory
    });

    // Record metadata in MongoDB Atlas & database
    const fileRecord = await db.createFile({
      id: fileId,
      originalName,
      filename: saveResult.storageFilename,
      title: customTitle,
      fontFamily,
      language,
      orientation,
      keywords,
      mainCategory,
      subCategory,
      isPremium: metadata.isPremium || metadata.is_premium || metadata.pricing === 'Paid' || metadata.pricing === 'paid' || metadata.premium === 'Yes' || metadata.premium === 'yes' || metadata.premium === true,
      mimeType,
      size: saveResult.size || multerFile.size,
      storageProvider: config.storageProvider,
      storagePath: saveResult.storagePath,
      directUrl: saveResult.directUrl || null,
      storageMetadata: saveResult.storageMetadata,
      uploadedAt: new Date().toISOString(),
      createdBy: apiKeyInfo ? apiKeyInfo.name : 'api'
    });

    return this.formatFileResponse(fileRecord, reqOrBase);
  }

  async getFileMetadata(fileId, reqOrBase = null) {
    if (!isValidFileId(fileId)) {
      const error = new Error('Invalid file ID format.');
      error.code = 'INVALID_FILE_ID';
      error.status = 400;
      throw error;
    }

    const fileRecord = await db.getFileById(fileId);
    if (!fileRecord) {
      const error = new Error(`File with ID '${fileId}' was not found.`);
      error.code = 'FILE_NOT_FOUND';
      error.status = 404;
      throw error;
    }

    return this.formatFileResponse(fileRecord, reqOrBase);
  }

  async getFileRecord(fileId) {
    if (!isValidFileId(fileId)) {
      const error = new Error('Invalid file ID format.');
      error.code = 'INVALID_FILE_ID';
      error.status = 400;
      throw error;
    }

    const fileRecord = await db.getFileById(fileId);
    if (!fileRecord) {
      const error = new Error(`File with ID '${fileId}' was not found.`);
      error.code = 'FILE_NOT_FOUND';
      error.status = 404;
      throw error;
    }

    return fileRecord;
  }

  async getFileStream(fileId, options = {}) {
    const fileRecord = await this.getFileRecord(fileId);
    const storageProvider = getStorageProvider(fileRecord.storageProvider || 'local');
    const stream = await storageProvider.getReadStream(fileRecord, options);
    return { stream, fileRecord };
  }

  async listFiles({ page = 1, limit = 20, search = '', category = '', mainCategory = '', subCategory = '', isPremium, pricing, language, orientation, keyword } = {}, reqOrBase = null) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));

    const result = await db.listFiles({ page: pageNum, limit: limitNum, search, category, mainCategory, subCategory, isPremium, pricing, language, orientation, keyword });
    return {
      files: result.files.map(f => this.formatFileResponse(f, reqOrBase)),
      pagination: result.pagination
    };
  }

  async listCategories() {
    return await db.listCategories();
  }

  async listFontLanguages() {
    return await db.listFontLanguages();
  }

  async getGroupedPresets({ search = '', mainCategory = '' } = {}, reqOrBase = null) {
    const allFilesResult = await db.listFiles({ page: 1, limit: 1000, search, mainCategory });
    const formatted = allFilesResult.files.map(f => this.formatFileResponse(f, reqOrBase));

    const grouped = { image: {}, text: {} };

    formatted.forEach(file => {
      const main = file.mainCategory || 'image';
      const sub = file.subCategory || 'general';
      if (!grouped[main]) grouped[main] = {};
      if (!grouped[main][sub]) grouped[main][sub] = [];
      grouped[main][sub].push(file);
    });

    return {
      total: formatted.length,
      grouped
    };
  }

  async updateFile(fileId, updates = {}, reqOrBase = null) {
    const existing = await this.getFileRecord(fileId);

    if (updates && updates.title !== undefined && updates.title !== null) {
      updates.title = formatTitle(updates.title, existing.originalName);
    }

    const updated = await db.updateFile(fileId, updates);
    if (!updated) {
      const error = new Error(`File '${fileId}' could not be updated.`);
      error.code = 'UPDATE_FAILED';
      error.status = 500;
      throw error;
    }
    return this.formatFileResponse(updated, reqOrBase);
  }

  async deleteFile(fileId) {
    const fileRecord = await this.getFileRecord(fileId);
    const storageProvider = getStorageProvider(fileRecord.storageProvider || 'cloudinary');

    await storageProvider.deleteFile(fileRecord);
    await db.hardDeleteFile(fileId);
    return true;
  }
}

module.exports = new FileService();
