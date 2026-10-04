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

const DEFAULT_FONT_SUBCATEGORIES = [
  'Normal'
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

function toCleanFont(file, reqOrBase = null) {
  const base = getBaseUrl(reqOrBase);
  const subCategory = file.subCategory || file.sub_category || file.category || 'Normal';
  const fontTitle = formatTitle(file.title || file.originalName, file.originalName);

  return {
    id: file.id,
    name: fontTitle,
    title: fontTitle,
    mainCategory: 'font',
    subCategory: subCategory,
    category: subCategory,
    fontUrl: file.directUrl || file.fileUrl || `${base}/files/${file.id}`,
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

router.post(
  '/',
  optionalAuth,
  upload.any(),
  async (req, res, next) => {
    try {
      const fontFiles = (req.files && req.files.length > 0) ? req.files : (req.file ? [req.file] : []);

      if (fontFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No font file was provided. Please send file(s) in form field "file", "fontFile", or "files".'
          }
        });
      }

      const subCategory = req.body.subCategory || req.body.category || req.body.fontStyle || 'Normal';
      const cleanFonts = [];

      for (const fontFile of fontFiles) {
        const rawName = (fontFiles.length === 1 && (req.body.name || req.body.fontName || req.body.title))
          ? (req.body.name || req.body.fontName || req.body.title)
          : fontFile.originalname;

        const fileData = await fileService.processUpload(
          fontFile,
          {
            title: formatTitle(rawName, fontFile.originalname),
            mainCategory: 'font',
            subCategory: subCategory
          },
          req.apiKeyInfo,
          req
        );

        cleanFonts.push(toCleanFont(fileData, req));
      }

      return res.status(201).json({
        success: true,
        message: cleanFonts.length > 1
          ? `${cleanFonts.length} fonts uploaded successfully.`
          : 'Font uploaded successfully.',
        count: cleanFonts.length,
        fonts: cleanFonts,
        font: cleanFonts[0]
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
    const subCategory = req.query.subCategory || req.query.category || req.query.fontStyle;
    const { search } = req.query;

    const result = await fileService.listFiles({
      page: 1,
      limit: 1000,
      search,
      mainCategory: 'font',
      subCategory: subCategory || ''
    }, req);

    const fonts = result.files.map(f => toCleanFont(f, req));

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

router.get('/:subCategoryOrId', optionalAuth, async (req, res, next) => {
  try {
    const param = req.params.subCategoryOrId;

    if (param.startsWith('f_')) {
      const fileData = await fileService.getFileMetadata(param, req);
      return res.json({
        success: true,
        font: toCleanFont(fileData, req)
      });
    }

    const result = await fileService.listFiles({
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

const handleUpdateFont = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, fontName, title, subCategory, category } = req.body;
    const updated = await fileService.updateFile(id, {
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
