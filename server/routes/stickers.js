const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const fileService = require('../services/fileService');
const { optionalAuth } = require('../middleware/auth');
const { getSafeExtension } = require('../utils/fileId');
const { getBaseUrl } = require('../utils/urlHelper');

const router = express.Router();

/**
 * Standard default sticker categories / subcategories
 */
const DEFAULT_STICKER_CATEGORIES = [
  'Badges',
  'Emoji',
  'Decorative',
  'Icons',
  'Anime',
  'Logos',
  'Vectors',
  'Labels',
  'Illustrations'
];

// Ensure temporary upload directory exists
const tempDir = path.resolve(config.uploadDirectory, '.tmp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure Multer storage for Stickers
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `tmp_sticker_${uniqueSuffix}`);
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
 * Helper to map a database record to a clean Sticker response object.
 */
function toCleanSticker(file, reqOrBase = null) {
  const base = getBaseUrl(reqOrBase);
  const subCategory = file.subCategory || file.sub_category || file.category || 'Badges';
  const isPrem = Boolean(file.isPremium || file.is_premium);

  let format = (file.format || file.stickerFormat || '').toUpperCase();
  if (!format || (format !== 'PNG' && format !== 'SVG')) {
    const mime = (file.mimeType || file.mime_type || '').toLowerCase();
    const orig = (file.originalName || file.filename || file.name || '').toLowerCase();
    if (mime.includes('svg') || orig.endsWith('.svg')) {
      format = 'SVG';
    } else {
      format = 'PNG';
    }
  }

  return {
    id: file.id,
    name: file.title || file.originalName,
    title: file.title || file.originalName,
    mainCategory: 'sticker',
    subCategory: subCategory,
    category: subCategory, // sticker category
    format: format,
    stickerFormat: format,
    isPremium: isPrem,
    premium: isPrem ? 'Yes' : 'No',
    pricing: isPrem ? 'Paid' : 'Free',
    stickerUrl: `${base}/files/${file.id}`,
    fileUrl: `${base}/files/${file.id}`,
    downloadUrl: `${base}/files/${file.id}/download`,
    viewUrl: `${base}/files/${file.id}/view`,
    fileName: file.originalName || file.filename,
    mimeType: file.mimeType,
    fileSize: file.size,
    sizeFormatted: file.sizeFormatted || `${file.size} Bytes`,
    uploadedAt: file.uploadedAt
  };
}

/**
 * GET /api/stickers/categories
 * Returns sticker categories list.
 */
router.get('/categories', optionalAuth, (req, res, next) => {
  try {
    const dbCategories = fileService.listCategories();
    const dbStickerSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.sticker)
      ? dbCategories.hierarchy.sticker.map(x => x.subCategory).filter(Boolean)
      : [];

    const stickerSet = new Set([...DEFAULT_STICKER_CATEGORIES, ...dbStickerSubs]);

    return res.json({
      success: true,
      categories: Array.from(stickerSet)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/stickers or /api/v1/stickers
 * Upload a sticker file (SVG, PNG, etc.).
 * Form fields:
 * - 'file' or 'stickerFile' (File)
 * - 'name' or 'stickerName' or 'title' (String - Sticker Name)
 * - 'category' or 'subCategory' or 'stickerCategory' (String - Sticker Category e.g. Badges)
 * - 'isPremium' or 'premium' or 'pricing' (Boolean/String - 'Free' vs 'Paid' / 'Yes' vs 'No' / true vs false)
 */
router.post(
  '/',
  optionalAuth,
  upload.any(),
  async (req, res, next) => {
    try {
      const stickerFile = (req.files && req.files.length > 0) ? req.files[0] : null;

      if (!stickerFile) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No sticker file was provided. Please send file in form field "file" or "stickerFile".'
          }
        });
      }

      const stickerName = req.body.name || req.body.stickerName || req.body.title || stickerFile.originalname;
      const category = req.body.category || req.body.subCategory || req.body.stickerCategory || 'Badges';

      let stickerFormat = (req.body.format || req.body.stickerFormat || '').trim().toUpperCase();
      if (!stickerFormat || (stickerFormat !== 'PNG' && stickerFormat !== 'SVG')) {
        const mime = (stickerFile.mimetype || '').toLowerCase();
        const orig = (stickerFile.originalname || '').toLowerCase();
        if (mime.includes('svg') || orig.endsWith('.svg')) {
          stickerFormat = 'SVG';
        } else {
          stickerFormat = 'PNG';
        }
      }

      const rawPremium = req.body.isPremium ?? req.body.premium ?? req.body.pricing;
      let isPremium = false;
      if (typeof rawPremium === 'boolean') {
        isPremium = rawPremium;
      } else if (typeof rawPremium === 'string') {
        const norm = rawPremium.trim().toLowerCase();
        if (norm === 'true' || norm === 'yes' || norm === 'paid' || norm === 'premium' || norm === '1') {
          isPremium = true;
        }
      } else if (typeof rawPremium === 'number') {
        isPremium = rawPremium === 1;
      }

      const fileData = await fileService.processUpload(
        stickerFile,
        {
          title: stickerName,
          mainCategory: 'sticker',
          subCategory: category,
          format: stickerFormat,
          stickerFormat: stickerFormat,
          isPremium: isPremium
        },
        req.apiKeyInfo,
        req
      );

      const cleanSticker = toCleanSticker(fileData, req);

      return res.status(201).json({
        success: true,
        message: 'Sticker uploaded successfully.',
        sticker: cleanSticker
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
 * GET /api/stickers or /api/v1/stickers
 * Returns list of stickers, filterable by search, category, or pricing/isPremium.
 */
router.get('/', optionalAuth, (req, res, next) => {
  try {
    const category = req.query.category || req.query.subCategory || req.query.stickerCategory;
    const { search, isPremium, pricing, premium } = req.query;

    const result = fileService.listFiles({
      page: 1,
      limit: 1000,
      search,
      mainCategory: 'sticker',
      subCategory: category || '',
      isPremium: isPremium ?? (premium !== undefined ? (premium === 'Yes' || premium === 'yes' || premium === 'true') : undefined),
      pricing: pricing
    }, req);

    const stickers = result.files.map(f => toCleanSticker(f, req));

    // Group by sticker category
    const catGrouped = {};
    stickers.forEach(s => {
      const cat = s.category || 'Badges';
      if (!catGrouped[cat]) catGrouped[cat] = [];
      catGrouped[cat].push(s);
    });

    return res.json({
      success: true,
      mainCategory: 'sticker',
      count: stickers.length,
      categories: Object.keys(catGrouped),
      stickers: stickers,
      grouped: catGrouped
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stickers/:categoryOrId
 * Returns stickers for specific category or metadata by ID.
 */
router.get('/:categoryOrId', optionalAuth, (req, res, next) => {
  try {
    const param = req.params.categoryOrId;

    // Check if param is a file ID (e.g. f_...)
    if (param.startsWith('f_')) {
      const fileData = fileService.getFileMetadata(param, req);
      return res.json({
        success: true,
        sticker: toCleanSticker(fileData, req)
      });
    }

    // Otherwise treat as category
    const result = fileService.listFiles({
      page: 1,
      limit: 1000,
      mainCategory: 'sticker',
      subCategory: param
    }, req);

    const stickers = result.files.map(f => toCleanSticker(f, req));

    return res.json({
      success: true,
      mainCategory: 'sticker',
      category: param,
      count: stickers.length,
      stickers: stickers
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/stickers/:id or PUT /api/stickers/:id
 * Edit sticker details (name, category, pricing/isPremium).
 */
const handleUpdateSticker = (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, stickerName, title, category, subCategory, stickerCategory, isPremium, pricing, premium } = req.body;
    
    let isPrem = undefined;
    const rawPrem = isPremium ?? premium ?? pricing;
    if (rawPrem !== undefined) {
      if (typeof rawPrem === 'boolean') isPrem = rawPrem;
      else if (typeof rawPrem === 'string') {
        const norm = rawPrem.trim().toLowerCase();
        isPrem = (norm === 'true' || norm === 'yes' || norm === 'paid' || norm === 'premium' || norm === '1');
      }
    }

    const updated = fileService.updateFile(id, {
      title: name || stickerName || title,
      mainCategory: 'sticker',
      subCategory: category || subCategory || stickerCategory,
      isPremium: isPrem,
      pricing: pricing
    }, req);

    return res.json({
      success: true,
      message: `Sticker '${id}' updated successfully.`,
      sticker: toCleanSticker(updated, req)
    });
  } catch (err) {
    next(err);
  }
};

router.patch('/:id', optionalAuth, handleUpdateSticker);
router.put('/:id', optionalAuth, handleUpdateSticker);

/**
 * DELETE /api/stickers/:id
 * Remove sticker file and database entry.
 */
router.delete('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    await fileService.deleteFile(id);
    return res.json({
      success: true,
      message: `Sticker '${id}' removed successfully.`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
