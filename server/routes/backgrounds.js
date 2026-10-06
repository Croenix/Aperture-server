const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const fileService = require('../services/fileService');
const { optionalAuth, authenticateApiKey } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getSafeExtension, formatTitle } = require('../utils/fileId');
const { getBaseUrl } = require('../utils/urlHelper');

const router = express.Router();

const DEFAULT_BACKGROUND_SUBCATEGORIES = [
  'Abstract',
  'Nature',
  'Gradient',
  'Studio',
  'Textures',
  'Minimalist',
  '3D',
  'Urban',
  'Pattern'
];

const DEFAULT_ORIENTATIONS = [
  'portrait',
  'landscape'
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
    cb(null, `tmp_bg_${uniqueSuffix}`);
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

function toCleanBackground(file, reqOrBase = null) {
  const base = getBaseUrl(reqOrBase);
  const subCategory = file.subCategory || file.sub_category || file.category || 'Abstract';
  const bgTitle = formatTitle(file.title || file.originalName, file.originalName);
  const isPremium = Boolean(file.isPremium || file.is_premium);
  const orientation = file.orientation || 'portrait';
  const keywords = Array.isArray(file.keywords) ? file.keywords : [];

  return {
    id: file.id,
    name: bgTitle,
    title: bgTitle,
    mainCategory: 'background',
    subCategory: subCategory,
    category: subCategory,
    orientation: orientation,
    keywords: keywords,
    isPremium: isPremium,
    premium: isPremium ? 'Yes' : 'No',
    pricing: isPremium ? 'Paid' : 'Free',
    backgroundUrl: file.directUrl || file.fileUrl || `${base}/files/${file.id}`,
    fileUrl: file.directUrl || file.fileUrl || `${base}/files/${file.id}`,
    downloadUrl: `${base}/files/${file.id}/download`,
    viewUrl: file.directUrl || file.viewUrl || `${base}/files/${file.id}/view`,
    fileName: file.originalName || file.filename,
    fileSize: file.size,
    sizeFormatted: file.sizeFormatted || `${file.size} Bytes`,
    uploadedAt: file.uploadedAt
  };
}

router.get('/categories', optionalAuth, async (req, res, next) => {
  try {
    const dbCategories = await fileService.listCategories();
    const dbBgSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.background)
      ? dbCategories.hierarchy.background.map(x => x.subCategory).filter(Boolean)
      : [];

    const bgSet = new Set([...DEFAULT_BACKGROUND_SUBCATEGORIES, ...dbBgSubs]);

    return res.json({
      success: true,
      categories: Array.from(bgSet)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/orientations', optionalAuth, async (req, res, next) => {
  return res.json({
    success: true,
    orientations: DEFAULT_ORIENTATIONS
  });
});

router.post(
  '/',
  optionalAuth,
  upload.any(),
  async (req, res, next) => {
    try {
      const bgFiles = (req.files && req.files.length > 0) ? req.files : (req.file ? [req.file] : []);

      if (bgFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No background file was provided. Please send file(s) in form field "file", "bgFile", or "files".'
          }
        });
      }

      const subCategory = req.body.subCategory || req.body.category || req.body.style || 'Abstract';
      const orientation = req.body.orientation || req.body.aspectRatio || 'portrait';
      const pricing = req.body.pricing || (req.body.isPremium === 'true' || req.body.isPremium === true ? 'Paid' : 'Free');
      
      let rawKeywords = req.body.keywords || req.body.tags || [];
      if (typeof rawKeywords === 'string') {
        rawKeywords = rawKeywords.split(',').map(k => k.trim()).filter(Boolean);
      }
      rawKeywords = rawKeywords.slice(0, 20);

      const cleanBgs = [];

      for (const bgFile of bgFiles) {
        const rawName = (bgFiles.length === 1 && (req.body.name || req.body.bgName || req.body.title))
          ? (req.body.name || req.body.bgName || req.body.title)
          : bgFile.originalname;

        const fileData = await fileService.processUpload(
          bgFile,
          {
            title: formatTitle(rawName, bgFile.originalname),
            mainCategory: 'background',
            subCategory: subCategory,
            orientation: orientation,
            pricing: pricing,
            isPremium: pricing === 'Paid' || pricing === 'paid',
            keywords: rawKeywords
          },
          req.apiKeyInfo,
          req
        );

        cleanBgs.push(toCleanBackground(fileData, req));
      }

      return res.status(201).json({
        success: true,
        message: cleanBgs.length > 1
          ? `${cleanBgs.length} backgrounds uploaded successfully.`
          : 'Background uploaded successfully.',
        count: cleanBgs.length,
        backgrounds: cleanBgs,
        background: cleanBgs[0]
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
    const subCategory = req.query.subCategory || req.query.category;
    const { search, orientation, pricing, isPremium, keyword } = req.query;

    const result = await fileService.listFiles({
      page: 1,
      limit: 1000,
      search,
      mainCategory: 'background',
      subCategory: subCategory || '',
      orientation: orientation || '',
      pricing,
      isPremium,
      keyword: keyword || ''
    }, req);

    const backgrounds = result.files.map(f => toCleanBackground(f, req));

    const subGrouped = {};
    const oriGrouped = {};

    backgrounds.forEach(b => {
      const sub = b.subCategory || 'Abstract';
      if (!subGrouped[sub]) subGrouped[sub] = [];
      subGrouped[sub].push(b);

      const ori = b.orientation || 'portrait';
      if (!oriGrouped[ori]) oriGrouped[ori] = [];
      oriGrouped[ori].push(b);
    });

    return res.json({
      success: true,
      mainCategory: 'background',
      count: backgrounds.length,
      subCategories: Object.keys(subGrouped),
      orientations: DEFAULT_ORIENTATIONS,
      groupedBySubcategory: subGrouped,
      groupedByOrientation: oriGrouped,
      backgrounds: backgrounds,
      grouped: subGrouped
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:subCategoryOrId', optionalAuth, async (req, res, next) => {
  try {
    const param = req.params.subCategoryOrId;

    if (param.startsWith('f_')) {
      const fileData = await fileService.getFileMetadata(param, req);
      return res.json({
        success: true,
        background: toCleanBackground(fileData, req)
      });
    }

    const result = await fileService.listFiles({
      page: 1,
      limit: 1000,
      mainCategory: 'background',
      subCategory: param
    }, req);

    const backgrounds = result.files.map(f => toCleanBackground(f, req));

    return res.json({
      success: true,
      mainCategory: 'background',
      subCategory: param,
      count: backgrounds.length,
      backgrounds: backgrounds
    });
  } catch (err) {
    next(err);
  }
});

const handleUpdateBackground = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, bgName, title, subCategory, category, orientation, pricing, isPremium, keywords, tags } = req.body;
    
    let rawKeywords = keywords || tags;
    if (typeof rawKeywords === 'string') {
      rawKeywords = rawKeywords.split(',').map(k => k.trim()).filter(Boolean);
    }
    if (Array.isArray(rawKeywords)) {
      rawKeywords = rawKeywords.slice(0, 20);
    }

    const updated = await fileService.updateFile(id, {
      title: name || bgName || title,
      mainCategory: 'background',
      subCategory: subCategory || category,
      orientation: orientation,
      pricing: pricing,
      isPremium: isPremium,
      keywords: rawKeywords
    }, req);

    return res.json({
      success: true,
      message: `Background '${id}' updated successfully.`,
      background: toCleanBackground(updated, req)
    });
  } catch (err) {
    next(err);
  }
};

router.patch('/:id', optionalAuth, handleUpdateBackground);
router.put('/:id', optionalAuth, handleUpdateBackground);

router.delete('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    await fileService.deleteFile(id);
    return res.json({
      success: true,
      message: `Background '${id}' removed successfully.`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
