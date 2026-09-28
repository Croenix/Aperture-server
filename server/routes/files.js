const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const fileService = require('../services/fileService');
const { authenticateApiKey } = require('../middleware/auth');
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

// Multer file filter for security & extension checking
const fileFilter = (req, file, cb) => {
  const ext = getSafeExtension(file.originalname);

  // Block dangerous executable extensions
  if (config.blockedExtensions.includes(ext)) {
    const err = new Error(`File type '.${ext}' is blocked for security reasons.`);
    err.code = 'BLOCKED_FILE_TYPE';
    err.status = 400;
    return cb(err, false);
  }

  // If allowedExtensions whitelist is specified, verify against it
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
 * POST /api/v1/files
 * Upload a file. Requires 'files:upload' scope.
 * Accepts optional form fields: 'title' and 'category'.
 */
router.post(
  '/',
  authenticateApiKey,
  requirePermission('files:upload'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No file was provided in the upload request. Please specify a file using form-data field "file".'
          }
        });
      }

      const fileData = await fileService.processUpload(
        req.file,
        {
          title: req.body.title,
          category: req.body.category
        },
        req.apiKeyInfo
      );

      return res.status(201).json({
        success: true,
        file: fileData
      });
    } catch (err) {
      // Clean up temp file if failed
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
      next(err);
    }
  }
);

/**
 * GET /api/v1/files/categories
 * Return list of all unique file categories. Requires 'files:read' scope.
 */
router.get(
  '/categories',
  authenticateApiKey,
  requirePermission('files:read'),
  (req, res, next) => {
    try {
      const categories = fileService.listCategories();
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
 * Return files for a specific category. Requires 'files:read' scope.
 */
router.get(
  '/category/:category',
  authenticateApiKey,
  requirePermission('files:read'),
  (req, res, next) => {
    try {
      const { page, limit, search } = req.query;
      const result = fileService.listFiles({
        page,
        limit,
        search,
        category: req.params.category
      });
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
 * Return paginated list of uploaded files. Requires 'files:read' scope.
 */
router.get(
  '/',
  authenticateApiKey,
  requirePermission('files:read'),
  (req, res, next) => {
    try {
      const { page, limit, search, category } = req.query;
      const result = fileService.listFiles({ page, limit, search, category });
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
 * Return file metadata. Requires 'files:read' scope.
 */
router.get(
  '/:id',
  authenticateApiKey,
  requirePermission('files:read'),
  (req, res, next) => {
    try {
      const fileData = fileService.getFileMetadata(req.params.id);
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
 * Stream helper for downloading or viewing files with HTTP Range support.
 */
async function streamFileResponse(req, res, next, isDownload) {
  try {
    const fileId = req.params.id;
    const fileRecord = fileService.getFileRecord(fileId);
    const disposition = isDownload ? 'attachment' : 'inline';
    const originalName = encodeURIComponent(fileRecord.originalName);

    // Set standard headers
    res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileRecord.originalName}"; filename*=UTF-8''${originalName}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Handle HTTP 206 Partial Content Range header (vital for video/audio streaming)
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

    // Full file stream
    res.setHeader('Content-Length', fileSize);
    const { stream } = await fileService.getFileStream(fileId);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/files/:id/download
 * Download the actual file.
 */
router.get('/:id/download', (req, res, next) => {
  streamFileResponse(req, res, next, true);
});

/**
 * GET /api/v1/files/:id/view
 * View/stream the file inline when supported by MIME type.
 */
router.get('/:id/view', (req, res, next) => {
  streamFileResponse(req, res, next, false);
});

/**
 * PATCH /api/v1/files/:id & PUT /api/v1/files/:id
 * Update file metadata (title, category). Requires 'files:upload' or 'files:manage' scope.
 */
const handleUpdateFile = (req, res, next) => {
  try {
    const fileId = req.params.id;
    const { title, category } = req.body;

    const updated = fileService.updateFile(fileId, { title, category });
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

/**
 * DELETE /api/v1/files/:id
 * Delete a file. Requires 'files:delete' scope.
 */
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
