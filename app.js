/**
 * app.js — Main renderer logic
 * Handles drag/drop, processing pipeline, tab switching, download.
 */
(() => {
  const isElectron = typeof window.electronAPI !== 'undefined';

  // ── DOM ────────────────────────────────────────────────────────────────────
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

  // Preview elements
  const beforeImg  = document.getElementById('before-img');
  const afterImg   = document.getElementById('after-img');
  const beforeImg2 = document.getElementById('before-img-2');
  const afterImg2  = document.getElementById('after-img-2');
  const beforeEmpty  = document.getElementById('before-empty');
  const afterEmpty   = document.getElementById('after-empty');
  const beforeEmpty2 = document.getElementById('before-empty-2');
  const afterEmpty2  = document.getElementById('after-empty-2');

  // Tabs
  const tabSplit  = document.getElementById('tab-split');
  const tabBefore = document.getElementById('tab-before');
  const tabAfter  = document.getElementById('tab-after');
  const viewSplit  = document.getElementById('view-split');
  const viewBefore = document.getElementById('view-before');
  const viewAfter  = document.getElementById('view-after');

  // ── State ──────────────────────────────────────────────────────────────────
  let fileQueue     = [];
  let processedBlobs = [];
  let cleanBlob     = null;
  let currentFile   = null;

  // ── Native menu (Electron) ────────────────────────────────────────────────
  if (isElectron) {
    window.electronAPI.onOpenFiles((paths) => {
      Promise.all(paths.map(pathToFile)).then(handleFiles);
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
    return { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp' }[e] || 'image/png';
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length) handleFiles(files);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files].filter(f => f.type.startsWith('image/'));
    if (files.length) handleFiles(files);
    fileInput.value = '';
  });

  // ── File loading ──────────────────────────────────────────────────────────
  function handleFiles(files) {
    fileQueue = files;
    processedBlobs = [];
    cleanBlob = null;

    currentFile = files[0];
    readDataURL(files[0]).then(url => {
      setBeforeImage(url);
      clearAfterImage();
    });

    // Show file name in dropzone
    dzIdle.classList.add('hidden');
    dzLoaded.classList.remove('hidden');
    loadedName.textContent = files.length === 1
      ? files[0].name
      : `${files.length} ảnh được chọn`;

    if (files.length > 1) {
      queue.classList.remove('hidden');
      queueList.innerHTML = '';
      files.forEach((f, i) => {
        const li = document.createElement('li');
        li.id = `qi-${i}`;
        if (i === 0) li.classList.add('active'); // Select first by default
        li.innerHTML = `<span class="q-name">${f.name}</span><span class="q-status" id="qs-${i}">—</span>`;
        
        li.addEventListener('click', () => {
          document.querySelectorAll('#queue-list li').forEach(el => el.classList.remove('active'));
          li.classList.add('active');
          
          currentFile = f;
          readDataURL(f).then(url => {
            setBeforeImage(url);
            const processed = processedBlobs.find(p => p.name === cleanName(f.name));
            if (processed) {
              setAfterImage(URL.createObjectURL(processed.blob));
              cleanBlob = processed.blob;
            } else {
              clearAfterImage();
              cleanBlob = null;
            }
          });
        });
        
        queueList.appendChild(li);
      });
      btnProcess.textContent = `Xử lý tất cả (${files.length})`;
      btnSaveAll.classList.add('hidden');
      setQueueProgress(0, files.length);
    } else {
      queue.classList.add('hidden');
      btnProcess.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg> Xóa Watermark`;
      btnSaveAll.classList.add('hidden');
    }

    btnProcess.disabled = false;
    btnSave.disabled = true;
    btnReset.classList.remove('hidden');
    setStatus('idle', files.length > 1 ? 'Sẵn sàng — nhấn "Xử lý tất cả"' : 'Sẵn sàng — nhấn "Xóa Watermark"');
  }

  // ── Process ───────────────────────────────────────────────────────────────
  btnProcess.addEventListener('click', async () => {
    if (fileQueue.length > 1) await processBatch(fileQueue);
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
    } catch (err) {
      setStatus('err', 'Lỗi: ' + err.message);
    }

    btnProcess.disabled = false;
  }

  async function processBatch(files) {
    btnProcess.disabled = true;
    btnSave.disabled = true;
    processedBlobs = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const qs = document.getElementById(`qs-${i}`);
      if (qs) qs.textContent = '⚙️';
      setStatus('busy', `Đang xử lý ${i+1}/${files.length}: ${f.name}`);
      setQueueProgress(i, files.length);

      try {
        const { blob, detection } = await processImage(f);
        processedBlobs.push({ name: cleanName(f.name), blob, type: f.type });
        if (qs) qs.textContent = detection.found ? '✓' : '—';

        const url = URL.createObjectURL(blob);
        setAfterImage(url);
        cleanBlob = blob;
      } catch {
        if (qs) qs.textContent = '✗';
      }
    }

    setQueueProgress(files.length, files.length);
    setStatus('ok', `✓ Xong ${files.length} ảnh`);
    btnSave.disabled = false;
    btnSaveAll.disabled = false;
    btnSaveAll.classList.remove('hidden');
    btnProcess.disabled = false;
  }

  // ── Processing pipeline ───────────────────────────────────────────────────
  async function processImage(file) {
    return new Promise((resolve, reject) => {
      readDataURL(file).then(dataUrl => {
        const img = new Image();
        img.onload = async () => {
          try {
            const result = await GeminiWatermarkRemover.removeWatermarkFromImage(img);
            
            const detection = {
              found: !!result.meta,
              confidence: result.meta ? result.meta.confidence : 0,
              isFallback: result.meta ? result.meta.isFallback : false,
              x: result.meta ? result.meta.x : 0,
              y: result.meta ? result.meta.y : 0,
              w: result.meta ? result.meta.width : 0,
              h: result.meta ? result.meta.height : 0
            };

            const source = result.canvas; // This might be an OffscreenCanvas
            const canvas = document.createElement('canvas');
            canvas.width = source.width;
            canvas.height = source.height;
            canvas.getContext('2d').drawImage(source, 0, 0);

            const mime = file.type.startsWith('image/') ? file.type : 'image/png';
            const q    = mime === 'image/jpeg' ? 0.95 : undefined;
            canvas.toBlob(blob => resolve({ detection, blob }), mime, q);
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error('Không đọc được ảnh'));
        img.src = dataUrl;
      });
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  btnSave.addEventListener('click', async () => {
    if (!cleanBlob) return;
    const name = currentFile ? cleanName(currentFile.name) : 'clean-image.png';
    await saveBlob(cleanBlob, name);
  });

  btnSaveAll.addEventListener('click', async () => {
    if (!processedBlobs.length) return;
    btnSaveAll.disabled = true;
    btnSaveAll.textContent = 'Đang lưu...';

    try {
      if (isElectron) {
        const res = await window.electronAPI.selectFolder();
        if (!res.canceled && res.filePaths.length > 0) {
          const folder = res.filePaths[0];
          for (const { name, blob, type } of processedBlobs) {
            const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
            const filePath = `${folder}\\${name}.${ext}`.replace(/\\\\/g, '\\');
            const buf = await blob.arrayBuffer();
            await window.electronAPI.writeFile(filePath, buf);
          }
          setStatus('ok', `✓ Đã lưu ${processedBlobs.length} ảnh vào thư mục`);
          window.electronAPI.showInFolder(folder);
        }
      } else {
        // Fallback for non-electron (web)
        for (const { name, blob, type } of processedBlobs) {
          const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
          const url = URL.createObjectURL(blob);
          Object.assign(document.createElement('a'), { href: url, download: `${name}.${ext}` }).click();
          await sleep(300);
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) { setStatus('err', 'Lỗi lưu ảnh: ' + e.message); }

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
    fileQueue = [];
    processedBlobs = [];
    cleanBlob = null;
    currentFile = null;

    dzIdle.classList.remove('hidden');
    dzLoaded.classList.add('hidden');
    queue.classList.add('hidden');
    btnProcess.disabled = true;
    btnSave.disabled = true;
    btnSaveAll.classList.add('hidden');
    
    clearAfterImage();
    [beforeImg, beforeImg2].forEach(img => { img.src = ''; img.classList.remove('loaded'); });
    beforeEmpty.classList.remove('hidden');
    beforeEmpty2.classList.remove('hidden');
    
    setStatus('idle', 'Chờ ảnh...');
  });

  // ── Tabs ──────────────────────────────────────────────────────────────────
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

  // ── Image helpers ─────────────────────────────────────────────────────────
  function setBeforeImage(url) {
    [beforeImg, beforeImg2].forEach(img => {
      img.src = url;
      img.onload = () => img.classList.add('loaded');
    });
    beforeEmpty.classList.add('hidden');
    beforeEmpty2.classList.add('hidden');
  }

  function setAfterImage(url) {
    [afterImg, afterImg2].forEach(img => {
      img.src = url;
      img.onload = () => img.classList.add('loaded');
    });
    afterEmpty.classList.add('hidden');
    afterEmpty2.classList.add('hidden');
  }

  function clearAfterImage() {
    [afterImg, afterImg2].forEach(img => { img.src = ''; img.classList.remove('loaded'); });
    afterEmpty.classList.remove('hidden');
    afterEmpty2.classList.remove('hidden');
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
    return dot > 0
      ? name.slice(0, dot) + '-clean' + name.slice(dot)
      : name + '-clean';
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

})();
