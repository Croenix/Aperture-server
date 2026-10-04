const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const fileService = require('../services/fileService');
const { optionalAuth } = require('../middleware/auth');
const { getSafeExtension, formatTitle } = require('../utils/fileId');
const { getBaseUrl } = require('../utils/urlHelper');

const router = express.Router();

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

const tempDir = path.resolve(config.uploadDirectory, '.tmp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

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

function toCleanSticker(file, reqOrBase = null) {
  const base = getBaseUrl(reqOrBase);
  const subCategory = file.subCategory || file.sub_category || file.category || 'Badges';
  const isPrem = Boolean(file.isPremium || file.is_premium);
  const stickerTitle = formatTitle(file.title || file.originalName, file.originalName);

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
    name: stickerTitle,
    title: stickerTitle,
    mainCategory: 'sticker',
    subCategory: subCategory,
    category: subCategory,
    format: format,
    stickerFormat: format,
    isPremium: isPrem,
    premium: isPrem ? 'Yes' : 'No',
    pricing: isPrem ? 'Paid' : 'Free',
    stickerUrl: file.directUrl || file.fileUrl || `${base}/files/${file.id}`,
    fileUrl: file.directUrl || file.fileUrl || `${base}/files/${file.id}`,
    downloadUrl: `${base}/files/${file.id}/download`,
    viewUrl: file.directUrl || file.viewUrl || `${base}/files/${file.id}/view`,
    fileName: file.originalName || file.filename,
    mimeType: file.mimeType,
    fileSize: file.size,
    sizeFormatted: file.sizeFormatted || `${file.size} Bytes`,
    uploadedAt: file.uploadedAt
  };
}

router.get('/categories', optionalAuth, async (req, res, next) => {
  try {
    const dbCategories = await fileService.listCategories();
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

router.post(
  '/',
  optionalAuth,
  upload.any(),
  async (req, res, next) => {
    try {
      const stickerFiles = (req.files && req.files.length > 0) ? req.files : (req.file ? [req.file] : []);

      if (stickerFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No sticker file was provided. Please send file(s) in form field "file", "stickerFile", or "files".'
          }
        });
      }

      const category = req.body.category || req.body.subCategory || req.body.stickerCategory || 'Badges';
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

      const cleanStickers = [];

      for (const stickerFile of stickerFiles) {
        const rawName = (stickerFiles.length === 1 && (req.body.name || req.body.stickerName || req.body.title))
          ? (req.body.name || req.body.stickerName || req.body.title)
          : stickerFile.originalname;

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

        const fileData = await fileService.processUpload(
          stickerFile,
          {
            title: formatTitle(rawName, stickerFile.originalname),
            mainCategory: 'sticker',
            subCategory: category,
            format: stickerFormat,
            stickerFormat: stickerFormat,
            isPremium: isPremium
          },
          req.apiKeyInfo,
          req
        );

        cleanStickers.push(toCleanSticker(fileData, req));
      }

      return res.status(201).json({
        success: true,
        message: cleanStickers.length > 1
          ? `${cleanStickers.length} stickers uploaded successfully.`
          : 'Sticker uploaded successfully.',
        count: cleanStickers.length,
        stickers: cleanStickers,
        sticker: cleanStickers[0]
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

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const category = req.query.category || req.query.subCategory || req.query.stickerCategory;
    const { search, isPremium, pricing, premium } = req.query;

    const result = await fileService.listFiles({
      page: 1,
      limit: 1000,
      search,
      mainCategory: 'sticker',
      subCategory: category || '',
      isPremium: isPremium ?? (premium !== undefined ? (premium === 'Yes' || premium === 'yes' || premium === 'true') : undefined),
      pricing: pricing
    }, req);

    const stickers = result.files.map(f => toCleanSticker(f, req));

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

router.get('/:categoryOrId', optionalAuth, async (req, res, next) => {
  try {
    const param = req.params.categoryOrId;

    if (param.startsWith('f_')) {
      const fileData = await fileService.getFileMetadata(param, req);
      return res.json({
        success: true,
        sticker: toCleanSticker(fileData, req)
      });
    }

    const result = await fileService.listFiles({
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

const handleUpdateSticker = async (req, res, next) => {
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

    const updated = await fileService.updateFile(id, {
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
