const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const fileService = require('../services/fileService');
const { optionalAuth, authenticateApiKey } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getSafeExtension } = require('../utils/fileId');
const { getBaseUrl } = require('../utils/urlHelper');

const router = express.Router();

/**
 * Standard default font subcategories (Defaults to Normal + Custom)
 */
const DEFAULT_FONT_SUBCATEGORIES = [
  'Normal'
];

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
    cb(null, `tmp_font_${uniqueSuffix}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: config.maxFileSizeBytes
  },
  fileFilter: (req, file, cb) => {
    const ext = getSafeExtension(file.originalname);
    if (config.blockedExtensions.includes(ext)) {
      const err = new Error(`File type '.${ext}' is blocked for security reasons.`);
      err.code = 'BLOCKED_FILE_TYPE';
      err.status = 400;
      return cb(err, false);
    }
    cb(null, true);
  }
});

/**
 * Helper to map a database record to a clean Font response object.
 */
function toCleanFont(file, reqOrBase = null) {
  const base = getBaseUrl(reqOrBase);
  const subCategory = file.subCategory || file.sub_category || file.category || 'Normal';

  return {
    id: file.id,
    name: file.title || file.originalName,
    title: file.title || file.originalName,
    mainCategory: 'font',
    subCategory: subCategory,
    category: subCategory,
    fontUrl: `${base}/files/${file.id}`,
    fileUrl: `${base}/files/${file.id}`,
    downloadUrl: `${base}/files/${file.id}/download`,
    viewUrl: `${base}/files/${file.id}/view`,
    fileName: file.originalName || file.filename,
    fileSize: file.size,
    sizeFormatted: file.sizeFormatted || `${file.size} Bytes`,
    uploadedAt: file.uploadedAt
  };
}

/**
 * GET /api/fonts/categories
 * Returns font subcategories tree.
 */
router.get('/categories', optionalAuth, (req, res, next) => {
  try {
    const dbCategories = fileService.listCategories();
    const dbFontSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.font)
      ? dbCategories.hierarchy.font.map(x => x.subCategory).filter(Boolean)
      : [];

    const fontSet = new Set([...DEFAULT_FONT_SUBCATEGORIES, ...dbFontSubs]);

    return res.json({
      success: true,
      categories: Array.from(fontSet)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/fonts or /api/v1/fonts
 * Upload a font file.
 * Form fields:
 * - 'file' or 'fontFile' (File)
 * - 'name' or 'fontName' or 'title' (String - Font Display Name)
 * - 'category' or 'subCategory' or 'fontStyle' (String - Subcategory e.g. Serif)
 */
router.post(
  '/',
  optionalAuth,
  upload.any(),
  async (req, res, next) => {
    try {
      const fontFile = (req.files && req.files.length > 0) ? req.files[0] : null;

      if (!fontFile) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No font file was provided. Please send file in form field "file" or "fontFile".'
          }
        });
      }

      const fontName = req.body.name || req.body.fontName || req.body.title || fontFile.originalname;
      const subCategory = req.body.subCategory || req.body.category || req.body.fontStyle || 'Normal';

      const fileData = await fileService.processUpload(
        fontFile,
        {
          title: fontName,
          mainCategory: 'font',
          subCategory: subCategory
        },
        req.apiKeyInfo,
        req
      );

      const cleanFont = toCleanFont(fileData, req);

      return res.status(201).json({
        success: true,
        message: 'Font uploaded successfully.',
        font: cleanFont
      });
    } catch (err) {
      if (req.files) {
        req.files.forEach(f => {
          if (f.path && fs.existsSync(f.path)) {
            fs.promises.unlink(f.path).catch(() => {});
          }
        });
      }
      next(err);
    }
  }
);

/**
 * GET /api/fonts or /api/v1/fonts
 * Returns list of fonts, filterable by search or subCategory.
 */
router.get('/', optionalAuth, (req, res, next) => {
  try {
    const subCategory = req.query.subCategory || req.query.category || req.query.fontStyle;
    const { search } = req.query;

    const result = fileService.listFiles({
      page: 1,
      limit: 1000,
      search,
      mainCategory: 'font',
      subCategory: subCategory || ''
    }, req);

    const fonts = result.files.map(f => toCleanFont(f, req));

    // Group by subcategory
    const subGrouped = {};
    fonts.forEach(f => {
      const sub = f.subCategory || 'Sans-Serif';
      if (!subGrouped[sub]) subGrouped[sub] = [];
      subGrouped[sub].push(f);
    });

    return res.json({
      success: true,
      mainCategory: 'font',
      count: fonts.length,
      subCategories: Object.keys(subGrouped),
      fonts: fonts,
      grouped: subGrouped
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/fonts/:subCategory
 * Returns fonts filtered by subCategory or metadata by ID.
 */
router.get('/:subCategoryOrId', optionalAuth, (req, res, next) => {
  try {
    const param = req.params.subCategoryOrId;

    // Check if param is a file ID (e.g. f_...)
    if (param.startsWith('f_')) {
      const fileData = fileService.getFileMetadata(param, req);
      return res.json({
        success: true,
        font: toCleanFont(fileData, req)
      });
    }

    // Otherwise treat as subCategory
    const result = fileService.listFiles({
      page: 1,
      limit: 1000,
      mainCategory: 'font',
      subCategory: param
    }, req);

    const fonts = result.files.map(f => toCleanFont(f, req));

    return res.json({
      success: true,
      mainCategory: 'font',
      subCategory: param,
      count: fonts.length,
      fonts: fonts
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/fonts/:id or PUT /api/fonts/:id
 * Edit font details (name, subCategory).
 */
const handleUpdateFont = (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, fontName, title, subCategory, category } = req.body;
    const updated = fileService.updateFile(id, {
      title: name || fontName || title,
      mainCategory: 'font',
      subCategory: subCategory || category
    }, req);

    return res.json({
      success: true,
      message: `Font '${id}' updated successfully.`,
      font: toCleanFont(updated, req)
    });
  } catch (err) {
    next(err);
  }
};

router.patch('/:id', optionalAuth, handleUpdateFont);
router.put('/:id', optionalAuth, handleUpdateFont);

/**
 * DELETE /api/fonts/:id
 * Remove font file and database entry.
 */
router.delete('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    await fileService.deleteFile(id);
    return res.json({
      success: true,
      message: `Font '${id}' removed successfully.`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
