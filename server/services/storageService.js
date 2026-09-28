const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Base Abstract Storage Provider Interface.
 * All custom storage adapters (e.g. S3, Cloudflare R2, Google Cloud Storage, Azure Blob)
 * must implement this contract.
 */
class StorageProvider {
  /**
   * Saves an uploaded file to storage.
   * @param {Object} params
   * @param {string} params.fileId - Safe unique file ID (e.g. f_8a72c91e4f2b)
   * @param {string} params.tempFilePath - Path to temporary file on disk (from multer)
   * @param {string} params.originalName - Sanitized original filename
   * @param {string} params.mimeType - MIME type
   * @returns {Promise<{ storageFilename: string, storagePath: string, storageMetadata: Object|null }>}
   */
  async saveFile(params) {
    throw new Error('saveFile() must be implemented by storage provider');
  }

  /**
   * Returns a readable stream for streaming or downloading the file.
   * @param {Object} fileRecord - Database file record
   * @param {Object} [options] - Stream options (e.g. { start, end } for range requests)
   * @returns {Promise<stream.Readable>}
   */
  async getReadStream(fileRecord, options = {}) {
    throw new Error('getReadStream() must be implemented by storage provider');
  }

  /**
   * Deletes a file from physical storage.
   * @param {Object} fileRecord - Database file record
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileRecord) {
    throw new Error('deleteFile() must be implemented by storage provider');
  }

  /**
   * Checks if the physical file exists in storage.
   * @param {Object} fileRecord - Database file record
   * @returns {Promise<boolean>}
   */
  async fileExists(fileRecord) {
    throw new Error('fileExists() must be implemented by storage provider');
  }

  /**
   * Returns stats/metadata about the physical file if available.
   * @param {Object} fileRecord
   * @returns {Promise<Object>}
   */
  async getFileStats(fileRecord) {
    throw new Error('getFileStats() must be implemented by storage provider');
  }
}

/**
 * Local Filesystem Storage Provider.
 * Stores files securely in the configured UPLOAD_DIRECTORY outside public root.
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

  /**
   * Safely resolves a stored filename within the upload directory,
   * guaranteeing no path traversal outside uploadDirectory.
   */
  _getSafeAbsolutePath(filename) {
    const safeBaseName = path.basename(filename);
    const resolvedPath = path.resolve(this.uploadDirectory, safeBaseName);
    
    // Strict directory containment check
    if (!resolvedPath.startsWith(this.uploadDirectory)) {
      throw new Error('Path traversal attempt detected');
    }
    return resolvedPath;
  }

  async saveFile({ fileId, tempFilePath, originalName, mimeType }) {
    this._ensureDirectory();

    // Preserve extension safely
    const ext = path.extname(originalName).toLowerCase();
    const storageFilename = `${fileId}${ext}`;
    const destinationPath = this._getSafeAbsolutePath(storageFilename);

    // If file came from multer disk storage temp path, move it; otherwise write buffer
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.promises.rename(tempFilePath, destinationPath);
      } catch (err) {
        // Fallback for cross-device moves
        await fs.promises.copyFile(tempFilePath, destinationPath);
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
    } else {
      throw new Error('Source file not found for storage save');
    }

    const stat = await fs.promises.stat(destinationPath);

    return {
      storageFilename,
      storagePath: storageFilename, // relative key for portability
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
 * Cloud S3-Compatible Storage Provider (Skeleton / Ready for AWS S3 / MinIO / Cloudflare R2).
 * To activate, configure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME in .env.
 */
class S3StorageProvider extends StorageProvider {
  constructor(options = {}) {
    super();
    this.bucket = options.bucket || process.env.S3_BUCKET_NAME;
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    this.endpoint = options.endpoint || process.env.S3_ENDPOINT;
    // S3Client initialization can be plugged here when @aws-sdk/client-s3 is added
  }

  async saveFile({ fileId, tempFilePath, originalName, mimeType }) {
    const ext = path.extname(originalName).toLowerCase();
    const key = `uploads/${fileId}${ext}`;
    
    // AWS S3 PutObjectCommand implementation pattern:
    // const stream = fs.createReadStream(tempFilePath);
    // await s3Client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: stream, ContentType: mimeType }));
    
    throw new Error('S3StorageProvider is configured as modular architecture. Install @aws-sdk/client-s3 and configure S3 credentials to use.');
  }

  async getReadStream(fileRecord, options = {}) {
    throw new Error('S3StorageProvider getReadStream not enabled.');
  }

  async deleteFile(fileRecord) {
    throw new Error('S3StorageProvider deleteFile not enabled.');
  }

  async fileExists(fileRecord) {
    throw new Error('S3StorageProvider fileExists not enabled.');
  }

  async getFileStats(fileRecord) {
    throw new Error('S3StorageProvider getFileStats not enabled.');
  }
}

// Storage Provider Registry & Factory
const providers = {
  local: new LocalStorageProvider(),
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
  S3StorageProvider,
  getStorageProvider
};
