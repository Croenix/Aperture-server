/**
 * APERTURE FILE SERVER - FRONTEND CONTROLLER
 * Vanilla JavaScript UI & REST API Client with Edit & Remove Preset support
 */

(function () {
  'use strict';

  // Application State
  const state = {
    currentFile: null,
    activeXhr: null,
    uploadStartTime: null,
    apiKey: sessionStorage.getItem('aperture_api_key') || 'aperture_upl_secret_key_2026',
    keyName: sessionStorage.getItem('aperture_key_name') || 'Upload Key Active',
    currentPage: 1,
    searchQuery: '',
    selectedCategory: 'all',
    totalPages: 1
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
    startUploadBtn: document.getElementById('start-upload-btn'),

    // Title & Category Inputs (Upload)
    customTitleInput: document.getElementById('custom-title-input'),
    customCategorySelect: document.getElementById('custom-category-select'),
    customCategoryInput: document.getElementById('custom-category-input'),

    // Uploading State Elements
    uploadingFileName: document.getElementById('uploading-file-name'),
    uploadPercentage: document.getElementById('upload-percentage'),
    progressBar: document.getElementById('progress-bar'),
    uploadBytes: document.getElementById('upload-bytes'),
    uploadSpeed: document.getElementById('upload-speed'),
    cancelUploadBtn: document.getElementById('cancel-upload-btn'),

    // Success State Elements
    successTitle: document.getElementById('success-title'),
    successCategory: document.getElementById('success-category'),
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
    editFileCategorySelect: document.getElementById('edit-file-category-select'),
    editFileCategoryCustom: document.getElementById('edit-file-category-custom'),

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
    if (bytes === 0) return '0 Bytes';
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
          elements.selectedPanel.classList.remove('hidden');
          elements.selectedFileName.textContent = state.currentFile.name;
          elements.selectedFileSize.textContent = formatBytes(state.currentFile.size);
        } else {
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

  // Handle File Selection
  function handleFileSelected(file) {
    if (!file) return;
    state.currentFile = file;

    // Auto-generate readable title
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const cleanTitle = baseName.replace(/[-_]+/g, ' ').trim();
    elements.customTitleInput.value = cleanTitle;

    // Auto-select category if .apx or firmware
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'apx' || ext === 'bin' || ext === 'hex') {
      elements.customCategorySelect.value = 'firmware';
    } else if (['json', 'yaml', 'yml', 'xml', 'ini', 'env', 'conf'].includes(ext)) {
      elements.customCategorySelect.value = 'config';
    } else if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) {
      elements.customCategorySelect.value = 'documents';
    } else {
      elements.customCategorySelect.value = 'general';
    }
    elements.customCategoryInput.classList.add('hidden');

    switchState('ready');
  }

  // Execute Upload via XMLHttpRequest
  function executeUpload() {
    if (!state.currentFile) {
      showToast('Please select a file first.', 'error');
      return;
    }

    switchState('uploading');
    state.uploadStartTime = Date.now();

    const formData = new FormData();
    formData.append('file', state.currentFile);

    // Append custom title & category
    const title = elements.customTitleInput.value.trim() || state.currentFile.name;
    let category = elements.customCategorySelect.value;
    if (category === '__custom__') {
      category = elements.customCategoryInput.value.trim() || 'general';
    }
    formData.append('title', title);
    formData.append('category', category);

    const xhr = new XMLHttpRequest();
    state.activeXhr = xhr;

    // Progress Listener
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        elements.progressBar.style.width = `${percent}%`;
        elements.uploadPercentage.textContent = `${percent}%`;
        elements.uploadBytes.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;

        // Calculate upload speed
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
        const file = response.file;
        // Populate Success State
        elements.successTitle.textContent = file.title || file.originalName;
        elements.successCategory.innerHTML = `<span class="badge badge-category badge-cat-${escapeHtml(file.category)}">${escapeHtml(file.category)}</span>`;
        elements.successFilename.textContent = file.originalName;
        elements.successFilesize.textContent = formatBytes(file.size);
        elements.successFileid.textContent = file.id;
        elements.successMimetype.textContent = file.mimeType;
        elements.successTimestamp.textContent = formatTimestamp(file.uploadedAt);
        elements.successFileUrl.value = file.url;
        elements.successApiUrl.value = file.apiUrl;

        elements.successViewLink.href = `${file.url}/view`;
        elements.successDownloadLink.href = `${file.url}/download`;

        switchState('success');
        showToast('Preset uploaded successfully!', 'success');
        fetchFilesList();
        fetchCategories();
      } else {
        // Populate Failure State
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

    // Send Request
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

  // Fetch Categories for Filter Dropdown
  async function fetchCategories() {
    try {
      const headers = {};
      if (state.apiKey) {
        headers['Authorization'] = `Bearer ${state.apiKey.trim()}`;
      }
      const res = await fetch('/api/v1/files/categories', { headers });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.categories)) {
        const currentSelected = elements.categoryFilterSelect.value;
        elements.categoryFilterSelect.innerHTML = '<option value="all">All Categories</option>';
        data.categories.forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.category;
          opt.textContent = `${item.category.charAt(0).toUpperCase() + item.category.slice(1)} (${item.count})`;
          elements.categoryFilterSelect.appendChild(opt);
        });
        elements.categoryFilterSelect.value = currentSelected || 'all';
      }
    } catch (err) {
      // Non-blocking
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
      if (state.selectedCategory && state.selectedCategory !== 'all') {
        url.searchParams.set('category', state.selectedCategory);
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
      renderEmptyTable('Could not connect to files API');
    }
  }

  // Render Table
  function renderFilesTable(files, pagination) {
    elements.fileTotalCount.textContent = `${pagination.total} ${pagination.total === 1 ? 'preset' : 'presets'}`;
    state.totalPages = pagination.totalPages;
    elements.paginationInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
    elements.prevPageBtn.disabled = pagination.page <= 1;
    elements.nextPageBtn.disabled = pagination.page >= pagination.totalPages;

    if (!files || files.length === 0) {
      renderEmptyTable('No presets found. Upload your first preset above!');
      return;
    }

    elements.filesTableBody.innerHTML = '';
    files.forEach(file => {
      const tr = document.createElement('tr');
      const catClass = `badge-cat-${escapeHtml(file.category || 'general')}`;
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
        <td>
          <span class="badge badge-category ${catClass}">${escapeHtml(file.category || 'general')}</span>
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
              data-category="${escapeHtml(file.category || 'general')}" 
              title="Edit Preset Title & Category">
              <svg class="icon-sm text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <a href="${file.url}/view" target="_blank" class="btn btn-glass btn-sm" title="View / Stream">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </a>
            <a href="${file.url}/download" class="btn btn-glass btn-sm" title="Download Preset">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </a>
            <button class="btn btn-glass btn-sm table-copy-btn" data-copy="${escapeHtml(file.url)}" title="Copy Direct URL">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="btn btn-glass btn-sm table-delete-btn" data-id="${escapeHtml(file.id)}" title="Remove Preset">
              <svg class="icon-sm text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;
      elements.filesTableBody.appendChild(tr);
    });

    // Attach row edit listeners
    document.querySelectorAll('.table-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fileId = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title');
        const category = btn.getAttribute('data-category');

        elements.editFileId.value = fileId;
        elements.editFileTitle.value = title;

        // Check if category is standard option
        let found = false;
        for (let i = 0; i < elements.editFileCategorySelect.options.length; i++) {
          if (elements.editFileCategorySelect.options[i].value.toLowerCase() === category.toLowerCase()) {
            elements.editFileCategorySelect.selectedIndex = i;
            found = true;
            break;
          }
        }

        if (!found) {
          elements.editFileCategorySelect.value = '__custom__';
          elements.editFileCategoryCustom.value = category;
          elements.editFileCategoryCustom.classList.remove('hidden');
        } else {
          elements.editFileCategoryCustom.classList.add('hidden');
          elements.editFileCategoryCustom.value = '';
        }

        elements.editModal.classList.remove('hidden');
      });
    });

    // Attach row copy listeners
    document.querySelectorAll('.table-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(text).then(() => {
          showToast('Preset URL copied to clipboard!', 'success');
        });
      });
    });

    // Attach row delete listeners
    document.querySelectorAll('.table-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
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
        <td colspan="6" class="empty-placeholder">
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
      const res = await fetch(`/api/v1/files/${fileId}`, {
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
    let newCategory = elements.editFileCategorySelect.value;
    if (newCategory === '__custom__') {
      newCategory = elements.editFileCategoryCustom.value.trim() || 'general';
    }

    if (!newTitle) {
      showToast('Please enter a preset title.', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/v1/files/${fileId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.apiKey.trim()}`
        },
        body: JSON.stringify({
          title: newTitle,
          category: newCategory
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

    // Custom Category Toggle (Upload)
    elements.customCategorySelect.addEventListener('change', (e) => {
      if (e.target.value === '__custom__') {
        elements.customCategoryInput.classList.remove('hidden');
        elements.customCategoryInput.focus();
      } else {
        elements.customCategoryInput.classList.add('hidden');
      }
    });

    // Custom Category Toggle (Edit Modal)
    elements.editFileCategorySelect.addEventListener('change', (e) => {
      if (e.target.value === '__custom__') {
        elements.editFileCategoryCustom.classList.remove('hidden');
        elements.editFileCategoryCustom.focus();
      } else {
        elements.editFileCategoryCustom.classList.add('hidden');
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

    // Category Filter Change
    elements.categoryFilterSelect.addEventListener('change', (e) => {
      state.selectedCategory = e.target.value;
      state.currentPage = 1;
      fetchFilesList();
    });

    // File Input Browse
    elements.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelected(e.target.files[0]);
      }
    });

    elements.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.fileInput.click();
    });

    elements.dropZone.addEventListener('click', (e) => {
      elements.fileInput.click();
    });

    // Clear Selected File
    elements.clearSelectedBtn.addEventListener('click', () => {
      state.currentFile = null;
      elements.fileInput.value = '';
      switchState('ready');
    });

    // Start Upload
    elements.startUploadBtn.addEventListener('click', () => {
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
      showToast('Files list refreshed.', 'info');
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
        const name = card.getAttribute('data-name');
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

      // Determine active name
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

  // Initialize
  function init() {
    elements.activeKeyName.textContent = state.keyName;
    initEvents();
    switchState('ready');
    fetchFilesList();
    fetchCategories();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
