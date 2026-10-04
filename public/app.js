/**
 * APERTURE CLOUD VAULT - FRONTEND CONTROLLER
 * Hierarchical Category System, Grid/Table View Toggles, Dynamic Vault Metrics & Live Search
 */

(function () {
  'use strict';

  const DEFAULT_IMAGE_SUBCATEGORIES = [
    'Vintage', 'Modern', 'Black & White', 'Cinematic', 'Portrait',
    'Landscape', 'Moody', 'Warm Tones', 'Cool Tones', 'Cyberpunk'
  ];

  const DEFAULT_FONT_SUBCATEGORIES = ['Normal'];

  const DEFAULT_STICKER_CATEGORIES = [
    'Badges', 'Emoji', 'Decorative', 'Icons', 'Anime',
    'Logos', 'Vectors', 'Labels', 'Illustrations'
  ];

  // Application State
  const state = {
    currentFile: null,
    selectedFiles: [],
    uploadIndex: 0,
    uploadedBatchResults: [],
    activeXhr: null,
    uploadStartTime: null,
    apiKey: sessionStorage.getItem('aperture_api_key') || 'aperture_upl_secret_key_2026',
    keyName: sessionStorage.getItem('aperture_key_name') || 'Upload Key Active',
    currentPage: 1,
    searchQuery: '',
    selectedMainFilter: 'all',
    selectedSubFilter: 'all',
    viewMode: localStorage.getItem('aperture_view_mode') || 'grid',
    totalPages: 1,
    filesList: [],
    categoriesTree: {
      image: [...DEFAULT_IMAGE_SUBCATEGORIES],
      text: [],
      font: [...DEFAULT_FONT_SUBCATEGORIES],
      sticker: [...DEFAULT_STICKER_CATEGORIES]
    }
  };

  // DOM Elements
  const elements = {
    // States
    stateReady: document.getElementById('state-ready'),
    stateUploading: document.getElementById('state-uploading'),
    stateSuccess: document.getElementById('state-success'),
    stateFailure: document.getElementById('state-failure'),

    // Dropzone & File Pickers
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    browseBtn: document.getElementById('browse-btn'),
    selectedPanel: document.getElementById('selected-file-panel'),
    selectedFileName: document.getElementById('selected-file-name'),
    selectedFileSize: document.getElementById('selected-file-size'),
    clearSelectedBtn: document.getElementById('clear-selected-btn'),
    cancelSelectedBtn: document.getElementById('cancel-selected-btn'),
    startUploadBtn: document.getElementById('start-upload-btn'),

    // Upload Meta Form
    customTitleInput: document.getElementById('custom-title-input'),
    uploadMainCategory: document.getElementById('upload-main-category'),
    uploadPricingSelect: document.getElementById('upload-pricing-select'),
    stickerFormatOptionGroup: document.getElementById('sticker-format-option-group'),
    uploadFormatSelect: document.getElementById('upload-format-select'),
    toggleCatImage: document.getElementById('toggle-cat-image'),
    toggleCatText: document.getElementById('toggle-cat-text'),
    toggleCatFont: document.getElementById('toggle-cat-font'),
    toggleCatSticker: document.getElementById('toggle-cat-sticker'),
    customSubcategorySelect: document.getElementById('custom-subcategory-select'),
    customSubcategoryInput: document.getElementById('custom-subcategory-input'),
    subcategoryLabelHint: document.getElementById('subcategory-label-hint'),

    // Uploading State Elements
    uploadingFileName: document.getElementById('uploading-file-name'),
    uploadPercentage: document.getElementById('upload-percentage'),
    progressBar: document.getElementById('progress-bar'),
    uploadBytes: document.getElementById('upload-bytes'),
    uploadSpeed: document.getElementById('upload-speed'),
    cancelUploadBtn: document.getElementById('cancel-upload-btn'),

    // Success State Elements
    successTitle: document.getElementById('success-title'),
    successMainCategory: document.getElementById('success-main-category'),
    successSubCategory: document.getElementById('success-sub-category'),
    successFilename: document.getElementById('success-filename'),
    successFilesize: document.getElementById('success-filesize'),
    successFileid: document.getElementById('success-fileid'),
    successMimetype: document.getElementById('success-mimetype'),
    successTimestamp: document.getElementById('success-timestamp'),
    successFileUrl: document.getElementById('success-file-url'),
    successApiUrl: document.getElementById('success-api-url'),
    successViewLink: document.getElementById('success-view-link'),
    successDownloadLink: document.getElementById('success-download-link'),
    uploadAnotherBtn: document.getElementById('upload-another-btn'),

    // Failure State Elements
    errorCodeBadge: document.getElementById('error-code-badge'),
    errorMessageText: document.getElementById('error-message-text'),
    retryUploadBtn: document.getElementById('retry-upload-btn'),
    chooseAnotherBtn: document.getElementById('choose-another-btn'),

    // Explorer / File Manager
    filesGridContainer: document.getElementById('files-grid-container'),
    filesGridBody: document.getElementById('files-grid-body'),
    filesTableContainer: document.getElementById('files-table-container'),
    filesTableBody: document.getElementById('files-table-body'),
    fileSearchInput: document.getElementById('file-search-input'),
    mainCategoryFilterSelect: document.getElementById('main-category-filter-select'),
    categoryFilterSelect: document.getElementById('category-filter-select'),
    refreshFilesBtn: document.getElementById('refresh-files-btn'),
    fileTotalCount: document.getElementById('file-total-count'),
    paginationInfo: document.getElementById('pagination-info'),
    prevPageBtn: document.getElementById('prev-page-btn'),
    nextPageBtn: document.getElementById('next-page-btn'),

    // View Toggles
    viewGridBtn: document.getElementById('view-grid-btn'),
    viewTableBtn: document.getElementById('view-table-btn'),

    // Category Pills
    categoryPills: document.querySelectorAll('.category-pill'),

    // Metrics Stat Elements
    statTotalCount: document.getElementById('stat-total-count'),
    statImageCount: document.getElementById('stat-image-count'),
    statTextCount: document.getElementById('stat-text-count'),
    statFontCount: document.getElementById('stat-font-count'),
    statStickerCount: document.getElementById('stat-sticker-count'),
    statStorageTotal: document.getElementById('stat-storage-total'),

    // Edit Modal Elements
    editModal: document.getElementById('edit-modal'),
    closeEditModal: document.getElementById('close-edit-modal'),
    cancelEditBtn: document.getElementById('cancel-edit-btn'),
    saveEditBtn: document.getElementById('save-edit-btn'),
    editFileId: document.getElementById('edit-file-id'),
    editFileTitle: document.getElementById('edit-file-title'),
    editFileMainCategory: document.getElementById('edit-file-main-category'),
    editFileSubcategorySelect: document.getElementById('edit-file-subcategory-select'),
    editFileSubcategoryCustom: document.getElementById('edit-file-subcategory-custom'),
    editFilePricingSelect: document.getElementById('edit-file-pricing-select'),
    editFileFormatGroup: document.getElementById('edit-file-format-group'),
    editFileFormatSelect: document.getElementById('edit-file-format-select'),

    // Status Indicator Pills
    mongoStatusPill: document.getElementById('mongo-status-pill'),
    mongoStatusText: document.getElementById('mongo-status-text'),
    cloudinaryStatusPill: document.getElementById('cloudinary-status-pill'),
    cloudinaryStatusText: document.getElementById('cloudinary-status-text'),
    serverStatusPill: document.getElementById('server-status-pill'),
    serverStatusText: document.getElementById('server-status-text'),

    // Auth & Security Page Modals
    authConfigBtn: document.getElementById('auth-config-btn'),
    activeKeyName: document.getElementById('active-key-name'),
    authModal: document.getElementById('auth-modal'),
    closeAuthModal: document.getElementById('close-auth-modal'),
    closeAuthModalBtn: document.getElementById('close-auth-modal-btn'),
    customApiKeyInput: document.getElementById('custom-api-key-input'),
    saveAuthBtn: document.getElementById('save-auth-btn'),
    toggleKeyVisibility: document.getElementById('toggle-key-visibility'),
    presetKeyCards: document.querySelectorAll('.preset-key-card'),
    createKeyForm: document.getElementById('create-key-form'),
    newKeyName: document.getElementById('new-key-name'),
    newKeyCustom: document.getElementById('new-key-custom'),
    createKeyBtn: document.getElementById('create-key-btn'),
    keysTableBody: document.getElementById('keys-table-body'),

    docsBtn: document.getElementById('docs-btn'),
    docsModal: document.getElementById('docs-modal'),
    closeDocsModal: document.getElementById('close-docs-modal'),

    // Toast Container
    toastContainer: document.getElementById('toast-container')
  };

  // Utility: Format bytes
  function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Utility: Format ISO timestamp
  function formatTimestamp(isoString) {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  }

  // Utility: Toast Notification
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
    toast.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${type === 'success' 
          ? '<polyline points="20 6 9 17 4 12"></polyline>' 
          : type === 'error'
          ? '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
          : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'}
      </svg>
      <span>${escapeHtml(message)}</span>
    `;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Switch View States (Ready, Uploading, Success, Failure)
  function switchState(stateName) {
    elements.stateReady.classList.add('hidden');
    elements.stateUploading.classList.add('hidden');
    elements.stateSuccess.classList.add('hidden');
    elements.stateFailure.classList.add('hidden');

    switch (stateName) {
      case 'ready':
        elements.stateReady.classList.remove('hidden');
        if (state.selectedFiles && state.selectedFiles.length > 0) {
          if (elements.dropZone) elements.dropZone.classList.add('hidden');
          elements.selectedPanel.classList.remove('hidden');
        } else {
          if (elements.dropZone) elements.dropZone.classList.remove('hidden');
          elements.selectedPanel.classList.add('hidden');
        }
        break;

      case 'uploading':
        elements.stateUploading.classList.remove('hidden');
        elements.uploadPercentage.textContent = '0%';
        elements.progressBar.style.width = '0%';
        elements.uploadSpeed.textContent = 'Connecting...';
        break;

      case 'success':
        elements.stateSuccess.classList.remove('hidden');
        break;

      case 'failure':
        elements.stateFailure.classList.remove('hidden');
        break;
    }
  }

  // Switch Repository Explorer View Mode (Grid vs Table)
  function setViewMode(mode) {
    state.viewMode = mode;
    localStorage.setItem('aperture_view_mode', mode);

    if (mode === 'grid') {
      if (elements.viewGridBtn) elements.viewGridBtn.classList.add('active');
      if (elements.viewTableBtn) elements.viewTableBtn.classList.remove('active');
      elements.filesGridContainer.classList.remove('hidden');
      elements.filesTableContainer.classList.add('hidden');
    } else {
      if (elements.viewGridBtn) elements.viewGridBtn.classList.remove('active');
      if (elements.viewTableBtn) elements.viewTableBtn.classList.add('active');
      elements.filesGridContainer.classList.add('hidden');
      elements.filesTableContainer.classList.remove('hidden');
    }
  }

  // Populate dynamic subcategory options
  function populateSubcategorySelect(selectEl, customInputEl, mainCategory, currentSub = '') {
    selectEl.innerHTML = '';

    let list = [];
    if (mainCategory === 'image') {
      list = state.categoriesTree.image || DEFAULT_IMAGE_SUBCATEGORIES;
    } else if (mainCategory === 'text') {
      list = state.categoriesTree.text || [];
    } else if (mainCategory === 'font') {
      list = state.categoriesTree.font || DEFAULT_FONT_SUBCATEGORIES;
    } else if (mainCategory === 'sticker') {
      list = state.categoriesTree.sticker || DEFAULT_STICKER_CATEGORIES;
    }

    if (list && list.length > 0) {
      list.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub;
        opt.textContent = sub;
        if (currentSub && currentSub.toLowerCase() === sub.toLowerCase()) {
          opt.selected = true;
        }
        selectEl.appendChild(opt);
      });
    }

    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = (list.length === 0) ? '+ Add Category (Required)' : '+ Enter Custom Category...';
    selectEl.appendChild(customOpt);

    if (list.length === 0 || (currentSub && !list.some(s => s.toLowerCase() === currentSub.toLowerCase()))) {
      selectEl.value = '__custom__';
      customInputEl.classList.remove('hidden');
      if (currentSub) {
        customInputEl.value = currentSub;
      }
    } else {
      if (!currentSub) {
        selectEl.selectedIndex = 0;
      }
      customInputEl.classList.add('hidden');
    }
  }

  // Handle Main Category Switch in Upload Form
  function setUploadMainCategory(mainCategory) {
    state.uploadMainCategory = mainCategory;
    elements.uploadMainCategory.value = mainCategory;

    [elements.toggleCatImage, elements.toggleCatText, elements.toggleCatFont, elements.toggleCatSticker].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (mainCategory === 'image') {
      if (elements.toggleCatImage) elements.toggleCatImage.classList.add('active');
      elements.subcategoryLabelHint.textContent = '(Select style e.g. Vintage)';
    } else if (mainCategory === 'text') {
      if (elements.toggleCatText) elements.toggleCatText.classList.add('active');
      elements.subcategoryLabelHint.textContent = '(Select or enter category)';
    } else if (mainCategory === 'font') {
      if (elements.toggleCatFont) elements.toggleCatFont.classList.add('active');
      elements.subcategoryLabelHint.textContent = '(Select font category)';
    } else if (mainCategory === 'sticker') {
      if (elements.toggleCatSticker) elements.toggleCatSticker.classList.add('active');
      elements.subcategoryLabelHint.textContent = '(Select sticker style)';
    }

    if (elements.stickerFormatOptionGroup) {
      if (mainCategory === 'sticker') {
        elements.stickerFormatOptionGroup.classList.remove('hidden');
      } else {
        elements.stickerFormatOptionGroup.classList.add('hidden');
      }
    }

    populateSubcategorySelect(elements.customSubcategorySelect, elements.customSubcategoryInput, mainCategory);
  }

  // Set Main Filter for Repository Explorer (via Pills, Select, or Stat Cards)
  function setMainFilter(mainCategory) {
    state.selectedMainFilter = mainCategory;
    state.currentPage = 1;

    // Sync HTML Select
    if (elements.mainCategoryFilterSelect) {
      elements.mainCategoryFilterSelect.value = mainCategory;
    }

    // Sync Pills UI
    elements.categoryPills.forEach(pill => {
      const cat = pill.getAttribute('data-category');
      if (cat === mainCategory) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    updateSubcategoryFilterDropdown();
    fetchFilesList();
  }

  // Helper to clean font title (converting arrows, dashes, underscores, dots to spaces)
  function cleanFontTitle(filename) {
    if (!filename || typeof filename !== 'string') return 'Unnamed Font';
    let text = filename.trim();

    const match = text.match(/\.([a-zA-Z0-9]{2,8})$/);
    if (match) {
      const extName = match[1].toLowerCase();
      if (!/^\d+$/.test(extName)) {
        text = text.slice(0, text.length - match[0].length);
      }
    }

    return text
      .replace(/(?:-->|->|=>|→|➔|➜|➡|>|[\u2190-\u21FF\u2794-\u27BE])/g, ' ')
      .replace(/[-_.]/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim() || 'Unnamed Font';
  }

  // Handle File Selection (Supports single and multiple bulk selection)
  function handleFilesSelected(files) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    state.selectedFiles = fileArray;
    state.currentFile = fileArray[0];

    const firstExt = fileArray[0].name.split('.').pop().toLowerCase();
    const isFont = fileArray.some(f => ['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(f.name.split('.').pop().toLowerCase()));
    const isSticker = ['svg', 'png'].includes(firstExt);
    const isText = ['txt', 'json', 'md', 'xml', 'csv', 'yaml', 'yml', 'js', 'html', 'css'].includes(firstExt);

    if (elements.uploadFormatSelect) {
      elements.uploadFormatSelect.value = firstExt === 'svg' ? 'SVG' : 'PNG';
    }

    if (isFont) {
      setUploadMainCategory('font');
    } else if (isSticker) {
      setUploadMainCategory('sticker');
    } else if (isText) {
      setUploadMainCategory('text');
    } else {
      setUploadMainCategory('image');
    }

    const singleFileSummary = document.getElementById('single-file-summary');
    const bulkFilesContainer = document.getElementById('bulk-files-container');
    const bulkFilesCount = document.getElementById('bulk-files-count');
    const bulkFilesList = document.getElementById('bulk-files-list');

    if (fileArray.length === 1) {
      const singleFile = fileArray[0];
      if (singleFileSummary) singleFileSummary.classList.remove('hidden');
      if (bulkFilesContainer) bulkFilesContainer.classList.add('hidden');

      if (elements.selectedFileName) elements.selectedFileName.textContent = singleFile.name;
      if (elements.selectedFileSize) elements.selectedFileSize.textContent = formatBytes(singleFile.size);
      if (elements.customTitleInput) {
        elements.customTitleInput.disabled = false;
        elements.customTitleInput.value = cleanFontTitle(singleFile.name);
      }
    } else {
      if (singleFileSummary) singleFileSummary.classList.add('hidden');
      if (bulkFilesContainer) bulkFilesContainer.classList.remove('hidden');

      if (bulkFilesCount) bulkFilesCount.textContent = `${fileArray.length} Files Selected (Bulk Upload)`;
      if (bulkFilesList) {
        bulkFilesList.innerHTML = fileArray.map((f, idx) => {
          const titlePrev = cleanFontTitle(f.name);
          return `
            <div class="bulk-file-item">
              <div class="bulk-file-info">
                <div class="bulk-file-name" title="${escapeHtml(f.name)}">${idx + 1}. ${escapeHtml(f.name)}</div>
                <div class="bulk-file-meta">
                  <span>${formatBytes(f.size)}</span>
                  <span>•</span>
                  <span class="bulk-file-title-preview" title="Title formatted for upload">Title: "${escapeHtml(titlePrev)}"</span>
                </div>
              </div>
              <span class="badge badge-subtle">Queued</span>
            </div>
          `;
        }).join('');
      }

      if (elements.customTitleInput) {
        elements.customTitleInput.value = '';
        elements.customTitleInput.placeholder = 'Bulk Mode: Titles auto-formatted from filenames (arrows & dashes converted to spaces)';
      }
    }

    switchState('ready');
  }

  // Execute Upload via XHR - Sequentially One-By-One
  function executeUpload() {
    if (!state.selectedFiles || state.selectedFiles.length === 0) {
      showToast('Please select at least one file to upload.', 'error');
      return;
    }

    const mainCategory = elements.uploadMainCategory.value || 'image';
    let subCategory = elements.customSubcategorySelect.value;
    if (subCategory === '__custom__') {
      subCategory = elements.customSubcategoryInput.value.trim();
      if (!subCategory) {
        showToast('Please enter a subcategory name.', 'error');
        elements.customSubcategoryInput.focus();
        return;
      }
    }

    const totalFiles = state.selectedFiles.length;
    state.uploadIndex = 0;
    state.uploadedBatchResults = [];

    switchState('uploading');

    uploadNextFileInBatch();

    function uploadNextFileInBatch() {
      if (state.uploadIndex >= totalFiles) {
        finishBatchUpload();
        return;
      }

      const currentFile = state.selectedFiles[state.uploadIndex];
      state.uploadStartTime = Date.now();

      const fileTitle = (totalFiles === 1 && elements.customTitleInput && elements.customTitleInput.value.trim())
        ? elements.customTitleInput.value.trim()
        : cleanFontTitle(currentFile.name);

      elements.uploadingFileName.textContent = totalFiles > 1
        ? `[File ${state.uploadIndex + 1}/${totalFiles}] ${fileTitle} (${currentFile.name})`
        : fileTitle;

      const pricingVal = elements.uploadPricingSelect ? elements.uploadPricingSelect.value : 'Free';
      const formatVal = elements.uploadFormatSelect ? elements.uploadFormatSelect.value : 'PNG';

      const formData = new FormData();
      formData.append('file', currentFile);
      formData.append('title', fileTitle);
      formData.append('mainCategory', mainCategory);
      formData.append('subCategory', subCategory);
      formData.append('category', subCategory);
      formData.append('pricing', pricingVal);
      formData.append('isPremium', pricingVal === 'Paid' ? 'true' : 'false');
      formData.append('format', formatVal);
      formData.append('stickerFormat', formatVal);

      const xhr = new XMLHttpRequest();
      state.activeXhr = xhr;

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const filePercent = e.loaded / e.total;
          const overallPercent = Math.round(((state.uploadIndex + filePercent) / totalFiles) * 100);

          elements.progressBar.style.width = `${overallPercent}%`;
          elements.uploadPercentage.textContent = `${overallPercent}%`;
          elements.uploadBytes.textContent = totalFiles > 1
            ? `File ${state.uploadIndex + 1}/${totalFiles}: ${formatBytes(e.loaded)} / ${formatBytes(e.total)}`
            : `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;

          const elapsedSec = (Date.now() - state.uploadStartTime) / 1000;
          if (elapsedSec > 0.3) {
            const bytesPerSec = e.loaded / elapsedSec;
            elements.uploadSpeed.textContent = `${formatBytes(bytesPerSec)}/s`;
          }
        }
      });

      xhr.addEventListener('load', () => {
        state.activeXhr = null;
        let response = null;

        try {
          response = JSON.parse(xhr.responseText);
        } catch (err) {
          response = {
            success: false,
            error: { code: 'SERVER_ERROR', message: `HTTP ${xhr.status}` }
          };
        }

        if (xhr.status >= 200 && xhr.status < 300 && response && response.success) {
          const fileObj = response.file || response.font || response.sticker;
          state.uploadedBatchResults.push({ success: true, file: fileObj });
        } else {
          const errorMsg = response && response.error ? response.error.message : 'Upload failed';
          state.uploadedBatchResults.push({ success: false, filename: currentFile.name, error: errorMsg });
        }

        // Move to NEXT file in sequence
        state.uploadIndex++;
        uploadNextFileInBatch();
      });

      xhr.addEventListener('error', () => {
        state.activeXhr = null;
        state.uploadedBatchResults.push({ success: false, filename: currentFile.name, error: 'Network Connection Failed' });
        state.uploadIndex++;
        uploadNextFileInBatch();
      });

      xhr.addEventListener('abort', () => {
        state.activeXhr = null;
        showToast('Upload cancelled by user.', 'info');
        switchState('ready');
      });

      xhr.open('POST', '/api/v1/files');
      if (state.apiKey) {
        xhr.setRequestHeader('Authorization', `Bearer ${state.apiKey.trim()}`);
      }
      xhr.send(formData);
    }
  }

  function finishBatchUpload() {
    const successes = state.uploadedBatchResults.filter(r => r.success);
    const failures = state.uploadedBatchResults.filter(r => !r.success);

    if (successes.length === 0 && failures.length > 0) {
      elements.errorCodeBadge.textContent = 'UPLOAD_FAILED';
      elements.errorMessageText.textContent = failures[0].error || 'Batch upload failed.';
      switchState('failure');
      showToast('Upload failed for all selected files.', 'error');
      return;
    }

    switchState('success');

    const firstFile = successes[0].file;
    const mainCat = (firstFile.mainCategory || 'image').toLowerCase();
    let badgeHtml = '<span class="badge badge-main-image">Image Preset</span>';
    if (mainCat === 'text') badgeHtml = '<span class="badge badge-main-text">Text Preset</span>';
    else if (mainCat === 'font') badgeHtml = '<span class="badge badge-main-font">Font</span>';
    else if (mainCat === 'sticker') badgeHtml = '<span class="badge badge-main-sticker">Sticker</span>';

    if (successes.length === 1) {
      elements.successTitle.textContent = firstFile.title || firstFile.name || firstFile.originalName;
      elements.successMainCategory.innerHTML = badgeHtml;
      elements.successSubCategory.innerHTML = `<span class="badge badge-subcategory">${escapeHtml(firstFile.subCategory || firstFile.category || 'General')}</span>`;
      elements.successFilename.textContent = firstFile.originalName || firstFile.fileName;
      elements.successFilesize.textContent = formatBytes(firstFile.size || firstFile.fileSize);
      elements.successFileid.textContent = firstFile.id;
      elements.successMimetype.textContent = firstFile.mimeType || '-';
      elements.successTimestamp.textContent = formatTimestamp(firstFile.uploadedAt);
      elements.successFileUrl.value = firstFile.fileUrl || firstFile.fontUrl || firstFile.stickerUrl || firstFile.url;
      elements.successApiUrl.value = firstFile.apiUrl || firstFile.fileUrl || firstFile.url;

      elements.successViewLink.href = firstFile.viewUrl || `${firstFile.fileUrl || firstFile.url}/view`;
      elements.successDownloadLink.href = firstFile.downloadUrl || `${firstFile.fileUrl || firstFile.url}/download`;
      showToast('File uploaded successfully to Vault!', 'success');
    } else {
      elements.successTitle.textContent = `${successes.length} Files Uploaded Successfully`;
      elements.successMainCategory.innerHTML = badgeHtml;
      elements.successSubCategory.innerHTML = `<span class="badge badge-subcategory">${escapeHtml(firstFile.subCategory || 'General')}</span>`;
      elements.successFilename.textContent = successes.map(s => s.file.originalName || s.file.fileName).join(', ');
      const totalSize = successes.reduce((acc, s) => acc + (s.file.size || s.file.fileSize || 0), 0);
      elements.successFilesize.textContent = `${formatBytes(totalSize)} total (${successes.length} files)`;
      elements.successFileid.textContent = successes.map(s => s.file.id).join(', ');
      elements.successMimetype.textContent = `${mainCat} multi-batch`;
      elements.successTimestamp.textContent = formatTimestamp(firstFile.uploadedAt);
      elements.successFileUrl.value = firstFile.fileUrl || firstFile.url;
      elements.successApiUrl.value = window.location.origin + `/api/v1/files?mainCategory=${mainCat}`;

      elements.successViewLink.href = firstFile.viewUrl || `${firstFile.fileUrl || firstFile.url}/view`;
      elements.successDownloadLink.href = firstFile.downloadUrl || `${firstFile.fileUrl || firstFile.url}/download`;

      showToast(`${successes.length} file(s) uploaded successfully!`, 'success');
    }

    fetchCategories();
    fetchFilesList();
  }

  function cancelUpload() {
    if (state.activeXhr) {
      state.activeXhr.abort();
      state.activeXhr = null;
    }
  }

  // Fetch Categories Tree from APIs
  async function fetchCategories() {
    try {
      const [presetsRes, fontsRes, stickersRes] = await Promise.allSettled([
        fetch('/api/presets/categories'),
        fetch('/api/fonts/categories'),
        fetch('/api/stickers/categories')
      ]);

      if (presetsRes.status === 'fulfilled' && presetsRes.value.ok) {
        const data = await presetsRes.value.json();
        if (data.success && data.categories) {
          state.categoriesTree.image = data.categories.image || DEFAULT_IMAGE_SUBCATEGORIES;
          state.categoriesTree.text = data.categories.text || [];
        }
      }

      if (fontsRes.status === 'fulfilled' && fontsRes.value.ok) {
        const data = await fontsRes.value.json();
        if (data.success && data.categories) {
          state.categoriesTree.font = data.categories || DEFAULT_FONT_SUBCATEGORIES;
        }
      }

      if (stickersRes.status === 'fulfilled' && stickersRes.value.ok) {
        const data = await stickersRes.value.json();
        if (data.success && data.categories) {
          state.categoriesTree.sticker = data.categories || DEFAULT_STICKER_CATEGORIES;
        }
      }

      updateSubcategoryFilterDropdown();
      populateSubcategorySelect(
        elements.customSubcategorySelect,
        elements.customSubcategoryInput,
        elements.uploadMainCategory.value || 'image'
      );
    } catch (err) {
      // Non-blocking
    }
  }

  // Update Explorer Subcategory Filter dropdown
  function updateSubcategoryFilterDropdown() {
    const currentSub = state.selectedSubFilter;
    elements.categoryFilterSelect.innerHTML = '<option value="all">All Subcategories</option>';

    let subList = [];
    if (state.selectedMainFilter === 'image') {
      subList = state.categoriesTree.image || [];
    } else if (state.selectedMainFilter === 'text') {
      subList = state.categoriesTree.text || [];
    } else if (state.selectedMainFilter === 'font') {
      subList = state.categoriesTree.font || [];
    } else if (state.selectedMainFilter === 'sticker') {
      subList = state.categoriesTree.sticker || [];
    } else {
      const allSub = new Set([
        ...(state.categoriesTree.image || []),
        ...(state.categoriesTree.text || []),
        ...(state.categoriesTree.font || []),
        ...(state.categoriesTree.sticker || [])
      ]);
      subList = Array.from(allSub);
    }

    subList.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = sub;
      if (currentSub === sub) {
        opt.selected = true;
      }
      elements.categoryFilterSelect.appendChild(opt);
    });

    if (currentSub && !subList.includes(currentSub)) {
      state.selectedSubFilter = 'all';
      elements.categoryFilterSelect.value = 'all';
    }
  }

  // Fetch Files List & Update Metrics
  async function fetchFilesList() {
    try {
      const url = new URL('/api/v1/files', window.location.origin);
      url.searchParams.set('page', state.currentPage);
      url.searchParams.set('limit', 15);
      if (state.searchQuery) {
        url.searchParams.set('search', state.searchQuery);
      }
      if (state.selectedMainFilter && state.selectedMainFilter !== 'all') {
        url.searchParams.set('mainCategory', state.selectedMainFilter);
      }
      if (state.selectedSubFilter && state.selectedSubFilter !== 'all') {
        url.searchParams.set('subCategory', state.selectedSubFilter);
      }

      const headers = {};
      if (state.apiKey) {
        headers['Authorization'] = `Bearer ${state.apiKey.trim()}`;
      }

      const res = await fetch(url.toString(), { headers });
      const data = await res.json();

      if (res.ok && data.success) {
        state.filesList = data.files || [];
        renderFiles(data.files, data.pagination);
        updateVaultMetrics();
      } else {
        renderEmptyState(data.error ? data.error.message : 'Failed to fetch presets');
      }
    } catch (err) {
      renderEmptyState('Could not connect to presets API');
    }
  }

  // Update Metrics Header Stat Cards
  async function updateVaultMetrics() {
    try {
      const headers = state.apiKey ? { 'Authorization': `Bearer ${state.apiKey.trim()}` } : {};
      const res = await fetch('/api/v1/files?limit=1000', { headers });
      const data = await res.json();

      if (res.ok && data.success && data.files) {
        const files = data.files;
        const totalCount = files.length;
        let imageCount = 0;
        let textCount = 0;
        let fontCount = 0;
        let stickerCount = 0;
        let totalStorageBytes = 0;

        files.forEach(f => {
          const cat = (f.mainCategory || 'image').toLowerCase();
          if (cat === 'image') imageCount++;
          else if (cat === 'text') textCount++;
          else if (cat === 'font') fontCount++;
          else if (cat === 'sticker') stickerCount++;

          totalStorageBytes += (f.size || f.fileSize || 0);
        });

        if (elements.statTotalCount) elements.statTotalCount.textContent = totalCount;
        if (elements.statImageCount) elements.statImageCount.textContent = imageCount;
        if (elements.statTextCount) elements.statTextCount.textContent = textCount;
        if (elements.statFontCount) elements.statFontCount.textContent = fontCount;
        if (elements.statStickerCount) elements.statStickerCount.textContent = stickerCount;
        if (elements.statStorageTotal) elements.statStorageTotal.textContent = formatBytes(totalStorageBytes);
      }
    } catch (err) {
      // Non-blocking
    }
  }

  // Helper for Main Category Badge
  function getMainCategoryBadge(mainCat) {
    const cat = (mainCat || 'image').toLowerCase();
    if (cat === 'image') return `<span class="badge badge-main-image">Image</span>`;
    if (cat === 'text') return `<span class="badge badge-main-text">Text</span>`;
    if (cat === 'font') return `<span class="badge badge-main-font">Font</span>`;
    if (cat === 'sticker') return `<span class="badge badge-main-sticker">Sticker</span>`;
    return `<span class="badge badge-main-image">${escapeHtml(cat)}</span>`;
  }

  // Render Files (Both Grid and Table)
  function renderFiles(files, pagination) {
    elements.fileTotalCount.textContent = `${pagination.total} ${pagination.total === 1 ? 'item' : 'items'}`;
    state.totalPages = pagination.totalPages;
    elements.paginationInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
    elements.prevPageBtn.disabled = pagination.page <= 1;
    elements.nextPageBtn.disabled = pagination.page >= pagination.totalPages;

    if (!files || files.length === 0) {
      renderEmptyState('No preset files found matching your filter.');
      return;
    }

    renderGridCards(files);
    renderFilesTable(files);
  }

  // Render Grid View
  function renderGridCards(files) {
    elements.filesGridBody.innerHTML = '';

    files.forEach(file => {
      const card = document.createElement('div');
      card.className = 'preset-card';

      const mainCat = (file.mainCategory || 'image').toLowerCase();
      const subCategory = file.subCategory || file.category || 'General';
      const pricing = file.pricing || (file.isPremium ? 'Paid' : 'Free');
      const format = file.format || file.stickerFormat || (file.mimeType && file.mimeType.includes('svg') ? 'SVG' : 'PNG');

      let iconClass = 'icon-image';
      let svgIcon = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>';
      if (mainCat === 'text') {
        iconClass = 'icon-text';
        svgIcon = '<polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line>';
      } else if (mainCat === 'font') {
        iconClass = 'icon-font';
        svgIcon = '<path d="M4 7V4h16v3"></path><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line>';
      } else if (mainCat === 'sticker') {
        iconClass = 'icon-sticker';
        svgIcon = '<circle cx="12" cy="12" r="10"></circle><polygon points="12 8 15 15 9 15"></polygon>';
      }

      const mainBadge = getMainCategoryBadge(file.mainCategory);
      const pricingBadge = (pricing === 'Paid' || pricing === 'paid' || file.isPremium)
        ? `<span class="badge badge-pricing-paid">Premium</span>`
        : `<span class="badge badge-pricing-free">Free</span>`;
      const formatBadge = (mainCat === 'sticker') ? `<span class="badge badge-format">${escapeHtml(format)}</span>` : '';

      card.innerHTML = `
        <div class="preset-card-header">
          <div class="preset-card-icon ${iconClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svgIcon}</svg>
          </div>
          <div class="preset-card-badges">
            ${mainBadge}
            ${pricingBadge}
          </div>
        </div>

        <div class="preset-card-body">
          <h4 class="preset-card-title" title="${escapeHtml(file.title || file.originalName)}">${escapeHtml(file.title || file.originalName)}</h4>
          <p class="preset-card-rawname">${escapeHtml(file.originalName)}</p>
        </div>

        <div class="preset-card-meta">
          <span class="badge badge-subcategory">${escapeHtml(subCategory)}</span>
          ${formatBadge}
          <span class="preset-card-id">${escapeHtml(file.id)}</span>
          <span class="font-mono">${formatBytes(file.size)}</span>
        </div>

        <div class="preset-card-actions">
          <button class="btn btn-glass btn-sm action-edit-btn" 
            data-id="${escapeHtml(file.id)}" 
            data-title="${escapeHtml(file.title || file.originalName)}" 
            data-main="${escapeHtml(file.mainCategory || 'image')}"
            data-sub="${escapeHtml(subCategory)}" 
            data-pricing="${escapeHtml(pricing)}"
            data-format="${escapeHtml(format)}"
            title="Edit Details">
            <svg class="icon-sm text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit
          </button>
          <a href="${file.url}/view" target="_blank" class="btn btn-glass btn-sm" title="View / Stream">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </a>
          <a href="${file.url}/download" class="btn btn-glass btn-sm" title="Download">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </a>
          <button class="btn btn-glass btn-sm action-copy-btn" data-copy="${escapeHtml(file.fileUrl || file.url)}" title="Copy Link">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="btn btn-glass btn-sm action-delete-btn" data-id="${escapeHtml(file.id)}" title="Delete">
            <svg class="icon-sm text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      elements.filesGridBody.appendChild(card);
    });

    bindActionButtons();
  }

  // Render Table View
  function renderFilesTable(files) {
    elements.filesTableBody.innerHTML = '';
    files.forEach(file => {
      const tr = document.createElement('tr');
      const mainBadge = getMainCategoryBadge(file.mainCategory);
      const subCategory = file.subCategory || file.category || 'General';
      const pricing = file.pricing || (file.isPremium ? 'Paid' : 'Free');
      const format = file.format || file.stickerFormat || (file.mimeType && file.mimeType.includes('svg') ? 'SVG' : 'PNG');
      const formatBadge = (file.mainCategory === 'sticker')
        ? `<span class="badge badge-format">${escapeHtml(format)}</span>`
        : '';
      const pricingBadge = (pricing === 'Paid' || pricing === 'paid' || file.isPremium)
        ? `<span class="badge badge-pricing-paid">Premium</span>`
        : `<span class="badge badge-pricing-free">Free</span>`;

      tr.innerHTML = `
        <td>
          <div class="file-name-cell">
            <svg class="icon-sm text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
            <div>
              <div class="file-title-text" title="${escapeHtml(file.title || file.originalName)}">${escapeHtml(file.title || file.originalName)}</div>
              <div class="file-raw-name">${escapeHtml(file.originalName)}</div>
            </div>
          </div>
        </td>
        <td>${mainBadge}</td>
        <td>
          <span class="badge badge-subcategory">${escapeHtml(subCategory)}</span>
          ${formatBadge}
          ${pricingBadge}
        </td>
        <td><span class="font-mono text-cyan">${escapeHtml(file.id)}</span></td>
        <td>${formatBytes(file.size)}</td>
        <td>${formatTimestamp(file.uploadedAt)}</td>
        <td class="text-right">
          <div class="actions-cell">
            <button class="btn btn-glass btn-sm action-edit-btn" 
              data-id="${escapeHtml(file.id)}" 
              data-title="${escapeHtml(file.title || file.originalName)}" 
              data-main="${escapeHtml(file.mainCategory || 'image')}"
              data-sub="${escapeHtml(subCategory)}" 
              data-pricing="${escapeHtml(pricing)}"
              data-format="${escapeHtml(format)}"
              title="Edit Details">
              <svg class="icon-sm text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <a href="${file.url}/view" target="_blank" class="btn btn-glass btn-sm" title="View / Stream">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </a>
            <a href="${file.url}/download" class="btn btn-glass btn-sm" title="Download File">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </a>
            <button class="btn btn-glass btn-sm action-copy-btn" data-copy="${escapeHtml(file.fileUrl || file.url)}" title="Copy Direct URL">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="btn btn-glass btn-sm action-delete-btn" data-id="${escapeHtml(file.id)}" title="Remove File">
              <svg class="icon-sm text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;
      elements.filesTableBody.appendChild(tr);
    });

    bindActionButtons();
  }

  // Bind Event Listeners to dynamic Grid/Table action buttons
  function bindActionButtons() {
    document.querySelectorAll('.action-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fileId = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title');
        const mainCat = btn.getAttribute('data-main') || 'image';
        const subCat = btn.getAttribute('data-sub') || 'General';
        const pricing = btn.getAttribute('data-pricing') || 'Free';
        const format = btn.getAttribute('data-format') || 'PNG';

        elements.editFileId.value = fileId;
        elements.editFileTitle.value = title;
        elements.editFileMainCategory.value = mainCat;
        if (elements.editFilePricingSelect) {
          elements.editFilePricingSelect.value = pricing;
        }

        if (elements.editFileFormatGroup) {
          if (mainCat === 'sticker') {
            elements.editFileFormatGroup.classList.remove('hidden');
            if (elements.editFileFormatSelect) elements.editFileFormatSelect.value = format;
          } else {
            elements.editFileFormatGroup.classList.add('hidden');
          }
        }

        populateSubcategorySelect(elements.editFileSubcategorySelect, elements.editFileSubcategoryCustom, mainCat, subCat);
        elements.editModal.classList.remove('hidden');
      });
    });

    document.querySelectorAll('.action-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy');
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Preset Direct URL copied!', 'success');
          });
        }
      });
    });

    document.querySelectorAll('.action-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fileId = btn.getAttribute('data-id');
        if (confirm(`Are you sure you want to permanently delete preset '${fileId}'?`)) {
          await deleteFile(fileId);
        }
      });
    });
  }

  function renderEmptyState(message) {
    const emptyHtml = `
      <div class="empty-placeholder">
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
          <p>${escapeHtml(message)}</p>
        </div>
      </div>
    `;

    if (elements.filesGridBody) elements.filesGridBody.innerHTML = emptyHtml;
    if (elements.filesTableBody) {
      elements.filesTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-placeholder">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
              <p>${escapeHtml(message)}</p>
            </div>
          </td>
        </tr>
      `;
    }
  }

  // Delete File API Call
  async function deleteFile(fileId) {
    try {
      const res = await fetch(`/api/presets/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${state.apiKey.trim()}`
        }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast(`Preset '${fileId}' removed successfully.`, 'success');
        fetchFilesList();
        fetchCategories();
      } else {
        showToast(data.error ? data.error.message : 'Deletion failed.', 'error');
      }
    } catch (err) {
      showToast('Network error while removing preset.', 'error');
    }
  }

  // Save Edit Preset Call
  async function savePresetEdit() {
    const fileId = elements.editFileId.value;
    const newTitle = elements.editFileTitle.value.trim();
    const newMain = elements.editFileMainCategory.value || 'image';
    let newSub = elements.editFileSubcategorySelect.value;
    if (newSub === '__custom__') {
      newSub = elements.editFileSubcategoryCustom.value.trim();
      if (!newSub) {
        showToast('Please enter a subcategory name.', 'error');
        elements.editFileSubcategoryCustom.focus();
        return;
      }
    }

    if (!newTitle) {
      showToast('Please enter a preset title.', 'error');
      return;
    }

    const newPricing = elements.editFilePricingSelect ? elements.editFilePricingSelect.value : 'Free';
    const newFormat = elements.editFileFormatSelect ? elements.editFileFormatSelect.value : 'PNG';

    try {
      const res = await fetch(`/api/presets/${fileId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.apiKey.trim()}`
        },
        body: JSON.stringify({
          title: newTitle,
          mainCategory: newMain,
          subCategory: newSub,
          category: newSub,
          pricing: newPricing,
          isPremium: newPricing === 'Paid',
          format: newFormat,
          stickerFormat: newFormat
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Preset updated successfully!', 'success');
        elements.editModal.classList.add('hidden');
        fetchFilesList();
        fetchCategories();
      } else {
        showToast(data.error ? data.error.message : 'Update failed.', 'error');
      }
    } catch (err) {
      showToast('Network error while saving changes.', 'error');
    }
  }

  // Setup Event Listeners
  function initEvents() {
    // View mode toggle listeners
    if (elements.viewGridBtn) {
      elements.viewGridBtn.addEventListener('click', () => setViewMode('grid'));
    }
    if (elements.viewTableBtn) {
      elements.viewTableBtn.addEventListener('click', () => setViewMode('table'));
    }

    // Category Pill Filters
    elements.categoryPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const category = pill.getAttribute('data-category');
        setMainFilter(category);
      });
    });

    // Stat Cards Click to Filter
    ['image', 'text', 'font', 'sticker'].forEach(cat => {
      const el = document.getElementById(`stat-card-${cat}`);
      if (el) {
        el.addEventListener('click', () => {
          setMainFilter(cat);
          const explorerEl = document.querySelector('.explorer-section');
          if (explorerEl) explorerEl.scrollIntoView({ behavior: 'smooth' });
        });
      }
    });

    const statAllEl = document.getElementById('stat-card-all');
    if (statAllEl) {
      statAllEl.addEventListener('click', () => {
        setMainFilter('all');
        const explorerEl = document.querySelector('.explorer-section');
        if (explorerEl) explorerEl.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Main Category Toggles (Upload Form)
    if (elements.toggleCatImage) {
      elements.toggleCatImage.addEventListener('click', () => setUploadMainCategory('image'));
    }
    if (elements.toggleCatText) {
      elements.toggleCatText.addEventListener('click', () => setUploadMainCategory('text'));
    }
    if (elements.toggleCatFont) {
      elements.toggleCatFont.addEventListener('click', () => setUploadMainCategory('font'));
    }
    if (elements.toggleCatSticker) {
      elements.toggleCatSticker.addEventListener('click', () => setUploadMainCategory('sticker'));
    }

    // Custom Subcategory Select (Upload)
    elements.customSubcategorySelect.addEventListener('change', (e) => {
      if (e.target.value === '__custom__') {
        elements.customSubcategoryInput.classList.remove('hidden');
        elements.customSubcategoryInput.focus();
      } else {
        elements.customSubcategoryInput.classList.add('hidden');
      }
    });

    // Edit Modal Main Category Change
    elements.editFileMainCategory.addEventListener('change', (e) => {
      populateSubcategorySelect(elements.editFileSubcategorySelect, elements.editFileSubcategoryCustom, e.target.value);
    });

    // Edit Modal Subcategory Change
    elements.editFileSubcategorySelect.addEventListener('change', (e) => {
      if (e.target.value === '__custom__') {
        elements.editFileSubcategoryCustom.classList.remove('hidden');
        elements.editFileSubcategoryCustom.focus();
      } else {
        elements.editFileSubcategoryCustom.classList.add('hidden');
      }
    });

    // Explorer Main Category Select Change
    if (elements.mainCategoryFilterSelect) {
      elements.mainCategoryFilterSelect.addEventListener('change', (e) => {
        setMainFilter(e.target.value);
      });
    }

    // Explorer Sub Category Filter Change
    elements.categoryFilterSelect.addEventListener('change', (e) => {
      state.selectedSubFilter = e.target.value;
      state.currentPage = 1;
      fetchFilesList();
    });

    // Dropzone Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
      elements.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      elements.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.dropZone.classList.remove('dragover');
      });
    });

    elements.dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        handleFilesSelected(files);
      }
    });

    // Edit Modal Actions
    elements.closeEditModal.addEventListener('click', () => {
      elements.editModal.classList.add('hidden');
    });

    elements.cancelEditBtn.addEventListener('click', () => {
      elements.editModal.classList.add('hidden');
    });

    elements.saveEditBtn.addEventListener('click', () => {
      savePresetEdit();
    });

    // File Input Browse
    elements.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesSelected(e.target.files);
      }
    });

    elements.browseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.fileInput.click();
    });

    elements.dropZone.addEventListener('click', (e) => {
      if (e.target && e.target.closest('#browse-btn')) return;
      elements.fileInput.click();
    });

    const resetFileSelection = () => {
      state.currentFile = null;
      state.selectedFiles = [];
      elements.fileInput.value = '';
      if (elements.customTitleInput) {
        elements.customTitleInput.value = '';
        elements.customTitleInput.disabled = false;
        elements.customTitleInput.placeholder = 'e.g. Vintage Amber Glow';
      }
      if (elements.customSubcategoryInput) elements.customSubcategoryInput.value = '';
      switchState('ready');
    };

    if (elements.clearSelectedBtn) {
      elements.clearSelectedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetFileSelection();
      });
    }

    if (elements.cancelSelectedBtn) {
      elements.cancelSelectedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetFileSelection();
      });
    }

    if (elements.selectedPanel) {
      elements.selectedPanel.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    [elements.customTitleInput, elements.customSubcategoryInput].forEach(input => {
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
          }
        });
      }
    });

    // Start Upload Click
    elements.startUploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      executeUpload();
    });

    // Cancel Upload
    elements.cancelUploadBtn.addEventListener('click', () => {
      cancelUpload();
    });

    // Success Actions
    elements.uploadAnotherBtn.addEventListener('click', () => {
      resetFileSelection();
    });

    // Failure Actions
    elements.retryUploadBtn.addEventListener('click', () => {
      executeUpload();
    });

    elements.chooseAnotherBtn.addEventListener('click', () => {
      resetFileSelection();
    });

    // 1-Click Copy Buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input && input.value) {
          navigator.clipboard.writeText(input.value).then(() => {
            const originalText = btn.querySelector('span').textContent;
            btn.querySelector('span').textContent = 'Copied!';
            showToast('URL copied to clipboard!', 'success');
            setTimeout(() => {
              btn.querySelector('span').textContent = originalText;
            }, 2000);
          });
        }
      });
    });

    // Live Search with Debounce
    let searchDebounce = null;
    elements.fileSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.searchQuery = e.target.value;
        state.currentPage = 1;
        fetchFilesList();
      }, 300);
    });

    // Refresh Files List
    elements.refreshFilesBtn.addEventListener('click', () => {
      fetchFilesList();
      fetchCategories();
      showToast('Presets repository refreshed.', 'info');
    });

    // Pagination
    elements.prevPageBtn.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        fetchFilesList();
      }
    });

    elements.nextPageBtn.addEventListener('click', () => {
      if (state.currentPage < state.totalPages) {
        state.currentPage++;
        fetchFilesList();
      }
    });

    // Auth & Security Center Modal
    elements.authConfigBtn.addEventListener('click', () => {
      elements.customApiKeyInput.value = state.apiKey;
      elements.authModal.classList.remove('hidden');
      fetchRegisteredKeys();
    });

    const closeAuthModalFn = () => {
      elements.authModal.classList.add('hidden');
    };

    if (elements.closeAuthModal) elements.closeAuthModal.addEventListener('click', closeAuthModalFn);
    if (elements.closeAuthModalBtn) elements.closeAuthModalBtn.addEventListener('click', closeAuthModalFn);

    elements.presetKeyCards.forEach(card => {
      card.addEventListener('click', () => {
        elements.presetKeyCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const key = card.getAttribute('data-key');
        elements.customApiKeyInput.value = key;
      });
    });

    elements.toggleKeyVisibility.addEventListener('click', () => {
      const type = elements.customApiKeyInput.type;
      if (type === 'password') {
        elements.customApiKeyInput.type = 'text';
        elements.toggleKeyVisibility.textContent = 'Hide';
      } else {
        elements.customApiKeyInput.type = 'password';
        elements.toggleKeyVisibility.textContent = 'Show';
      }
    });

    elements.saveAuthBtn.addEventListener('click', () => {
      const newKey = elements.customApiKeyInput.value.trim();
      if (!newKey) {
        showToast('API Key string cannot be empty.', 'error');
        return;
      }
      state.apiKey = newKey;
      sessionStorage.setItem('aperture_api_key', newKey);

      let matchingPreset = Array.from(elements.presetKeyCards).find(c => c.getAttribute('data-key') === newKey);
      state.keyName = matchingPreset ? matchingPreset.getAttribute('data-name') : 'Custom Key Active';
      sessionStorage.setItem('aperture_key_name', state.keyName);
      elements.activeKeyName.textContent = state.keyName;

      elements.authModal.classList.add('hidden');
      showToast(`Active API Key updated (${state.keyName}).`, 'success');
      fetchFilesList();
      fetchCategories();
      fetchRegisteredKeys();
    });

    // Create New System API Key Handler
    if (elements.createKeyForm) {
      elements.createKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const keyName = elements.newKeyName.value.trim();
        const customKey = elements.newKeyCustom ? elements.newKeyCustom.value.trim() : '';

        const checkedScopes = Array.from(document.querySelectorAll('.scope-checkbox:checked')).map(cb => cb.value);
        if (checkedScopes.length === 0) {
          showToast('Please select at least one permission scope.', 'error');
          return;
        }

        try {
          elements.createKeyBtn.disabled = true;
          elements.createKeyBtn.querySelector('span').textContent = 'Issuing Key...';

          const res = await fetch('/api/v1/keys', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${state.apiKey}`
            },
            body: JSON.stringify({
              name: keyName,
              customKey: customKey || undefined,
              permissions: checkedScopes
            })
          });

          const data = await res.json();
          if (data.success) {
            showToast(`API Key "${keyName}" issued successfully!`, 'success');
            elements.createKeyForm.reset();
            fetchRegisteredKeys();
          } else {
            showToast(`Failed to issue key: ${data.error?.message || 'Access Denied'}`, 'error');
          }
        } catch (err) {
          showToast('Failed to reach server to issue API Key.', 'error');
        } finally {
          elements.createKeyBtn.disabled = false;
          elements.createKeyBtn.querySelector('span').textContent = 'Generate & Issue API Key';
        }
      });
    }

    // Docs Modal
    elements.docsBtn.addEventListener('click', () => {
      elements.docsModal.classList.remove('hidden');
    });

    elements.closeDocsModal.addEventListener('click', () => {
      elements.docsModal.classList.add('hidden');
    });

    // Close Modals on Backdrop Click
    [elements.authModal, elements.docsModal, elements.editModal].forEach(modal => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });
  }

  // Live Health Polling
  async function checkLiveHealth() {
    try {
      const res = await fetch('/api/v1/health');
      if (!res.ok) throw new Error('Health check HTTP ' + res.status);
      const data = await res.json();

      const mongo = data.connections?.mongodb;
      if (elements.mongoStatusPill && elements.mongoStatusText) {
        if (mongo?.connected) {
          elements.mongoStatusPill.className = 'status-pill status-pill-mongo';
          elements.mongoStatusText.textContent = 'MongoDB Atlas Connected';
        } else {
          elements.mongoStatusPill.className = 'status-pill status-pill-mongo status-offline';
          elements.mongoStatusText.textContent = 'MongoDB Disconnected';
        }
      }

      const cld = data.connections?.cloudinary;
      if (elements.cloudinaryStatusPill && elements.cloudinaryStatusText) {
        if (cld?.connected || cld?.status === 'connected' || cld?.status === 'configured') {
          elements.cloudinaryStatusPill.className = 'status-pill status-pill-cloudinary';
          elements.cloudinaryStatusText.textContent = `Cloudinary Active (${cld.cloudName || 'sttsmedia'})`;
        } else {
          elements.cloudinaryStatusPill.className = 'status-pill status-pill-cloudinary status-offline';
          elements.cloudinaryStatusText.textContent = 'Cloudinary Offline';
        }
      }

      if (elements.serverStatusPill && elements.serverStatusText) {
        elements.serverStatusPill.className = 'status-pill status-pill-server';
        elements.serverStatusText.textContent = 'API Server Online';
      }
    } catch (err) {
      if (elements.serverStatusPill && elements.serverStatusText) {
        elements.serverStatusPill.className = 'status-pill status-pill-server status-offline';
        elements.serverStatusText.textContent = 'API Server Offline';
      }
    }
  }

  // Fetch Registered System API Keys
  async function fetchRegisteredKeys() {
    if (!elements.keysTableBody) return;
    try {
      elements.keysTableBody.innerHTML = `<tr><td colspan="4" class="empty-placeholder"><p>Loading registered API keys...</p></td></tr>`;
      const res = await fetch('/api/v1/keys', {
        headers: {
          'Authorization': `Bearer ${state.apiKey}`
        }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.keys)) {
        if (data.keys.length === 0) {
          elements.keysTableBody.innerHTML = `<tr><td colspan="4" class="empty-placeholder"><p>No registered API keys found in database.</p></td></tr>`;
          return;
        }

        elements.keysTableBody.innerHTML = data.keys.map(k => {
          const permsBadges = (k.permissions || []).map(p => {
            const shortName = p.replace('files:', '');
            return `<span class="scope-badge scope-badge-${shortName}">${escapeHtml(p)}</span>`;
          }).join(' ');

          const isSelf = k.key === state.apiKey;
          const deleteBtn = isSelf
            ? `<span class="text-muted" style="font-size:0.75rem;">(Active Key)</span>`
            : `<button type="button" class="btn btn-secondary btn-sm revoke-key-btn text-danger" data-key="${escapeHtml(k.key)}">Revoke</button>`;

          return `
            <tr>
              <td>
                <div class="font-semibold">${escapeHtml(k.name || 'Unnamed Key')}</div>
                <div class="font-mono text-secondary" style="font-size: 0.75rem;">${escapeHtml(k.key.substring(0, 14))}...</div>
              </td>
              <td>${permsBadges || '<span class="text-muted">None</span>'}</td>
              <td class="text-secondary" style="font-size:0.8rem;">${formatTimestamp(k.createdAt)}</td>
              <td class="text-right">${deleteBtn}</td>
            </tr>
          `;
        }).join('');

        // Wire up revoke key buttons
        elements.keysTableBody.querySelectorAll('.revoke-key-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const targetKey = btn.getAttribute('data-key');
            if (confirm(`Are you sure you want to revoke API key (${targetKey.substring(0, 10)}...)?`)) {
              await revokeApiKey(targetKey);
            }
          });
        });
      } else {
        elements.keysTableBody.innerHTML = `<tr><td colspan="4" class="empty-placeholder"><p class="text-danger">Failed to load API keys: ${escapeHtml(data.error?.message || 'Access Denied')}</p></td></tr>`;
      }
    } catch (err) {
      elements.keysTableBody.innerHTML = `<tr><td colspan="4" class="empty-placeholder"><p class="text-danger">Failed to load API keys from server.</p></td></tr>`;
    }
  }

  // Revoke System API Key
  async function revokeApiKey(keyToRevoke) {
    try {
      const res = await fetch(`/api/v1/keys/${encodeURIComponent(keyToRevoke)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${state.apiKey}`
        }
      });
      const data = await res.json();
      if (data.success) {
        showToast('API Key revoked successfully!', 'success');
        fetchRegisteredKeys();
      } else {
        showToast(`Revocation failed: ${data.error?.message || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error revoking API key.', 'error');
    }
  }

  // Update Docs Host URLs
  function updateDocsHostUrls() {
    if (!elements.docsModal) return;
    const origin = window.location.origin;
    const codeBlocks = elements.docsModal.querySelectorAll('code');
    codeBlocks.forEach(code => {
      code.textContent = code.textContent.replace(/http:\/\/localhost:3000/g, origin);
    });
  }

  // Initialize Application
  function init() {
    updateDocsHostUrls();
    elements.activeKeyName.textContent = state.keyName;
    setViewMode(state.viewMode);
    initEvents();
    setUploadMainCategory('image');
    switchState('ready');
    fetchCategories();
    fetchFilesList();
    checkLiveHealth();
    setInterval(checkLiveHealth, 10000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
