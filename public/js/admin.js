/* ============================================
   EuroPolitika Admin Panel — admin.js
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initSidebarToggle();
  initAIProcessing();
  initImageUpload();
  initDeleteConfirmation();
  initAutoSave();
  initRichTextEditor();
  checkCompiledNewsletterData();
  initSocialMediaHelper();
});

/* ---------- Sidebar Toggle (Mobile) ---------- */
function initSidebarToggle() {
  const toggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.querySelector('.sidebar-overlay');

  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('visible');
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
    });
  }
}

/* ---------- AI Processing ---------- */
function initAIProcessing() {
  const aiBtn = document.getElementById('aiProcessBtn');
  const rawContent = document.getElementById('rawContent');

  if (!aiBtn || !rawContent) return;

  let isProcessing = false;

  const startProcessing = async (rawText) => {
    if (isProcessing) return;
    isProcessing = true;

    // Show loading state
    setAILoading(true);
    aiBtn.disabled = true;
    rawContent.disabled = true;

    try {
      showNotification('İçerik çekiliyor ve işleniyor, lütfen bekleyin...', 'info');

      const response = await fetch('/api/ai/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: rawText }),
      });

      const res = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(res.message || res.error || `İşlem başarısız oldu (${response.status})`);
      }

      if (!res.success || !res.data) {
        throw new Error(res.message || 'AI işlemi başarısız oldu.');
      }

      const data = res.data;

      // Populate editor fields with AI results
      populateEditorFields(data);

      // Show success message
      setAILoading(false);
      showAIResult(true);
      showNotification('İçerik başarıyla işlendi!', 'success');

      // Hide raw content section and show editor fields
      const aiSection = document.querySelector('.ai-section');
      if (aiSection) {
        aiSection.style.display = 'none';
      }

      const editorFields = document.querySelector('.editor-fields');
      if (editorFields) {
        editorFields.style.display = 'block';
      }

    } catch (error) {
      console.error('AI Processing Error:', error);
      setAILoading(false);
      showNotification(error.message || 'AI işlemi sırasında bir hata oluştu.', 'error');
    } finally {
      isProcessing = false;
      aiBtn.disabled = false;
      rawContent.disabled = false;
    }
  };

  aiBtn.addEventListener('click', async () => {
    const rawText = rawContent.value.trim();

    if (!rawText) {
      showNotification('Lütfen işlenecek içerik girin.', 'warning');
      rawContent.focus();
      return;
    }

    await startProcessing(rawText);
  });

  // Automatically detect pasted URL and start processing
  const handleAutoProcess = () => {
    const text = rawContent.value.trim();
    if (text.startsWith('http://') || text.startsWith('https://')) {
      startProcessing(text);
    }
  };

  rawContent.addEventListener('paste', () => {
    setTimeout(handleAutoProcess, 100);
  });

  rawContent.addEventListener('input', () => {
    // Debounce/prevent double trigger if pasted
    setTimeout(handleAutoProcess, 200);
  });
}

function populateEditorFields(data) {
  let ktString = '';
  if (data.key_takeaways) {
    if (Array.isArray(data.key_takeaways)) {
      ktString = data.key_takeaways.join('\n');
    } else {
      ktString = data.key_takeaways;
    }
  }

  const fields = {
    title: data.title || '',
    excerpt: data.excerpt || data.summary || '',
    content: data.content || data.body || '',
    editor_analysis: data.editor_analysis || '',
    key_takeaways: ktString,
    category: data.category || '',
    tags: Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || ''),
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === 'SELECT') {
        // Try to find matching option (case-insensitive)
        const options = Array.from(el.options);
        const match = options.find(
          opt => opt.value.toLowerCase() === value.toLowerCase()
        );
        if (match) {
          el.value = match.value;
        }
      } else {
        el.value = value;
      }
    }
  });

  // Update CKEditor content with instanceReady handling to prevent race conditions
  if (window.CKEDITOR && CKEDITOR.instances.content) {
    try {
      if (CKEDITOR.instances.content.instanceReady) {
        CKEDITOR.instances.content.setData(fields.content);
      } else {
        CKEDITOR.instances.content.once('instanceReady', () => {
          CKEDITOR.instances.content.setData(fields.content);
        });
      }
    } catch (e) {
      console.error('CKEditor setData error:', e);
      CKEDITOR.instances.content.setData(fields.content);
    }
  }

  // Set cover image if returned from backend API (resolved statically)
  if (data.cover_image) {
    const imageUrl = data.cover_image;
    
    // Set hidden input value
    const coverImageInput = document.getElementById('coverImage');
    if (coverImageInput) {
      coverImageInput.value = imageUrl;
    }
    
    // Update preview element
    const preview = document.querySelector('.image-preview');
    if (preview) {
      let img = preview.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        preview.appendChild(img);
      }
      img.src = imageUrl;
      img.alt = 'AI tarafından seçilen kapak görseli';
      preview.classList.add('visible');
    }
    showNotification('AI makaleye uygun sabit bir kapak görseli seçti!', 'success');
  }

  // Add Google Images search link for the cover image if keywords are available
  if (data.image_keywords) {
    const coverUrlLabel = document.querySelector('label[for="coverImageUrlInput"]');
    if (coverUrlLabel) {
      let searchLink = coverUrlLabel.querySelector('.cover-search-link');
      if (!searchLink) {
        searchLink = document.createElement('a');
        searchLink.className = 'cover-search-link';
        searchLink.target = '_blank';
        searchLink.style.marginLeft = '8px';
        searchLink.style.textTransform = 'none';
        searchLink.style.color = '#C53030';
        searchLink.style.textDecoration = 'underline';
        searchLink.style.fontWeight = 'bold';
        coverUrlLabel.appendChild(searchLink);
      }
      searchLink.href = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(data.image_keywords)}`;
      searchLink.innerHTML = `🔍 Google'da Ara`;
    }
  }

  // Populate inline image placeholders
  if (data.content) {
    setTimeout(() => {
      renderInlineImagePlaceholders(data.content, data.resolvedImages || []);
    }, 100);
  }
}

function renderInlineImagePlaceholders(htmlContent, resolvedImages = []) {
  const container = document.getElementById('inlineImagesContainer');
  const card = document.getElementById('inlineImagesCard');
  if (!container || !card) return;

  container.innerHTML = '';
  
  // Use DOMParser to find all placeholders
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const placeholders = doc.querySelectorAll('.image-placeholder');

  if (placeholders.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  placeholders.forEach(ph => {
    const id = ph.getAttribute('data-id');
    const prompt = ph.getAttribute('data-prompt');
    const search = ph.getAttribute('data-search') || prompt;

    const slot = document.createElement('div');
    slot.className = 'inline-image-slot';
    slot.setAttribute('data-slot-id', id);
    slot.setAttribute('data-prompt', prompt);
    slot.style.border = '1px solid #E2E8F0';
    slot.style.padding = '12px';
    slot.style.borderRadius = '6px';
    slot.style.backgroundColor = '#F8F9FA';

    slot.innerHTML = `
      <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #333; display: flex; justify-content: space-between; align-items: center;">
        <span>Görsel ${id}</span>
        <a href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(search)}" target="_blank" style="font-size: 11px; color: #C53030; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
          🔍 Görsel Ara
        </a>
      </div>
      <div style="font-size: 12px; color: #718096; margin-bottom: 8px; font-style: italic; line-height: 1.4;">Öneri: ${prompt}</div>
      <div style="display: flex; gap: 6px;">
        <input type="text" class="inline-image-url-input" placeholder="Görsel linki yapıştırın..." style="flex: 1; padding: 6px 10px; border: 1px solid #CBD5E0; border-radius: 4px; font-size: 13px; font-family: inherit;">
        <button type="button" class="btn btn-secondary btn-sm btn-download-inline" style="padding: 6px 12px; font-size: 12px;">İndir</button>
      </div>
      <div class="inline-preview-container" style="margin-top: 10px; display: none; text-align: center; border-radius: 4px; overflow: hidden; max-height: 120px; border: 1px solid #CBD5E0;">
        <img src="" alt="Önizleme" style="max-width: 100%; max-height: 120px; object-fit: cover;">
      </div>
      <input type="hidden" class="inline-resolved-path" value="">
    `;

    container.appendChild(slot);

    // Bind event listener to the download button
    const btn = slot.querySelector('.btn-download-inline');
    const input = slot.querySelector('.inline-image-url-input');
    const hiddenInput = slot.querySelector('.inline-resolved-path');
    const previewContainer = slot.querySelector('.inline-preview-container');
    const previewImg = slot.querySelector('.inline-preview-container img');

    // Pre-populate if we have a pre-resolved image for this slot (from newsletter digest compiler)
    const matchingResolved = resolvedImages.find(img => img.slotId === parseInt(id));
    if (matchingResolved) {
      hiddenInput.value = matchingResolved.url;
      previewImg.src = matchingResolved.url;
      previewContainer.style.display = 'block';
      input.value = matchingResolved.url;
    }

    btn.addEventListener('click', async () => {
      const url = input.value.trim();
      if (!url) {
        showNotification('Lütfen geçerli bir görsel URL\'si girin.', 'warning');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'İndiriliyor...';
      showNotification(`Görsel ${id} indiriliyor...`, 'info');

      try {
        const response = await fetch('/api/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        const res = await response.json();
        if (!response.ok || !res.success) {
          throw new Error(res.message || 'Görsel indirilemedi.');
        }

        hiddenInput.value = res.url;
        previewImg.src = res.url;
        previewContainer.style.display = 'block';
        
        showNotification(`Görsel ${id} başarıyla yerelleştirildi!`, 'success');
        input.value = '';
      } catch (error) {
        console.error(error);
        showNotification(error.message || 'Görsel indirilemedi.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'İndir';
      }
    });
  });
}

function setAILoading(visible) {
  const loading = document.querySelector('.ai-loading');
  if (loading) {
    loading.classList.toggle('visible', visible);
  }
}

function showAIResult(visible) {
  const result = document.querySelector('.ai-result');
  if (result) {
    result.classList.toggle('visible', visible);
  }
}

/* ---------- Image Upload ---------- */
function initImageUpload() {
  const fileInput = document.getElementById('coverImageInput');
  const btnDownloadUrl = document.getElementById('btnDownloadCoverUrl');
  const urlInput = document.getElementById('coverImageUrlInput');
  
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        showNotification('Lütfen geçerli bir görsel dosyası seçin (JPEG, PNG, WebP, GIF).', 'error');
        fileInput.value = '';
        return;
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        showNotification('Dosya boyutu 5MB\'dan küçük olmalıdır.', 'error');
        fileInput.value = '';
        return;
      }

      const formData = new FormData();
      formData.append('image', file);

      try {
        // Show preview immediately (local)
        showImagePreview(file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Yükleme başarısız oldu.');
        }

        const data = await response.json();

        // Set hidden input with uploaded image path
        const hiddenInput = document.getElementById('coverImage');
        if (hiddenInput) {
          hiddenInput.value = data.path || data.url || '';
        }

        showNotification('Görsel başarıyla yüklendi.', 'success');

      } catch (error) {
        console.error('Upload Error:', error);
        showNotification(error.message || 'Görsel yüklenirken bir hata oluştu.', 'error');
      }
    });
  }

  // Handle URL download
  if (btnDownloadUrl && urlInput) {
    btnDownloadUrl.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) {
        showNotification('Lütfen geçerli bir görsel URL\'si girin.', 'warning');
        return;
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showNotification('Lütfen http:// veya https:// ile başlayan bir link girin.', 'warning');
        return;
      }

      btnDownloadUrl.disabled = true;
      btnDownloadUrl.textContent = 'İndiriliyor...';
      showNotification('Görsel internetten indiriliyor ve sunucuya kaydediliyor...', 'info');

      try {
        const response = await fetch('/api/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        const res = await response.json();
        if (!response.ok || !res.success) {
          throw new Error(res.message || 'Görsel indirilemedi.');
        }

        // Set hidden input value
        const hiddenInput = document.getElementById('coverImage');
        if (hiddenInput) {
          hiddenInput.value = res.url;
        }

        // Show image preview
        const preview = document.querySelector('.image-preview');
        if (preview) {
          let img = preview.querySelector('img');
          if (!img) {
            img = document.createElement('img');
            preview.appendChild(img);
          }
          img.src = res.url;
          img.alt = 'İndirilen kapak görseli';
          preview.classList.add('visible');
        }

        showNotification('Görsel başarıyla indirildi ve yerelleştirildi!', 'success');
        urlInput.value = '';

      } catch (error) {
        console.error('Download URL Error:', error);
        showNotification(error.message || 'Görsel indirilirken bir hata oluştu.', 'error');
      } finally {
        btnDownloadUrl.disabled = false;
        btnDownloadUrl.textContent = 'İndir';
      }
    });
  }
}

function showImagePreview(file) {
  const preview = document.querySelector('.image-preview');
  if (!preview) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    let img = preview.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      preview.appendChild(img);
    }
    img.src = e.target.result;
    img.alt = 'Kapak görseli önizleme';
    preview.classList.add('visible');
  };
  reader.readAsDataURL(file);
}

/* ---------- Delete Confirmation ---------- */
function initDeleteConfirmation() {
  // Bind delete buttons
  document.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const articleId = btn.dataset.deleteId;
      const articleTitle = btn.dataset.deleteTitle || 'bu haberi';
      showDeleteModal(articleId, articleTitle);
    });
  });
}

function showDeleteModal(articleId, articleTitle) {
  const overlay = document.getElementById('deleteModal');
  if (!overlay) return;

  // Update modal content
  const titleEl = overlay.querySelector('.modal-article-title');
  if (titleEl) {
    titleEl.textContent = articleTitle;
  }

  // Show modal
  overlay.classList.add('visible');

  // Handle confirm
  const confirmBtn = overlay.querySelector('.btn-confirm-delete');
  const cancelBtn = overlay.querySelector('.btn-cancel-delete');

  // Clone and replace to remove old listeners
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

  newConfirm.addEventListener('click', () => {
    // Submit delete via form
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `/admin/haberler/${articleId}/sil`;
    document.body.appendChild(form);
    form.submit();
  });

  // Handle cancel
  const closeModal = () => {
    overlay.classList.remove('visible');
  };

  if (cancelBtn) {
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', closeModal);
  }

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Close on Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/* ---------- Auto-Save Draft ---------- */
function initAutoSave() {
  const titleInput = document.getElementById('title');
  const contentInput = document.getElementById('content');
  const excerptInput = document.getElementById('excerpt');

  if (!titleInput && !contentInput) return;

  const STORAGE_KEY = 'europolitika_draft';
  let saveTimeout = null;

  // Restore draft
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const draft = JSON.parse(saved);
      // Only restore if fields are empty (i.e., new article)
      if (titleInput && !titleInput.value && draft.title) {
        titleInput.value = draft.title;
      }
      if (contentInput && !contentInput.value && draft.content) {
        contentInput.value = draft.content;
      }
      if (excerptInput && !excerptInput.value && draft.excerpt) {
        excerptInput.value = draft.excerpt;
      }
    }
  } catch (e) {
    // Silently fail
  }

  // Auto-save on input
  const saveDraft = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      try {
        const draft = {
          title: titleInput ? titleInput.value : '',
          content: contentInput ? contentInput.value : '',
          excerpt: excerptInput ? excerptInput.value : '',
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch (e) {
        // Silently fail
      }
    }, 1000);
  };

  [titleInput, contentInput, excerptInput].forEach((el) => {
    if (el) {
      el.addEventListener('input', saveDraft);
    }
  });

  // Clear draft and resolve inline images on form submission
  const form = document.querySelector('.editor-form');
  const btnSubmitEditor = document.getElementById('btnSubmitEditor');
  if (form && btnSubmitEditor) {
    let formSubmitted = false;

    // Prevent default form submission (e.g. on Enter key press)
    form.addEventListener('submit', (e) => {
      e.preventDefault();
    });

    btnSubmitEditor.addEventListener('click', async () => {
      if (formSubmitted) return;

      // Sync CKEditor HTML back to textarea
      if (window.CKEDITOR && CKEDITOR.instances.content) {
        CKEDITOR.instances.content.updateElement();
      }

      // Show status on button
      btnSubmitEditor.disabled = true;
      const originalText = btnSubmitEditor.textContent;
      btnSubmitEditor.textContent = 'Kaydediliyor...';

      const contentEl = document.getElementById('content');
      
      // 1. Resolve inline images if placeholders exist
      if (contentEl && contentEl.value.includes('image-placeholder')) {
        showNotification('Haber içi görseller yerelleştiriliyor...', 'info');
        try {
          let html = contentEl.value;
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const placeholders = doc.querySelectorAll('.image-placeholder');

          for (const ph of placeholders) {
            const id = ph.getAttribute('data-id');
            const prompt = ph.getAttribute('data-prompt');

            // Find matching slot in UI
            const slot = document.querySelector(`.inline-image-slot[data-slot-id="${id}"]`);
            const hiddenPathInput = slot ? slot.querySelector('.inline-resolved-path') : null;
            let finalUrl = hiddenPathInput ? hiddenPathInput.value : '';

            // If user left it empty, download fallback stock image automatically
            if (!finalUrl) {
              const safeKeywords = ['finance', 'money', 'bank', 'business', 'market', 'politics', 'government', 'meeting', 'europe', 'travel', 'beach', 'hotel', 'resort', 'nature', 'restaurant'];
              let chosenKeyword = 'business';
              const promptLower = prompt ? prompt.toLowerCase() : '';
              for (const kw of safeKeywords) {
                if (promptLower.includes(kw)) {
                  chosenKeyword = kw;
                  break;
                }
              }

              const fallbackUrl = `https://loremflickr.com/600/400/${chosenKeyword}`;
              const response = await fetch('/api/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: fallbackUrl }),
              });
              const res = await response.json().catch(() => ({}));
              if (response.ok && res.success && res.url) {
                finalUrl = res.url;
              }
            }

            if (finalUrl) {
              const img = doc.createElement('img');
              img.src = finalUrl;
              img.alt = prompt;
              img.className = 'article-inline-image';
              img.setAttribute('data-id', id);
              if (prompt) img.setAttribute('data-prompt', prompt);
              ph.parentNode.replaceChild(img, ph);
            } else {
              ph.remove();
            }
          }
          const resolvedHtml = doc.body.innerHTML;
          contentEl.value = resolvedHtml;
          
          // Update CKEditor content and destroy instance so it won't overwrite on submit
          if (window.CKEDITOR && CKEDITOR.instances.content) {
            CKEDITOR.instances.content.setData(resolvedHtml);
            CKEDITOR.instances.content.destroy(true);
          }
        } catch (error) {
          console.error('Image resolving error on submit:', error);
        }
      } else {
        // If no placeholders, still destroy CKEditor cleanly to avoid any submit issues
        if (window.CKEDITOR && CKEDITOR.instances.content) {
          CKEDITOR.instances.content.destroy(true);
        }
      }

      // 2. Generate and upload social sharing card image
      try {
        showNotification('Sosyal medya paylaşım kartı üretiliyor...', 'info');
        await generateAndUploadSocialCard();
      } catch (error) {
        console.error('Social card error:', error);
      }

      // 3. Clear draft and submit
      localStorage.removeItem(STORAGE_KEY);
      formSubmitted = true;
      form.submit();
    });
  }
}

async function generateAndUploadSocialCard() {
  const titleEl = document.getElementById('title');
  if (!titleEl) return;

  const title = titleEl.value;
  const excerpt = document.getElementById('excerpt')?.value || '';
  const category = document.getElementById('category')?.value || 'Genel';
  const coverImage = document.getElementById('coverImage')?.value || '';

  // Generate a clean slug
  const cleanSlug = title.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  const shareCard = document.getElementById('shareCardTemplate');
  if (!shareCard) return;

  // Populate card template values
  shareCard.querySelector('.card-title').textContent = title;
  shareCard.querySelector('.card-excerpt').textContent = excerpt;
  shareCard.querySelector('.card-category').textContent = category;
  shareCard.querySelector('.card-date').textContent = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  const coverImg = shareCard.querySelector('.card-cover-img');
  const coverContainer = shareCard.querySelector('.card-cover-container');
  if (coverImage) {
    coverImg.src = coverImage;
    coverContainer.style.display = 'block';
  } else {
    coverImg.src = '';
    coverContainer.style.display = 'none';
  }

  // Generate base64 via html2canvas
  const canvas = await html2canvas(shareCard, {
    useCORS: true,
    allowTaint: true,
    scale: 1.5,
    backgroundColor: '#F8F7F4'
  });
  const dataUrl = canvas.toDataURL('image/png');

  const res = await fetch('/api/upload-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: cleanSlug, image: dataUrl })
  });
  const data = await res.json();
  if (data.success) {
    const socialImageInput = document.getElementById('socialImage');
    if (socialImageInput) {
      socialImageInput.value = data.url;
    }
  }
}

/* ---------- Notification Utility ---------- */
function showNotification(message, type = 'info') {
  // Remove existing notification
  const existing = document.querySelector('.notification-toast');
  if (existing) existing.remove();

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  const toast = document.createElement('div');
  toast.className = `notification-toast notification-${type}`;
  toast.innerHTML = `
    <span class="notification-icon">${icons[type] || icons.info}</span>
    <span class="notification-message">${message}</span>
    <button class="notification-close" onclick="this.parentElement.remove()">✕</button>
  `;

  // Apply styles inline (since CSS may not include toast styles)
  Object.assign(toast.style, {
    position: 'fixed',
    top: '1.5rem',
    right: '1.5rem',
    zIndex: '3000',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem 1.25rem',
    borderRadius: '8px',
    background: '#FFFFFF',
    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
    border: '1px solid #E2E8F0',
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#333',
    maxWidth: '400px',
    animation: 'toastSlideIn 0.3s ease-out',
  });

  // Add color accent based on type
  const colors = {
    success: '#38A169',
    error: '#E53E3E',
    warning: '#D69E2E',
    info: '#3182CE',
  };
  toast.style.borderLeft = `4px solid ${colors[type] || colors.info}`;

  // Style close button
  const closeBtn = toast.querySelector('.notification-close');
  Object.assign(closeBtn.style, {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    color: '#999',
    padding: '0 0.25rem',
    marginLeft: 'auto',
  });

  document.body.appendChild(toast);

  // Add CSS animation if not present
  if (!document.getElementById('toast-animation-style')) {
    const style = document.createElement('style');
    style.id = 'toast-animation-style';
    style.textContent = `
      @keyframes toastSlideIn {
        from { opacity: 0; transform: translateX(30px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes toastSlideOut {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(30px); }
      }
    `;
    document.head.appendChild(style);
  }

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

/* ---------- CKEditor Rich Text Editor ---------- */
function initRichTextEditor() {
  const contentEl = document.getElementById('content');
  if (contentEl && typeof CKEDITOR !== 'undefined') {
    // Prevent CKEditor from stripping empty div and span tags
    CKEDITOR.dtd.$removeEmpty['div'] = false;
    CKEDITOR.dtd.$removeEmpty['span'] = false;

    // Disable content filtering to prevent stripping custom image placeholders
    CKEDITOR.config.allowedContent = true;
    CKEDITOR.config.versionCheck = false;
    CKEDITOR.replace('content', {
      height: 400,
      removePlugins: 'about,forms,iframe',
      allowedContent: true,
      extraAllowedContent: 'img[*]; div[*]; span[*]; a[*]',
      versionCheck: false
    });
  }
}

/* ---------- Check Compiled Newsletter Data ---------- */
function checkCompiledNewsletterData() {
  const newsletterDataRaw = sessionStorage.getItem('newsletter_data');
  if (!newsletterDataRaw) return;

  try {
    const data = JSON.parse(newsletterDataRaw);
    
    // Clear immediately to prevent reloading populating it again
    sessionStorage.removeItem('newsletter_data');

    // Populate editor fields
    populateEditorFields(data);

    // Show editor, hide AI processing raw input
    const aiSection = document.querySelector('.ai-section');
    if (aiSection) aiSection.style.display = 'none';

    const editorFields = document.querySelector('.editor-fields');
    if (editorFields) editorFields.style.display = 'block';

    // Populate cover image preview
    if (data.cover_image) {
      const coverInput = document.getElementById('coverImage');
      if (coverInput) coverInput.value = data.cover_image;

      const preview = document.querySelector('.image-preview');
      if (preview) {
        let img = preview.querySelector('img');
        if (!img) {
          img = document.createElement('img');
          preview.appendChild(img);
        }
        img.src = data.cover_image;
        img.alt = 'Bülten Kapak Görseli';
        preview.classList.add('visible');
      }
    }

    showNotification('AI bülten derlemesi başarıyla yüklendi! Lütfen kontrol edin.', 'success');

  } catch (error) {
    console.error('Error parsing compiled newsletter data:', error);
  }
}

/* ---------- Sosyal Medya Paylaşım Yardımcısı ---------- */
function initSocialMediaHelper() {
  const copyButtons = document.querySelectorAll('.btn-copy-social');
  copyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const textarea = document.getElementById(targetId);
      if (!textarea) return;

      textarea.select();
      textarea.setSelectionRange(0, 99999); // For mobile devices

      try {
        navigator.clipboard.writeText(textarea.value);
        showNotification('Metin başarıyla panoya kopyalandı!', 'success');
        
        // Temporarily change button text
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Kopyalandı!';
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 2000);
      } catch (err) {
        console.error('Clipboard copy failed:', err);
        // Fallback copy method
        try {
          document.execCommand('copy');
          showNotification('Metin başarıyla panoya kopyalandı!', 'success');
        } catch (e) {
          showNotification('Kopyalama başarısız oldu.', 'error');
        }
      }
    });
  });
}
