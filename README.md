# Aperture File Server

A high-performance, production-ready file upload API and web interface built with **Node.js**, **Express.js**, and **SQLite**. Designed with a modular storage provider architecture, granular API key permissions, rate limiting, and defensive security controls.

---

## 🌟 Features

- ⚡ **RESTful API**: Clean JSON responses with consistent error and success schemas.
- 🔒 **Bearer Token Authentication & Permissions**: Fine-grained access control (`files:read`, `files:upload`, `files:delete`, `files:manage`).
- 🛡️ **Defensive Security**:
  - Path traversal prevention.
  - Server-side unique ID generation (`f_8a72c91e4f2b`).
  - Dangerous executable extension blacklisting (`.exe`, `.sh`, `.bat`, etc.).
  - Rate limiting with `express-rate-limit`.
  - HTTP security headers with `helmet`.
  - CORS configuration.
- 💾 **Modular Storage System**:
  - Local disk storage provider with absolute containment guarantees.
  - S3 / MinIO / Cloudflare R2 cloud-ready provider abstraction.
- 🗄️ **SQLite Metadata Engine**:
  - High-performance WAL mode (`better-sqlite3`).
  - File indexing and instant search.
- 🎨 **Modern Cyber-Glassmorphic Web Interface**:
  - Responsive Drag-and-Drop file picker.
  - Granular upload progress indicator and percentage.
  - Cancel upload support (`XMLHttpRequest.abort()`).
  - 1-click URL and API endpoint copy buttons.
  - State management: `READY`, `UPLOADING`, `SUCCESS`, and `FAILURE` with retry.
  - Interactive file explorer with pagination, search, and delete actions.

---

## 📋 Table of Contents

1. [Installation](#installation)
2. [Environment Configuration](#environment-configuration)
3. [Server Startup](#server-startup)
4. [API Authentication & Permission Scopes](#api-authentication--permission-scopes)
5. [Presets & Two-Level Category System](#presets--two-level-category-system)
   - [Get Image Presets Only (`GET /api/presets/image`)](#get-image-presets-only)
   - [Get Text Presets Only (`GET /api/presets/text`)](#get-text-presets-only)
   - [Get Category Hierarchy (`GET /api/presets/categories`)](#get-category-hierarchy)
   - [Get Grouped Presets (`GET /api/presets`)](#get-grouped-presets)
   - [Edit Preset (`PATCH /api/presets/:id`)](#edit-preset)
   - [Delete Preset (`DELETE /api/presets/:id`)](#delete-preset)
6. [API Endpoints & cURL Examples](#api-endpoints--curl-examples)
   - [Upload File](#1-upload-file)
   - [Get File Metadata](#2-get-file-metadata)
   - [Download File](#3-download-file)
   - [View / Stream File](#4-view--stream-file)
   - [Delete File](#5-delete-file)
   - [List Files (Paginated)](#6-list-files-paginated)
   - [Health Check](#7-health-check)
   - [API Key Management](#8-api-key-management)
7. [Error Response Format & Error Codes](#error-response-format--error-codes)
8. [Modular Storage Architecture (Local & Cloud S3)](#modular-storage-architecture)
9. [Mobile Integration (Android / iOS)](#mobile-integration)
10. [Production Deployment Instructions](#production-deployment-instructions)

---

## 🚀 Installation

Ensure **Node.js (v18+)** and **npm** are installed on your system.

```bash
# 1. Clone or navigate to the project directory
cd aperture-server

# 2. Install production and development dependencies
npm install
```

---

## ⚙️ Environment Configuration

Copy `.env.example` to create your `.env` configuration file:

```bash
cp .env.example .env
```

### Configuration Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for the HTTP server to listen on. |
| `BASE_URL` | `http://localhost:3000` | Publicly accessible base URL for the server. |
| `MAX_FILE_SIZE_MB` | `100` | Maximum allowed file upload size in megabytes. |
| `UPLOAD_DIRECTORY` | `./storage/uploads` | Path to store local files. |
| `DATABASE_PATH` | `./storage/database.sqlite` | Path to SQLite metadata database. |
| `STORAGE_PROVIDER` | `local` | Active storage provider (`local` or `s3`). |
| `RATE_LIMIT_WINDOW_MS`| `900000` (15 min) | Rate limiting window in milliseconds. |
| `RATE_LIMIT_MAX` | `300` | Max requests allowed per IP per window. |
| `ALLOWED_EXTENSIONS`| `""` (all allowed) | Whitelist of allowed extensions (e.g. `jpg,png,pdf,mp4`). |
| `ADMIN_API_KEY` | `aperture_adm_secret_key_2026` | Master admin key seeded on initial boot. |
| `UPLOAD_API_KEY` | `aperture_upl_secret_key_2026` | Upload key seeded on initial boot. |
| `READ_API_KEY` | `aperture_ro_secret_key_2026` | Read-only key seeded on initial boot. |

---

## 🖥️ Server Startup

### Development Mode (with hot reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

Once running, access the web upload interface at:
👉 **[http://localhost:3000/](http://localhost:3000/)**

---

## 🔑 API Authentication & Permission Scopes

All protected endpoints require authentication via an **API Key** sent as a Bearer token:

```http
Authorization: Bearer YOUR_API_KEY
```
*(Alternatively, you can pass the `x-api-key: YOUR_API_KEY` header).*

### Permission Scopes

| Scope | Description |
|---|---|
| `files:read` | Allows listing files, viewing metadata, and downloading. |
| `files:upload` | Allows uploading new files to the server. |
| `files:delete` | Allows deleting physical files and metadata. |
| `files:manage` | Master admin permission granting universal access to all endpoints and API key management. |

### Pre-Seeded Default Keys

| Role | Key | Granted Scopes |
|---|---|---|
| **Master Admin** | `aperture_adm_secret_key_2026` | `files:read`, `files:upload`, `files:delete`, `files:manage` |
| **Upload Service** | `aperture_upl_secret_key_2026` | `files:read`, `files:upload` |
| **Read Only** | `aperture_ro_secret_key_2026` | `files:read` |

---

## 🎨 Presets & Two-Level Category System

The system provides a two-level hierarchical classification system designed for presets:
1. **Main Category**:
   - `image` (`Image Preset`): Pre-seeded with subcategories: `Vintage`, `Modern`, `Black & White`, `Cinematic`, `Portrait`, `Landscape`, `Moody`, `Warm Tones`, `Cool Tones`, `Cyberpunk`, plus user-defined subcategories.
   - `text` (`Text Preset`): Empty by default, allows adding any custom text preset subcategories.
2. **Sub Category**:
   - Specific style or grouping within the main category.

---

### Get Image Presets Only

```bash
# Get all image presets
curl -X GET http://localhost:3000/api/presets/image

# Filter image presets by subcategory (e.g. Vintage)
curl -X GET http://localhost:3000/api/presets/image/Vintage
```

**Response:**
```json
{
  "success": true,
  "mainCategory": "image",
  "count": 1,
  "subCategories": ["Vintage"],
  "presets": [
    {
      "id": "f_c11d0a6c3916",
      "title": "Amber Sunset LUT",
      "mainCategory": "image",
      "subCategory": "Vintage",
      "category": "Vintage",
      "fileUrl": "http://localhost:3000/files/f_c11d0a6c3916",
      "downloadUrl": "http://localhost:3000/files/f_c11d0a6c3916/download",
      "viewUrl": "http://localhost:3000/files/f_c11d0a6c3916/view",
      "fileName": "amber_sunset.cube",
      "fileSize": 118086,
      "sizeFormatted": "115.32 KB",
      "uploadedAt": "2026-09-28T20:23:16.336Z"
    }
  ],
  "grouped": {
    "Vintage": [ /* preset objects */ ]
  }
}
```

---

### Get Text Presets Only

```bash
# Get all text presets
curl -X GET http://localhost:3000/api/presets/text

# Filter text presets by subcategory (e.g. Quotes)
curl -X GET http://localhost:3000/api/presets/text/Quotes
```

---

### Get Category Hierarchy

Returns available preset styles and dynamic subcategories for both `image` and `text`:

```bash
curl -X GET http://localhost:3000/api/presets/categories
```

**Response:**
```json
{
  "success": true,
  "categories": {
    "image": [
      "Vintage",
      "Modern",
      "Black & White",
      "Cinematic",
      "Portrait",
      "Landscape",
      "Moody",
      "Warm Tones",
      "Cool Tones",
      "Cyberpunk"
    ],
    "text": [
      "Quotes",
      "Captions"
    ]
  }
}
```

---

### Get Grouped Presets

```bash
curl -X GET http://localhost:3000/api/presets
```

---

### Edit Preset

Update title, main category, and subcategory for any preset:

```bash
curl -X PATCH http://localhost:3000/api/presets/f_c11d0a6c3916 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Moody Forest Glow",
    "mainCategory": "image",
    "subCategory": "Moody"
  }'
```

---

### Delete Preset

```bash
curl -X DELETE http://localhost:3000/api/presets/f_c11d0a6c3916
```

---

## 📡 API Endpoints & cURL Examples

### 1. Upload File
- **Method**: `POST`
- **Endpoint**: `/api/v1/files`
- **Required Permission**: `files:upload`
- **Content-Type**: `multipart/form-data`
- **Form Fields**:
  - `file` *(Required)*: File binary payload (e.g. `.apx`, `.bin`, `.json`, `.pdf`, etc.)
  - `title` *(Optional)*: Custom file title / display name.
  - `category` *(Optional)*: Category identifier (e.g. `firmware`, `config`, `documents`, `updates`, `general`).

```bash
curl -X POST http://localhost:3000/api/v1/files \
  -H "Authorization: Bearer aperture_upl_secret_key_2026" \
  -F "file=@example.apx" \
  -F "title=Aperture Core Firmware v2.4" \
  -F "category=firmware"
```

#### Success Response (`201 Created`):
```json
{
  "success": true,
  "file": {
    "id": "f_8a72c91e4f2b",
    "title": "Aperture Core Firmware v2.4",
    "category": "firmware",
    "originalName": "example.apx",
    "filename": "f_8a72c91e4f2b.apx",
    "mimeType": "application/octet-stream",
    "size": 123456,
    "uploadedAt": "2026-09-28T12:00:00.000Z",
    "url": "http://localhost:3000/files/f_8a72c91e4f2b",
    "apiUrl": "http://localhost:3000/api/v1/files/f_8a72c91e4f2b"
  }
}
```

---

### 2. Get File Metadata
- **Method**: `GET`
- **Endpoint**: `/api/v1/files/:id`
- **Required Permission**: `files:read`

```bash
curl -X GET http://localhost:3000/api/v1/files/f_8a72c91e4f2b \
  -H "Authorization: Bearer aperture_ro_secret_key_2026"
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "file": {
    "id": "f_8a72c91e4f2b",
    "title": "Aperture Core Firmware v2.4",
    "category": "firmware",
    "originalName": "example.apx",
    "filename": "f_8a72c91e4f2b.apx",
    "mimeType": "application/octet-stream",
    "size": 123456,
    "uploadedAt": "2026-09-28T12:00:00.000Z",
    "url": "http://localhost:3000/files/f_8a72c91e4f2b",
    "apiUrl": "http://localhost:3000/api/v1/files/f_8a72c91e4f2b"
  }
}
```

---

### 3. Download File
- **Method**: `GET`
- **Endpoint**: `/api/v1/files/:id/download` or `/files/:id/download`
- **Description**: Triggers direct browser attachment download with original filename preserved.

```bash
curl -O -J http://localhost:3000/api/v1/files/f_8a72c91e4f2b/download
```

---

### 4. View / Stream File
- **Method**: `GET`
- **Endpoint**: `/api/v1/files/:id/view` or `/files/:id`
- **Description**: Streams file inline (images, videos, audio, PDF) with HTTP `206 Partial Content` Range header support for seeking.

```bash
curl -i http://localhost:3000/api/v1/files/f_8a72c91e4f2b/view
```

---

### 5. Delete File
- **Method**: `DELETE`
- **Endpoint**: `/api/v1/files/:id`
- **Required Permission**: `files:delete`

```bash
curl -X DELETE http://localhost:3000/api/v1/files/f_8a72c91e4f2b \
  -H "Authorization: Bearer aperture_adm_secret_key_2026"
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "File 'f_8a72c91e4f2b' has been permanently deleted."
}
```

---

### 6. List Files (Paginated)
- **Method**: `GET`
- **Endpoint**: `/api/v1/files?page=1&limit=20&search=doc`
- **Required Permission**: `files:read`

```bash
curl -X GET "http://localhost:3000/api/v1/files?page=1&limit=20" \
  -H "Authorization: Bearer aperture_ro_secret_key_2026"
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "files": [
    {
      "id": "f_8a72c91e4f2b",
      "originalName": "example.apx",
      "filename": "f_8a72c91e4f2b.apx",
      "mimeType": "application/octet-stream",
      "size": 123456,
      "uploadedAt": "2026-09-28T12:00:00.000Z",
      "url": "http://localhost:3000/files/f_8a72c91e4f2b",
      "apiUrl": "http://localhost:3000/api/v1/files/f_8a72c91e4f2b"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 7. Presets API (Instant Mobile & Client Extraction)

Designed specifically for client apps (Android/iOS, web apps, preset managers) to retrieve presets with **title**, **category**, and **direct access URLs** in a single call.

#### A. Flat Presets List: `GET /api/v1/presets`
Query parameters: `?category=Cinematic`, `?search=soft`, `?page=1&limit=50`

```bash
curl http://localhost:3000/api/v1/presets
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "total": 3,
  "categories": ["Cinematic", "Portrait", "Vintage"],
  "presets": [
    {
      "id": "f_c2b56aa43bce",
      "title": "Teal & Orange Cyberpunk",
      "category": "Cinematic",
      "originalName": "cinematic_01.apx",
      "filename": "f_c2b56aa43bce.apx",
      "mimeType": "application/octet-stream",
      "size": 123456,
      "sizeFormatted": "120.56 KB",
      "uploadedAt": "2026-09-28T19:19:11.575Z",
      "directUrl": "http://localhost:3000/files/f_c2b56aa43bce",
      "downloadUrl": "http://localhost:3000/files/f_c2b56aa43bce/download",
      "viewUrl": "http://localhost:3000/files/f_c2b56aa43bce/view",
      "url": "http://localhost:3000/files/f_c2b56aa43bce",
      "apiUrl": "http://localhost:3000/api/v1/files/f_c2b56aa43bce"
    }
  ]
}
```

#### B. Grouped by Category: `GET /api/v1/presets/grouped`
Returns all presets categorized under custom category keys for instant UI tab / category rendering.

```bash
curl http://localhost:3000/api/v1/presets/grouped
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "total": 3,
  "categories": ["Cinematic", "Portrait", "Vintage"],
  "grouped": {
    "Cinematic": [
      {
        "id": "f_c2b56aa43bce",
        "title": "Teal & Orange Cyberpunk",
        "category": "Cinematic",
        "downloadUrl": "http://localhost:3000/files/f_c2b56aa43bce/download",
        "viewUrl": "http://localhost:3000/files/f_c2b56aa43bce/view",
        "directUrl": "http://localhost:3000/files/f_c2b56aa43bce"
      }
    ],
    "Portrait": [
      {
        "id": "f_e9641bb5a993",
        "title": "Soft Skin Tone Glow",
        "category": "Portrait",
        "downloadUrl": "http://localhost:3000/files/f_e9641bb5a993/download",
        "viewUrl": "http://localhost:3000/files/f_e9641bb5a993/view",
        "directUrl": "http://localhost:3000/files/f_e9641bb5a993"
      }
    ]
  }
}
```

#### C. Edit Preset Title & Category: `PATCH /api/preset/:id`
Updates preset title and custom category without re-uploading file binary.

```bash
curl -X PATCH http://localhost:3000/api/preset/f_c2b56aa43bce \
  -H "Content-Type: application/json" \
  -d '{"title": "Teal & Orange Sunset Edition", "category": "Cinematic"}'
```

#### D. Remove Preset: `DELETE /api/preset/:id`
Permanently deletes the physical preset file and database metadata.

```bash
curl -X DELETE http://localhost:3000/api/preset/f_c2b56aa43bce
```

---

### 8. Health Check
- **Method**: `GET`
- **Endpoint**: `/api/v1/health`

```bash
curl http://localhost:3000/api/v1/health
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-09-28T12:00:00.000Z",
  "uptimeSeconds": 3600,
  "service": {
    "name": "Aperture File Server",
    "version": "1.0.0",
    "baseUrl": "http://localhost:3000",
    "storageProvider": "local",
    "maxFileSizeMb": 100
  },
  "components": {
    "database": {
      "status": "healthy",
      "activeFiles": 42,
      "activeApiKeys": 3
    },
    "storage": {
      "status": "healthy",
      "provider": "local"
    }
  }
}
```

---

### 8. API Key Management
- **Method**: `POST`
- **Endpoint**: `/api/v1/keys`
- **Required Permission**: `files:manage`

```bash
curl -X POST http://localhost:3000/api/v1/keys \
  -H "Authorization: Bearer aperture_adm_secret_key_2026" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mobile App Client Key",
    "permissions": ["files:read", "files:upload"]
  }'
```

---

## ⚠️ Error Response Format & Error Codes

All errors return a standardized JSON structure:

```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "The uploaded file exceeds the maximum allowed size of 100MB."
  }
}
```

### Standard Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing Bearer token in `Authorization` header. |
| `INVALID_API_KEY` | 401 | The supplied API key was not found or is revoked. |
| `FORBIDDEN` | 403 | API key lacks required scope for this action. |
| `FILE_NOT_FOUND` | 404 | File ID does not exist in the database. |
| `INVALID_FILE_ID` | 400 | File ID did not match the expected format (`f_...`). |
| `FILE_TOO_LARGE` | 400 | File size exceeded `MAX_FILE_SIZE_MB`. |
| `BLOCKED_FILE_TYPE` | 400 | The file extension was blocked for security. |
| `NO_FILE_PROVIDED` | 400 | The multipart form did not contain a `file` field. |
| `RATE_LIMIT_EXCEEDED`| 429 | Rate limit exceeded for the requesting IP. |
| `INTERNAL_SERVER_ERROR`| 500 | Unexpected server exception. |

---

## 🏗️ Modular Storage Architecture

The storage layer is decoupled using the `StorageProvider` interface in `server/services/storageService.js`.

### How to switch to AWS S3 / Cloudflare R2 / MinIO:

1. Install the official AWS SDK client:
   ```bash
   npm install @aws-sdk/client-s3
   ```
2. Update `.env`:
   ```env
   STORAGE_PROVIDER=s3
   S3_BUCKET_NAME=your-bucket-name
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-key
   AWS_SECRET_ACCESS_KEY=your-secret
   # Optional for MinIO / R2:
   S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
   ```
3. The database automatically tracks `storage_provider` per file, allowing hybrid storage migrations.

---

## 📱 Mobile Integration (Android / iOS)

The API is fully decoupled and ready for mobile applications (e.g., Kotlin/Retrofit on Android, Swift/URLSession on iOS).

### Android (Retrofit / OkHttp Example)

```kotlin
interface ApertureApi {
    @Multipart
    @POST("api/v1/files")
    suspend fun uploadFile(
        @Header("Authorization") bearerToken: String,
        @Part file: MultipartBody.Part
    ): Response<FileUploadResponse>

    @GET("api/v1/files/{id}")
    suspend fun getFileMetadata(
        @Header("Authorization") bearerToken: String,
        @Path("id") fileId: String
    ): Response<FileMetadataResponse>
}
```

---

## 🚢 Production Deployment Instructions

### 1. Process Manager (PM2)
```bash
npm install -g pm2
pm2 start server/app.js --name "aperture-server" -i max
pm2 save
pm2 startup
```

### 2. Nginx Reverse Proxy Configuration
```nginx
server {
    listen 80;
    server_name files.yourdomain.com;

    # Important: Set client_max_body_size to match MAX_FILE_SIZE_MB
    client_max_body_size 120M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for instant streaming uploads
        proxy_request_buffering off;
    }
}
```

---

## 📄 License
MIT License. Created by Aperture Labs.
