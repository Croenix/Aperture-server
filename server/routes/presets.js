const express = require('express');
const fileService = require('../services/fileService');
const { optionalAuth } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

/**
 * Helper to map a file record to a clean, focused preset object.
 */
function toCleanPreset(file) {
  const base = config.baseUrl;
  return {
    id: file.id,
    title: file.title || file.originalName,
    category: file.category || 'general',
    fileUrl: `${base}/files/${file.id}`,
    downloadUrl: `${base}/files/${file.id}/download`,
    fileName: file.originalName || file.filename,
    fileSize: file.size,
    sizeFormatted: file.sizeFormatted || `${file.size} Bytes`
  };
}

/**
 * FORMAT 1: GET /api/preset or /api/presets or /api/v1/presets
 * Returns flat list of presets with title, category, and direct file access links.
 * Optional query: ?category=... &search=...
 */
router.get('/', optionalAuth, (req, res, next) => {
  try {
    const { category, search } = req.query;
    const result = fileService.listFiles({ page: 1, limit: 1000, search, category });
    const cleanPresets = result.files.map(toCleanPreset);

    return res.json({
      success: true,
      count: cleanPresets.length,
      presets: cleanPresets
    });
  } catch (err) {
    next(err);
  }
});

/**
 * FORMAT 2 (Grouped): GET /api/preset/grouped or /api/presets/grouped
 * Returns all presets organized by category keys for instant UI/client tab loading.
 */
router.get('/grouped', optionalAuth, (req, res, next) => {
  try {
    const { search } = req.query;
    const result = fileService.listFiles({ page: 1, limit: 1000, search });
    
    const grouped = {};
    result.files.forEach(file => {
      const preset = toCleanPreset(file);
      const cat = preset.category;
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(preset);
    });

    return res.json({
      success: true,
      presets: grouped
    });
  } catch (err) {
    next(err);
  }
});

/**
 * EDIT PRESET: PATCH /api/preset/:id or PUT /api/preset/:id
 * Updates preset title or category.
 */
const handleUpdatePreset = (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, category } = req.body;
    const updated = fileService.updateFile(id, { title, category });

    return res.json({
      success: true,
      message: `Preset '${id}' updated successfully.`,
      preset: toCleanPreset(updated)
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
