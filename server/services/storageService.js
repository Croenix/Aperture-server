const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const config = require('../config');

/**
 * Base Abstract Storage Provider Interface.
 */
class StorageProvider {
  async saveFile(params) {
    throw new Error('saveFile() must be implemented by storage provider');
  }
  async getReadStream(fileRecord, options = {}) {
    throw new Error('getReadStream() must be implemented by storage provider');
  }
  async deleteFile(fileRecord) {
    throw new Error('deleteFile() must be implemented by storage provider');
  }
  async fileExists(fileRecord) {
    throw new Error('fileExists() must be implemented by storage provider');
  }
  async getFileStats(fileRecord) {
    throw new Error('getFileStats() must be implemented by storage provider');
  }
}

/**
 * Cloudinary Storage Provider.
 * Stores all uploaded assets (images, fonts, stickers, presets) in Cloudinary
 * inside the configured folder (e.g. 'Aperture Assets').
 */
class CloudinaryStorageProvider extends StorageProvider {
  constructor(options = {}) {
    super();
    this.cloudName = options.cloudName || config.cloudinary.cloudName;
    this.apiKey = options.apiKey || config.cloudinary.apiKey;
    this.apiSecret = options.apiSecret || config.cloudinary.apiSecret;
    this.folder = options.folder || config.cloudinary.folder || 'Aperture Assets';

    if (this.cloudName && this.apiKey && this.apiSecret) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret
      });
    }
  }

  async saveFile({ fileId, tempFilePath, originalName, mimeType }) {
    if (!tempFilePath || !fs.existsSync(tempFilePath)) {
      throw new Error('Source file not found for Cloudinary upload');
    }

    const folderName = this.folder || 'Aperture Assets';
    const uploadOptions = {
      folder: folderName,
      public_id: fileId,
      resource_type: 'auto',
      use_filename: false,
      unique_filename: false
    };

    let result;
    try {
      result = await cloudinary.uploader.upload(tempFilePath, uploadOptions);
    } catch (err) {
      // Fallback for custom binary/font extensions that require raw resource type
      if (err && err.message && (err.message.includes('Invalid image file') || err.message.includes('file format'))) {
        uploadOptions.resource_type = 'raw';
        result = await cloudinary.uploader.upload(tempFilePath, uploadOptions);
      } else {
        throw err;
      }
    }

    // Clean up local temp file after upload to Cloudinary
    await fs.promises.unlink(tempFilePath).catch(() => {});

    return {
      storageFilename: result.public_id,
      storagePath: result.public_id,
      directUrl: result.secure_url || result.url,
      size: result.bytes || 0,
      storageMetadata: {
        provider: 'cloudinary',
        publicId: result.public_id,
        secureUrl: result.secure_url || result.url,
        format: result.format,
        resourceType: result.resource_type,
        folder: folderName
      }
    };
  }

  async deleteFile(fileRecord) {
    try {
      const publicId = fileRecord.storagePath || fileRecord.filename;
      if (!publicId) return true;

      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      } catch {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      }
      return true;
    } catch (err) {
      return true;
    }
  }

  async fileExists(fileRecord) {
    return Boolean(fileRecord.directUrl || fileRecord.storagePath);
  }

  async getFileStats(fileRecord) {
    return {
      size: fileRecord.size,
      url: fileRecord.directUrl || fileRecord.storagePath
    };
  }
}

/**
 * Local Filesystem Storage Provider.
 */
class LocalStorageProvider extends StorageProvider {
  constructor(uploadDirectory = config.uploadDirectory) {
    super();
    this.uploadDirectory = path.resolve(uploadDirectory);
    this._ensureDirectory();
  }

  _ensureDirectory() {
    if (!fs.existsSync(this.uploadDirectory)) {
      fs.mkdirSync(this.uploadDirectory, { recursive: true });
    }
  }

  _getSafeAbsolutePath(filename) {
    const safeBaseName = path.basename(filename);
    const resolvedPath = path.resolve(this.uploadDirectory, safeBaseName);
    if (!resolvedPath.startsWith(this.uploadDirectory)) {
      throw new Error('Path traversal attempt detected');
    }
    return resolvedPath;
  }

  async saveFile({ fileId, tempFilePath, originalName, mimeType }) {
    this._ensureDirectory();

    const ext = path.extname(originalName).toLowerCase();
    const storageFilename = `${fileId}${ext}`;
    const destinationPath = this._getSafeAbsolutePath(storageFilename);

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.promises.rename(tempFilePath, destinationPath);
      } catch (err) {
        await fs.promises.copyFile(tempFilePath, destinationPath);
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
    } else {
      throw new Error('Source file not found for storage save');
    }

    const stat = await fs.promises.stat(destinationPath);

    return {
      storageFilename,
      storagePath: storageFilename,
      size: stat.size,
      storageMetadata: {
        provider: 'local',
        absoluteDir: this.uploadDirectory
      }
    };
  }

  async getReadStream(fileRecord, options = {}) {
    const absolutePath = this._getSafeAbsolutePath(fileRecord.storagePath || fileRecord.filename);
    if (!fs.existsSync(absolutePath)) {
      const err = new Error('File not found on storage disk');
      err.code = 'ENOENT';
      throw err;
    }
    return fs.createReadStream(absolutePath, options);
  }

  async deleteFile(fileRecord) {
    try {
      const absolutePath = this._getSafeAbsolutePath(fileRecord.storagePath || fileRecord.filename);
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return true;
      throw err;
    }
  }

  async fileExists(fileRecord) {
    try {
      const absolutePath = this._getSafeAbsolutePath(fileRecord.storagePath || fileRecord.filename);
      await fs.promises.access(absolutePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async getFileStats(fileRecord) {
    const absolutePath = this._getSafeAbsolutePath(fileRecord.storagePath || fileRecord.filename);
    return fs.promises.stat(absolutePath);
  }
}

/**
 * S3 Provider Skeleton
 */
class S3StorageProvider extends StorageProvider {
  constructor(options = {}) {
    super();
  }
}

// Storage Provider Registry & Factory
const providers = {
  local: new LocalStorageProvider(),
  cloudinary: new CloudinaryStorageProvider(),
  s3: new S3StorageProvider()
};

function getStorageProvider(name = config.storageProvider) {
  const provider = providers[name.toLowerCase()];
  if (!provider) {
    throw new Error(`Unsupported storage provider: ${name}. Supported providers: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

module.exports = {
  StorageProvider,
  LocalStorageProvider,
  CloudinaryStorageProvider,
  S3StorageProvider,
  getStorageProvider
};
