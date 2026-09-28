const crypto = require('crypto');
const path = require('path');

/**
 * Generates a unique, public-safe file identifier.
 * Format: f_<12-hex-characters> (e.g., f_8a72c91e4f2b)
 * @returns {string} Unique file ID
 */
function generateFileId() {
  const hex = crypto.randomBytes(6).toString('hex');
  return `f_${hex}`;
}

/**
 * Validates whether a given string is a valid file ID format.
 * @param {string} id
 * @returns {boolean}
 */
function isValidFileId(id) {
  if (typeof id !== 'string') return false;
  return /^f_[0-9a-fA-F]{12}$/.test(id.trim());
}

/**
 * Sanitizes original filename to prevent path traversal, null-byte injection,
 * and dangerous character sets while preserving legitimate international characters.
 * @param {string} filename 
 * @returns {string} Sanitized base filename
 */
function sanitizeOriginalFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // Remove any path traversal tokens (/ \ .. :)
  let sanitized = path.basename(filename);

  // Remove control characters (ASCII 0-31 and 127) and null bytes
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');

  // Strip characters reserved in Windows / Unix filesystems: < > : " / \ | ? *
  sanitized = sanitized.replace(/[<>:"/\\|?*]/g, '_');

  // Collapse consecutive underscores or spaces
  sanitized = sanitized.replace(/\s+/g, ' ').replace(/_+/g, '_').trim();

  // Strip leading and trailing dots
  sanitized = sanitized.replace(/^\.+|\.+$/g, '');

  if (!sanitized) {
    sanitized = 'file';
  }

  // Cap maximum filename length
  if (sanitized.length > 200) {
    const ext = path.extname(sanitized);
    const base = path.basename(sanitized, ext);
    sanitized = base.slice(0, 195 - ext.length) + ext;
  }

  return sanitized;
}

/**
 * Extracts normalized file extension without leading dot.
 * @param {string} filename 
 * @returns {string}
 */
function getSafeExtension(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const ext = path.extname(filename).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

module.exports = {
  generateFileId,
  isValidFileId,
  sanitizeOriginalFilename,
  getSafeExtension
};
