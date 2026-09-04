/**
 * app.js â€” Main renderer logic
 * Handles drag/drop, processing pipeline, custom logo overlay, tab switching, download.
 */
(() => {
  const isElectron = typeof window.electronAPI !== 'undefined';

  // â”€â”€ DOM Elements â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dropZone     = document.getElementById('drop-zone');
  const fileInput    = document.getElementById('file-input');
  const dzIdle       = document.getElementById('dz-idle');
  const dzLoaded     = document.getElementById('dz-loaded');
  const loadedName   = document.getElementById('loaded-name');
  const statusDot    = document.getElementById('status-dot');
  const statusMsg    = document.getElementById('status-msg');
  const btnProcess   = document.getElementById('btn-process');
  const btnSave      = document.getElementById('btn-save');
  const btnSaveAll   = document.getElementById('btn-save-all');
  const btnReset     = document.getElementById('btn-reset');
  const queue        = document.getElementById('queue');
  const queueList    = document.getElementById('queue-list');
  const qProgressBar = document.getElementById('q-progress-bar');
  const qProgressTxt = document.getElementById('q-progress-text');
  const overwriteWrap = document.getElementById('overwrite-wrap');
  const chkOverwrite  = document.getElementById('chk-overwrite');

  // Custom Logo DOM Elements
  const chkEnableLogo   = document.getElementById('chk-enable-logo');
  const logoBody        = document.getElementById('logo-body');
  const logoUploader    = document.getElementById('logo-uploader');
  const logoFileInput   = document.getElementById('logo-file-input');
  const logoIdle        = document.getElementById('logo-idle');
  const logoPreviewWrap = document.getElementById('logo-preview-wrap');
  const logoThumb       = document.getElementById('logo-thumb');
  const logoName        = document.getElementById('logo-name');
  const btnRemoveLogo   = document.getElementById('btn-remove-logo');
  const rngLogoScale    = document.getElementById('rng-logo-scale');
  const valLogoScale    = document.getElementById('val-logo-scale');
  const rngLogoOpacity  = document.getElementById('rng-logo-opacity');
  const valLogoOpacity  = document.getElementById('val-logo-opacity');
  // mode selection removed — always overlay-only

  // Preview elements
  const beforeImg  = document.getElementById('before-img');
  const afterImg   = document.getElementById('after-img');
  const beforeImg2 = document.getElementById('before-img-2');
  const afterImg2  = document.getElementById('after-img-2');
  const beforeEmpty  = document.getElementById('before-empty');
  const afterEmpty   = document.getElementById('after-empty');
  const beforeEmpty2 = document.getElementById('before-empty-2');
  const afterEmpty2  = document.getElementById('after-empty-2');

  // Video preview elements
  const beforeVideo  = document.getElementById('before-video');
  const afterVideo   = document.getElementById('after-video');
  const beforeVideo2 = document.getElementById('before-video-2');
  const afterVideo2  = document.getElementById('after-video-2');

  // Video progress
  const videoProgressEl = document.getElementById('video-progress');
  const vpFrames        = document.getElementById('vp-frames');
  const vpFill          = document.getElementById('vp-fill');
  const vpTime          = document.getElementById('vp-time');

  // Tabs
  const tabSplit  = document.getElementById('tab-split');
  const tabBefore = document.getElementById('tab-before');
  const tabAfter  = document.getElementById('tab-after');
  const viewSplit  = document.getElementById('view-split');
  const viewBefore = document.getElementById('view-before');
  const viewAfter  = document.getElementById('view-after');

  // â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let fileQueue      = [];
  let processedBlobs = [];
  let cleanBlob      = null;
  let currentFile    = null;
  let isVideoMode    = false; // true when current file is a video
  let videoAbortCtrl = null; // AbortController for cancelling video processing

  // Custom Logo State
  let customLogo = null; // { dataUrl: string, name: string, img: Image }
  let logoSettings = {
    enabled: false,
    scale: 100,
    opacity: 100
    // Always overlay-only: logo stamps directly on top of Gemini watermark
  };

  // â”€â”€ Native menu (Electron) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isElectron) {
    window.electronAPI.onOpenFiles((paths) => {
      Promise.all(paths.map(p => pathToFile(p).then(f => { f._sourcePath = p; return f; }))).then(handleFiles);
    });
  }

  async function pathToFile(p) {
    const url = `file://${p.replace(/\\/g, '/')}`;
    const resp = await fetch(url);
    const blob = await resp.blob();
    const name = p.split(/[\\/]/).pop();
    return new File([blob], name, { type: blob.type || guessMime(name) });
  }

  function guessMime(n) {
    const e = n.split('.').pop().toLowerCase();
    return {
      png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp',
      mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime',
      avi:'video/x-msvideo', mkv:'video/x-matroska'
    }[e] || 'image/png';
  }

  function isVideoFile(file) {
    return (file.type && file.type.startsWith('video/')) ||
      /\.(mp4|webm|mov|avi|mkv|m4v|ogv)$/i.test(file.name);
  }

  function isImageFile(file) {
    return (file.type && file.type.startsWith('image/')) ||
      /\.(png|jpe?g|webp|avif|bmp|gif)$/i.test(file.name);
  }

  // â”€â”€ Custom Logo Management & LocalStorage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function initCustomLogo() {
    try {
      const savedSettings = localStorage.getItem('gemini_logo_settings');
      if (savedSettings) {
        logoSettings = Object.assign(logoSettings, JSON.parse(savedSettings));
      }
    } catch (_) {}

    // Apply saved settings to UI
    chkEnableLogo.checked = !!logoSettings.enabled;
    if (logoSettings.enabled) {
      logoBody.classList.remove('hidden');
    } else {
      logoBody.classList.add('hidden');
    }

    rngLogoScale.value = logoSettings.scale || 100;
    valLogoScale.textContent = `${rngLogoScale.value}%`;

    rngLogoOpacity.value = logoSettings.opacity !== undefined ? logoSettings.opacity : 100;
    valLogoOpacity.textContent = `${rngLogoOpacity.value}%`;



    // Load saved logo image
    try {
      const savedLogo = localStorage.getItem('gemini_custom_logo');
      if (savedLogo) {
        const parsed = JSON.parse(savedLogo);
        if (parsed && parsed.dataUrl) {
          applyCustomLogoData(parsed.dataUrl, parsed.name || 'logo.png', false);
        }
      }
    } catch (_) {}
  }

  function applyCustomLogoData(dataUrl, name, saveToStorage = true) {
    const img = new Image();
    img.onload = () => {
      customLogo = { dataUrl, name, img };
      logoThumb.src = dataUrl;
      logoName.textContent = name;
      logoIdle.classList.add('hidden');
      logoPreviewWrap.classList.remove('hidden');

      if (saveToStorage) {
        try {
          localStorage.setItem('gemini_custom_logo', JSON.stringify({ dataUrl, name }));
        } catch (e) {
          console.warn('Cannot save logo to localStorage:', e);
        }
      }
    };
    img.src = dataUrl;
  }

  function removeCustomLogo() {
    customLogo = null;
    logoThumb.src = '';
    logoName.textContent = '';
    logoPreviewWrap.classList.add('hidden');
    logoIdle.classList.remove('hidden');
    logoFileInput.value = '';
    try {
      localStorage.removeItem('gemini_custom_logo');
    } catch (_) {}
  }

  function saveSettings() {
    try {
      localStorage.setItem('gemini_logo_settings', JSON.stringify(logoSettings));
    } catch (_) {}
  }

  // Toggle enable
  chkEnableLogo.addEventListener('change', () => {
    logoSettings.enabled = chkEnableLogo.checked;
    if (logoSettings.enabled) {
      logoBody.classList.remove('hidden');
    } else {
      logoBody.classList.add('hidden');
    }
    saveSettings();
  });

  // Logo upload click & drag
  logoUploader.addEventListener('click', (e) => {
    if (e.target !== btnRemoveLogo && !btnRemoveLogo.contains(e.target)) {
      logoFileInput.click();
    }
  });

  logoUploader.addEventListener('dragover', (e) => {
    e.preventDefault();
    logoUploader.classList.add('drag-over');
  });
  logoUploader.addEventListener('dragleave', () => logoUploader.classList.remove('drag-over'));
  logoUploader.addEventListener('drop', (e) => {
    e.preventDefault();
    logoUploader.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && isImageFile(file)) {
      readDataURL(file).then(url => applyCustomLogoData(url, file.name, true));
    }
  });

  logoFileInput.addEventListener('change', () => {
    const file = logoFileInput.files[0];
    if (file) {
      readDataURL(file).then(url => applyCustomLogoData(url, file.name, true));
    }
  });

  btnRemoveLogo.addEventListener('click', (e) => {
    e.stopPropagation();
    removeCustomLogo();
  });

  // Sliders
  rngLogoScale.addEventListener('input', () => {
    logoSettings.scale = parseInt(rngLogoScale.value, 10);
    valLogoScale.textContent = `${logoSettings.scale}%`;
    saveSettings();
  });

  rngLogoOpacity.addEventListener('input', () => {
    logoSettings.opacity = parseInt(rngLogoOpacity.value, 10);
    valLogoOpacity.textContent = `${logoSettings.opacity}%`;
    saveSettings();
  });

  // No mode radios — always overlay-only

  // Helper: overlay custom logo onto canvas
  function overlayCustomLogo(canvas, meta) {
    if (!logoSettings.enabled || !customLogo || !customLogo.img || !customLogo.img.complete) {
      return canvas;
    }

    const ctx = canvas.getContext('2d');
    const scale = (logoSettings.scale || 100) / 100;
    const opacity = (logoSettings.opacity !== undefined ? logoSettings.opacity : 100) / 100;

    const W = canvas.width;
    const H = canvas.height;

    // Target watermark coordinates & size
    let targetX, targetY, targetW, targetH;
    if (meta && meta.width > 0 && meta.height > 0) {
      targetX = meta.x;
      targetY = meta.y;
      targetW = meta.width;
      targetH = meta.height;
    } else {
      const defaultSize = (W > 1024 || H > 1024) ? 96 : 48;
      const margin = (W > 1024 || H > 1024) ? 48 : 24;
      targetW = defaultSize;
      targetH = defaultSize;
      targetX = W - targetW - margin;
      targetY = H - targetH - margin;
    }

    // Preserve aspect ratio of the custom logo
    const logoW = customLogo.img.naturalWidth || customLogo.img.width || targetW;
    const logoH = customLogo.img.naturalHeight || customLogo.img.height || targetH;
    const logoAspect = logoW / logoH;

    let drawW = targetW * scale;
    let drawH = targetH * scale;

    if (logoAspect >= 1) {
      drawH = drawW / logoAspect;
    } else {
      drawW = drawH * logoAspect;
    }

    // Center within watermark bounding area
    const centerX = targetX + targetW / 2;
    const centerY = targetY + targetH / 2;
    const drawX = Math.round(centerX - drawW / 2);
    const drawY = Math.round(centerY - drawH / 2);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(customLogo.img, drawX, drawY, drawW, drawH);
    ctx.restore();

    return canvas;
  }

  initCustomLogo();

  // â”€â”€ Drag & drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f =>
      isImageFile(f) || isVideoFile(f)
    );
    files.forEach(f => { if (f.path) f._sourcePath = f.path; });
    if (files.length) handleFiles(files);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files].filter(f =>
      isImageFile(f) || isVideoFile(f)
    );
    files.forEach(f => { if (f.path) f._sourcePath = f.path; });
    if (files.length) handleFiles(files);
    fileInput.value = '';
  });

  // â”€â”€ File loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function handleFiles(files) {
    if (!files || files.length === 0) return;

    fileQueue = Array.from(files);
    processedBlobs = [];
    cleanBlob = null;

    currentFile = files[0];
    isVideoMode = isVideoFile(files[0]);

    if (isVideoMode) {
      setBeforeVideo(files[0]);
      clearAfterVideo();
      clearAfterImage();
    } else {
      readDataURL(files[0]).then(url => {
        setBeforeImage(url);
        clearAfterImage();
        clearBeforeVideo();
        clearAfterVideo();
      });
    }

    // Show file name / count in dropzone
    dzIdle.classList.add('hidden');
    dzLoaded.classList.remove('hidden');
    loadedName.textContent = files.length === 1
      ? files[0].name
      : `${files.length} file (${files.filter(isVideoFile).length} video, ${files.filter(f => !isVideoFile(f)).length} áº£nh)`;

    if (files.length > 1) {
      queue.classList.remove('hidden');
      queueList.innerHTML = '';
      files.forEach((f, i) => {
        const li = document.createElement('li');
        li.id = `qi-${i}`;
        if (i === 0) li.classList.add('active');
        const icon = isVideoFile(f) ? 'ðŸŽ¬' : 'ðŸ–¼ï¸';
        li.innerHTML = `<span class="q-icon">${icon}</span> <span class="q-name">${f.name}</span><span class="q-status" id="qs-${i}">â€”</span>`;

        li.addEventListener('click', () => {
          document.querySelectorAll('#queue-list li').forEach(el => el.classList.remove('active'));
          li.classList.add('active');

          currentFile = f;
          isVideoMode = isVideoFile(f);

          if (isVideoMode) {
            setBeforeVideo(f);
            clearBeforeImage();
            const processed = processedBlobs.find(p => p.name === cleanName(f.name));
            if (processed) { setAfterVideo(processed.blob); cleanBlob = processed.blob; }
            else { clearAfterVideo(); cleanBlob = null; }
          } else {
            readDataURL(f).then(url => {
              setBeforeImage(url);
              clearBeforeVideo();
              const processed = processedBlobs.find(p => p.name === cleanName(f.name));
              if (processed) { setAfterImage(URL.createObjectURL(processed.blob)); cleanBlob = processed.blob; }
              else { clearAfterImage(); cleanBlob = null; }
            });
          }
        });

        queueList.appendChild(li);
      });

      const vCount = files.filter(isVideoFile).length;
      const iCount = files.length - vCount;
      let labelStr = `Xá»­ lÃ½ táº¥t cáº£ (${files.length})`;
      if (vCount === files.length) labelStr = `Xá»­ lÃ½ ${files.length} video`;
      else if (iCount === files.length) labelStr = `Xá»­ lÃ½ ${files.length} áº£nh`;

      btnProcess.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg> ${labelStr}`;
      btnSaveAll.classList.add('hidden');
      setQueueProgress(0, files.length);
    } else {
      queue.classList.add('hidden');
      const label = isVideoMode ? 'XÃ³a Watermark Video' : 'XÃ³a Watermark';
      btnProcess.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg> ${label}`;
      btnSave.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/></svg> ${isVideoMode ? 'LÆ°u video' : 'LÆ°u áº£nh'}`;
      btnSaveAll.classList.add('hidden');
    }

    videoProgressEl.classList.add('hidden');
    btnProcess.disabled = false;
    btnSave.disabled = true;
    btnReset.classList.remove('hidden');
    const hint = isVideoMode
      ? 'Video sáºµn sÃ ng â€” nháº¥n "XÃ³a Watermark Video"'
      : (files.length > 1 ? 'Sáºµn sÃ ng â€” nháº¥n nÃºt xá»­ lÃ½ táº¥t cáº£' : 'Sáºµn sÃ ng â€” nháº¥n "XÃ³a Watermark"');
    setStatus('idle', hint);
  }

  // â”€â”€ Process â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  btnProcess.addEventListener('click', async () => {
    if (fileQueue.length > 1) await processBatch(fileQueue);
    else if (isVideoMode) await processVideoFile(currentFile);
    else await processSingle(currentFile);
  });

  async function processSingle(file) {
    btnProcess.disabled = true;
    setStatus('busy', 'Äang xá»­ lÃ½...');

    try {
      const { detection, blob } = await processImage(file);
      cleanBlob = blob;

      const url = URL.createObjectURL(blob);
      setAfterImage(url);

      if (logoSettings.enabled && customLogo) {
        setStatus('ok', 'âœ“ ÄÃ£ xá»­ lÃ½ & chÃ¨n logo thÆ°Æ¡ng hiá»‡u');
      } else if (detection.found) {
        setStatus('ok', 'âœ“ Watermark Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½');
      } else {
        setStatus('warn', 'KhÃ´ng tÃ¬m tháº¥y watermark â€” áº£nh giá»¯ nguyÃªn');
      }

      btnSave.disabled = false;
      // Show overwrite option if we know the original path
      if (isElectron && file && file._sourcePath) {
        overwriteWrap.classList.remove('hidden');
      }
    } catch (err) {
      setStatus('err', 'Lá»—i: ' + err.message);
    }

    btnProcess.disabled = false;
  }

  async function processBatch(files) {
    btnProcess.disabled = true;
    btnSave.disabled = true;
    btnSaveAll.classList.add('hidden');
    processedBlobs = [];
    videoAbortCtrl = new AbortController();
    const signal = videoAbortCtrl.signal;

    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) break;
      const f = files[i];
      const qs = document.getElementById(`qs-${i}`);
      if (qs) qs.textContent = 'âš™ï¸';

      // Highlight active file in queue
      document.querySelectorAll('#queue-list li').forEach(el => el.classList.remove('active'));
      const activeLi = document.getElementById(`qi-${i}`);
      if (activeLi) activeLi.classList.add('active');

      currentFile = f;
      isVideoMode = isVideoFile(f);
      setQueueProgress(i, files.length);

      try {
        if (isVideoMode) {
          setStatus('busy', `Äang xá»­ lÃ½ video ${i+1}/${files.length}: ${f.name}`);
          setBeforeVideo(f);
          clearBeforeImage();
          clearAfterImage();
          videoProgressEl.classList.remove('hidden');

          const blob = await renderVideoWithoutWatermark(f, signal);
          processedBlobs.push({
            name: cleanName(f.name),
            blob,
            type: blob.type || 'video/webm',
            isVideo: true,
            sourcePath: f._sourcePath || null
          });
          cleanBlob = blob;
          setAfterVideo(blob);
          if (qs) qs.textContent = 'âœ“';
        } else {
          setStatus('busy', `Äang xá»­ lÃ½ áº£nh ${i+1}/${files.length}: ${f.name}`);
          videoProgressEl.classList.add('hidden');
          const dataUrl = await readDataURL(f);
          setBeforeImage(dataUrl);
          clearBeforeVideo();
          clearAfterVideo();

          const { blob, detection } = await processImage(f);
          processedBlobs.push({
            name: cleanName(f.name),
            blob,
            type: blob.type || (f.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'),
            isVideo: false,
            sourcePath: f._sourcePath || null
          });
          cleanBlob = blob;
          setAfterImage(URL.createObjectURL(blob));
          if (qs) qs.textContent = detection.found ? 'âœ“' : 'â€”';
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          if (qs) qs.textContent = 'â€”';
          break;
        }
        console.error(`Lá»—i xá»­ lÃ½ file ${f.name}:`, err);
        if (qs) qs.textContent = 'âœ—';
      }
    }

    videoProgressEl.classList.add('hidden');
    setQueueProgress(files.length, files.length);
    setStatus('ok', `âœ“ HoÃ n táº¥t ${processedBlobs.length}/${files.length} file`);
    btnSave.disabled = processedBlobs.length === 0;
    btnSaveAll.disabled = processedBlobs.length === 0;
    if (processedBlobs.length > 0) {
      btnSaveAll.classList.remove('hidden');
    }
    btnProcess.disabled = false;
    videoAbortCtrl = null;

    const allHavePaths = files.every(f => f._sourcePath);
    if (isElectron && allHavePaths && processedBlobs.length > 0) {
      overwriteWrap.classList.remove('hidden');
    }
  }

  // ── Processing pipeline ───────────────────────────────────────────────────
  async function processImage(file) {
    return new Promise((resolve, reject) => {
      readDataURL(file).then(dataUrl => {
        const img = new Image();
        img.onload = async () => {
          try {
            let detection = { found: false, x: 0, y: 0, w: 0, h: 0 };
            let finalCanvas = null;

            if (logoSettings.enabled && customLogo) {
              // ── LOGO MODE: detect position → keep original → stamp logo on top ──
              try {
                const detectResult = await GeminiWatermarkRemover.removeWatermarkFromImage(img);
                const m = detectResult?.meta;
                if (m && m.width > 0) {
                  detection = { found: true, x: m.x, y: m.y, w: m.width, h: m.height };
                }
              } catch (_) {}

              // Keep original image untouched
              finalCanvas = document.createElement('canvas');
              finalCanvas.width = img.naturalWidth || img.width;
              finalCanvas.height = img.naturalHeight || img.height;
              finalCanvas.getContext('2d').drawImage(img, 0, 0);

              // Stamp logo at Gemini watermark position (covers it)
              overlayCustomLogo(finalCanvas, detection.found ? detection : null);

            } else {
              // ── NORMAL MODE: remove Gemini watermark ──
              const result = await GeminiWatermarkRemover.removeWatermarkFromImage(img);
              const m = result?.meta;
              if (m) detection = { found: true, x: m.x, y: m.y, w: m.width, h: m.height };

              const source = result.canvas;
              finalCanvas = document.createElement('canvas');
              finalCanvas.width = source.width;
              finalCanvas.height = source.height;
              finalCanvas.getContext('2d').drawImage(source, 0, 0);
            }

            // Export: PNG for WebP/PNG (lossless), JPEG for JPG inputs
            const isJpeg = (file.type === 'image/jpeg') || /\.jpe?g$/i.test(file.name);
            const mime = isJpeg ? 'image/jpeg' : 'image/png';
            const q    = isJpeg ? 0.95 : undefined;
            finalCanvas.toBlob(blob => resolve({ detection, blob }), mime, q);
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error('Không đọc được ảnh'));
        img.src = dataUrl;
      });
    });
  }

  // â”€â”€ Video processing pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function processVideoFile(file) {
    btnProcess.disabled = true;
    btnSave.disabled = true;
    videoProgressEl.classList.remove('hidden');
    videoAbortCtrl = new AbortController();
    const signal = videoAbortCtrl.signal;

    setStatus('busy', 'Äang phÃ¢n tÃ­ch video...');

    try {
      const blob = await renderVideoWithoutWatermark(file, signal);
      cleanBlob = blob;
      setAfterVideo(blob);
      if (logoSettings.enabled && customLogo) {
        setStatus('ok', 'âœ“ Watermark video Ä‘Ã£ Ä‘Æ°á»£c xÃ³a & chÃ¨n logo thÆ°Æ¡ng hiá»‡u');
      } else {
        setStatus('ok', 'âœ“ Watermark video Ä‘Ã£ Ä‘Æ°á»£c xÃ³a');
      }
      btnSave.disabled = false;
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('warn', 'ÄÃ£ há»§y xá»­ lÃ½ video');
      } else {
        setStatus('err', 'Lá»—i xá»­ lÃ½ video: ' + err.message);
        console.error(err);
      }
    } finally {
      videoAbortCtrl = null;
      btnProcess.disabled = false;
    }
  }

  async function renderVideoWithoutWatermark(file, signal) {
    const srcUrl = URL.createObjectURL(file);

    // 1. Load video metadata
    const vid = document.createElement('video');
    vid.src = srcUrl;
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'auto';

    await new Promise((res, rej) => {
      vid.onloadedmetadata = res;
      vid.onerror = () => rej(new Error('KhÃ´ng Ä‘á»c Ä‘Æ°á»£c video'));
    });

    const W = vid.videoWidth;
    const H = vid.videoHeight;
    const duration = vid.duration;
    const fps = 30;
    const frameDurationMicros = Math.round(1_000_000 / fps);
    const totalFrames = Math.max(1, Math.ceil(duration * fps));

    const isOverlayOnly = logoSettings.enabled && customLogo;

    // ── FAST PATH: FFmpeg single-pass overlay (Electron + logo mode) ──────────
    if (isElectron && isOverlayOnly && window.electronAPI.overlayLogoVideo) {
      setStatus('busy', 'âš¡ Ä ang chÃ¨n logo báº±ng FFmpeg (nhanh)...');

      // 2a. Detect watermark position from frame 0 for accurate placement
      const detectCanvas = document.createElement('canvas');
      detectCanvas.width = W;
      detectCanvas.height = H;
      const detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true });

      vid.currentTime = 0;
      await new Promise(r => { vid.onseeked = r; });
      detectCtx.drawImage(vid, 0, 0, W, H);

      let logoX, logoY, logoW, logoH;
      try {
        const engine = await GeminiWatermarkRemover.createWatermarkEngine();
        const result = await engine.removeWatermarkFromImage(detectCanvas);
        const m = result?.meta || result;
        if (m && m.x != null && m.width > 0) {
          // Use detected watermark bounding box
          logoW = Math.round(m.width  * (logoSettings.scale / 100));
          logoH = Math.round(m.height * (logoSettings.scale / 100));
          // Center logo over watermark center
          const cx = m.x + m.width  / 2;
          const cy = m.y + m.height / 2;
          logoX = Math.round(cx - logoW / 2);
          logoY = Math.round(cy - logoH / 2);
        } else {
          throw new Error('no meta');
        }
      } catch (_) {
        // Fallback: bottom-right corner matching Gemini default position
        const size = (W > 1920 || H > 1080) ? 120 : (W > 1280 || H > 720) ? 96 : 64;
        const margin = Math.round(size * 0.4);
        logoW = Math.round(size * (logoSettings.scale / 100));
        logoH = Math.round(size * (logoSettings.scale / 100));
        logoX = W - logoW - margin;
        logoY = H - logoH - margin;
      }

      // Preserve logo aspect ratio
      const natW = customLogo.img.naturalWidth || customLogo.img.width || logoW;
      const natH = customLogo.img.naturalHeight || customLogo.img.height || logoH;
      const aspect = natW / natH;
      if (aspect >= 1) {
        logoH = Math.round(logoW / aspect);
      } else {
        logoW = Math.round(logoH * aspect);
      }

      // Convert logo image to PNG buffer
      const logoCanvas = document.createElement('canvas');
      logoCanvas.width = natW;
      logoCanvas.height = natH;
      logoCanvas.getContext('2d').drawImage(customLogo.img, 0, 0);
      const logoPngBlob = await new Promise(r => logoCanvas.toBlob(r, 'image/png'));
      const logoBuffer = await logoPngBlob.arrayBuffer();

      // Read source video
      const srcBuffer = await file.arrayBuffer();
      const opacity = (logoSettings.opacity ?? 100) / 100;

      vpFill.style.width = '30%';
      vpFrames.textContent = 'FFmpeg Ä‘ang xá»­ lÃ½...';
      vpTime.textContent = 'Æ¯á»›c tÃ­nh cÃ²n: vÃ i giÃ¢y';

      const result = await window.electronAPI.overlayLogoVideo({
        sourcePath: file._sourcePath || null,
        buffer: srcBuffer,
        logoBuffer,
        logoX,
        logoY,
        logoW,
        logoH,
        opacity
      });

      URL.revokeObjectURL(srcUrl);
      vpFill.style.width = '100%';
      vpFrames.textContent = `HoÃ n táº¥t (FFmpeg)`;
      vpTime.textContent = 'HoÃ n táº¥t!';

      if (!result.success) {
        throw new Error(result.error || 'FFmpeg overlay tháº¥t báº¡i');
      }

      return new Blob([result.buffer], { type: 'video/mp4' });
    }

    // â”€â”€ NORMAL PATH: frame-by-frame (remove watermark or web mode) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // 2. Pre-warm SDK engine and alpha maps
    setStatus('busy', 'Äang khá»Ÿi táº¡o engine Gemini SDK...');
    const engine = await GeminiWatermarkRemover.createWatermarkEngine();
    await Promise.all([
      engine.getAlphaMap(48),
      engine.getAlphaMap(96),
      engine.getAlphaMap('96-20260520'),
      engine.getAlphaMap('96-outline-light'),
      engine.getAlphaMap('96-outline-dark'),
      engine.getAlphaMap('36-v2')
    ]);

    // 3. Canvas setup
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = W;
    frameCanvas.height = H;
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

    // 4. WebCodecs VideoEncoder setup
    setStatus('busy', 'Äang xÃ³a logo tá»«ng khung hÃ¬nh chuáº©n xÃ¡c...');
    const startTime = Date.now();

    const muxer = new window.SimpleWebMMuxer({
      width: W,
      height: H,
      codec: 'V_VP9',
      duration: duration
    });

    let encodeError = null;

    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta);
      },
      error: (e) => {
        console.error('[WebCodecs] Encoder error:', e);
        encodeError = e;
      }
    });

    const config = {
      codec: 'vp09.00.10.08',
      width: W,
      height: H,
      bitrate: 16_000_000,
      framerate: fps
    };

    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) {
      config.codec = 'vp8';
      muxer.codec = 'V_VP8';
    }

    encoder.configure(config);

    // 5. Detect watermark from frame 0 and cache for entire video
    let cachedVideoMeta = null;
    {
      vid.currentTime = 0;
      await new Promise(r => { vid.onseeked = r; });
      frameCtx.drawImage(vid, 0, 0, W, H);
      try {
        const probe = await engine.removeWatermarkFromImage(frameCanvas);
        const m = probe?.meta || probe;
        if (m && m.x != null && m.width > 0) {
          cachedVideoMeta = { x: m.x, y: m.y, width: m.width, height: m.height };
        }
      } catch (_) {}
    }

    // 6. Frame-by-frame processing
    for (let i = 0; i < totalFrames; i++) {
      if (signal.aborted) {
        try { encoder.close(); } catch (_) {}
        URL.revokeObjectURL(srcUrl);
        throw new DOMException('Aborted', 'AbortError');
      }

      if (encodeError) {
        throw new Error('Lá»—i mÃ£ hÃ³a: ' + encodeError.message);
      }

      // Seek to exact frame position
      const t = Math.min(i / fps, Math.max(0, duration - 0.001));
      vid.currentTime = t;
      await new Promise(r => { vid.onseeked = r; });

      // Draw original frame to canvas
      frameCtx.drawImage(vid, 0, 0, W, H);

      let cleanCanvas;
      if (isOverlayOnly) {
        cleanCanvas = frameCanvas;
      } else {
        // Clean watermark using SDK reverse alpha blending
        cleanCanvas = await engine.removeWatermarkFromImage(frameCanvas);
      }

      // Overlay custom logo at exact watermark position
      if (logoSettings.enabled && customLogo) {
        overlayCustomLogo(cleanCanvas, cachedVideoMeta);
      }

      // Create VideoFrame with mathematically exact CFR timestamp
      const timestampMicros = i * frameDurationMicros;
      const vFrame = new VideoFrame(cleanCanvas, {
        timestamp: timestampMicros,
        duration: frameDurationMicros
      });

      encoder.encode(vFrame, { keyFrame: i % 30 === 0 });
      vFrame.close();

      // Update progress
      const pct = Math.min(100, Math.round(((i + 1) / totalFrames) * 100));
      vpFill.style.width = pct + '%';
      vpFrames.textContent = `${i + 1} / ${totalFrames} frames (${((i + 1) / fps).toFixed(1)}s / ${duration.toFixed(1)}s)`;

      const elapsed = (Date.now() - startTime) / 1000;
      const eta = i > 2 ? Math.max(0, Math.round((elapsed / ((i + 1) / totalFrames)) - elapsed)) : '--';
      vpTime.textContent = `Æ¯á»›c tÃ­nh cÃ²n: ${eta === '--' ? '--' : eta + 's'}`;

      if (i % 5 === 0) await sleep(0);
    }

    await encoder.flush();
    encoder.close();
    URL.revokeObjectURL(srcUrl);

    vpFill.style.width = '100%';
    vpFrames.textContent = `${totalFrames} / ${totalFrames} frames (100%)`;
    vpTime.textContent = 'HoÃ n táº¥t!';

    return muxer.finalize();
  }


  // â”€â”€ Save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  btnSave.addEventListener('click', async () => {
    if (!cleanBlob) return;

    // Overwrite original file directly (Electron only)
    if (isElectron && chkOverwrite.checked && currentFile && currentFile._sourcePath) {
      const buf = await cleanBlob.arrayBuffer();
      const result = await window.electronAPI.writeFile(currentFile._sourcePath, buf);
      if (result.success) {
        setStatus('ok', `âœ“ ÄÃ£ ghi Ä‘Ã¨: ${currentFile._sourcePath.split(/[\\/]/).pop()}`);
      } else {
        setStatus('err', 'Ghi Ä‘Ã¨ tháº¥t báº¡i: ' + result.error);
      }
      return;
    }

    // Determine extension based on blob type
    let defaultName;
    if (isVideoMode && currentFile) {
      const ext = cleanBlob.type.includes('mp4') ? 'mp4' : 'webm';
      defaultName = cleanName(currentFile.name) + '.' + ext;
    } else {
      const ext = (cleanBlob && cleanBlob.type === 'image/jpeg') ? 'jpg' : 'png';
      defaultName = (currentFile ? cleanName(currentFile.name) : 'clean-image') + '.' + ext;
    }
    await saveBlob(cleanBlob, defaultName);
  });

  btnSaveAll.addEventListener('click', async () => {
    if (!processedBlobs.length) return;
    btnSaveAll.disabled = true;
    btnSaveAll.textContent = 'Äang lÆ°u...';

    try {
      // Overwrite mode: ghi Ä‘Ã¨ tháº³ng vÃ o file gá»‘c
      if (isElectron && chkOverwrite.checked) {
        let ok = 0;
        for (const { sourcePath, blob } of processedBlobs) {
          if (!sourcePath) continue;
          const buf = await blob.arrayBuffer();
          const result = await window.electronAPI.writeFile(sourcePath, buf);
          if (result.success) ok++;
        }
        setStatus('ok', `âœ“ ÄÃ£ ghi Ä‘Ã¨ ${ok} file gá»‘c`);
      } else if (isElectron) {
        const res = await window.electronAPI.selectFolder();
        if (!res.canceled && res.filePaths.length > 0) {
          const folder = res.filePaths[0];
          for (const item of processedBlobs) {
            let ext;
            if (item.isVideo || item.type.includes('video')) {
              ext = item.type.includes('mp4') ? 'mp4' : 'webm';
            } else {
              ext = (item.blob.type === 'image/jpeg' || item.type === 'image/jpeg') ? 'jpg' : 'png';
            }
            const filePath = `${folder}\\${item.name}.${ext}`.replace(/\\\\/g, '\\');
            const buf = await item.blob.arrayBuffer();
            await window.electronAPI.writeFile(filePath, buf);
          }
          setStatus('ok', `âœ“ ÄÃ£ lÆ°u ${processedBlobs.length} file vÃ o thÆ° má»¥c`);
          window.electronAPI.showInFolder(folder);
        }
      } else {
        // Fallback for non-electron (web)
        for (const item of processedBlobs) {
          let ext;
          if (item.isVideo || item.type.includes('video')) {
            ext = item.type.includes('mp4') ? 'mp4' : 'webm';
          } else {
            ext = (item.blob.type === 'image/jpeg' || item.type === 'image/jpeg') ? 'jpg' : 'png';
          }
          const url = URL.createObjectURL(item.blob);
          Object.assign(document.createElement('a'), { href: url, download: `${item.name}.${ext}` }).click();
          await sleep(300);
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) { setStatus('err', 'Lá»—i lÆ°u file: ' + e.message); }

    btnSaveAll.disabled = false;
    btnSaveAll.textContent = 'Táº£i táº¥t cáº£';
  });

  async function saveBlob(blob, defaultName, isZip = false) {
    if (isElectron) {
      const res = isZip
        ? await window.electronAPI.saveZip()
        : await window.electronAPI.saveFile({ defaultName, mimeType: blob.type });
      if (res.canceled || !res.filePath) return;
      const buf = await blob.arrayBuffer();
      const result = await window.electronAPI.writeFile(res.filePath, buf);
      if (result.success) {
        setStatus('ok', `âœ“ ÄÃ£ lÆ°u: ${res.filePath.split(/[\\/]/).pop()}`);
        window.electronAPI.showInFolder(res.filePath);
      } else {
        setStatus('err', 'KhÃ´ng lÆ°u Ä‘Æ°á»£c: ' + result.error);
      }
    } else {
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: defaultName }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  // â”€â”€ Reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  btnReset.addEventListener('click', () => {
    // Cancel any in-progress video processing
    if (videoAbortCtrl) { videoAbortCtrl.abort(); videoAbortCtrl = null; }

    fileQueue = [];
    processedBlobs = [];
    cleanBlob = null;
    currentFile = null;
    isVideoMode = false;

    dzIdle.classList.remove('hidden');
    dzLoaded.classList.add('hidden');
    queue.classList.add('hidden');
    btnProcess.disabled = true;
    btnSave.disabled = true;
    btnSaveAll.classList.add('hidden');
    overwriteWrap.classList.add('hidden');
    chkOverwrite.checked = false;
    videoProgressEl.classList.add('hidden');
    vpFill.style.width = '0%';

    clearAfterImage();
    clearAfterVideo();
    clearBeforeVideo();
    [beforeImg, beforeImg2].forEach(img => { img.src = ''; img.classList.remove('loaded'); });
    beforeEmpty.classList.remove('hidden');
    beforeEmpty2.classList.remove('hidden');

    setStatus('idle', 'Chá» áº£nh hoáº·c video...');
  });

  // â”€â”€ Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function switchTab(active) {
    [tabSplit, tabBefore, tabAfter].forEach(t => { t.classList.remove('active'); t.setAttribute('aria-pressed', 'false'); });
    [viewSplit, viewBefore, viewAfter].forEach(v => v.classList.add('hidden'));
    active.btn.classList.add('active');
    active.btn.setAttribute('aria-pressed', 'true');
    active.view.classList.remove('hidden');
  }

  tabSplit.addEventListener('click',  () => switchTab({ btn: tabSplit,  view: viewSplit }));
  tabBefore.addEventListener('click', () => switchTab({ btn: tabBefore, view: viewBefore }));
  tabAfter.addEventListener('click',  () => switchTab({ btn: tabAfter,  view: viewAfter }));

  // â”€â”€ Image helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setBeforeImage(url) {
    [beforeImg, beforeImg2].forEach(img => {
      img.src = url;
      img.onload = () => img.classList.add('loaded');
      img.classList.remove('hidden');
    });
    [beforeVideo, beforeVideo2].forEach(v => { v.classList.remove('active'); });
    beforeEmpty.classList.add('hidden');
    beforeEmpty2.classList.add('hidden');
  }

  function clearBeforeImage() {
    [beforeImg, beforeImg2].forEach(img => { img.src = ''; img.classList.remove('loaded'); });
  }

  function setAfterImage(url) {
    [afterImg, afterImg2].forEach(img => {
      img.src = url;
      img.onload = () => img.classList.add('loaded');
    });
    [afterVideo, afterVideo2].forEach(v => { v.classList.remove('active'); });
    afterEmpty.classList.add('hidden');
    afterEmpty2.classList.add('hidden');
  }

  function clearAfterImage() {
    [afterImg, afterImg2].forEach(img => { img.src = ''; img.classList.remove('loaded'); });
    afterEmpty.classList.remove('hidden');
    afterEmpty2.classList.remove('hidden');
  }

  // â”€â”€ Video helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setBeforeVideo(file) {
    const url = URL.createObjectURL(file);
    [beforeVideo, beforeVideo2].forEach(v => {
      v.src = url;
      v.classList.add('active');
    });
    [beforeImg, beforeImg2].forEach(img => { img.src = ''; img.classList.remove('loaded'); });
    beforeEmpty.classList.add('hidden');
    beforeEmpty2.classList.add('hidden');
  }

  function clearBeforeVideo() {
    [beforeVideo, beforeVideo2].forEach(v => {
      v.pause(); v.src = ''; v.classList.remove('active');
    });
  }

  function setAfterVideo(blob) {
    const url = URL.createObjectURL(blob);
    [afterVideo, afterVideo2].forEach(v => {
      v.src = url;
      v.classList.add('active');
    });
    [afterImg, afterImg2].forEach(img => { img.src = ''; img.classList.remove('loaded'); });
    afterEmpty.classList.add('hidden');
    afterEmpty2.classList.add('hidden');
  }

  function clearAfterVideo() {
    [afterVideo, afterVideo2].forEach(v => {
      v.pause(); v.src = ''; v.classList.remove('active');
    });
    afterEmpty.classList.remove('hidden');
    afterEmpty2.classList.remove('hidden');
  }

  // â”€â”€ Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setStatus(type, msg) {
    statusMsg.textContent = msg;
    statusDot.className = 'status-dot';
    if (type === 'ok')   statusDot.classList.add('dot-ok');
    if (type === 'warn') statusDot.classList.add('dot-warn');
    if (type === 'err')  statusDot.classList.add('dot-err');
    if (type === 'busy') statusDot.classList.add('dot-busy');
  }

  function setQueueProgress(done, total) {
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    qProgressBar.style.width = pct + '%';
    qProgressTxt.textContent = `${done} / ${total}`;
  }

  // â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function readDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = () => rej(new Error('FileReader error'));
      r.readAsDataURL(file);
    });
  }

  function cleanName(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // â”€â”€ Sync Before/After Video Controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setupVideoSync(v1, v2) {
    if (!v1 || !v2) return;
    let isSyncing = false;
    v1.addEventListener('play', () => {
      if (v2.paused && !isSyncing) { isSyncing = true; v2.play().finally(() => { isSyncing = false; }); }
    });
    v1.addEventListener('pause', () => {
      if (!v2.paused && !isSyncing) { isSyncing = true; v2.pause(); isSyncing = false; }
    });
    v1.addEventListener('seeking', () => {
      if (Math.abs(v2.currentTime - v1.currentTime) > 0.1 && !isSyncing) {
        isSyncing = true;
        v2.currentTime = v1.currentTime;
        setTimeout(() => { isSyncing = false; }, 50);
      }
    });
  }
  setupVideoSync(beforeVideo, afterVideo);
  setupVideoSync(afterVideo, beforeVideo);
  setupVideoSync(beforeVideo2, afterVideo2);
  setupVideoSync(afterVideo2, beforeVideo2);

  // ── Main tab switcher ──────────────────────────────────────────────────────
  const mtabRemove = document.getElementById('mtab-remove');
  const mtabLogo   = document.getElementById('mtab-logo');
  const tcRemove   = document.getElementById('tc-remove');
  const tcLogo     = document.getElementById('tc-logo');

  function switchMainTab(tab) {
    if (tab === 'logo') {
      mtabRemove.classList.remove('active');
      mtabLogo.classList.add('active');
      tcRemove.classList.add('hidden');
      tcLogo.classList.remove('hidden');
    } else {
      mtabLogo.classList.remove('active');
      mtabRemove.classList.add('active');
      tcLogo.classList.add('hidden');
      tcRemove.classList.remove('hidden');
    }
  }

  mtabRemove.addEventListener('click', () => switchMainTab('remove'));
  mtabLogo.addEventListener('click',   () => switchMainTab('logo'));

})();

// ── Logo Tab Module (independent) ─────────────────────────────────────────────
(() => {
  const isElectron = typeof window.electronAPI !== 'undefined';

  // DOM refs
  const mediaDropEl   = document.getElementById('logo-media-drop');
  const mediaInput    = document.getElementById('logo-media-input');
  const lmIdle        = document.getElementById('lm-idle');
  const lmLoaded      = document.getElementById('lm-loaded');
  const lmName        = document.getElementById('lm-name');
  const logoUploader  = document.getElementById('logo-uploader');
  const logoFileInput = document.getElementById('logo-file-input');
  const logoIdle      = document.getElementById('logo-idle');
  const logoPreview   = document.getElementById('logo-preview-wrap');
  const logoThumb     = document.getElementById('logo-thumb');
  const logoName      = document.getElementById('logo-name');
  const btnRemoveLogo = document.getElementById('btn-remove-logo');
  const rngScale      = document.getElementById('rng-logo-scale');
  const valScale      = document.getElementById('val-logo-scale');
  const rngOpacity    = document.getElementById('rng-logo-opacity');
  const valOpacity    = document.getElementById('val-logo-opacity');
  const posGrid       = document.getElementById('pos-grid');
  const statusDot     = document.getElementById('logo-status-dot');
  const statusMsg     = document.getElementById('logo-status-msg');
  const videoProgress = document.getElementById('logo-video-progress');
  const logoVpFill    = document.getElementById('logo-vp-fill');
  const logoVpFrames  = document.getElementById('logo-vp-frames');
  const logoVpTime    = document.getElementById('logo-vp-time');
  const btnApply      = document.getElementById('btn-logo-apply');
  const btnSave       = document.getElementById('btn-logo-save');
  const btnReset      = document.getElementById('btn-logo-reset');

  // State
  let mediaFile  = null;  // source image or video
  let logoImg    = null;  // { img: Image, dataUrl: string, name: string }
  let logoPos    = 'br';  // tl|tc|tr|ml|mc|mr|bl|bc|br
  let resultBlob = null;
  let logoScale   = 100;
  let logoOpacity = 100;

  // ── Status helpers ──────────────────────────────────────────────────────────
  function setStatus(type, msg) {
    statusDot.className = 'status-dot';
    if (type === 'busy') statusDot.classList.add('busy');
    else if (type === 'ok') statusDot.classList.add('ok');
    else if (type === 'err') statusDot.classList.add('err');
    statusMsg.textContent = msg;
  }

  function isVideoFile(f) {
    return (f.type && f.type.startsWith('video/')) ||
      /\.(mp4|webm|mov|avi|mkv|m4v|ogv)$/i.test(f.name);
  }
  function isImageFile(f) {
    return (f.type && f.type.startsWith('image/')) ||
      /\.(png|jpe?g|webp|avif|bmp|gif)$/i.test(f.name);
  }
  function readDataURL(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }

  // ── Update apply button state ───────────────────────────────────────────────
  function updateApplyBtn() {
    btnApply.disabled = !(mediaFile && logoImg);
  }

  // ── Media dropzone ──────────────────────────────────────────────────────────
  function applyMedia(file) {
    mediaFile = file;
    lmIdle.classList.add('hidden');
    lmLoaded.classList.remove('hidden');
    lmName.textContent = file.name;

    // Show preview in right panel
    const url = URL.createObjectURL(file);
    const beforeImg   = document.getElementById('before-img');
    const beforeVideo = document.getElementById('before-video');
    const beforeEmpty = document.getElementById('before-empty');
    const afterImg    = document.getElementById('after-img');
    const afterVideo  = document.getElementById('after-video');
    const afterEmpty  = document.getElementById('after-empty');

    // Reset after panel
    [afterImg, afterVideo].forEach(el => { el.src = ''; el.classList.add('hidden'); });
    afterEmpty.classList.remove('hidden');
    resultBlob = null;
    btnSave.disabled = true;

    if (isVideoFile(file)) {
      beforeImg.classList.add('hidden');
      beforeVideo.classList.remove('hidden');
      beforeEmpty.classList.add('hidden');
      beforeVideo.src = url;
    } else {
      beforeVideo.classList.add('hidden');
      beforeImg.classList.remove('hidden');
      beforeEmpty.classList.add('hidden');
      beforeImg.src = url;
    }

    setStatus('idle', file.name + ' - San sang');
    updateApplyBtn();
  }

  mediaDropEl.addEventListener('click', e => {
    if (e.target !== btnRemoveLogo && !btnRemoveLogo.contains(e.target)) mediaInput.click();
  });
  mediaDropEl.addEventListener('dragover',  e => { e.preventDefault(); mediaDropEl.classList.add('drag-over'); });
  mediaDropEl.addEventListener('dragleave', () => mediaDropEl.classList.remove('drag-over'));
  mediaDropEl.addEventListener('drop', e => {
    e.preventDefault();
    mediaDropEl.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && (isVideoFile(f) || isImageFile(f))) applyMedia(f);
  });
  mediaInput.addEventListener('change', () => {
    if (mediaInput.files[0]) applyMedia(mediaInput.files[0]);
  });

  // ── Logo picker ─────────────────────────────────────────────────────────────
  function applyLogo(dataUrl, name) {
    const img = new Image();
    img.onload = () => {
      logoImg = { img, dataUrl, name };
      logoThumb.src = dataUrl;
      logoName.textContent = name;
      logoIdle.classList.add('hidden');
      logoPreview.classList.remove('hidden');
      // Persist
      try { localStorage.setItem('gemini_logo_tab_logo', JSON.stringify({ dataUrl, name })); } catch (_) {}
      updateApplyBtn();
    };
    img.src = dataUrl;
  }

  logoUploader.addEventListener('click', e => {
    if (e.target !== btnRemoveLogo && !btnRemoveLogo.contains(e.target)) logoFileInput.click();
  });
  logoUploader.addEventListener('dragover',  e => { e.preventDefault(); logoUploader.classList.add('drag-over'); });
  logoUploader.addEventListener('dragleave', () => logoUploader.classList.remove('drag-over'));
  logoUploader.addEventListener('drop', e => {
    e.preventDefault();
    logoUploader.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && isImageFile(f)) readDataURL(f).then(u => applyLogo(u, f.name));
  });
  logoFileInput.addEventListener('change', () => {
    const f = logoFileInput.files[0];
    if (f) readDataURL(f).then(u => applyLogo(u, f.name));
  });
  btnRemoveLogo.addEventListener('click', e => {
    e.stopPropagation();
    logoImg = null;
    logoThumb.src = '';
    logoIdle.classList.remove('hidden');
    logoPreview.classList.add('hidden');
    logoFileInput.value = '';
    try { localStorage.removeItem('gemini_logo_tab_logo'); } catch (_) {}
    updateApplyBtn();
  });

  // Restore saved logo
  try {
    const saved = localStorage.getItem('gemini_logo_tab_logo');
    if (saved) {
      const p = JSON.parse(saved);
      if (p && p.dataUrl) applyLogo(p.dataUrl, p.name || 'logo.png');
    }
  } catch (_) {}

  // ── Sliders ─────────────────────────────────────────────────────────────────
  rngScale.addEventListener('input', () => {
    logoScale = parseInt(rngScale.value, 10);
    valScale.textContent = logoScale + '%';
  });
  rngOpacity.addEventListener('input', () => {
    logoOpacity = parseInt(rngOpacity.value, 10);
    valOpacity.textContent = logoOpacity + '%';
  });

  // ── Position grid ───────────────────────────────────────────────────────────
  posGrid.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      posGrid.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      logoPos = btn.dataset.pos;
    });
  });

  // ── Compute logo position from pos code ─────────────────────────────────────
  function computeLogoRect(W, H, logoNatW, logoNatH, scale, pos) {
    const margin = Math.round(Math.min(W, H) * 0.04);
    // Base size = 8% of shorter dimension, scaled by user slider
    const baseSize = Math.round(Math.min(W, H) * 0.08 * scale / 100);
    const aspect = logoNatW / logoNatH;
    let drawW = baseSize;
    let drawH = Math.round(baseSize / aspect);
    if (drawH > baseSize) { drawH = baseSize; drawW = Math.round(baseSize * aspect); }

    const positions = {
      tl: { x: margin,              y: margin },
      tc: { x: (W - drawW) / 2,     y: margin },
      tr: { x: W - drawW - margin,  y: margin },
      ml: { x: margin,              y: (H - drawH) / 2 },
      mc: { x: (W - drawW) / 2,     y: (H - drawH) / 2 },
      mr: { x: W - drawW - margin,  y: (H - drawH) / 2 },
      bl: { x: margin,              y: H - drawH - margin },
      bc: { x: (W - drawW) / 2,     y: H - drawH - margin },
      br: { x: W - drawW - margin,  y: H - drawH - margin },
    };
    const { x, y } = positions[pos] || positions.br;
    return { x: Math.round(x), y: Math.round(y), w: drawW, h: drawH };
  }

  // ── Stamp logo onto canvas ──────────────────────────────────────────────────
  function stampLogo(canvas, pos, scale, opacity) {
    if (!logoImg) return;
    const ctx = canvas.getContext('2d');
    const { x, y, w, h } = computeLogoRect(
      canvas.width, canvas.height,
      logoImg.img.naturalWidth, logoImg.img.naturalHeight,
      scale, pos
    );
    ctx.save();
    ctx.globalAlpha = opacity / 100;
    ctx.drawImage(logoImg.img, x, y, w, h);
    ctx.restore();
  }

  // ── Apply: image ────────────────────────────────────────────────────────────
  async function applyLogoToImage() {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        stampLogo(canvas, logoPos, logoScale, logoOpacity);
        const isJpeg = /\.jpe?g$/i.test(mediaFile.name) || mediaFile.type === 'image/jpeg';
        canvas.toBlob(blob => blob ? res(blob) : rej(new Error('Export failed')),
          isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? 0.95 : undefined);
      };
      img.onerror = rej;
      readDataURL(mediaFile).then(u => { img.src = u; });
    });
  }

  // ── Apply: video via FFmpeg ─────────────────────────────────────────────────
  async function applyLogoToVideoFFmpeg() {
    // Convert logo to PNG buffer
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width  = logoImg.img.naturalWidth;
    tempCanvas.height = logoImg.img.naturalHeight;
    tempCanvas.getContext('2d').drawImage(logoImg.img, 0, 0);
    const logoPngBlob = await new Promise(r => tempCanvas.toBlob(r, 'image/png'));
    const logoBuffer  = await logoPngBlob.arrayBuffer();

    // Get video dimensions from element
    const vid = document.createElement('video');
    vid.src  = URL.createObjectURL(mediaFile);
    vid.muted = true;
    await new Promise((res, rej) => { vid.onloadedmetadata = res; vid.onerror = rej; });
    const W = vid.videoWidth;
    const H = vid.videoHeight;
    URL.revokeObjectURL(vid.src);

    const { x, y, w, h } = computeLogoRect(
      W, H,
      logoImg.img.naturalWidth, logoImg.img.naturalHeight,
      logoScale, logoPos
    );

    const srcBuf = await mediaFile.arrayBuffer();
    const result = await window.electronAPI.overlayLogoVideo({
      sourcePath: mediaFile._sourcePath || null,
      buffer: srcBuf,
      logoBuffer,
      logoX: x, logoY: y, logoW: w, logoH: h,
      opacity: logoOpacity / 100
    });

    if (!result.success) throw new Error(result.error || 'FFmpeg overlay failed');
    return new Blob([result.buffer], { type: 'video/mp4' });
  }

  // ── Frame-by-frame fallback (web / no Electron) ─────────────────────────────
  async function applyLogoToVideoCanvas() {
    const srcUrl = URL.createObjectURL(mediaFile);
    const vid = document.createElement('video');
    vid.src = srcUrl; vid.muted = true; vid.playsInline = true; vid.preload = 'auto';
    await new Promise((res, rej) => { vid.onloadedmetadata = res; vid.onerror = rej; });

    const W = vid.videoWidth, H = vid.videoHeight;
    const duration = vid.duration;
    const fps = 30;
    const totalFrames = Math.max(1, Math.ceil(duration * fps));

    const muxer = new window.SimpleWebMMuxer({ width: W, height: H, codec: 'V_VP9', duration });
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => console.error(e)
    });
    const cfg = { codec: 'vp09.00.10.08', width: W, height: H, bitrate: 16_000_000, framerate: fps };
    if (!(await VideoEncoder.isConfigSupported(cfg)).supported) { cfg.codec = 'vp8'; muxer.codec = 'V_VP8'; }
    encoder.configure(cfg);

    const fc = document.createElement('canvas'); fc.width = W; fc.height = H;
    const ctx = fc.getContext('2d', { willReadFrequently: true });
    const fdu = Math.round(1_000_000 / fps);

    for (let i = 0; i < totalFrames; i++) {
      vid.currentTime = Math.min(i / fps, Math.max(0, duration - 0.001));
      await new Promise(r => { vid.onseeked = r; });
      ctx.drawImage(vid, 0, 0, W, H);
      stampLogo(fc, logoPos, logoScale, logoOpacity);
      const vf = new VideoFrame(fc, { timestamp: i * fdu, duration: fdu });
      encoder.encode(vf, { keyFrame: i % 30 === 0 });
      vf.close();

      const pct = Math.round(((i + 1) / totalFrames) * 100);
      logoVpFill.style.width = pct + '%';
      logoVpFill.style.animation = 'none';
      logoVpFrames.textContent = (i + 1) + ' / ' + totalFrames + ' frames';
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }
    await encoder.flush();
    encoder.close();
    URL.revokeObjectURL(srcUrl);
    return muxer.finalize();
  }

  // ── Main apply handler ──────────────────────────────────────────────────────
  btnApply.addEventListener('click', async () => {
    if (!mediaFile || !logoImg) return;

    btnApply.disabled = true;
    btnSave.disabled  = true;
    resultBlob = null;
    videoProgress.classList.remove('hidden');
    logoVpFill.style.width = '30%';
    logoVpFill.style.animation = 'pulse-bar 1.2s ease infinite';
    logoVpFrames.textContent = 'Dang xu ly...';
    logoVpTime.textContent   = 'Uoc tinh: vai giay';
    setStatus('busy', 'Dang chen logo...');

    try {
      let blob;
      if (isVideoFile(mediaFile)) {
        if (isElectron && window.electronAPI.overlayLogoVideo) {
          setStatus('busy', 'FFmpeg: chen logo 1 lan chay...');
          blob = await applyLogoToVideoFFmpeg();
        } else {
          setStatus('busy', 'Xu ly tung frame...');
          blob = await applyLogoToVideoCanvas();
        }
      } else {
        blob = await applyLogoToImage();
      }

      resultBlob = blob;

      // Show in after panel
      const url = URL.createObjectURL(blob);
      const afterImg   = document.getElementById('after-img');
      const afterVideo = document.getElementById('after-video');
      const afterEmpty = document.getElementById('after-empty');
      afterEmpty.classList.add('hidden');
      if (isVideoFile(mediaFile)) {
        afterImg.classList.add('hidden');
        afterVideo.classList.remove('hidden');
        afterVideo.src = url;
      } else {
        afterVideo.classList.add('hidden');
        afterImg.classList.remove('hidden');
        afterImg.src = url;
      }

      videoProgress.classList.add('hidden');
      setStatus('ok', 'Da chen logo thanh cong!');
      btnSave.disabled  = false;
      btnApply.disabled = false;

    } catch (err) {
      videoProgress.classList.add('hidden');
      setStatus('err', 'Loi: ' + err.message);
      console.error(err);
      btnApply.disabled = false;
    }
  });

  // ── Save ────────────────────────────────────────────────────────────────────
  btnSave.addEventListener('click', async () => {
    if (!resultBlob) return;
    const ext  = isVideoFile(mediaFile) ? 'mp4' : /\.jpe?g$/i.test(mediaFile.name) ? 'jpg' : 'png';
    const name = mediaFile.name.replace(/\.[^.]+$/, '') + '_logo.' + ext;

    if (isElectron) {
      const r = await window.electronAPI.saveFile({ defaultName: name, mimeType: resultBlob.type });
      if (!r.canceled && r.filePath) {
        const buf = await resultBlob.arrayBuffer();
        await window.electronAPI.writeFile(r.filePath, buf);
        setStatus('ok', 'Da luu: ' + r.filePath.split(/[\\/]/).pop());
      }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(resultBlob);
      a.download = name;
      a.click();
    }
  });

  // ── Reset ────────────────────────────────────────────────────────────────────
  btnReset.addEventListener('click', () => {
    mediaFile = null; resultBlob = null;
    lmIdle.classList.remove('hidden');
    lmLoaded.classList.add('hidden');
    lmName.textContent = '';
    mediaInput.value = '';
    ['before-img','before-video','after-img','after-video'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.src = ''; el.classList.add('hidden'); }
    });
    ['before-empty','after-empty'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
    videoProgress.classList.add('hidden');
    setStatus('idle', 'Chon anh/video va logo de bat dau');
    btnApply.disabled = true;
    btnSave.disabled  = true;
  });

})();
