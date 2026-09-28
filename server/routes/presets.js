const express = require('express');
const fileService = require('../services/fileService');
const { optionalAuth } = require('../middleware/auth');
const config = require('../config');
const { getBaseUrl } = require('../utils/urlHelper');

const router = express.Router();

/**
 * Standard default subcategories for presets
 */
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

/**
 * Helper to map a file record to a clean, focused preset object.
 */
function toCleanPreset(file, reqOrBase = null) {
  const base = getBaseUrl(reqOrBase);
  const mainCategory = file.mainCategory || file.main_category || 'image';
  const subCategory = file.subCategory || file.sub_category || file.category || 'general';

  return {
    id: file.id,
    title: file.title || file.originalName,
    mainCategory: mainCategory,
    subCategory: subCategory,
    category: subCategory, // alias
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
 * GET /api/presets/categories
 * Returns the two-level category tree with presets and custom user categories.
 */
router.get('/categories', optionalAuth, (req, res, next) => {
  try {
    const dbCategories = fileService.listCategories();
    const dbImgSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.image)
      ? dbCategories.hierarchy.image.map(x => x.subCategory).filter(Boolean)
      : [];
    const dbTextSubs = (dbCategories && dbCategories.hierarchy && dbCategories.hierarchy.text)
      ? dbCategories.hierarchy.text.map(x => x.subCategory).filter(Boolean)
      : [];

    // Combine defaults with existing categories in DB
    const imageSet = new Set([...DEFAULT_IMAGE_SUBCATEGORIES, ...dbImgSubs]);
    const textSet = new Set(dbTextSubs);

    return res.json({
      success: true,
      categories: {
        image: Array.from(imageSet),
        text: Array.from(textSet),
        all: dbCategories
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/presets/image
 * GET /api/presets/image/:subCategory
 * Dedicated endpoint returning ONLY Image Presets.
 */
const handleImagePresets = (req, res, next) => {
  try {
    const subCategory = req.params.subCategory || req.query.subCategory || req.query.category;
    const { search } = req.query;

    const result = fileService.listFiles({
      page: 1,
      limit: 1000,
      search,
      mainCategory: 'image',
      subCategory: subCategory || ''
    }, req);

    const presets = result.files.map(p => toCleanPreset(p, req));

    // Group by subcategory
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

/**
 * GET /api/presets/text
 * GET /api/presets/text/:subCategory
 * Dedicated endpoint returning ONLY Text Presets.
 */
const handleTextPresets = (req, res, next) => {
  try {
    const subCategory = req.params.subCategory || req.query.subCategory || req.query.category;
    const { search } = req.query;

    const result = fileService.listFiles({
      page: 1,
      limit: 1000,
      search,
      mainCategory: 'text',
      subCategory: subCategory || ''
    }, req);

    const presets = result.files.map(p => toCleanPreset(p, req));

    // Group by subcategory
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

/**
 * GET /api/preset or /api/presets
 * Returns hierarchical list separated cleanly into image and text presets.
 */
router.get('/', optionalAuth, (req, res, next) => {
  try {
    const { mainCategory, subCategory, category, search } = req.query;

    // If specific main category requested
    if (mainCategory && mainCategory.toLowerCase() === 'image') {
      const result = fileService.listFiles({ page: 1, limit: 1000, search, mainCategory: 'image', subCategory: subCategory || category }, req);
      return res.json({
        success: true,
        mainCategory: 'image',
        presets: result.files.map(p => toCleanPreset(p, req))
      });
    }

    if (mainCategory && mainCategory.toLowerCase() === 'text') {
      const result = fileService.listFiles({ page: 1, limit: 1000, search, mainCategory: 'text', subCategory: subCategory || category }, req);
      return res.json({
        success: true,
        mainCategory: 'text',
        presets: result.files.map(p => toCleanPreset(p, req))
      });
    }

    // Default: fetch all and return clean separated structure
    const allResult = fileService.listFiles({ page: 1, limit: 1000, search, subCategory: subCategory || category }, req);
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

/**
 * GET /api/preset/grouped or /api/presets/grouped
 * Returns all presets organized by mainCategory -> subCategory hierarchy.
 */
router.get('/grouped', optionalAuth, (req, res, next) => {
  try {
    const { search } = req.query;
    const groupedData = fileService.getGroupedPresets({ search }, req);

    return res.json({
      success: true,
      total: groupedData.total,
      presets: groupedData.grouped
    });
  } catch (err) {
    next(err);
  }
});

/**
 * EDIT PRESET: PATCH /api/preset/:id or PUT /api/preset/:id
 * Updates preset title, mainCategory, or subCategory.
 */
const handleUpdatePreset = (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, mainCategory, subCategory, category } = req.body;
    const updated = fileService.updateFile(id, {
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

/**
 * REMOVE PRESET: DELETE /api/preset/:id
 * Removes the preset file and database record.
 */
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

