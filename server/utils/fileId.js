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

/**
 * Formats a title or derives it from original filename:
 * Strips file extension, replaces all '-' and '.' with spaces, collapses multiple spaces, and trims.
 * @param {string} rawTitle 
 * @param {string} [originalName] 
 * @returns {string}
 */
function formatTitle(rawTitle, originalName = '') {
  let text = (rawTitle && typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : '';

  if (!text && originalName && typeof originalName === 'string') {
    text = originalName.trim();
  }

  if (!text) return 'unnamed';

  // Strip non-numeric file extension if present (e.g. .ttf, .png, .lut, .cube, .otf)
  const match = text.match(/\.([a-zA-Z0-9]{2,8})$/);
  if (match) {
    const extName = match[1].toLowerCase();
    // Only strip if extension is not purely numeric (e.g. avoid stripping .2 from v1.2)
    if (!/^\d+$/.test(extName)) {
      text = text.slice(0, text.length - match[0].length);
    }
  }

  // Replace arrow marks, dashes, underscores, dots, and split CamelCase/PascalCase words (e.g. MapName -> Map Name)
  return text
    .replace(/(?:-->|->|=>|→|➔|➜|➡|>|[\u2190-\u21FF\u2794-\u27BE])/g, ' ')
    .replace(/[-_.]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  generateFileId,
  isValidFileId,
  sanitizeOriginalFilename,
  getSafeExtension,
  formatTitle
};

