const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const fileService = require('../services/fileService');
const { authenticateApiKey, optionalAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getSafeExtension } = require('../utils/fileId');

const router = express.Router();

// Ensure temporary upload directory exists
const tempDir = path.resolve(config.uploadDirectory, '.tmp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure Multer storage
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `tmp_${uniqueSuffix}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = getSafeExtension(file.originalname);
  if (config.blockedExtensions.includes(ext)) {
    const err = new Error(`File type '.${ext}' is blocked for security reasons.`);
    err.code = 'BLOCKED_FILE_TYPE';
    err.status = 400;
    return cb(err, false);
  }
  if (config.allowedExtensions.length > 0 && !config.allowedExtensions.includes(ext)) {
    const err = new Error(`File extension '.${ext}' is not permitted. Allowed: ${config.allowedExtensions.join(', ')}`);
    err.code = 'UNSUPPORTED_FILE_TYPE';
    err.status = 400;
    return cb(err, false);
  }
  cb(null, true);
};

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: config.maxFileSizeBytes
  },
  fileFilter
});

/**
 * POST /api/v1/files (Supports single and bulk uploads)
 */
router.post(
  '/',
  authenticateApiKey,
  requirePermission('files:upload'),
  upload.any(),
  async (req, res, next) => {
    try {
      const filesList = (req.files && req.files.length > 0) ? req.files : (req.file ? [req.file] : []);

      if (filesList.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No file was provided in the upload request. Please specify file(s) using form-data field "file" or "files".'
          }
        });
      }

      const uploadedFiles = [];
      for (const fileItem of filesList) {
        const fileData = await fileService.processUpload(
          fileItem,
          {
            title: req.body.title,
            mainCategory: req.body.mainCategory || req.body.main_category,
            subCategory: req.body.subCategory || req.body.sub_category || req.body.category,
            category: req.body.subCategory || req.body.sub_category || req.body.category,
            pricing: req.body.pricing,
            isPremium: req.body.isPremium || req.body.is_premium,
            format: req.body.format || req.body.stickerFormat,
            stickerFormat: req.body.format || req.body.stickerFormat
          },
          req.apiKeyInfo,
          req
        );
        uploadedFiles.push(fileData);
      }

      return res.status(201).json({
        success: true,
        message: uploadedFiles.length > 1 
          ? `${uploadedFiles.length} files uploaded successfully.`
          : 'File uploaded successfully.',
        count: uploadedFiles.length,
        files: uploadedFiles,
        file: uploadedFiles[0]
      });
    } catch (err) {
      const filesToClean = (req.files && req.files.length > 0) ? req.files : (req.file ? [req.file] : []);
      filesToClean.forEach(f => {
        if (f && f.path && fs.existsSync(f.path)) {
          fs.promises.unlink(f.path).catch(() => {});
        }
      });
      next(err);
    }
  }
);

/**
 * GET /api/v1/files/categories
 */
router.get(
  '/categories',
  optionalAuth,
  async (req, res, next) => {
    try {
      const categories = await fileService.listCategories();
      return res.json({
        success: true,
        categories
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/files/category/:category
 */
router.get(
  '/category/:category',
  optionalAuth,
  async (req, res, next) => {
    try {
      const { page, limit, search } = req.query;
      const result = await fileService.listFiles({
        page,
        limit,
        search,
        category: req.params.category
      }, req);
      return res.json({
        success: true,
        category: req.params.category,
        files: result.files,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/files
 */
router.get(
  '/',
  optionalAuth,
  async (req, res, next) => {
    try {
      const { page, limit, search, category, mainCategory, subCategory, isPremium, pricing } = req.query;
      const result = await fileService.listFiles({ page, limit, search, category, mainCategory, subCategory, isPremium, pricing }, req);
      return res.json({
        success: true,
        files: result.files,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/files/:id
 */
router.get(
  '/:id',
  optionalAuth,
  async (req, res, next) => {
    try {
      const fileData = await fileService.getFileMetadata(req.params.id, req);
      return res.json({
        success: true,
        file: fileData
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Stream helper for downloading or viewing files.
 */
async function streamFileResponse(req, res, next, isDownload) {
  try {
    const fileId = req.params.id;
    const fileRecord = await fileService.getFileRecord(fileId);
    
    // If stored on Cloudinary with direct URL, redirect directly to Cloudinary CDN URL!
    if (fileRecord.directUrl || (fileRecord.storageMetadata && fileRecord.storageMetadata.secureUrl)) {
      const targetUrl = fileRecord.directUrl || fileRecord.storageMetadata.secureUrl;
      return res.redirect(targetUrl);
    }

    const disposition = isDownload ? 'attachment' : 'inline';
    const originalName = encodeURIComponent(fileRecord.originalName);

    res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileRecord.originalName}"; filename*=UTF-8''${originalName}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const range = req.headers.range;
    const fileSize = fileRecord.size;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).json({
          success: false,
          error: {
            code: 'RANGE_NOT_SATISFIABLE',
            message: 'Requested Range Not Satisfiable'
          }
        });
      }

      const chunkSize = (end - start) + 1;
      const { stream } = await fileService.getFileStream(fileId, { start, end });

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);
      return stream.pipe(res);
    }

    res.setHeader('Content-Length', fileSize);
    const { stream } = await fileService.getFileStream(fileId);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

router.get('/:id/download', (req, res, next) => {
  streamFileResponse(req, res, next, true);
});

router.get('/:id/view', (req, res, next) => {
  streamFileResponse(req, res, next, false);
});

const handleUpdateFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const { title, mainCategory, subCategory, category, isPremium, pricing, format, stickerFormat } = req.body;

    const updated = await fileService.updateFile(fileId, {
      title,
      mainCategory,
      subCategory: subCategory || category,
      category: subCategory || category,
      isPremium,
      pricing,
      format,
      stickerFormat
    }, req);

    return res.json({
      success: true,
      message: `File '${fileId}' updated successfully.`,
      file: updated
    });
  } catch (err) {
    next(err);
  }
};

router.patch('/:id', authenticateApiKey, requirePermission(['files:upload', 'files:manage']), handleUpdateFile);
router.put('/:id', authenticateApiKey, requirePermission(['files:upload', 'files:manage']), handleUpdateFile);

router.delete(
  '/:id',
  authenticateApiKey,
  requirePermission('files:delete'),
  async (req, res, next) => {
    try {
      const fileId = req.params.id;
      await fileService.deleteFile(fileId);
      return res.json({
        success: true,
        message: `File '${fileId}' has been permanently deleted.`
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
module.exports.streamFileResponse = streamFileResponse;
