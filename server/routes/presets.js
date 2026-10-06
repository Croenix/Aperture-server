const multer = require('multer');
const path = require('path');
const fs = require('fs');
const express = require('express');
const fileService = require('../services/fileService');
const { optionalAuth, authenticateApiKey } = require('../middleware/auth');
const config = require('../config');
const { getBaseUrl } = require('../utils/urlHelper');
const { formatTitle, getSafeExtension } = require('../utils/fileId');

const router = express.Router();

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
    cb(null, `tmp_preset_${uniqueSuffix}`);
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

const DEFAULT_IMAGE_SUBCATEGORIES = [
  'Vintage',
  'Modern',
  'Black & White',
  'Cinematic',
  'Portrait',
  'Landscape',
  'Moody',
  'Warm Tones',
  'Cool Tones',
  'Cyberpunk'
];

function toCleanPreset(file, reqOrBase = null) {
  const base = getBaseUrl(reqOrBase);
  const mainCategory = file.mainCategory || file.main_category || 'image';
  const subCategory = file.subCategory || file.sub_category || file.category || 'general';
  const presetTitle = formatTitle(file.title || file.originalName, file.originalName);

  return {
    id: file.id,
    title: presetTitle,
    name: presetTitle,
    language: file.language || 'English',
    orientation: file.orientation || null,
    keywords: file.keywords || [],
    mainCategory: mainCategory,
    subCategory: subCategory,
    category: subCategory,
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
    const dbImgSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.image)
      ? dbCategories.hierarchy.image.map(x => x.subCategory).filter(Boolean)
      : [];
    const dbTextSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.text)
      ? dbCategories.hierarchy.text.map(x => x.subCategory).filter(Boolean)
      : [];

    const dbBgSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.background)
      ? dbCategories.hierarchy.background.map(x => x.subCategory).filter(Boolean)
      : [];
    const dbFontSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.font)
      ? dbCategories.hierarchy.font.map(x => x.subCategory).filter(Boolean)
      : [];
    const dbStickerSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.sticker)
      ? dbCategories.hierarchy.sticker.map(x => x.subCategory).filter(Boolean)
      : [];

    const DEFAULT_BG_SUBCATEGORIES = ['Abstract', 'Nature', 'Gradient', 'Studio', 'Textures', 'Minimalist', '3D', 'Urban', 'Pattern'];
    const DEFAULT_STICKER_SUBCATEGORIES = ['Badges', 'Emoji', 'Decorative', 'Icons', 'Anime', 'Vectors'];

    const imageSet = new Set([...DEFAULT_IMAGE_SUBCATEGORIES, ...dbImgSubs]);
    const textSet = new Set(dbTextSubs);
    const bgSet = new Set([...DEFAULT_BG_SUBCATEGORIES, ...dbBgSubs]);
    const fontSet = new Set([...dbFontSubs, 'Normal']);
    const stickerSet = new Set([...DEFAULT_STICKER_SUBCATEGORIES, ...dbStickerSubs]);

    return res.json({
      success: true,
      categories: {
        image: Array.from(imageSet),
        text: Array.from(textSet),
        background: Array.from(bgSet),
        font: Array.from(fontSet),
        sticker: Array.from(stickerSet),
        all: dbCategories
      }
    });
  } catch (err) {
    next(err);
  }
});

const handleImagePresets = async (req, res, next) => {
  try {
    const subCategory = req.params.subCategory || req.query.subCategory || req.query.category;
    const { search } = req.query;

    const result = await fileService.listFiles({
      page: 1,
      limit: 1000,
      search,
      mainCategory: 'image',
      subCategory: subCategory || ''
    }, req);

    const presets = result.files.map(p => toCleanPreset(p, req));

    const subGrouped = {};
    presets.forEach(p => {
      const sub = p.subCategory || 'general';
      if (!subGrouped[sub]) subGrouped[sub] = [];
      subGrouped[sub].push(p);
    });

    return res.json({
      success: true,
      mainCategory: 'image',
      count: presets.length,
      subCategories: Object.keys(subGrouped),
      presets: presets,
      grouped: subGrouped
    });
  } catch (err) {
    next(err);
  }
};

router.get('/image', optionalAuth, handleImagePresets);
router.get('/image/:subCategory', optionalAuth, handleImagePresets);

const handleTextPresets = async (req, res, next) => {
  try {
    const subCategory = req.params.subCategory || req.query.subCategory || req.query.category;
    const { search } = req.query;

    const result = await fileService.listFiles({
      page: 1,
      limit: 1000,
      search,
      mainCategory: 'text',
      subCategory: subCategory || ''
    }, req);

    const presets = result.files.map(p => toCleanPreset(p, req));

    const subGrouped = {};
    presets.forEach(p => {
      const sub = p.subCategory || 'general';
      if (!subGrouped[sub]) subGrouped[sub] = [];
      subGrouped[sub].push(p);
    });

    return res.json({
      success: true,
      mainCategory: 'text',
      count: presets.length,
      subCategories: Object.keys(subGrouped),
      presets: presets,
      grouped: subGrouped
    });
  } catch (err) {
    next(err);
  }
};

router.get('/text', optionalAuth, handleTextPresets);
router.get('/text/:subCategory', optionalAuth, handleTextPresets);

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { mainCategory, subCategory, category, search } = req.query;

    if (mainCategory && mainCategory.toLowerCase() === 'image') {
      const result = await fileService.listFiles({ page: 1, limit: 1000, search, mainCategory: 'image', subCategory: subCategory || category }, req);
      return res.json({
        success: true,
        mainCategory: 'image',
        presets: result.files.map(p => toCleanPreset(p, req))
      });
    }

    if (mainCategory && mainCategory.toLowerCase() === 'text') {
      const result = await fileService.listFiles({ page: 1, limit: 1000, search, mainCategory: 'text', subCategory: subCategory || category }, req);
      return res.json({
        success: true,
        mainCategory: 'text',
        presets: result.files.map(p => toCleanPreset(p, req))
      });
    }

    const allResult = await fileService.listFiles({ page: 1, limit: 1000, search, subCategory: subCategory || category }, req);
    const allClean = allResult.files.map(p => toCleanPreset(p, req));

    const imagePresets = allClean.filter(p => p.mainCategory === 'image');
    const textPresets = allClean.filter(p => p.mainCategory === 'text');

    return res.json({
      success: true,
      totalCount: allClean.length,
      imageCount: imagePresets.length,
      textCount: textPresets.length,
      presets: {
        image: imagePresets,
        text: textPresets
      },
      all: allClean
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
      const presetFiles = (req.files && req.files.length > 0) ? req.files : (req.file ? [req.file] : []);

      if (presetFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_PROVIDED',
            message: 'No preset file was provided. Please send file(s) in form field "file", "presetFile", or "files".'
          }
        });
      }

      const mainCategory = (req.body.mainCategory || req.body.main_category || 'image').trim().toLowerCase();
      const subCategory = (req.body.subCategory || req.body.sub_category || req.body.category || 'Vintage').trim();
      const cleanPresets = [];

      for (const pFile of presetFiles) {
        const rawName = (presetFiles.length === 1 && (req.body.name || req.body.title))
          ? (req.body.name || req.body.title)
          : pFile.originalname;

        const fileData = await fileService.processUpload(
          pFile,
          {
            title: formatTitle(rawName, pFile.originalname),
            mainCategory,
            subCategory
          },
          req.apiKeyInfo,
          req
        );

        cleanPresets.push(toCleanPreset(fileData, req));
      }

      return res.status(201).json({
        success: true,
        message: cleanPresets.length > 1
          ? `${cleanPresets.length} presets uploaded successfully.`
          : 'Preset uploaded successfully.',
        count: cleanPresets.length,
        presets: cleanPresets,
        preset: cleanPresets[0]
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

router.get('/grouped', optionalAuth, async (req, res, next) => {
  try {
    const { search } = req.query;
    const groupedData = await fileService.getGroupedPresets({ search }, req);

    return res.json({
      success: true,
      total: groupedData.total,
      presets: groupedData.grouped
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id.startsWith('f_')) {
      const fileData = await fileService.getFileMetadata(id, req);
      return res.json({
        success: true,
        preset: toCleanPreset(fileData, req)
      });
    }

    const result = await fileService.listFiles({
      page: 1,
      limit: 1000,
      subCategory: id
    }, req);

    const presets = result.files.map(p => toCleanPreset(p, req));

    return res.json({
      success: true,
      subCategory: id,
      count: presets.length,
      presets: presets
    });
  } catch (err) {
    next(err);
  }
});

const handleUpdatePreset = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, mainCategory, subCategory, category } = req.body;
    const updated = await fileService.updateFile(id, {
      title,
      mainCategory,
      subCategory: subCategory || category,
      category: subCategory || category
    }, req);

    return res.json({
      success: true,
      message: `Preset '${id}' updated successfully.`,
      preset: toCleanPreset(updated, req)
    });
  } catch (err) {
    next(err);
  }
};

router.patch('/:id', handleUpdatePreset);
router.put('/:id', handleUpdatePreset);

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await fileService.deleteFile(id);
    return res.json({
      success: true,
      message: `Preset '${id}' has been removed.`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
