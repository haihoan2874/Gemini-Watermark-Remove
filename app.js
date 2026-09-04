/**
 * app.js — Main renderer logic
 * Handles drag/drop, processing pipeline, custom logo overlay, tab switching, download.
 */
// ── Global Clipboard Paste (Ctrl + V) ────────────────────────────────────────
window.addEventListener('paste', e => {
  if (!e.clipboardData || !e.clipboardData.items) return;
  const items = Array.from(e.clipboardData.items);
  const item = items.find(it => it.type && it.type.startsWith('image/'));
  if (!item) return;
  const blob = item.getAsFile();
  if (!blob) return;
  const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' });
  const isLogoTab = document.getElementById('mtab-logo')?.classList.contains('active');
  const isBgRemoveTab = document.getElementById('mtab-bgremove')?.classList.contains('active');
  const isConvertTab = document.getElementById('mtab-convert')?.classList.contains('active');
  if (isConvertTab) {
    window.dispatchEvent(new CustomEvent('paste-file-convert', { detail: file }));
  } else if (isBgRemoveTab) {
    window.dispatchEvent(new CustomEvent('paste-image-bgremove', { detail: file }));
  } else if (isLogoTab) {
    window.dispatchEvent(new CustomEvent('paste-image-logo', { detail: file }));
  } else {
    window.dispatchEvent(new CustomEvent('paste-image-remover', { detail: file }));
  }
});

(() => {
  const isElectron = typeof window.electronAPI !== 'undefined';

  // ── DOM Elements ───────────────────────────────────────────────────────────
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
  const watermarkDetectBox = document.getElementById('watermark-detect-box');
  const mediaWrapBefore    = document.getElementById('media-wrap-before');
  let tab1DetectedRect     = null; // { x, y, w, h, natW, natH, isVideo }

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
  const tabWipe   = document.getElementById('tab-wipe');
  const viewSplit  = document.getElementById('view-split');
  const viewBefore = document.getElementById('view-before');
  const viewAfter  = document.getElementById('view-after');
  const viewWipe        = document.getElementById('view-wipe');
  const wipeContainer   = document.getElementById('wipe-container');
  const wipeHandle      = document.getElementById('wipe-handle');
  const wipeLayerBefore = document.getElementById('wipe-layer-before');
  const wipeClipLayer   = document.getElementById('wipe-layer-after');
  const wipeImgBefore   = document.getElementById('wipe-img-before');
  const wipeImgAfter    = document.getElementById('wipe-img-after');
  const wipeVideoBefore = document.getElementById('wipe-video-before');
  const wipeVideoAfter  = document.getElementById('wipe-video-after');
  const wipeEmpty       = document.getElementById('wipe-empty');
  const wipeRange       = document.getElementById('wipe-range');

  // ── State ──────────────────────────────────────────────────────────────────
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

  // ── Native menu (Electron) ────────────────────────────────────────────────
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



  // ── Drag & drop ───────────────────────────────────────────────────────────
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
  dropZone.addEventListener('click', e => {
    if (e.target.tagName === 'INPUT') return;
    fileInput.click();
  });
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('click', e => e.stopPropagation());
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files].filter(f =>
      isImageFile(f) || isVideoFile(f)
    );
    files.forEach(f => { if (f.path) f._sourcePath = f.path; });
    if (files.length) handleFiles(files);
    fileInput.value = '';
  });

  // ── File loading ──────────────────────────────────────────────────────────
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
    detectAndShowTab1Watermark(files[0], isVideoMode);

    // Show file name / count in dropzone
    dzIdle.classList.add('hidden');
    dzLoaded.classList.remove('hidden');
    loadedName.textContent = files.length === 1
      ? files[0].name
      : `${files.length} file (${files.filter(isVideoFile).length} video, ${files.filter(f => !isVideoFile(f)).length} ảnh)`;

    if (files.length > 1) {
      queue.classList.remove('hidden');
      queueList.innerHTML = '';
      files.forEach((f, i) => {
        const li = document.createElement('li');
        li.id = `qi-${i}`;
        if (i === 0) li.classList.add('active');
        const isImg = isImageFile(f);
        const icon = isVideoFile(f) ? '🎬' : '🖼️';
        const mediaPreviewHtml = isImg
          ? `<img src="${URL.createObjectURL(f)}" class="queue-thumb" alt=""/>`
          : `<span class="q-icon">${icon}</span>`;
        li.innerHTML = `${mediaPreviewHtml} <span class="q-name">${f.name}</span><span class="q-status" id="qs-${i}">—</span>`;

        li.addEventListener('click', () => {
          document.querySelectorAll('#queue-list li').forEach(el => el.classList.remove('active'));
          li.classList.add('active');

          currentFile = f;
          isVideoMode = isVideoFile(f);
          detectAndShowTab1Watermark(f, isVideoMode);

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
      let labelStr = `Xử lý tất cả (${files.length})`;
      if (vCount === files.length) labelStr = `Xử lý ${files.length} video`;
      else if (iCount === files.length) labelStr = `Xử lý ${files.length} ảnh`;

      btnProcess.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg> ${labelStr}`;
      btnSaveAll.classList.add('hidden');
      setQueueProgress(0, files.length);
    } else {
      queue.classList.add('hidden');
      const label = isVideoMode ? 'Xóa Watermark Video' : 'Xóa Watermark';
      btnProcess.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg> ${label}`;
      btnSave.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/></svg> ${isVideoMode ? 'Lưu video' : 'Lưu ảnh'}`;
      btnSaveAll.classList.add('hidden');
    }

    videoProgressEl.classList.add('hidden');
    btnProcess.disabled = false;
    btnSave.disabled = true;
    btnReset.classList.remove('hidden');
    const hint = isVideoMode
      ? 'Video sẵn sàng — nhấn "Xóa Watermark Video"'
      : (files.length > 1 ? 'Sẵn sàng — nhấn nút xử lý tất cả' : 'Sẵn sàng — nhấn "Xóa Watermark"');
    setStatus('idle', hint);
  }

  // ── Process ───────────────────────────────────────────────────────────────
  btnProcess.addEventListener('click', async () => {
    hideTab1WatermarkBox();
    if (fileQueue.length > 1) await processBatch(fileQueue);
    else if (isVideoMode) await processVideoFile(currentFile);
    else await processSingle(currentFile);
  });

  async function processSingle(file) {
    btnProcess.disabled = true;
    setStatus('busy', 'Đang xử lý...');

    try {
      const { detection, blob } = await processImage(file);
      cleanBlob = blob;

      const url = URL.createObjectURL(blob);
      setAfterImage(url);

      if (detection.found) {
        setStatus('ok', '✓ Watermark đã được xử lý');
      } else {
        setStatus('warn', 'Không tìm thấy watermark — ảnh giữ nguyên');
      }

      btnSave.disabled = false;
      // Show overwrite option if we know the original path
      if (isElectron && file && file._sourcePath) {
        overwriteWrap.classList.remove('hidden');
      }
    } catch (err) {
      setStatus('err', 'Lỗi: ' + err.message);
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
          setStatus('busy', `Đang xử lý video ${i+1}/${files.length}: ${f.name}`);
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
          if (qs) qs.textContent = '✓';
        } else {
          setStatus('busy', `Đang xử lý ảnh ${i+1}/${files.length}: ${f.name}`);
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
          if (qs) qs.textContent = detection.found ? '✓' : '—';
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          if (qs) qs.textContent = '—';
          break;
        }
        console.error(`Lỗi xử lý file ${f.name}:`, err);
        if (qs) qs.textContent = 'âœ—';
      }
    }

    videoProgressEl.classList.add('hidden');
    setQueueProgress(files.length, files.length);
    setStatus('ok', `✓ Hoàn tất ${processedBlobs.length}/${files.length} file`);
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

  // ── Video processing pipeline ─────────────────────────────────────────────
  async function processVideoFile(file) {
    btnProcess.disabled = true;
    btnSave.disabled = true;
    videoProgressEl.classList.remove('hidden');
    videoAbortCtrl = new AbortController();
    const signal = videoAbortCtrl.signal;

    setStatus('busy', 'Đang phân tích video...');

    try {
      const blob = await renderVideoWithoutWatermark(file, signal);
      cleanBlob = blob;
      setAfterVideo(blob);
      if (logoSettings.enabled && customLogo) {
        setStatus('ok', '✓ Watermark video đã được xóa & chèn logo thương hiệu');
      } else {
        setStatus('ok', '✓ Watermark video đã được xóa');
      }
      btnSave.disabled = false;
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('warn', 'Đã hủy xử lý video');
      } else {
        setStatus('err', 'Lỗi xử lý video: ' + err.message);
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
      vid.onerror = () => rej(new Error('Không đọc được video'));
    });

    const W = vid.videoWidth;
    const H = vid.videoHeight;
    const duration = vid.duration;
    const fps = 30;
    const frameDurationMicros = Math.round(1_000_000 / fps);
    const totalFrames = Math.max(1, Math.ceil(duration * fps));

    // ── NORMAL PATH: frame-by-frame (remove watermark or web mode) ───────────

    // 2. Pre-warm SDK engine and alpha maps
    setStatus('busy', 'Đang khởi tạo engine Gemini SDK...');
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
    setStatus('busy', 'Đang xóa logo từng khung hình chuẩn xác...');
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
        throw new Error('Lỗi mã hóa: ' + encodeError.message);
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
      vpTime.textContent = `Ước tính còn: ${eta === '--' ? '--' : eta + 's'}`;

      if (i % 5 === 0) await sleep(0);
    }

    await encoder.flush();
    encoder.close();
    URL.revokeObjectURL(srcUrl);

    vpFill.style.width = '100%';
    vpFrames.textContent = `${totalFrames} / ${totalFrames} frames (100%)`;
    vpTime.textContent = 'Hoàn tất!';

    return muxer.finalize();
  }


  // ── Save ──────────────────────────────────────────────────────────────────
  btnSave.addEventListener('click', async () => {
    if (!cleanBlob) return;

    // Overwrite original file directly (Electron only)
    if (isElectron && chkOverwrite.checked && currentFile && currentFile._sourcePath) {
      const buf = await cleanBlob.arrayBuffer();
      const result = await window.electronAPI.writeFile(currentFile._sourcePath, buf);
      if (result.success) {
        setStatus('ok', `✓ Đã ghi đè: ${currentFile._sourcePath.split(/[\\/]/).pop()}`);
      } else {
        setStatus('err', 'Ghi đè thất bại: ' + result.error);
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
    btnSaveAll.textContent = 'Đang lưu...';

    try {
      // Overwrite mode: ghi đè thẳng vào file gốc
      if (isElectron && chkOverwrite.checked) {
        let ok = 0;
        for (const { sourcePath, blob } of processedBlobs) {
          if (!sourcePath) continue;
          const buf = await blob.arrayBuffer();
          const result = await window.electronAPI.writeFile(sourcePath, buf);
          if (result.success) ok++;
        }
        setStatus('ok', `✓ Đã ghi đè ${ok} file gốc`);
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
          setStatus('ok', `✓ Đã lưu ${processedBlobs.length} file vào thư mục`);
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
    } catch (e) { setStatus('err', 'Lỗi lưu file: ' + e.message); }

    btnSaveAll.disabled = false;
    btnSaveAll.textContent = 'Tải tất cả';
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
        setStatus('ok', `✓ Đã lưu: ${res.filePath.split(/[\\/]/).pop()}`);
        window.electronAPI.showInFolder(res.filePath);
      } else {
        setStatus('err', 'Không lưu được: ' + result.error);
      }
    } else {
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: defaultName }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  btnReset.addEventListener('click', () => {
    // Cancel any in-progress video processing
    if (videoAbortCtrl) { videoAbortCtrl.abort(); videoAbortCtrl = null; }

    fileQueue = [];
    processedBlobs = [];
    cleanBlob = null;
    currentFile = null;
    isVideoMode = false;
    tab1DetectedRect = null;
    hideTab1WatermarkBox();

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
    clearBeforeImage();

    setStatus('idle', 'Chờ ảnh hoặc video...');
  });

  // ── Tabs ──────────────────────────────────────────────────────────────────
  function switchTab(active) {
    [tabSplit, tabBefore, tabAfter, tabWipe].forEach(t => { t?.classList.remove('active'); t?.setAttribute('aria-pressed', 'false'); });
    [viewSplit, viewBefore, viewAfter, viewWipe].forEach(v => v?.classList.add('hidden'));
    active.btn.classList.add('active');
    active.btn.setAttribute('aria-pressed', 'true');
    active.view.classList.remove('hidden');
    if (active.btn === tabWipe) {
      updateWipeMedia();
    }
  }

  let isWipeDragging = false;

  function updateWipePositionFromClientX(clientX) {
    if (!wipeContainer) return;
    const rect = wipeContainer.getBoundingClientRect();
    if (rect.width <= 0) return;
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const pct = Math.round((offsetX / rect.width) * 100);
    setWipePosition(pct);
  }

  function setWipePosition(pct) {
    pct = Math.max(0, Math.min(100, pct));
    if (wipeHandle) wipeHandle.style.left = `${pct}%`;
    if (wipeLayerBefore) wipeLayerBefore.style.clipPath = `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)`;
    if (wipeClipLayer) wipeClipLayer.style.clipPath = `polygon(${pct}% 0, 100% 0, 100% 100%, ${pct}% 100%)`;
    if (wipeRange) wipeRange.value = pct;
  }

  wipeContainer?.addEventListener('mousedown', e => {
    e.preventDefault();
    isWipeDragging = true;
    updateWipePositionFromClientX(e.clientX);
  });

  window.addEventListener('mousemove', e => {
    if (isWipeDragging) {
      updateWipePositionFromClientX(e.clientX);
    }
  });

  window.addEventListener('mouseup', () => {
    isWipeDragging = false;
  });

  wipeContainer?.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      isWipeDragging = true;
      updateWipePositionFromClientX(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (isWipeDragging && e.touches.length === 1) {
      updateWipePositionFromClientX(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    isWipeDragging = false;
  });

  wipeRange?.addEventListener('input', e => {
    setWipePosition(e.target.value);
  });

  function updateWipeMedia() {
    const hasBefore = beforeImg.src && !beforeImg.classList.contains('hidden') && !beforeImg.src.endsWith('/') && beforeImg.src !== window.location.href;
    const hasBeforeVid = beforeVideo.src && beforeVideo.classList.contains('active');
    const hasAfter = afterImg.src && !afterImg.classList.contains('hidden') && !afterImg.src.endsWith('/') && afterImg.src !== window.location.href;
    const hasAfterVid = afterVideo.src && afterVideo.classList.contains('active');

    if ((hasBefore || hasBeforeVid) && (hasAfter || hasAfterVid)) {
      wipeEmpty?.classList.add('hidden');
      if (hasBefore) {
        wipeImgBefore.src = beforeImg.src;
        wipeImgBefore.classList.add('loaded');
        wipeImgBefore.classList.remove('hidden');
        wipeVideoBefore.classList.remove('active');
      } else if (hasBeforeVid) {
        wipeVideoBefore.src = beforeVideo.src;
        wipeVideoBefore.classList.add('active');
        wipeImgBefore.classList.add('hidden');
        wipeImgBefore.classList.remove('loaded');
      }

      if (hasAfter) {
        wipeImgAfter.src = afterImg.src;
        wipeImgAfter.classList.add('loaded');
        wipeImgAfter.classList.remove('hidden');
        wipeVideoAfter.classList.remove('active');
      } else if (hasAfterVid) {
        wipeVideoAfter.src = afterVideo.src;
        wipeVideoAfter.classList.add('active');
        wipeImgAfter.classList.add('hidden');
        wipeImgAfter.classList.remove('loaded');
      }
    } else {
      wipeImgBefore?.removeAttribute('src');
      wipeImgBefore?.classList.remove('loaded');
      wipeImgBefore?.classList.add('hidden');
      wipeImgAfter?.removeAttribute('src');
      wipeImgAfter?.classList.remove('loaded');
      wipeImgAfter?.classList.add('hidden');
      wipeEmpty?.classList.remove('hidden');
    }
  }

  tabSplit?.addEventListener('click',  () => switchTab({ btn: tabSplit,  view: viewSplit }));
  tabBefore?.addEventListener('click', () => switchTab({ btn: tabBefore, view: viewBefore }));
  tabAfter?.addEventListener('click',  () => switchTab({ btn: tabAfter,  view: viewAfter }));
  tabWipe?.addEventListener('click',   () => switchTab({ btn: tabWipe,   view: viewWipe }));
  window.addEventListener('preview-updated', updateWipeMedia);

  // ── Image helpers ─────────────────────────────────────────────────────────
  function setBeforeImage(url) {
    [beforeImg, beforeImg2].forEach(img => {
      if (!img) return;
      img.src = url;
      img.onload = () => {
        img.classList.add('loaded');
        img.classList.remove('hidden');
        renderTab1WatermarkBox();
      };
      img.classList.remove('hidden');
    });
    [beforeVideo, beforeVideo2].forEach(v => { v?.classList.remove('active'); });
    beforeEmpty?.classList.add('hidden');
    beforeEmpty2?.classList.add('hidden');
    if (tabWipe?.classList.contains('active')) updateWipeMedia();
  }

  function clearBeforeImage() {
    [beforeImg, beforeImg2].forEach(img => {
      if (!img) return;
      img.removeAttribute('src');
      img.classList.remove('loaded');
      img.classList.add('hidden');
    });
    beforeEmpty?.classList.remove('hidden');
    beforeEmpty2?.classList.remove('hidden');
    hideTab1WatermarkBox();
    if (tabWipe?.classList.contains('active')) updateWipeMedia();
  }

  function setAfterImage(url) {
    [afterImg, afterImg2].forEach(img => {
      if (!img) return;
      img.src = url;
      img.onload = () => {
        img.classList.add('loaded');
        img.classList.remove('hidden');
      };
      img.classList.remove('hidden');
    });
    [afterVideo, afterVideo2].forEach(v => { v?.classList.remove('active'); });
    afterEmpty?.classList.add('hidden');
    afterEmpty2?.classList.add('hidden');
    if (tabWipe?.classList.contains('active')) updateWipeMedia();
  }

  function clearAfterImage() {
    [afterImg, afterImg2].forEach(img => {
      if (!img) return;
      img.removeAttribute('src');
      img.classList.remove('loaded');
      img.classList.add('hidden');
    });
    afterEmpty?.classList.remove('hidden');
    afterEmpty2?.classList.remove('hidden');
    if (tabWipe?.classList.contains('active')) updateWipeMedia();
  }

  // ── Video helpers ──────────────────────────────────────────────────────────
  function setBeforeVideo(file) {
    const url = URL.createObjectURL(file);
    [beforeVideo, beforeVideo2].forEach(v => {
      v.src = url;
      v.classList.add('active');
    });
    [beforeImg, beforeImg2].forEach(img => { img.src = ''; img.classList.remove('loaded'); });
    beforeEmpty.classList.add('hidden');
    beforeEmpty2.classList.add('hidden');
    if (tabWipe?.classList.contains('active')) updateWipeMedia();
  }

  function clearBeforeVideo() {
    [beforeVideo, beforeVideo2].forEach(v => {
      v.pause(); v.src = ''; v.classList.remove('active');
    });
    hideTab1WatermarkBox();
    if (tabWipe?.classList.contains('active')) updateWipeMedia();
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
    if (tabWipe?.classList.contains('active')) updateWipeMedia();
  }

  function clearAfterVideo() {
    [afterVideo, afterVideo2].forEach(v => {
      v.pause(); v.src = ''; v.classList.remove('active');
    });
    afterEmpty.classList.remove('hidden');
    afterEmpty2.classList.remove('hidden');
    if (tabWipe?.classList.contains('active')) updateWipeMedia();
  }

  // ── Status ─────────────────────────────────────────────────────────────────
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

  // ── Utilities ──────────────────────────────────────────────────────────────
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

  // ── Tab 1 Watermark detection box preview ───────────────────────────────────
  function getDefaultGeminiRect(W, H) {
    const size = (W > 1024 || H > 1024) ? 96 : 48;
    const margin = (W > 1024 || H > 1024) ? 48 : 24;
    return { x: Math.max(0, W - size - margin), y: Math.max(0, H - size - margin), w: size, h: size };
  }

  async function detectAndShowTab1Watermark(file, isVideo) {
    if (!watermarkDetectBox || !file) return;
    try {
      if (isVideo) {
        const url = URL.createObjectURL(file);
        const vid = document.createElement('video');
        vid.src = url;
        vid.muted = true;
        await new Promise(r => { vid.onloadedmetadata = r; });
        const w = vid.videoWidth || 1280;
        const h = vid.videoHeight || 720;
        const fc = document.createElement('canvas');
        fc.width = w; fc.height = h;
        vid.currentTime = 0;
        await new Promise(r => { vid.onseeked = r; });
        fc.getContext('2d').drawImage(vid, 0, 0);
        const engine = await window.GeminiWatermarkRemover.createWatermarkEngine();
        const probe = await engine.removeWatermarkFromImage(fc);
        URL.revokeObjectURL(url);
        const m = probe?.meta || probe;
        if (m && m.width > 0 && m.x != null) {
          tab1DetectedRect = { x: m.x, y: m.y, w: m.width, h: m.height, natW: w, natH: h, isVideo: true };
        } else {
          const def = getDefaultGeminiRect(w, h);
          tab1DetectedRect = { ...def, natW: w, natH: h, isVideo: true };
        }
      } else {
        const dataUrl = await readDataURL(file);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const res = await window.GeminiWatermarkRemover.removeWatermarkFromImage(img);
        const m = res?.meta || res;
        if (m && m.width > 0 && m.x != null) {
          tab1DetectedRect = { x: m.x, y: m.y, w: m.width, h: m.height, natW: w, natH: h, isVideo: false };
        } else {
          const def = getDefaultGeminiRect(w, h);
          tab1DetectedRect = { ...def, natW: w, natH: h, isVideo: false };
        }
      }
      renderTab1WatermarkBox();
    } catch (_) {
      hideTab1WatermarkBox();
    }
  }

  function renderTab1WatermarkBox() {
    if (!watermarkDetectBox || !tab1DetectedRect) return;
    const tcRemove = document.getElementById('tc-remove');
    if (tcRemove && tcRemove.classList.contains('hidden')) {
      watermarkDetectBox.classList.add('hidden');
      return;
    }
    const mediaWrap = document.getElementById('media-wrap-before');
    const mediaEl = tab1DetectedRect.isVideo ? beforeVideo : beforeImg;
    if (!mediaEl || !mediaWrap) return;
    const mRect = mediaEl.getBoundingClientRect();
    const wrapRect = mediaWrap.getBoundingClientRect();
    if (mRect.width === 0 || mRect.height === 0) {
      requestAnimationFrame(renderTab1WatermarkBox);
      return;
    }
    const scaleX = mRect.width / tab1DetectedRect.natW;
    const scaleY = mRect.height / tab1DetectedRect.natH;
    const boxX = (mRect.left - wrapRect.left) + tab1DetectedRect.x * scaleX;
    const boxY = (mRect.top  - wrapRect.top)  + tab1DetectedRect.y * scaleY;
    const boxW = Math.max(20, tab1DetectedRect.w * scaleX);
    const boxH = Math.max(20, tab1DetectedRect.h * scaleY);
    watermarkDetectBox.style.left   = `${Math.round(boxX)}px`;
    watermarkDetectBox.style.top    = `${Math.round(boxY)}px`;
    watermarkDetectBox.style.width  = `${Math.round(boxW)}px`;
    watermarkDetectBox.style.height = `${Math.round(boxH)}px`;
    watermarkDetectBox.classList.remove('hidden');
  }

  function hideTab1WatermarkBox() {
    if (watermarkDetectBox) watermarkDetectBox.classList.add('hidden');
  }

  window.addEventListener('resize', renderTab1WatermarkBox);
  beforeVideo.addEventListener('loadedmetadata', renderTab1WatermarkBox);
  window.addEventListener('tab-switched', e => {
    if (e.detail === 'remove') renderTab1WatermarkBox();
    else hideTab1WatermarkBox();
  });

  window.addEventListener('paste-image-remover', e => {
    handleFiles([e.detail]);
    setStatus('idle', '📋 Đã dán ảnh từ Clipboard — sẵn sàng xóa watermark');
  });

  // ── Sync Before/After Video Controls ────────────────────────────────────────
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
  setupVideoSync(wipeVideoBefore, wipeVideoAfter);
  setupVideoSync(wipeVideoAfter, wipeVideoBefore);

  // ── Main tab switcher ──────────────────────────────────────────────────────
  const mtabRemove   = document.getElementById('mtab-remove');
  const mtabLogo     = document.getElementById('mtab-logo');
  const mtabBgRemove = document.getElementById('mtab-bgremove');
  const mtabConvert  = document.getElementById('mtab-convert');
  const tcRemove     = document.getElementById('tc-remove');
  const tcLogo       = document.getElementById('tc-logo');
  const tcBgRemove   = document.getElementById('tc-bgremove');
  const tcConvert    = document.getElementById('tc-convert');
  const panelRightCompare = document.getElementById('panel-right-compare');
  const panelRightConvert = document.getElementById('panel-right-convert');
  const boxAfter = document.getElementById('box-after');

  function switchMainTab(tab) {
    [mtabRemove, mtabLogo, mtabBgRemove, mtabConvert].forEach(b => b?.classList.remove('active'));
    [tcRemove, tcLogo, tcBgRemove, tcConvert].forEach(c => c?.classList.add('hidden'));

    // Toggle checkerboard pattern on after-box and wipe-container only in bgremove tab
    if (tab === 'bgremove') {
      boxAfter?.classList.add('checkerboard-bg');
      viewAfter?.classList.add('checkerboard-bg');
      wipeContainer?.classList.add('checkerboard-bg');
    } else {
      boxAfter?.classList.remove('checkerboard-bg');
      viewAfter?.classList.remove('checkerboard-bg');
      wipeContainer?.classList.remove('checkerboard-bg');
    }
    if (tabWipe?.classList.contains('active')) {
      updateWipeMedia();
    }

    if (tab === 'logo') {
      mtabLogo?.classList.add('active');
      tcLogo?.classList.remove('hidden');
      panelRightCompare?.classList.remove('hidden');
      panelRightConvert?.classList.add('hidden');
    } else if (tab === 'bgremove') {
      mtabBgRemove?.classList.add('active');
      tcBgRemove?.classList.remove('hidden');
      panelRightCompare?.classList.remove('hidden');
      panelRightConvert?.classList.add('hidden');
    } else if (tab === 'convert') {
      mtabConvert?.classList.add('active');
      tcConvert?.classList.remove('hidden');
      panelRightCompare?.classList.add('hidden');
      panelRightConvert?.classList.remove('hidden');
    } else {
      mtabRemove?.classList.add('active');
      tcRemove?.classList.remove('hidden');
      panelRightCompare?.classList.remove('hidden');
      panelRightConvert?.classList.add('hidden');
    }
    window.dispatchEvent(new CustomEvent('tab-switched', { detail: tab }));
  }

  mtabRemove?.addEventListener('click',   () => switchMainTab('remove'));
  mtabLogo?.addEventListener('click',     () => switchMainTab('logo'));
  mtabBgRemove?.addEventListener('click', () => switchMainTab('bgremove'));
  mtabConvert?.addEventListener('click',  () => switchMainTab('convert'));

})();

// ── Logo Tab Module (independent) ─────────────────────────────────────────────
(() => {
  const isElectron = typeof window.electronAPI !== 'undefined';

  // DOM refs
  const mediaDropEl     = document.getElementById('logo-media-drop');
  const mediaInput      = document.getElementById('logo-media-input');
  const lmIdle          = document.getElementById('lm-idle');
  const lmLoaded        = document.getElementById('lm-loaded');
  const lmName          = document.getElementById('lm-name');
  const logoUploader    = document.getElementById('logo-uploader');
  const logoFileInput   = document.getElementById('logo-file-input');
  const logoIdle        = document.getElementById('logo-idle');
  const logoPreview     = document.getElementById('logo-preview-wrap');
  const logoThumb       = document.getElementById('logo-thumb');
  const logoName        = document.getElementById('logo-name');
  const btnRemoveLogo   = document.getElementById('btn-remove-logo');
  const rngScale        = document.getElementById('rng-logo-scale');
  const valScale        = document.getElementById('val-logo-scale');
  const rngOpacity      = document.getElementById('rng-logo-opacity');
  const valOpacity      = document.getElementById('val-logo-opacity');
  const posGrid         = document.getElementById('pos-grid');
  const btnSnapGemini   = document.getElementById('btn-snap-gemini');
  const statusDot       = document.getElementById('logo-status-dot');
  const statusMsg       = document.getElementById('logo-status-msg');
  const videoProgress   = document.getElementById('logo-video-progress');
  const logoVpFill      = document.getElementById('logo-vp-fill');
  const logoVpFrames    = document.getElementById('logo-vp-frames');
  const logoVpTime      = document.getElementById('logo-vp-time');
  const btnApply        = document.getElementById('btn-logo-apply');
  const btnSave         = document.getElementById('btn-logo-save');
  const btnReset        = document.getElementById('btn-logo-reset');
  const logoQueue       = document.getElementById('logo-queue');
  const logoQueueList   = document.getElementById('logo-queue-list');
  const lqProgressBar   = document.getElementById('lq-progress-bar');
  const lqProgressText  = document.getElementById('lq-progress-text');
  const btnLogoSaveAll  = document.getElementById('btn-logo-save-all');

  // Preview elements
  const beforeImg       = document.getElementById('before-img');
  const beforeVideo     = document.getElementById('before-video');
  const beforeImg2      = document.getElementById('before-img-2');
  const beforeVideo2    = document.getElementById('before-video-2');
  const beforeEmpty     = document.getElementById('before-empty');
  const beforeEmpty2    = document.getElementById('before-empty-2');
  const afterImg        = document.getElementById('after-img');
  const afterVideo      = document.getElementById('after-video');
  const afterImg2       = document.getElementById('after-img-2');
  const afterVideo2     = document.getElementById('after-video-2');
  const afterEmpty      = document.getElementById('after-empty');
  const afterEmpty2     = document.getElementById('after-empty-2');
  const mediaWrapBefore = document.getElementById('media-wrap-before');
  const logoDragBox     = document.getElementById('logo-drag-box');
  const logoDragImg     = document.getElementById('logo-drag-img');

  // State
  let mediaFile          = null;  // currently active source File
  let mediaFiles         = [];    // batch source Files
  let currentMediaIdx    = 0;     // index of active file in batch
  let processedLogoList  = [];    // [{ name, origName, blob, isVideo, sourcePath }]
  let logoImg            = null;  // { img: Image, dataUrl: string, name: string }
  let mediaNatW          = 0;     // natural width of source media
  let mediaNatH          = 0;     // natural height of source media
  let geminiDetectedRect = null;  // { x, y, w, h } in natural coords
  let customLogoRect     = null;  // { x, y, w, h } in natural coords
  let logoPos            = 'br';  // tl|tc|tr|ml|mc|mr|bl|bc|br|custom|gemini
  let resultBlob         = null;
  let logoScale          = 100;
  let logoOpacity        = 100;
  let isDragging         = false;
  let dragStartX         = 0;
  let dragStartY         = 0;
  let initialLogoX       = 0;
  let initialLogoY       = 0;
  let isVideoMode        = false;

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

  function updateApplyBtn() {
    btnApply.disabled = !(mediaFile && logoImg);
  }

  function getDefaultGeminiRect(W, H) {
    const size = (W > 1024 || H > 1024) ? 96 : 48;
    const margin = (W > 1024 || H > 1024) ? 48 : 24;
    return { x: Math.max(0, W - size - margin), y: Math.max(0, H - size - margin), w: size, h: size };
  }

  // ── Snap to Gemini watermark position ──────────────────────────────────────
  function snapToGemini() {
    if (!mediaNatW || !mediaNatH) return;
    const gRect = geminiDetectedRect || getDefaultGeminiRect(mediaNatW, mediaNatH);
    const aspect = (logoImg?.img?.naturalWidth || 1) / (logoImg?.img?.naturalHeight || 1);

    // Calculate logo width & height matching Gemini icon size * user scale
    let drawW = Math.round(gRect.w * (logoScale / 100));
    let drawH = Math.round(drawW / aspect);
    if (drawH > drawW * 2) { drawH = drawW * 2; drawW = Math.round(drawH * aspect); }

    // Center logo directly on Gemini watermark
    let drawX = Math.round(gRect.x + gRect.w / 2 - drawW / 2);
    let drawY = Math.round(gRect.y + gRect.h / 2 - drawH / 2);

    // Clamp inside image bounds
    drawX = Math.max(0, Math.min(mediaNatW - drawW, drawX));
    drawY = Math.max(0, Math.min(mediaNatH - drawH, drawY));

    customLogoRect = { x: drawX, y: drawY, w: drawW, h: drawH };
    logoPos = 'br';

    posGrid.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
    posGrid.querySelector('[data-pos="br"]')?.classList.add('active');

    updateDragBoxUI();
    setStatus('ok', `🎯 Đã căn đúng vị trí logo Gemini (${gRect.x}, ${gRect.y})`);
  }

  // ── Snap to 9-point grid ───────────────────────────────────────────────────
  function snapToGrid(pos) {
    if (!mediaNatW || !mediaNatH || !logoImg) return;
    if (pos === 'br') {
      snapToGemini();
      return;
    }

    const aspect = (logoImg.img.naturalWidth || 1) / (logoImg.img.naturalHeight || 1);
    const baseSize = Math.round(Math.min(mediaNatW, mediaNatH) * 0.08 * (logoScale / 100));
    let drawW = baseSize;
    let drawH = Math.round(baseSize / aspect);
    if (drawH > baseSize) { drawH = baseSize; drawW = Math.round(baseSize * aspect); }

    const margin = Math.round(Math.min(mediaNatW, mediaNatH) * 0.04);
    const positions = {
      tl: { x: margin,                      y: margin },
      tc: { x: (mediaNatW - drawW) / 2,     y: margin },
      tr: { x: mediaNatW - drawW - margin,  y: margin },
      ml: { x: margin,                      y: (mediaNatH - drawH) / 2 },
      mc: { x: (mediaNatW - drawW) / 2,     y: (mediaNatH - drawH) / 2 },
      mr: { x: mediaNatW - drawW - margin,  y: (mediaNatH - drawH) / 2 },
      bl: { x: margin,                      y: mediaNatH - drawH - margin },
      bc: { x: (mediaNatW - drawW) / 2,     y: mediaNatH - drawH - margin },
      br: { x: mediaNatW - drawW - margin,  y: mediaNatH - drawH - margin },
    };

    const pt = positions[pos] || positions.br;
    customLogoRect = { x: Math.round(pt.x), y: Math.round(pt.y), w: drawW, h: drawH };
    logoPos = pos;
    updateDragBoxUI();
  }

  // ── Position & render interactive draggable overlay box ────────────────────
  function updateDragBoxUI() {
    if (!logoImg || !mediaFile || !customLogoRect || !mediaNatW || !mediaNatH) {
      if (logoDragBox) logoDragBox.classList.add('hidden');
      return;
    }

    const mediaEl = isVideoFile(mediaFile) ? beforeVideo : beforeImg;
    const mRect = mediaEl.getBoundingClientRect();
    const wrapRect = mediaWrapBefore.getBoundingClientRect();

    if (mRect.width === 0 || mRect.height === 0) {
      requestAnimationFrame(updateDragBoxUI);
      return;
    }

    const scaleX = mRect.width / mediaNatW;
    const scaleY = mRect.height / mediaNatH;

    const boxX = (mRect.left - wrapRect.left) + customLogoRect.x * scaleX;
    const boxY = (mRect.top  - wrapRect.top)  + customLogoRect.y * scaleY;
    const boxW = Math.max(16, customLogoRect.w * scaleX);
    const boxH = Math.max(16, customLogoRect.h * scaleY);

    logoDragBox.style.left    = `${Math.round(boxX)}px`;
    logoDragBox.style.top     = `${Math.round(boxY)}px`;
    logoDragBox.style.width   = `${Math.round(boxW)}px`;
    logoDragBox.style.height  = `${Math.round(boxH)}px`;
    logoDragBox.style.opacity = logoOpacity / 100;

    if (logoDragImg.src !== logoImg.dataUrl) {
      logoDragImg.src = logoImg.dataUrl;
    }
    logoDragBox.classList.remove('hidden');
  }

  // ── Mouse & Touch Dragging ─────────────────────────────────────────────────
  function onDragStart(clientX, clientY) {
    if (!customLogoRect) return;
    isDragging = true;
    dragStartX = clientX;
    dragStartY = clientY;
    initialLogoX = customLogoRect.x;
    initialLogoY = customLogoRect.y;
    logoDragBox.classList.add('dragging');
  }

  function onDragMove(clientX, clientY) {
    if (!isDragging || !customLogoRect || !mediaNatW || !mediaNatH) return;
    const mediaEl = isVideoFile(mediaFile) ? beforeVideo : beforeImg;
    const mRect = mediaEl.getBoundingClientRect();
    if (mRect.width === 0 || mRect.height === 0) return;

    const scaleX = mRect.width / mediaNatW;
    const scaleY = mRect.height / mediaNatH;

    const dx = (clientX - dragStartX) / scaleX;
    const dy = (clientY - dragStartY) / scaleY;

    customLogoRect.x = Math.max(0, Math.min(mediaNatW - customLogoRect.w, Math.round(initialLogoX + dx)));
    customLogoRect.y = Math.max(0, Math.min(mediaNatH - customLogoRect.h, Math.round(initialLogoY + dy)));
    logoPos = 'custom';

    // Clear 9-grid active state
    posGrid.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));

    updateDragBoxUI();
  }

  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    logoDragBox.classList.remove('dragging');
  }

  logoDragBox.addEventListener('mousedown', e => {
    e.preventDefault();
    onDragStart(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', e => {
    if (isDragging) onDragMove(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (isDragging) onDragEnd();
  });

  logoDragBox.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      onDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (isDragging && e.touches.length === 1) {
      onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (isDragging) onDragEnd();
  });

  window.addEventListener('resize', updateDragBoxUI);
  beforeVideo.addEventListener('loadedmetadata', updateDragBoxUI);
  beforeImg.addEventListener('load', updateDragBoxUI);

  // ── Media dropzone & Gemini detection ───────────────────────────────────────
  function applyMediaFiles(files) {
    if (!files || !files.length) return;
    mediaFiles = Array.from(files);
    currentMediaIdx = 0;
    processedLogoList = [];

    if (mediaFiles.length > 1) {
      logoQueue.classList.remove('hidden');
      renderLogoQueue();
      btnLogoSaveAll.classList.add('hidden');
      setLogoQueueProgress(0, mediaFiles.length);
    } else {
      logoQueue.classList.add('hidden');
      btnLogoSaveAll.classList.add('hidden');
    }

    applyMedia(mediaFiles[0]);
    updateApplyBtn();
  }

  function renderLogoQueue() {
    logoQueueList.innerHTML = '';
    mediaFiles.forEach((f, i) => {
      const li = document.createElement('li');
      li.id = `lqi-${i}`;
      if (i === currentMediaIdx) li.classList.add('active');
      const isImg = isImageFile(f);
      const icon = isVideoFile(f) ? '🎬' : '🖼️';
      const mediaPreviewHtml = isImg
        ? `<img src="${URL.createObjectURL(f)}" class="queue-thumb" alt=""/>`
        : `<span class="q-icon">${icon}</span>`;
      li.innerHTML = `${mediaPreviewHtml} <span class="q-name">${f.name}</span><span class="q-status" id="lqs-${i}">—</span>`;
      li.addEventListener('click', () => {
        document.querySelectorAll('#logo-queue-list li').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        currentMediaIdx = i;
        applyMedia(f);
        const processed = processedLogoList.find(p => p.origName === f.name);
        if (processed) {
          resultBlob = processed.blob;
          showAfterPreview(processed.blob, processed.isVideo);
          btnSave.disabled = false;
        }
      });
      logoQueueList.appendChild(li);
    });
  }

  function setLogoQueueProgress(done, total) {
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    if (lqProgressBar) lqProgressBar.style.width = pct + '%';
    if (lqProgressText) lqProgressText.textContent = `${done} / ${total}`;
  }

  async function applyMedia(file) {
    mediaFile = file;
    isVideoMode = isVideoFile(file);
    lmIdle.classList.add('hidden');
    lmLoaded.classList.remove('hidden');
    lmName.textContent = mediaFiles.length > 1
      ? `${mediaFiles.length} file (${mediaFiles.filter(isVideoFile).length} video, ${mediaFiles.filter(f => !isVideoFile(f)).length} ảnh)`
      : file.name;

    // Reset results
    resultBlob = null;
    btnSave.disabled = true;
    [afterImg, afterImg2].forEach(img => { if (img) { img.removeAttribute('src'); img.classList.remove('loaded'); img.classList.add('hidden'); } });
    [afterVideo, afterVideo2].forEach(v => { if (v) { v.src = ''; v.classList.remove('active'); v.classList.add('hidden'); } });
    afterEmpty.classList.remove('hidden');
    if (afterEmpty2) afterEmpty2.classList.remove('hidden');

    const url = URL.createObjectURL(file);
    beforeEmpty.classList.add('hidden');
    if (beforeEmpty2) beforeEmpty2.classList.add('hidden');

    if (isVideoMode) {
      [beforeImg, beforeImg2].forEach(img => { if (img) { img.removeAttribute('src'); img.classList.remove('loaded'); img.classList.add('hidden'); } });
      [beforeVideo, beforeVideo2].forEach(v => {
        if (v) {
          v.src = url;
          v.classList.remove('hidden');
          v.classList.add('active');
          v.load();
        }
      });
    } else {
      [beforeVideo, beforeVideo2].forEach(v => { if (v) { v.src = ''; v.classList.remove('active'); v.classList.add('hidden'); } });
      [beforeImg, beforeImg2].forEach(img => {
        if (img) {
          img.src = url;
          img.classList.remove('hidden');
          img.classList.add('loaded');
        }
      });
    }

    setStatus('busy', 'Đang quét vị trí watermark Gemini...');

    // Detect media dimensions and Gemini watermark position
    if (isVideoMode) {
      const vid = document.createElement('video');
      vid.src = url;
      vid.muted = true;
      await new Promise(r => { vid.onloadedmetadata = r; });
      mediaNatW = vid.videoWidth || 1280;
      mediaNatH = vid.videoHeight || 720;

      try {
        const fc = document.createElement('canvas');
        fc.width = mediaNatW; fc.height = mediaNatH;
        vid.currentTime = 0;
        await new Promise(r => { vid.onseeked = r; });
        fc.getContext('2d').drawImage(vid, 0, 0);
        const engine = await window.GeminiWatermarkRemover.createWatermarkEngine();
        const probe = await engine.removeWatermarkFromImage(fc);
        const m = probe?.meta || probe;
        if (m && m.width > 0 && m.x != null) {
          geminiDetectedRect = { x: m.x, y: m.y, w: m.width, h: m.height };
        } else {
          geminiDetectedRect = getDefaultGeminiRect(mediaNatW, mediaNatH);
        }
      } catch (_) {
        geminiDetectedRect = getDefaultGeminiRect(mediaNatW, mediaNatH);
      }
    } else {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res; img.onerror = rej;
        img.src = url;
      });
      mediaNatW = img.naturalWidth || img.width;
      mediaNatH = img.naturalHeight || img.height;

      try {
        const res = await window.GeminiWatermarkRemover.removeWatermarkFromImage(img);
        const m = res?.meta || res;
        if (m && m.width > 0 && m.x != null) {
          geminiDetectedRect = { x: m.x, y: m.y, w: m.width, h: m.height };
        } else {
          geminiDetectedRect = getDefaultGeminiRect(mediaNatW, mediaNatH);
        }
      } catch (_) {
        geminiDetectedRect = getDefaultGeminiRect(mediaNatW, mediaNatH);
      }
    }

    if (logoImg) {
      snapToGemini();
    } else {
      setStatus('idle', `${file.name} sẵn sàng · Hãy chọn ảnh logo`);
    }
    updateApplyBtn();
  }

  mediaDropEl.addEventListener('click', e => {
    if (e.target.tagName === 'INPUT') return;
    if (btnRemoveLogo && (e.target === btnRemoveLogo || btnRemoveLogo.contains(e.target))) return;
    mediaInput.click();
  });
  mediaInput.addEventListener('click', e => e.stopPropagation());
  mediaDropEl.addEventListener('dragover',  e => { e.preventDefault(); mediaDropEl.classList.add('drag-over'); });
  mediaDropEl.addEventListener('dragleave', () => mediaDropEl.classList.remove('drag-over'));
  mediaDropEl.addEventListener('drop', e => {
    e.preventDefault();
    mediaDropEl.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => isVideoFile(f) || isImageFile(f));
    files.forEach(f => { if (f.path) f._sourcePath = f.path; });
    if (files.length) applyMediaFiles(files);
  });
  mediaInput.addEventListener('change', () => {
    const files = [...mediaInput.files].filter(f => isVideoFile(f) || isImageFile(f));
    files.forEach(f => { if (f.path) f._sourcePath = f.path; });
    if (files.length) applyMediaFiles(files);
    mediaInput.value = '';
  });

  window.addEventListener('paste-image-logo', e => {
    const file = e.detail;
    if (!mediaFile && !mediaFiles.length) {
      applyMediaFiles([file]);
      setStatus('idle', '📋 Đã dán ảnh từ Clipboard làm file gốc');
    } else if (!logoImg) {
      readDataURL(file).then(u => applyLogo(u, file.name));
      setStatus('idle', '🏷️ Đã dán ảnh từ Clipboard làm Logo thương hiệu');
    } else {
      applyMediaFiles([file]);
      setStatus('idle', '📋 Đã dán ảnh mới từ Clipboard');
    }
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

      try { localStorage.setItem('gemini_logo_tab_logo', JSON.stringify({ dataUrl, name })); } catch (_) {}

      if (mediaFile && mediaNatW && mediaNatH) {
        snapToGemini();
      }
      updateApplyBtn();
    };
    img.src = dataUrl;
  }

  logoUploader.addEventListener('click', e => {
    if (e.target.tagName === 'INPUT') return;
    if (btnRemoveLogo && (e.target === btnRemoveLogo || btnRemoveLogo.contains(e.target))) return;
    logoFileInput.click();
  });
  logoFileInput.addEventListener('click', e => e.stopPropagation());
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
    customLogoRect = null;
    if (logoDragBox) logoDragBox.classList.add('hidden');
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
    if (customLogoRect && logoImg) {
      const aspect = (logoImg.img.naturalWidth || 1) / (logoImg.img.naturalHeight || 1);
      const baseRef = geminiDetectedRect ? geminiDetectedRect.w : Math.round(Math.min(mediaNatW, mediaNatH) * 0.08);
      const newW = Math.round(baseRef * (logoScale / 100));
      const newH = Math.round(newW / aspect);
      // Keep center position
      const cx = customLogoRect.x + customLogoRect.w / 2;
      const cy = customLogoRect.y + customLogoRect.h / 2;
      customLogoRect.w = newW;
      customLogoRect.h = newH;
      customLogoRect.x = Math.max(0, Math.min(mediaNatW - newW, Math.round(cx - newW / 2)));
      customLogoRect.y = Math.max(0, Math.min(mediaNatH - newH, Math.round(cy - newH / 2)));
      updateDragBoxUI();
    }
  });

  rngOpacity.addEventListener('input', () => {
    logoOpacity = parseInt(rngOpacity.value, 10);
    valOpacity.textContent = logoOpacity + '%';
    if (logoDragBox) logoDragBox.style.opacity = logoOpacity / 100;
  });

  // ── Snap button & 9-position grid ──────────────────────────────────────────
  btnSnapGemini.addEventListener('click', () => {
    snapToGemini();
  });

  posGrid.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      posGrid.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      snapToGrid(btn.dataset.pos);
    });
  });

  // ── Show preview in after panel ───────────────────────────────────────────
  function showAfterPreview(blob, isVideo) {
    const url = URL.createObjectURL(blob);
    afterEmpty.classList.add('hidden');
    if (afterEmpty2) afterEmpty2.classList.add('hidden');

    if (isVideo) {
      [afterImg, afterImg2].forEach(img => {
        if (img) { img.src = ''; img.classList.remove('loaded'); img.classList.add('hidden'); }
      });
      [afterVideo, afterVideo2].forEach(v => {
        if (v) {
          v.src = url;
          v.classList.remove('hidden');
          v.classList.add('active');
          v.load();
          v.currentTime = 0;
          v.play().catch(() => {});
        }
      });
    } else {
      [afterVideo, afterVideo2].forEach(v => {
        if (v) { v.src = ''; v.classList.remove('active'); v.classList.add('hidden'); }
      });
      [afterImg, afterImg2].forEach(img => {
        if (img) {
          img.src = url;
          img.classList.remove('hidden');
          img.classList.add('loaded');
        }
      });
    }
    window.dispatchEvent(new CustomEvent('preview-updated'));
  }

  // ── Compute logo rect for any media file ──────────────────────────────────
  async function computeLogoRectForFile(file) {
    const isVid = isVideoFile(file);
    let natW = 1280, natH = 720;
    let geminiRect = null;

    if (isVid) {
      const url = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.src = url;
      vid.muted = true;
      await new Promise(r => { vid.onloadedmetadata = r; });
      natW = vid.videoWidth || 1280;
      natH = vid.videoHeight || 720;
      try {
        const fc = document.createElement('canvas');
        fc.width = natW; fc.height = natH;
        vid.currentTime = 0;
        await new Promise(r => { vid.onseeked = r; });
        fc.getContext('2d').drawImage(vid, 0, 0);
        const engine = await window.GeminiWatermarkRemover.createWatermarkEngine();
        const probe = await engine.removeWatermarkFromImage(fc);
        const m = probe?.meta || probe;
        if (m && m.width > 0 && m.x != null) {
          geminiRect = { x: m.x, y: m.y, w: m.width, h: m.height };
        }
      } catch (_) {}
      URL.revokeObjectURL(url);
    } else {
      const dataUrl = await readDataURL(file);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
      natW = img.naturalWidth || img.width;
      natH = img.naturalHeight || img.height;
      try {
        const res = await window.GeminiWatermarkRemover.removeWatermarkFromImage(img);
        const m = res?.meta || res;
        if (m && m.width > 0 && m.x != null) {
          geminiRect = { x: m.x, y: m.y, w: m.width, h: m.height };
        }
      } catch (_) {}
    }

    if (!geminiRect) {
      geminiRect = getDefaultGeminiRect(natW, natH);
    }

    const aspect = (logoImg?.img?.naturalWidth || 1) / (logoImg?.img?.naturalHeight || 1);
    let rect = null;

    if (logoPos === 'gemini') {
      let drawW = Math.round(geminiRect.w * (logoScale / 100));
      let drawH = Math.round(drawW / aspect);
      if (drawH > drawW * 2) { drawH = drawW * 2; drawW = Math.round(drawH * aspect); }
      let drawX = Math.round(geminiRect.x + geminiRect.w / 2 - drawW / 2);
      let drawY = Math.round(geminiRect.y + geminiRect.h / 2 - drawH / 2);
      rect = { x: Math.max(0, drawX), y: Math.max(0, drawY), w: drawW, h: drawH };
    } else if (logoPos === 'custom' && customLogoRect && mediaNatW && mediaNatH) {
      const relX = customLogoRect.x / mediaNatW;
      const relY = customLogoRect.y / mediaNatH;
      const relW = customLogoRect.w / mediaNatW;
      const relH = customLogoRect.h / mediaNatH;
      rect = {
        x: Math.round(relX * natW),
        y: Math.round(relY * natH),
        w: Math.max(16, Math.round(relW * natW)),
        h: Math.max(16, Math.round(relH * natH))
      };
    } else {
      const baseRef = Math.round(Math.min(natW, natH) * 0.12);
      let drawW = Math.round(baseRef * (logoScale / 100));
      let drawH = Math.round(drawW / aspect);
      if (drawH > drawW) { drawH = drawW; drawW = Math.round(drawH * aspect); }
      const margin = Math.round(Math.min(natW, natH) * 0.04);
      const positions = {
        tl: { x: margin,                  y: margin },
        tc: { x: (natW - drawW) / 2,     y: margin },
        tr: { x: natW - drawW - margin,  y: margin },
        ml: { x: margin,                  y: (natH - drawH) / 2 },
        mc: { x: (natW - drawW) / 2,     y: (natH - drawH) / 2 },
        mr: { x: natW - drawW - margin,  y: (natH - drawH) / 2 },
        bl: { x: margin,                  y: natH - drawH - margin },
        bc: { x: (natW - drawW) / 2,     y: natH - drawH - margin },
        br: { x: natW - drawW - margin,  y: natH - drawH - margin },
      };
      const pt = positions[logoPos] || positions.br;
      rect = { x: Math.round(pt.x), y: Math.round(pt.y), w: drawW, h: drawH };
    }

    return rect;
  }

  // ── Apply: image ────────────────────────────────────────────────────────────
  async function applyLogoToImage(file, rect) {
    const targetFile = file || mediaFile;
    const targetRect = rect || customLogoRect;
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        if (targetRect && logoImg) {
          ctx.save();
          ctx.globalAlpha = logoOpacity / 100;
          ctx.drawImage(logoImg.img, targetRect.x, targetRect.y, targetRect.w, targetRect.h);
          ctx.restore();
        }

        const isJpeg = /\.jpe?g$/i.test(targetFile.name) || targetFile.type === 'image/jpeg';
        canvas.toBlob(blob => blob ? res(blob) : rej(new Error('Xuất ảnh thất bại')),
          isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? 0.95 : undefined);
      };
      img.onerror = rej;
      readDataURL(targetFile).then(u => { img.src = u; });
    });
  }

  // ── Apply: video via FFmpeg ─────────────────────────────────────────────────
  async function applyLogoToVideoFFmpeg(file, rect) {
    const targetFile = file || mediaFile;
    const targetRect = rect || customLogoRect;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width  = logoImg.img.naturalWidth;
    tempCanvas.height = logoImg.img.naturalHeight;
    tempCanvas.getContext('2d').drawImage(logoImg.img, 0, 0);
    const logoPngBlob = await new Promise(r => tempCanvas.toBlob(r, 'image/png'));
    const logoBuffer  = await logoPngBlob.arrayBuffer();

    const srcPath = targetFile._sourcePath || targetFile.path || null;
    const srcBuf = srcPath ? new ArrayBuffer(0) : await targetFile.arrayBuffer();

    const result = await window.electronAPI.overlayLogoVideo({
      sourcePath: srcPath,
      buffer: srcBuf,
      logoBuffer,
      logoX: targetRect.x,
      logoY: targetRect.y,
      logoW: targetRect.w,
      logoH: targetRect.h,
      opacity: logoOpacity / 100
    });

    if (!result.success) throw new Error(result.error || 'FFmpeg overlay thất bại');
    return new Blob([result.buffer], { type: 'video/mp4' });
  }

  // ── Fallback: Web VideoCanvas ───────────────────────────────────────────────
  async function applyLogoToVideoCanvas(file, rect) {
    const targetFile = file || mediaFile;
    const targetRect = rect || customLogoRect;
    const srcUrl = URL.createObjectURL(targetFile);
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

      ctx.save();
      ctx.globalAlpha = logoOpacity / 100;
      ctx.drawImage(logoImg.img, targetRect.x, targetRect.y, targetRect.w, targetRect.h);
      ctx.restore();

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

  // ── Process single file item ────────────────────────────────────────────────
  async function processOneLogoItem(file) {
    const isVid = isVideoFile(file);
    const rect = (file === mediaFile && customLogoRect)
      ? customLogoRect
      : await computeLogoRectForFile(file);

    let blob;
    if (isVid) {
      if (isElectron && window.electronAPI.overlayLogoVideo) {
        blob = await applyLogoToVideoFFmpeg(file, rect);
      } else {
        blob = await applyLogoToVideoCanvas(file, rect);
      }
    } else {
      blob = await applyLogoToImage(file, rect);
    }
    return { blob, isVideo: isVid };
  }

  // ── Single file processing ──────────────────────────────────────────────────
  async function processLogoSingle() {
    if (!mediaFile || !logoImg || !customLogoRect) return;

    btnApply.disabled = true;
    btnSave.disabled  = true;
    resultBlob = null;
    videoProgress.classList.remove('hidden');
    logoVpFill.style.width = '30%';
    logoVpFill.style.animation = 'pulse-bar 1.2s ease infinite';
    logoVpFrames.textContent = 'Đang xử lý...';
    logoVpTime.textContent   = 'Ước tính: vài giây';
    setStatus('busy', 'Đang chèn logo...');

    try {
      const { blob, isVideo } = await processOneLogoItem(mediaFile);
      resultBlob = blob;
      showAfterPreview(blob, isVideo);

      videoProgress.classList.add('hidden');
      setStatus('ok', '✓ Đã chèn logo thành công! Xem kết quả ở cột SAU');
      btnSave.disabled  = false;
      btnApply.disabled = false;
    } catch (err) {
      videoProgress.classList.add('hidden');
      setStatus('err', 'Lỗi: ' + err.message);
      console.error(err);
      btnApply.disabled = false;
    }
  }

  // ── Batch processing ────────────────────────────────────────────────────────
  async function processLogoBatch() {
    btnApply.disabled = true;
    btnSave.disabled  = true;
    btnLogoSaveAll.classList.add('hidden');
    processedLogoList = [];
    videoProgress.classList.remove('hidden');
    logoVpFill.style.width = '20%';
    logoVpFill.style.animation = 'pulse-bar 1.2s ease infinite';
    setLogoQueueProgress(0, mediaFiles.length);

    for (let i = 0; i < mediaFiles.length; i++) {
      const f = mediaFiles[i];
      const qs = document.getElementById(`lqs-${i}`);
      if (qs) qs.textContent = '⏳';
      document.querySelectorAll('#logo-queue-list li').forEach(el => el.classList.remove('active'));
      const activeLi = document.getElementById(`lqi-${i}`);
      if (activeLi) activeLi.classList.add('active');

      currentMediaIdx = i;
      setLogoQueueProgress(i, mediaFiles.length);
      setStatus('busy', `Đang chèn logo ${i + 1}/${mediaFiles.length}: ${f.name}`);
      logoVpFrames.textContent = `${i + 1} / ${mediaFiles.length} file`;
      logoVpTime.textContent   = f.name;

      try {
        const { blob, isVideo } = await processOneLogoItem(f);
        processedLogoList.push({
          name: cleanName(f.name) + '_logo',
          blob,
          isVideo,
          sourcePath: f._sourcePath || null,
          origName: f.name
        });
        resultBlob = blob;
        showAfterPreview(blob, isVideo);
        if (qs) qs.textContent = '✓';
      } catch (err) {
        console.error('Lỗi file:', f.name, err);
        if (qs) qs.textContent = '✕';
      }
    }

    setLogoQueueProgress(mediaFiles.length, mediaFiles.length);
    videoProgress.classList.add('hidden');
    setStatus('ok', `✓ Hoàn tất chèn logo ${processedLogoList.length}/${mediaFiles.length} file`);
    btnApply.disabled = false;
    btnSave.disabled = processedLogoList.length === 0;
    if (processedLogoList.length > 0) {
      btnLogoSaveAll.classList.remove('hidden');
      btnLogoSaveAll.disabled = false;
    }
  }

  // ── Main apply handler ──────────────────────────────────────────────────────
  btnApply.addEventListener('click', async () => {
    if ((!mediaFile && !mediaFiles.length) || !logoImg) return;
    if (mediaFiles.length > 1) {
      await processLogoBatch();
    } else {
      await processLogoSingle();
    }
  });

  // ── Save single result ──────────────────────────────────────────────────────
  btnSave.addEventListener('click', async () => {
    if (!resultBlob) return;
    const currentF = mediaFiles[currentMediaIdx] || mediaFile;
    const ext  = isVideoFile(currentF) ? 'mp4' : /\.jpe?g$/i.test(currentF.name) ? 'jpg' : 'png';
    const name = currentF.name.replace(/\.[^.]+$/, '') + '_logo.' + ext;

    if (isElectron) {
      const r = await window.electronAPI.saveFile({ defaultName: name, mimeType: resultBlob.type });
      if (!r.canceled && r.filePath) {
        const buf = await resultBlob.arrayBuffer();
        await window.electronAPI.writeFile(r.filePath, buf);
        setStatus('ok', '✓ Đã lưu: ' + r.filePath.split(/[\\/]/).pop());
      }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(resultBlob);
      a.download = name;
      a.click();
    }
  });

  // ── Save all results (batch) ────────────────────────────────────────────────
  btnLogoSaveAll.addEventListener('click', async () => {
    if (!processedLogoList.length) return;
    btnLogoSaveAll.disabled = true;
    btnLogoSaveAll.textContent = 'Đang lưu...';
    try {
      if (isElectron) {
        const res = await window.electronAPI.selectFolder();
        if (!res.canceled && res.filePaths.length > 0) {
          const folder = res.filePaths[0];
          let saved = 0;
          for (const item of processedLogoList) {
            const ext = item.isVideo ? 'mp4' : (item.blob.type === 'image/jpeg' ? 'jpg' : 'png');
            const filePath = `${folder}\\${item.name}.${ext}`.replace(/\\\\/g, '\\');
            const buf = await item.blob.arrayBuffer();
            await window.electronAPI.writeFile(filePath, buf);
            saved++;
          }
          setStatus('ok', `✓ Đã lưu ${saved} file vào thư mục`);
          window.electronAPI.showInFolder(folder);
        }
      } else {
        for (const item of processedLogoList) {
          const ext = item.isVideo ? 'mp4' : (item.blob.type === 'image/jpeg' ? 'jpg' : 'png');
          const url = URL.createObjectURL(item.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${item.name}.${ext}`;
          a.click();
          await new Promise(r => setTimeout(r, 300));
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) {
      setStatus('err', 'Lỗi lưu: ' + e.message);
    }
    btnLogoSaveAll.disabled = false;
    btnLogoSaveAll.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/></svg> Tải tất cả (Thư mục)`;
  });

  // ── Reset ────────────────────────────────────────────────────────────────────
  btnReset.addEventListener('click', () => {
    mediaFile = null; mediaFiles = []; currentMediaIdx = 0; processedLogoList = []; resultBlob = null; customLogoRect = null;
    lmIdle.classList.remove('hidden');
    lmLoaded.classList.add('hidden');
    lmName.textContent = '';
    mediaInput.value = '';
    logoQueue.classList.add('hidden');
    btnLogoSaveAll.classList.add('hidden');
    if (logoDragBox) logoDragBox.classList.add('hidden');
    [beforeImg, afterImg, beforeImg2, afterImg2].forEach(img => {
      if (img) { img.removeAttribute('src'); img.classList.remove('loaded'); img.classList.add('hidden'); }
    });
    [beforeVideo, afterVideo, beforeVideo2, afterVideo2].forEach(v => {
      if (v) { v.src = ''; v.classList.remove('active'); v.classList.add('hidden'); }
    });
    [beforeEmpty, afterEmpty, beforeEmpty2, afterEmpty2].forEach(el => {
      if (el) el.classList.remove('hidden');
    });
    videoProgress.classList.add('hidden');
    setStatus('idle', 'Chọn ảnh/video và logo để bắt đầu');
    btnApply.disabled = true;
    btnSave.disabled  = true;
  });

  // Listen for tab switch to show/hide drag box
  window.addEventListener('tab-switched', e => {
    if (e.detail === 'logo') {
      updateDragBoxUI();
    } else {
      if (logoDragBox) logoDragBox.classList.add('hidden');
    }
  });

})();

// ── Tab 3: Media & Document Converter Module (Independent) ────────────────────
(() => {
  const isElectron = typeof window.electronAPI !== 'undefined';

  // DOM elements
  const dropzone      = document.getElementById('convert-dropzone');
  const fileInput     = document.getElementById('convert-file-input');
  const czIdle        = document.getElementById('cz-idle');
  const czLoaded      = document.getElementById('cz-loaded');
  const czName        = document.getElementById('cz-name');
  const btnRun        = document.getElementById('btn-convert-run');
  const btnSaveAll    = document.getElementById('btn-convert-save-all');
  const btnReset      = document.getElementById('btn-convert-reset');
  const statusDot     = document.getElementById('conv-status-dot');
  const statusMsg     = document.getElementById('conv-status-msg');
  const batchProgress = document.getElementById('conv-batch-progress');
  const progFill      = document.getElementById('conv-prog-fill');
  const progLabel     = document.getElementById('conv-prog-label');
  const progPercent   = document.getElementById('conv-prog-percent');

  // Metrics
  const metricTotal   = document.getElementById('metric-total');
  const metricDone    = document.getElementById('metric-done');
  const metricPending = document.getElementById('metric-pending');

  // Dashboard table
  const emptyState    = document.getElementById('conv-empty-state');
  const queueItemsEl  = document.getElementById('conv-queue-items');

  // Category filters
  const catPills      = document.querySelectorAll('.cat-pill');
  const chipGroups    = {
    doc:   document.getElementById('grp-doc'),
    video: document.getElementById('grp-video'),
    audio: document.getElementById('grp-audio'),
    image: document.getElementById('grp-image')
  };

  // Format chips & options
  const formatChips   = document.querySelectorAll('.format-chip');
  const optBlocks     = {
    video: document.getElementById('opt-video'),
    gif:   document.getElementById('opt-gif'),
    audio: document.getElementById('opt-audio'),
    image: document.getElementById('opt-image'),
    doc:   document.getElementById('opt-doc')
  };

  const rngImgQuality = document.getElementById('rng-img-quality');
  const valImgQuality = document.getElementById('val-img-quality');

  // State
  let convertQueue = []; // [{ id, file, name, size, type, ext, targetFormat, status: 'pending'|'processing'|'done'|'error', errorMsg, resultBlob, outputPath }]
  let activeFormat = 'mp4';
  let activeType   = 'video';
  let isConverting = false;

  function setStatus(type, msg) {
    if (!statusDot || !statusMsg) return;
    statusDot.className = 'status-dot';
    if (type === 'ok')   statusDot.classList.add('ok');
    if (type === 'busy') statusDot.classList.add('busy');
    if (type === 'err')  statusDot.classList.add('err');
    statusMsg.textContent = msg;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFileCategory(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['docx', 'doc'].includes(ext)) return 'doc';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'flv'].includes(ext)) return 'video';
    if (['png', 'jpg', 'jpeg', 'webp', 'ico', 'bmp', 'gif', 'svg'].includes(ext)) return 'image';
    if (['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'wma'].includes(ext)) return 'audio';
    return 'other';
  }

  function guessMimeType(fmt) {
    const map = {
      pdf: 'application/pdf',
      mp4: 'video/mp4',
      webm: 'video/webm',
      gif: 'image/gif',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      ico: 'image/x-icon'
    };
    return map[fmt.toLowerCase()] || 'application/octet-stream';
  }

  // ── Format Selection ────────────────────────────────────────────────────────
  function setTargetFormat(format, type) {
    activeFormat = format.toLowerCase();
    activeType = type;

    formatChips.forEach(c => {
      c.classList.toggle('active', c.dataset.format === activeFormat);
    });

    // Hide all option blocks
    Object.values(optBlocks).forEach(b => b?.classList.add('hidden'));

    if (activeFormat === 'mp4' || activeFormat === 'webm') {
      optBlocks.video?.classList.remove('hidden');
    } else if (activeFormat === 'gif') {
      optBlocks.gif?.classList.remove('hidden');
    } else if (['mp3', 'wav', 'aac'].includes(activeFormat)) {
      optBlocks.audio?.classList.remove('hidden');
    } else if (['png', 'jpg', 'webp', 'ico'].includes(activeFormat)) {
      optBlocks.image?.classList.remove('hidden');
    } else if (activeFormat === 'pdf') {
      optBlocks.doc?.classList.remove('hidden');
    }

    // Update target format for pending items in queue
    convertQueue.forEach(item => {
      if (item.status === 'pending') {
        item.targetFormat = activeFormat;
      }
    });

    renderQueueTable();
  }

  formatChips.forEach(chip => {
    chip.addEventListener('click', () => {
      setTargetFormat(chip.dataset.format, chip.dataset.type);
    });
  });

  // Category filter buttons
  catPills.forEach(pill => {
    pill.addEventListener('click', () => {
      catPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const cat = pill.dataset.cat;

      if (cat === 'all') {
        Object.values(chipGroups).forEach(g => g && (g.style.display = 'flex'));
      } else if (cat === 'media') {
        chipGroups.doc && (chipGroups.doc.style.display = 'none');
        chipGroups.image && (chipGroups.image.style.display = 'none');
        chipGroups.video && (chipGroups.video.style.display = 'flex');
        chipGroups.audio && (chipGroups.audio.style.display = 'flex');
        if (activeType !== 'video' && activeType !== 'audio') setTargetFormat('mp4', 'video');
      } else if (cat === 'doc') {
        chipGroups.video && (chipGroups.video.style.display = 'none');
        chipGroups.audio && (chipGroups.audio.style.display = 'none');
        chipGroups.image && (chipGroups.image.style.display = 'none');
        chipGroups.doc && (chipGroups.doc.style.display = 'flex');
        setTargetFormat('pdf', 'doc');
      } else if (cat === 'image') {
        chipGroups.doc && (chipGroups.doc.style.display = 'none');
        chipGroups.video && (chipGroups.video.style.display = 'none');
        chipGroups.audio && (chipGroups.audio.style.display = 'none');
        chipGroups.image && (chipGroups.image.style.display = 'flex');
        setTargetFormat('webp', 'image');
      }
    });
  });

  // Image quality range
  if (rngImgQuality && valImgQuality) {
    rngImgQuality.addEventListener('input', () => {
      valImgQuality.textContent = `${rngImgQuality.value}%`;
    });
  }

  // ── File Ingestion ──────────────────────────────────────────────────────────
  function addFilesToQueue(files) {
    if (!files || !files.length) return;
    let hasDoc = false;
    let hasVideo = false;
    let hasAudio = false;
    let hasImage = false;

    Array.from(files).forEach(f => {
      // Prevent duplicates in queue
      if (convertQueue.some(item => item.name === f.name && item.size === f.size)) return;

      const cat = getFileCategory(f.name);
      if (cat === 'doc')   hasDoc = true;
      if (cat === 'video') hasVideo = true;
      if (cat === 'audio') hasAudio = true;
      if (cat === 'image') hasImage = true;

      // Smart target format per file
      let targetFmt = activeFormat;
      if (cat === 'doc') targetFmt = 'pdf';
      else if (cat === 'video' && activeType === 'doc') targetFmt = 'mp4';
      else if (cat === 'image' && activeType === 'doc') targetFmt = 'webp';

      convertQueue.push({
        id: 'cv_' + Math.random().toString(36).slice(2, 9),
        file: f,
        name: f.name,
        size: f.size,
        ext: f.name.split('.').pop().toLowerCase(),
        category: cat,
        targetFormat: targetFmt,
        status: 'pending',
        errorMsg: '',
        resultBlob: null
      });
    });

    // Auto-select smart format if category demands it
    if (hasDoc && !hasVideo && !hasImage && !hasAudio) {
      setTargetFormat('pdf', 'doc');
      const docPill = document.getElementById('cat-doc');
      if (docPill) docPill.click();
    } else if (hasVideo && !hasDoc) {
      if (activeType === 'doc') setTargetFormat('mp4', 'video');
    }

    updateDropzoneUI();
    renderQueueTable();
    updateMetrics();

    btnRun.disabled = convertQueue.length === 0;
    setStatus('ok', `Đã thêm ${convertQueue.length} file vào hàng đợi`);
  }

  function updateDropzoneUI() {
    if (convertQueue.length > 0) {
      czIdle.classList.add('hidden');
      czLoaded.classList.remove('hidden');
      czName.textContent = `${convertQueue.length} file sẵn sàng`;
    } else {
      czIdle.classList.remove('hidden');
      czLoaded.classList.add('hidden');
      czName.textContent = '';
    }
  }

  function updateMetrics() {
    if (!metricTotal || !metricDone || !metricPending) return;
    const total = convertQueue.length;
    const done = convertQueue.filter(i => i.status === 'done').length;
    const pending = convertQueue.filter(i => i.status === 'pending' || i.status === 'processing').length;

    metricTotal.textContent = String(total);
    metricDone.textContent = String(done);
    metricPending.textContent = String(pending);
  }

  // ── Render Queue Table / Cards ──────────────────────────────────────────────
  function renderQueueTable() {
    if (!queueItemsEl || !emptyState) return;

    if (convertQueue.length === 0) {
      emptyState.classList.remove('hidden');
      queueItemsEl.classList.add('hidden');
      queueItemsEl.innerHTML = '';
      return;
    }

    emptyState.classList.add('hidden');
    queueItemsEl.classList.remove('hidden');
    queueItemsEl.innerHTML = '';

    convertQueue.forEach(item => {
      const card = document.createElement('div');
      card.className = 'conv-row-card';

      // Badge class
      const badgeClass = item.category === 'doc' ? 'badge-doc' :
                         item.category === 'video' ? 'badge-video' :
                         item.category === 'audio' ? 'badge-audio' : 'badge-image';

      // Status badge text
      let statusHtml = '<span class="conv-status-tag pending">Chờ xử lý</span>';
      if (item.status === 'processing') {
        statusHtml = '<span class="conv-status-tag processing">Đang chuyển...</span>';
      } else if (item.status === 'done') {
        statusHtml = '<span class="conv-status-tag done">✓ Hoàn tất</span>';
      } else if (item.status === 'error') {
        statusHtml = `<span class="conv-status-tag error" title="${item.errorMsg || 'Lỗi'}">✕ Lỗi</span>`;
      }

      // Action button
      let actionBtnHtml = '';
      if (item.status === 'done' && item.resultBlob) {
        actionBtnHtml = `<button class="btn-row-action btn-save-item" data-id="${item.id}">Lưu file</button>`;
      } else if (item.status === 'pending') {
        actionBtnHtml = `<button class="btn-row-action btn-del-item" data-id="${item.id}" title="Xóa khỏi hàng đợi">✕</button>`;
      }

      card.innerHTML = `
        <div class="conv-row-left">
          <div class="conv-type-badge ${badgeClass}">
            ${item.ext.toUpperCase()}
          </div>
          <div class="conv-file-meta">
            <span class="conv-filename" title="${item.name}">${item.name}</span>
            <div class="conv-submeta">
              <span>${formatBytes(item.size)}</span>
              <span class="conv-arrow">→</span>
              <span class="conv-target-pill">${item.targetFormat.toUpperCase()}</span>
            </div>
          </div>
        </div>
        <div class="conv-row-right">
          ${statusHtml}
          ${actionBtnHtml}
        </div>
      `;

      // Event listener for item save
      const btnSaveItem = card.querySelector('.btn-save-item');
      if (btnSaveItem) {
        btnSaveItem.addEventListener('click', () => saveSingleItem(item));
      }

      // Event listener for item delete
      const btnDelItem = card.querySelector('.btn-del-item');
      if (btnDelItem) {
        btnDelItem.addEventListener('click', () => {
          convertQueue = convertQueue.filter(q => q.id !== item.id);
          updateDropzoneUI();
          renderQueueTable();
          updateMetrics();
          btnRun.disabled = convertQueue.length === 0;
        });
      }

      queueItemsEl.appendChild(card);
    });
  }

  // ── Drag & Drop & Click Handling ────────────────────────────────────────────
  if (dropzone) {
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        const files = Array.from(e.dataTransfer.files);
        files.forEach(f => { if (f.path) f._sourcePath = f.path; });
        addFilesToQueue(files);
      }
    });

    dropzone.addEventListener('click', async (e) => {
      if (e.target.tagName === 'INPUT') return;
      // If native Electron, show native multi-file dialog
      if (isElectron) {
        e.preventDefault();
        const res = await window.electronAPI.selectConvertFiles();
        if (!res.canceled && res.filePaths && res.filePaths.length) {
          const files = await Promise.all(res.filePaths.map(async p => {
            const url = `file://${p.replace(/\\/g, '/')}`;
            const resp = await fetch(url);
            const blob = await resp.blob();
            const name = p.split(/[\\/]/).pop();
            const f = new File([blob], name, { type: blob.type });
            f._sourcePath = p;
            return f;
          }));
          addFilesToQueue(files);
        }
      } else if (fileInput) {
        fileInput.click();
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('click', e => e.stopPropagation());
    fileInput.addEventListener('change', e => {
      if (e.target.files && e.target.files.length) {
        addFilesToQueue(e.target.files);
        fileInput.value = '';
      }
    });
  }

  // Listen for paste event in convert tab
  window.addEventListener('paste-file-convert', e => {
    if (e.detail) addFilesToQueue([e.detail]);
  });

  // ── Conversion Execution ────────────────────────────────────────────────────
  if (btnRun) {
    btnRun.addEventListener('click', async () => {
      if (isConverting || !convertQueue.length) return;

      isConverting = true;
      btnRun.disabled = true;
      btnReset.disabled = true;
      btnSaveAll.classList.add('hidden');
      batchProgress.classList.remove('hidden');
      setStatus('busy', 'Đang thực hiện chuyển đổi...');

      let successCount = 0;
      for (let i = 0; i < convertQueue.length; i++) {
        const item = convertQueue[i];
        if (item.status === 'done') {
          successCount++;
          continue;
        }

        item.status = 'processing';
        renderQueueTable();
        updateMetrics();

        const pct = Math.round((i / convertQueue.length) * 100);
        progFill.style.width = `${pct}%`;
        progPercent.textContent = `${pct}%`;
        progLabel.textContent = `(${i + 1}/${convertQueue.length}) Đang chuyển đổi: ${item.name}...`;

        try {
          const buf = await item.file.arrayBuffer();
          const ext = item.file.name.split('.').pop().toLowerCase();

          if (item.targetFormat === 'pdf' && (ext === 'docx' || ext === 'doc')) {
            // Word to PDF via native Word COM
            const res = await window.electronAPI.convertDocxToPdf({
              sourcePath: item.file._sourcePath || null,
              buffer: buf,
              originalName: item.file.name
            });
            if (!res.success) throw new Error(res.error || 'Lỗi chuyển đổi Word sang PDF');
            item.resultBlob = new Blob([res.buffer], { type: 'application/pdf' });
          } else {
            // Media conversion via FFmpeg
            const opts = {};
            if (item.targetFormat === 'mp4' || item.targetFormat === 'webm') {
              opts.resolution = document.getElementById('sel-video-res')?.value || '';
              opts.fps = document.getElementById('sel-video-fps')?.value || '';
              opts.crf = document.getElementById('sel-video-crf')?.value || '22';
            } else if (item.targetFormat === 'gif') {
              opts.fps = Number(document.getElementById('sel-gif-fps')?.value || 15);
              opts.scaleWidth = Number(document.getElementById('sel-gif-scale')?.value || 480);
            } else if (['mp3', 'wav', 'aac'].includes(item.targetFormat)) {
              opts.audioBitrate = document.getElementById('sel-audio-bitrate')?.value || '192k';
            } else if (['jpg', 'jpeg', 'webp'].includes(item.targetFormat)) {
              opts.quality = Number(rngImgQuality?.value || 85);
            }

            const res = await window.electronAPI.convertMedia({
              sourcePath: item.file._sourcePath || null,
              buffer: buf,
              targetFormat: item.targetFormat,
              options: opts
            });

            if (!res.success) throw new Error(res.error || 'Lỗi chuyển đổi media');
            item.resultBlob = new Blob([res.buffer], { type: guessMimeType(item.targetFormat) });
          }

          item.status = 'done';
          successCount++;
        } catch (err) {
          console.error(err);
          item.status = 'error';
          item.errorMsg = err.message || 'Lỗi chuyển đổi';
        }

        renderQueueTable();
        updateMetrics();
      }

      progFill.style.width = '100%';
      progPercent.textContent = '100%';
      progLabel.textContent = 'Hoàn tất toàn bộ hàng đợi!';
      setStatus('ok', `✓ Đã chuyển đổi thành công ${successCount}/${convertQueue.length} file`);

      isConverting = false;
      btnRun.disabled = false;
      btnReset.disabled = false;
      if (successCount > 0) btnSaveAll.classList.remove('hidden');
    });
  }

  // ── Save Individual File ────────────────────────────────────────────────────
  async function saveSingleItem(item) {
    if (!item.resultBlob) return;
    const base = item.name.replace(/\.[^.]+$/, '');
    const outName = `${base}.${item.targetFormat}`;

    if (isElectron) {
      const r = await window.electronAPI.saveFile({
        defaultName: outName,
        mimeType: item.resultBlob.type
      });
      if (!r.canceled && r.filePath) {
        const buf = await item.resultBlob.arrayBuffer();
        await window.electronAPI.writeFile(r.filePath, buf);
        setStatus('ok', '✓ Đã lưu: ' + r.filePath.split(/[\\/]/).pop());
        window.electronAPI.showInFolder(r.filePath);
      }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(item.resultBlob);
      a.download = outName;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  // ── Save All Completed Files to Folder ──────────────────────────────────────
  if (btnSaveAll) {
    btnSaveAll.addEventListener('click', async () => {
      const completed = convertQueue.filter(i => i.status === 'done' && i.resultBlob);
      if (!completed.length) return;

      btnSaveAll.disabled = true;
      btnSaveAll.textContent = 'Đang lưu...';

      try {
        if (isElectron) {
          const res = await window.electronAPI.selectFolder();
          if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
            const folder = res.filePaths[0];
            let savedCount = 0;
            for (const item of completed) {
              const base = item.name.replace(/\.[^.]+$/, '');
              const outPath = `${folder}\\${base}.${item.targetFormat}`.replace(/\\\\/g, '\\');
              const buf = await item.resultBlob.arrayBuffer();
              await window.electronAPI.writeFile(outPath, buf);
              savedCount++;
            }
            setStatus('ok', `✓ Đã lưu ${savedCount} file vào thư mục`);
            window.electronAPI.showInFolder(folder);
          }
        } else {
          for (const item of completed) {
            const base = item.name.replace(/\.[^.]+$/, '');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(item.resultBlob);
            a.download = `${base}.${item.targetFormat}`;
            a.click();
            await new Promise(r => setTimeout(r, 250));
            URL.revokeObjectURL(a.href);
          }
        }
      } catch (err) {
        setStatus('err', 'Lỗi khi lưu thư mục: ' + err.message);
      }

      btnSaveAll.disabled = false;
      btnSaveAll.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/></svg> Tải tất cả (Thư mục)`;
    });
  }

  // ── Reset Queue ─────────────────────────────────────────────────────────────
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      convertQueue = [];
      updateDropzoneUI();
      renderQueueTable();
      updateMetrics();
      batchProgress?.classList.add('hidden');
      btnSaveAll?.classList.add('hidden');
      btnRun.disabled = true;
      setStatus('ok', 'Đã xóa toàn bộ hàng đợi');
    });
  }

})();

// ── Tab 4: Background Removal Module (Independent) ────────────────────────────
(() => {
  const isElectron = typeof window.electronAPI !== 'undefined';

  // DOM elements
  const dropzone      = document.getElementById('bg-dropzone');
  const fileInput     = document.getElementById('bg-file-input');
  const bgIdle        = document.getElementById('bg-idle');
  const bgLoaded      = document.getElementById('bg-loaded');
  const bgLoadedName  = document.getElementById('bg-loaded-name');
  const btnProcess    = document.getElementById('btn-bg-process');
  const btnSave       = document.getElementById('btn-bg-save');
  const btnSaveAll    = document.getElementById('btn-bg-save-all');
  const btnReset      = document.getElementById('btn-bg-reset');
  const statusDot     = document.getElementById('bg-status-dot');
  const statusMsg     = document.getElementById('bg-status-msg');
  const batchProgress = document.getElementById('bg-batch-progress');
  const progFill      = document.getElementById('bg-prog-fill');
  const progLabel     = document.getElementById('bg-prog-label');
  const progPercent   = document.getElementById('bg-prog-percent');

  // Queue elements
  const queueWrap     = document.getElementById('bg-queue');
  const queueList     = document.getElementById('bg-queue-list');
  const queueBar      = document.getElementById('bg-queue-progress-bar');
  const queueText     = document.getElementById('bg-queue-progress-text');

  // Color options
  const colorPills    = document.querySelectorAll('.bg-color-pill');
  const colorPicker   = document.getElementById('bg-picker-input');

  // Preview elements
  const beforeImg     = document.getElementById('before-img');
  const afterImg      = document.getElementById('after-img');
  const beforeImg2    = document.getElementById('before-img-2');
  const afterImg2     = document.getElementById('after-img-2');
  const beforeEmpty   = document.getElementById('before-empty');
  const afterEmpty    = document.getElementById('after-empty');
  const beforeEmpty2  = document.getElementById('before-empty-2');
  const afterEmpty2   = document.getElementById('after-empty-2');
  const beforeVideo   = document.getElementById('before-video');
  const afterVideo    = document.getElementById('after-video');

  // State
  let bgFiles = [];           // File list
  let currentFileIdx = 0;     // Active preview index
  let processedBgList = [];   // [{ name, file, blob, url }]
  let selectedBgColor = 'transparent';
  let isProcessing = false;

  function setStatus(type, msg) {
    if (!statusDot || !statusMsg) return;
    statusDot.className = 'status-dot';
    if (type === 'ok')   statusDot.classList.add('ok');
    if (type === 'busy') statusDot.classList.add('busy');
    if (type === 'err')  statusDot.classList.add('err');
    statusMsg.textContent = msg;
  }

  // Color pill interactions
  colorPills.forEach(pill => {
    pill.addEventListener('click', () => {
      colorPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const mode = pill.dataset.mode;
      if (mode === 'transparent') {
        selectedBgColor = 'transparent';
      } else if (mode === 'white') {
        selectedBgColor = '#ffffff';
      } else if (mode === 'blue') {
        selectedBgColor = '#2b579a';
      } else if (mode === 'custom') {
        if (colorPicker) {
          colorPicker.click();
        }
      }
    });
  });

  if (colorPicker) {
    colorPicker.addEventListener('input', (e) => {
      selectedBgColor = e.target.value;
      const customPill = document.querySelector('.bg-color-pill[data-mode="custom"]');
      if (customPill) {
        colorPills.forEach(p => p.classList.remove('active'));
        customPill.classList.add('active');
        const dot = customPill.querySelector('.color-dot');
        if (dot) dot.style.background = e.target.value;
      }
    });
  }

  // Ingestion
  function handleBgFiles(files) {
    if (!files || !files.length) return;
    const valid = Array.from(files).filter(f => f.type && f.type.startsWith('image/'));
    if (!valid.length) return;

    bgFiles = valid;
    currentFileIdx = 0;
    processedBgList = [];

    // UI state
    bgIdle.classList.add('hidden');
    bgLoaded.classList.remove('hidden');
    bgLoadedName.textContent = bgFiles.length === 1 ? bgFiles[0].name : `${bgFiles.length} ảnh đã chọn`;

    // Queue UI
    if (bgFiles.length > 1) {
      queueWrap.classList.remove('hidden');
      renderQueueList();
    } else {
      queueWrap.classList.add('hidden');
    }

    // Display first file in preview
    previewFile(bgFiles[0]);

    btnProcess.disabled = false;
    btnSave.disabled = true;
    btnSaveAll.classList.add('hidden');
    setStatus('ok', `Đã nạp ${bgFiles.length} ảnh. Sẵn sàng xóa phông!`);
  }

  function previewFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (beforeImg) {
      beforeImg.src = url;
      beforeImg.classList.remove('hidden');
      beforeImg.classList.add('loaded');
    }
    if (beforeImg2) {
      beforeImg2.src = url;
      beforeImg2.classList.remove('hidden');
      beforeImg2.classList.add('loaded');
    }
    beforeEmpty?.classList.add('hidden');
    beforeEmpty2?.classList.add('hidden');

    // Hide any video elements
    beforeVideo?.classList.add('hidden');
    afterVideo?.classList.add('hidden');

    // Reset after preview unless already processed
    const already = processedBgList.find(p => p.name === file.name);
    if (already && already.url) {
      showAfterPreview(already.url);
      btnSave.disabled = false;
    } else {
      [afterImg, afterImg2].forEach(img => {
        if (img) { img.removeAttribute('src'); img.classList.remove('loaded'); img.classList.add('hidden'); }
      });
      afterEmpty?.classList.remove('hidden');
      afterEmpty2?.classList.remove('hidden');
      btnSave.disabled = true;
    }
  }

  function showAfterPreview(url) {
    if (afterImg) {
      afterImg.src = url;
      afterImg.classList.remove('hidden');
      afterImg.classList.add('loaded');
    }
    if (afterImg2) {
      afterImg2.src = url;
      afterImg2.classList.remove('hidden');
      afterImg2.classList.add('loaded');
    }
    afterEmpty?.classList.add('hidden');
    afterEmpty2?.classList.add('hidden');
    window.dispatchEvent(new CustomEvent('preview-updated'));
  }

  function renderQueueList() {
    if (!queueList) return;
    queueList.innerHTML = '';
    queueText.textContent = `${processedBgList.length} / ${bgFiles.length}`;
    const pct = Math.round((processedBgList.length / bgFiles.length) * 100);
    queueBar.style.width = `${pct}%`;

    bgFiles.forEach((file, idx) => {
      const isCurrent = idx === currentFileIdx;
      const isDone = processedBgList.some(p => p.name === file.name);

      const li = document.createElement('li');
      li.className = 'queue-item' + (isCurrent ? ' active' : '') + (isDone ? ' done' : '');
      li.style.cursor = 'pointer';
      li.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <img src="${URL.createObjectURL(file)}" class="queue-thumb" alt=""/>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">
            ${isDone ? '✓ ' : ''}${file.name}
          </span>
        </div>
        <span>${isDone ? 'Hoàn tất' : (isCurrent ? 'Đang chọn' : 'Chờ')}</span>
      `;
      li.addEventListener('click', () => {
        currentFileIdx = idx;
        renderQueueList();
        previewFile(file);
      });
      queueList.appendChild(li);
    });
  }

  // Dropzone events
  if (dropzone) {
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        const files = Array.from(e.dataTransfer.files);
        files.forEach(f => { if (f.path) f._sourcePath = f.path; });
        handleBgFiles(files);
      }
    });

    dropzone.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT') return;
      if (fileInput) fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('click', e => e.stopPropagation());
    fileInput.addEventListener('change', e => {
      if (e.target.files && e.target.files.length) {
        handleBgFiles(e.target.files);
        fileInput.value = '';
      }
    });
  }

  // Global paste
  window.addEventListener('paste-image-bgremove', e => {
    if (e.detail) handleBgFiles([e.detail]);
  });

  // Processing execution
  if (btnProcess) {
    btnProcess.addEventListener('click', async () => {
      if (isProcessing || !bgFiles.length) return;
      isProcessing = true;
      btnProcess.disabled = true;
      btnReset.disabled = true;
      batchProgress.classList.remove('hidden');
      setStatus('busy', 'Đang phân tích tách nền AI...');

      for (let i = 0; i < bgFiles.length; i++) {
        currentFileIdx = i;
        const file = bgFiles[i];
        previewFile(file);
        renderQueueList();

        const pct = Math.round((i / bgFiles.length) * 100);
        progFill.style.width = `${pct}%`;
        progPercent.textContent = `${pct}%`;
        progLabel.textContent = `(${i + 1}/${bgFiles.length}) Đang tách nền: ${file.name}...`;

        try {
          const buf = await file.arrayBuffer();
          const res = await window.electronAPI.removeBackground({
            sourcePath: file._sourcePath || null,
            buffer: buf,
            mimeType: file.type || 'image/png',
            options: { bgColor: selectedBgColor }
          });

          if (!res.success) throw new Error(res.error || 'Lỗi tách nền');

          const outBlob = new Blob([res.buffer], { type: 'image/png' });
          const outUrl = URL.createObjectURL(outBlob);

          // Update processed list
          const existingIdx = processedBgList.findIndex(p => p.name === file.name);
          if (existingIdx >= 0) {
            processedBgList[existingIdx] = { name: file.name, file, blob: outBlob, url: outUrl };
          } else {
            processedBgList.push({ name: file.name, file, blob: outBlob, url: outUrl });
          }

          if (i === currentFileIdx) {
            showAfterPreview(outUrl);
          }
        } catch (err) {
          console.error(err);
          setStatus('err', `Lỗi xử lý ${file.name}: ` + err.message);
        }
      }

      progFill.style.width = '100%';
      progPercent.textContent = '100%';
      progLabel.textContent = 'Hoàn tất tách nền!';
      setStatus('ok', `✓ Đã tách phông xong ${processedBgList.length}/${bgFiles.length} ảnh`);

      renderQueueList();
      btnProcess.disabled = false;
      btnReset.disabled = false;
      btnSave.disabled = false;
      isProcessing = false;

      if (processedBgList.length > 1) {
        btnSaveAll.classList.remove('hidden');
      }
    });
  }

  // Save single
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const curFile = bgFiles[currentFileIdx];
      if (!curFile) return;
      const processed = processedBgList.find(p => p.name === curFile.name);
      if (!processed || !processed.blob) return;

      const baseName = curFile.name.replace(/\.[^.]+$/, '');
      const outName = `${baseName}_nobg.png`;

      if (isElectron) {
        const r = await window.electronAPI.saveFile({
          defaultName: outName,
          mimeType: 'image/png'
        });
        if (!r.canceled && r.filePath) {
          const buf = await processed.blob.arrayBuffer();
          await window.electronAPI.writeFile(r.filePath, buf);
          setStatus('ok', '✓ Đã lưu ảnh: ' + r.filePath.split(/[\\/]/).pop());
          window.electronAPI.showInFolder(r.filePath);
        }
      } else {
        const a = document.createElement('a');
        a.href = processed.url;
        a.download = outName;
        a.click();
      }
    });
  }

  // Save all to folder
  if (btnSaveAll) {
    btnSaveAll.addEventListener('click', async () => {
      if (!processedBgList.length) return;
      btnSaveAll.disabled = true;
      btnSaveAll.textContent = 'Đang lưu...';

      try {
        if (isElectron) {
          const res = await window.electronAPI.selectFolder();
          if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
            const folder = res.filePaths[0];
            let saved = 0;
            for (const item of processedBgList) {
              const baseName = item.name.replace(/\.[^.]+$/, '');
              const outPath = `${folder}\\${baseName}_nobg.png`.replace(/\\\\/g, '\\');
              const buf = await item.blob.arrayBuffer();
              await window.electronAPI.writeFile(outPath, buf);
              saved++;
            }
            setStatus('ok', `✓ Đã lưu ${saved} ảnh vào thư mục`);
            window.electronAPI.showInFolder(folder);
          }
        } else {
          for (const item of processedBgList) {
            const baseName = item.name.replace(/\.[^.]+$/, '');
            const a = document.createElement('a');
            a.href = item.url;
            a.download = `${baseName}_nobg.png`;
            a.click();
            await new Promise(r => setTimeout(r, 250));
          }
        }
      } catch (err) {
        setStatus('err', 'Lỗi lưu thư mục: ' + err.message);
      }

      btnSaveAll.disabled = false;
      btnSaveAll.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/></svg> Tải tất cả (Thư mục)`;
    });
  }

  // Reset
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      bgFiles = [];
      currentFileIdx = 0;
      processedBgList = [];
      bgIdle.classList.remove('hidden');
      bgLoaded.classList.add('hidden');
      bgLoadedName.textContent = '';
      if (fileInput) fileInput.value = '';
      queueWrap.classList.add('hidden');
      batchProgress.classList.add('hidden');
      btnSaveAll.classList.add('hidden');
      btnProcess.disabled = true;
      btnSave.disabled = true;
      [beforeImg, afterImg, beforeImg2, afterImg2].forEach(img => {
        if (img) { img.removeAttribute('src'); img.classList.remove('loaded'); img.classList.add('hidden'); }
      });
      beforeEmpty?.classList.remove('hidden');
      afterEmpty?.classList.remove('hidden');
      beforeEmpty2?.classList.remove('hidden');
      afterEmpty2?.classList.remove('hidden');
      setStatus('ok', 'Đã hủy và sẵn sàng chọn ảnh mới');
    });
  }

})();

