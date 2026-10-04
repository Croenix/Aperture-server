/**
 * APERTURE FILE SERVER - FRONTEND CONTROLLER
 * Two-level Hierarchical Category System (Main: Image / Text, Sub: Vintage, Modern, B&W, etc.)
 */

(function () {
  'use strict';

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

  const DEFAULT_FONT_SUBCATEGORIES = [
    'Normal'
  ];

  const DEFAULT_STICKER_CATEGORIES = [
    'Badges',
    'Emoji',
    'Decorative',
    'Icons',
    'Anime',
    'Logos',
    'Vectors',
    'Labels',
    'Illustrations'
  ];

  // Application State
  const state = {
    currentFile: null,
    activeXhr: null,
    uploadStartTime: null,
    apiKey: sessionStorage.getItem('aperture_api_key') || 'aperture_upl_secret_key_2026',
    keyName: sessionStorage.getItem('aperture_key_name') || 'Upload Key Active',
    currentPage: 1,
    searchQuery: '',
    selectedMainFilter: 'all',
    selectedSubFilter: 'all',
    totalPages: 1,
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

    // Upload Meta Form (Hierarchical Categories)
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
    filesTableBody: document.getElementById('files-table-body'),
    fileSearchInput: document.getElementById('file-search-input'),
    mainCategoryFilterSelect: document.getElementById('main-category-filter-select'),
    categoryFilterSelect: document.getElementById('category-filter-select'),
    refreshFilesBtn: document.getElementById('refresh-files-btn'),
    fileTotalCount: document.getElementById('file-total-count'),
    paginationInfo: document.getElementById('pagination-info'),
    prevPageBtn: document.getElementById('prev-page-btn'),
    nextPageBtn: document.getElementById('next-page-btn'),

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

    // Auth & Docs Modals
    authConfigBtn: document.getElementById('auth-config-btn'),
    activeKeyName: document.getElementById('active-key-name'),
    authModal: document.getElementById('auth-modal'),
    closeAuthModal: document.getElementById('close-auth-modal'),
    customApiKeyInput: document.getElementById('custom-api-key-input'),
    saveAuthBtn: document.getElementById('save-auth-btn'),
    toggleKeyVisibility: document.getElementById('toggle-key-visibility'),
    presetKeyCards: document.querySelectorAll('.preset-key-card'),

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
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  }

  // Utility: Show Toast Notification
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

  // Switch View States
  function switchState(stateName) {
    elements.stateReady.classList.add('hidden');
    elements.stateUploading.classList.add('hidden');
    elements.stateSuccess.classList.add('hidden');
    elements.stateFailure.classList.add('hidden');

    switch (stateName) {
      case 'ready':
        elements.stateReady.classList.remove('hidden');
        if (state.currentFile) {
          if (elements.dropZone) elements.dropZone.classList.add('hidden');
          elements.selectedPanel.classList.remove('hidden');
          elements.selectedFileName.textContent = state.currentFile.name;
          elements.selectedFileSize.textContent = formatBytes(state.currentFile.size);
        } else {
          if (elements.dropZone) elements.dropZone.classList.remove('hidden');
          elements.selectedPanel.classList.add('hidden');
        }
        break;

      case 'uploading':
        elements.stateUploading.classList.remove('hidden');
        const activeTitle = elements.customTitleInput.value.trim() || (state.currentFile ? state.currentFile.name : 'Uploading...');
        elements.uploadingFileName.textContent = activeTitle;
        elements.uploadPercentage.textContent = '0%';
        elements.progressBar.style.width = '0%';
        elements.uploadBytes.textContent = `0 KB / ${state.currentFile ? formatBytes(state.currentFile.size) : '0 KB'}`;
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

  // Populate dynamic subcategory options for a given main category and target select element
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

    // Add option to type custom subcategory
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = (list.length === 0) ? '+ Add Category (Required)' : '+ Enter Custom Category...';
    selectEl.appendChild(customOpt);

    // If list is empty, default select custom and show input
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
      elements.subcategoryLabelHint.textContent = '(Select image preset style or add custom)';
    } else if (mainCategory === 'text') {
      if (elements.toggleCatText) elements.toggleCatText.classList.add('active');
      elements.subcategoryLabelHint.textContent = '(Enter or select text preset category)';
    } else if (mainCategory === 'font') {
      if (elements.toggleCatFont) elements.toggleCatFont.classList.add('active');
      elements.subcategoryLabelHint.textContent = '(Select Normal or enter custom font category)';
    } else if (mainCategory === 'sticker') {
      if (elements.toggleCatSticker) elements.toggleCatSticker.classList.add('active');
      elements.subcategoryLabelHint.textContent = '(Select sticker category e.g. Badges, Emoji or add custom)';
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

  // Handle File Selection
  function handleFileSelected(file) {
    if (!file) return;
    state.currentFile = file;

    // Auto-generate readable title
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const cleanTitle = baseName.replace(/[-_]+/g, ' ').trim();
    elements.customTitleInput.value = cleanTitle;

    // Auto-detect main category based on file extension
    const ext = file.name.split('.').pop().toLowerCase();
    const isFontFile = ['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext);
    const isStickerFile = ['svg', 'png'].includes(ext);
    const isTextFile = ['txt', 'json', 'md', 'xml', 'csv', 'yaml', 'yml', 'js', 'html', 'css'].includes(ext);

    if (elements.uploadFormatSelect) {
      elements.uploadFormatSelect.value = ext === 'svg' ? 'SVG' : 'PNG';
    }

    if (isFontFile) {
      setUploadMainCategory('font');
    } else if (isStickerFile) {
      setUploadMainCategory('sticker');
    } else if (isTextFile) {
      setUploadMainCategory('text');
    } else {
      setUploadMainCategory('image');
    }

    switchState('ready');
  }

  // Execute Upload via XMLHttpRequest
  function executeUpload() {
    if (!state.currentFile) {
      showToast('Please select a file first.', 'error');
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

    switchState('uploading');
    state.uploadStartTime = Date.now();

    const formData = new FormData();
    formData.append('file', state.currentFile);

    const title = elements.customTitleInput.value.trim() || state.currentFile.name;
    const pricingVal = elements.uploadPricingSelect ? elements.uploadPricingSelect.value : 'Free';
    const formatVal = elements.uploadFormatSelect ? elements.uploadFormatSelect.value : 'PNG';

    formData.append('title', title);
    formData.append('mainCategory', mainCategory);
    formData.append('subCategory', subCategory);
    formData.append('category', subCategory);
    formData.append('pricing', pricingVal);
    formData.append('isPremium', pricingVal === 'Paid' ? 'true' : 'false');
    formData.append('format', formatVal);
    formData.append('stickerFormat', formatVal);

    const xhr = new XMLHttpRequest();
    state.activeXhr = xhr;

    // Progress Listener
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        elements.progressBar.style.width = `${percent}%`;
        elements.uploadPercentage.textContent = `${percent}%`;
        elements.uploadBytes.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;

        const elapsedSec = (Date.now() - state.uploadStartTime) / 1000;
        if (elapsedSec > 0.3) {
          const bytesPerSec = e.loaded / elapsedSec;
          elements.uploadSpeed.textContent = `${formatBytes(bytesPerSec)}/s`;
        }
      }
    });

    // Success / Error Listener
    xhr.addEventListener('load', () => {
      state.activeXhr = null;
      let response = null;

      try {
        response = JSON.parse(xhr.responseText);
      } catch (err) {
        response = {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: `Server returned status ${xhr.status} with non-JSON response.`
          }
        };
      }

      if (xhr.status >= 200 && xhr.status < 300 && response && response.success) {
        const file = response.file || response.font || response.sticker;
        const mainCat = (file.mainCategory || 'image').toLowerCase();

        let badgeHtml = '<span class="badge badge-main-image">Image Preset</span>';
        if (mainCat === 'text') badgeHtml = '<span class="badge badge-main-text">Text Preset</span>';
        else if (mainCat === 'font') badgeHtml = '<span class="badge badge-main-font">Font</span>';
        else if (mainCat === 'sticker') badgeHtml = '<span class="badge badge-main-sticker">Sticker</span>';

        // Populate Success State
        elements.successTitle.textContent = file.title || file.name || file.originalName;
        elements.successMainCategory.innerHTML = badgeHtml;
        elements.successSubCategory.innerHTML = `<span class="badge badge-subcategory">${escapeHtml(file.subCategory || file.category || 'General')}</span>`;
        elements.successFilename.textContent = file.originalName || file.fileName;
        elements.successFilesize.textContent = formatBytes(file.size || file.fileSize);
        elements.successFileid.textContent = file.id;
        elements.successMimetype.textContent = file.mimeType || '-';
        elements.successTimestamp.textContent = formatTimestamp(file.uploadedAt);
        elements.successFileUrl.value = file.fileUrl || file.fontUrl || file.stickerUrl || file.url;
        elements.successApiUrl.value = file.apiUrl || file.fileUrl || file.url;

        elements.successViewLink.href = file.viewUrl || `${file.fileUrl || file.url}/view`;
        elements.successDownloadLink.href = file.downloadUrl || `${file.fileUrl || file.url}/download`;

        switchState('success');
        showToast('File uploaded successfully!', 'success');
        fetchCategories();
        fetchFilesList();
      } else {
        const errorCode = response && response.error ? response.error.code : `HTTP_${xhr.status}`;
        const errorMsg = response && response.error ? response.error.message : 'An error occurred during upload.';
        
        elements.errorCodeBadge.textContent = errorCode;
        elements.errorMessageText.textContent = errorMsg;
        switchState('failure');
        showToast(errorMsg, 'error');
      }
    });

    // Network / Abort Errors
    xhr.addEventListener('error', () => {
      state.activeXhr = null;
      elements.errorCodeBadge.textContent = 'NETWORK_ERROR';
      elements.errorMessageText.textContent = 'Network connection failed while transferring data.';
      switchState('failure');
    });

    xhr.addEventListener('abort', () => {
      state.activeXhr = null;
      showToast('Upload cancelled.', 'info');
      switchState('ready');
    });

    xhr.open('POST', '/api/v1/files');
    if (state.apiKey) {
      xhr.setRequestHeader('Authorization', `Bearer ${state.apiKey.trim()}`);
    }
    xhr.send(formData);
  }

  // Cancel Upload
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

      // Refresh Subcategory filter dropdown in explorer
      updateSubcategoryFilterDropdown();

      // Refresh upload subcategory picker
      populateSubcategorySelect(
        elements.customSubcategorySelect,
        elements.customSubcategoryInput,
        elements.uploadMainCategory.value || 'image'
      );
    } catch (err) {
      // Non-blocking
    }
  }

  // Update Explorer Subcategory Filter dropdown based on current selected Main Category filter
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

  // Fetch Files List from API
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
        renderFilesTable(data.files, data.pagination);
      } else {
        renderEmptyTable(data.error ? data.error.message : 'Failed to fetch files');
      }
    } catch (err) {
      renderEmptyTable('Could not connect to presets API');
    }
  }

  // Helper for Main Category Badge
  function getMainCategoryBadge(mainCat) {
    const cat = (mainCat || 'image').toLowerCase();
    if (cat === 'image') return `<span class="badge badge-main-image">Image Preset</span>`;
    if (cat === 'text') return `<span class="badge badge-main-text">Text Preset</span>`;
    if (cat === 'font') return `<span class="badge badge-main-font">Font</span>`;
    if (cat === 'sticker') return `<span class="badge badge-main-sticker">Sticker</span>`;
    return `<span class="badge badge-main-image">${escapeHtml(cat)}</span>`;
  }

  // Render Table
  function renderFilesTable(files, pagination) {
    elements.fileTotalCount.textContent = `${pagination.total} ${pagination.total === 1 ? 'item' : 'items'}`;
    state.totalPages = pagination.totalPages;
    elements.paginationInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
    elements.prevPageBtn.disabled = pagination.page <= 1;
    elements.nextPageBtn.disabled = pagination.page >= pagination.totalPages;

    if (!files || files.length === 0) {
      renderEmptyTable('No items found matching your filter. Upload your first file above!');
      return;
    }

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
            <!-- Edit Preset Button -->
            <button class="btn btn-glass btn-sm table-edit-btn" 
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
            <button class="btn btn-glass btn-sm table-copy-btn" data-copy="${escapeHtml(file.fileUrl || file.url)}" title="Copy Direct URL">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="btn btn-glass btn-sm table-delete-btn" data-id="${escapeHtml(file.id)}" title="Remove File">
              <svg class="icon-sm text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;
      elements.filesTableBody.appendChild(tr);
    });

    // Row Edit Listeners
    document.querySelectorAll('.table-edit-btn').forEach(btn => {
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

    // Row Copy Listeners
    document.querySelectorAll('.table-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(text).then(() => {
          showToast('Preset URL copied to clipboard!', 'success');
        });
      });
    });

    // Row Delete Listeners
    document.querySelectorAll('.table-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fileId = btn.getAttribute('data-id');
        if (confirm(`Are you sure you want to permanently remove preset '${fileId}'?`)) {
          await deleteFile(fileId);
        }
      });
    });
  }

  function renderEmptyTable(message) {
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

  // Delete / Remove File API Call
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
    // Main Category Toggles (Upload)
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

    // Main Category Change in Edit Modal
    elements.editFileMainCategory.addEventListener('change', (e) => {
      populateSubcategorySelect(elements.editFileSubcategorySelect, elements.editFileSubcategoryCustom, e.target.value);
    });

    // Subcategory Select in Edit Modal
    elements.editFileSubcategorySelect.addEventListener('change', (e) => {
      if (e.target.value === '__custom__') {
        elements.editFileSubcategoryCustom.classList.remove('hidden');
        elements.editFileSubcategoryCustom.focus();
      } else {
        elements.editFileSubcategoryCustom.classList.add('hidden');
      }
    });

    // Explorer Main Category Filter Change
    elements.mainCategoryFilterSelect.addEventListener('change', (e) => {
      state.selectedMainFilter = e.target.value;
      state.currentPage = 1;
      updateSubcategoryFilterDropdown();
      fetchFilesList();
    });

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
        handleFileSelected(files[0]);
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
        handleFileSelected(e.target.files[0]);
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

    // Helper to reset file selection without uploading
    const resetFileSelection = () => {
      state.currentFile = null;
      elements.fileInput.value = '';
      if (elements.customTitleInput) elements.customTitleInput.value = '';
      if (elements.customSubcategoryInput) elements.customSubcategoryInput.value = '';
      switchState('ready');
    };

    // Clear / Cancel Selected File (Does not trigger upload)
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

    // Prevent Enter key in metadata inputs from prematurely submitting
    [elements.customTitleInput, elements.customSubcategoryInput].forEach(input => {
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
          }
        });
      }
    });

    // Start Upload (Explicit user click on Upload button)
    elements.startUploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      executeUpload();
    });

    // Cancel Upload
    elements.cancelUploadBtn.addEventListener('click', () => {
      cancelUpload();
    });

    // Success State Buttons
    elements.uploadAnotherBtn.addEventListener('click', () => {
      state.currentFile = null;
      elements.fileInput.value = '';
      switchState('ready');
    });

    // Failure State Buttons
    elements.retryUploadBtn.addEventListener('click', () => {
      executeUpload();
    });

    elements.chooseAnotherBtn.addEventListener('click', () => {
      state.currentFile = null;
      elements.fileInput.value = '';
      switchState('ready');
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

    // Search input with debounce
    let searchDebounce = null;
    elements.fileSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.searchQuery = e.target.value;
        state.currentPage = 1;
        fetchFilesList();
      }, 300);
    });

    // Refresh files
    elements.refreshFilesBtn.addEventListener('click', () => {
      fetchFilesList();
      fetchCategories();
      showToast('Presets list refreshed.', 'info');
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

    // Auth Modal
    elements.authConfigBtn.addEventListener('click', () => {
      elements.customApiKeyInput.value = state.apiKey;
      elements.authModal.classList.remove('hidden');
    });

    elements.closeAuthModal.addEventListener('click', () => {
      elements.authModal.classList.add('hidden');
    });

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
    });

    // Docs Modal
    elements.docsBtn.addEventListener('click', () => {
      elements.docsModal.classList.remove('hidden');
    });

    elements.closeDocsModal.addEventListener('click', () => {
      elements.docsModal.classList.add('hidden');
    });

    // Close modals on backdrop click
    [elements.authModal, elements.docsModal, elements.editModal].forEach(modal => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });
  }

  // Update documentation code snippets to match the actual server host
  function updateDocsHostUrls() {
    if (!elements.docsModal) return;
    const origin = window.location.origin;
    const codeBlocks = elements.docsModal.querySelectorAll('code');
    codeBlocks.forEach(code => {
      code.textContent = code.textContent.replace(/http:\/\/localhost:3000/g, origin);
    });
  }

  // Initialize
  function init() {
    updateDocsHostUrls();
    elements.activeKeyName.textContent = state.keyName;
    initEvents();
    setUploadMainCategory('image');
    switchState('ready');
    fetchCategories();
    fetchFilesList();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
