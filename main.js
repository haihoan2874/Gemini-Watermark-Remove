/**
 * main.js — Electron Main Process
 * Creates the app window, handles native menus and file dialogs.
 */

const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');

// Keep a global reference so GC doesn't kill the window
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    title: 'Gemini Studio Toolkit - All-in-One Creative Media & Document Suite · TRỊNH HẢI HOÀN',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#07070f',
    show: false, // show after ready-to-show for smooth launch
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true, // clean UI — no menu bar clutter
  });

  mainWindow.loadFile('index.html');

  // Show window smoothly when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Build native app menu
  buildAppMenu();
}

function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Image(s)...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Chọn file cần xử lý',
              filters: [{ name: 'Media Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov', 'docx', 'doc'] }],
              properties: ['openFile', 'multiSelections'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('open-files', result.filePaths);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Thoát' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools', label: 'Developer Tools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Về ứng dụng',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Gemini Studio Toolkit',
              message: 'Gemini Studio Toolkit v1.0.0',
              detail: 'Bộ công cụ sáng tạo đa năng 4-trong-1:\n✦ Xóa Watermark AI (Ảnh & Video)\n✦ Chèn Logo / Dấu bản quyền thương hiệu\n✦ Xóa Phông AI (Background Removal)\n✦ Chuyển đổi định dạng Media & Tài liệu Word sang PDF\n\nPhát triển bởi: TRỊNH HẢI HOÀN\nXử lý 100% Offline — Dữ liệu an toàn tuyệt đối.',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── IPC: Save file dialog ────────────────────────────────────────────────────
ipcMain.handle('save-file-dialog', async (event, { defaultName, mimeType }) => {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Lưu ảnh đã xử lý',
    defaultPath: defaultName || `clean-image.${ext}`,
    filters: [
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      { name: 'WebP Image', extensions: ['webp'] },
    ],
  });
  return result;
});

// ── IPC: Save zip dialog ─────────────────────────────────────────────────────
ipcMain.handle('save-zip-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Lưu ZIP',
    defaultPath: 'gemini-clean-images.zip',
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });
  return result;
});

// ── IPC: Select folder dialog ────────────────────────────────────────────────
ipcMain.handle('select-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn thư mục lưu tất cả ảnh',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result;
});

// ── IPC: Write binary file (for downloads) ───────────────────────────────────
ipcMain.handle('write-file', async (event, { filePath, buffer }) => {
  const fs = require('fs');
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Open folder after save ──────────────────────────────────────────────
ipcMain.handle('show-in-folder', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// ── IPC: Overlay logo onto video using FFmpeg (fast, single-pass) ───────────
ipcMain.handle('overlay-logo-video', async (event, { sourcePath, buffer, logoBuffer, logoX, logoY, logoW, logoH, opacity }) => {
  const os = require('os');
  const fs = require('fs');
  const { spawn } = require('child_process');
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  const ffmpegPath = ffmpegInstaller.path;

  const tmpDir = os.tmpdir();
  const ts = Date.now();

  // Write logo PNG to temp file
  const logoPath = path.join(tmpDir, `gemini_logo_${ts}.png`);
  fs.writeFileSync(logoPath, Buffer.from(logoBuffer));

  // Write video to temp if no source path
  let inputPath = sourcePath && fs.existsSync(sourcePath) ? sourcePath : null;
  let tempInputCreated = false;
  if (!inputPath) {
    inputPath = path.join(tmpDir, `gemini_in_${ts}.mp4`);
    fs.writeFileSync(inputPath, Buffer.from(buffer));
    tempInputCreated = true;
  }

  const outputPath = path.join(tmpDir, `gemini_logo_out_${ts}.mp4`);

  // FFmpeg overlay: scale logo to exact size, position it, apply opacity
  const alphaVal = Math.max(0, Math.min(1, opacity ?? 1));
  // Use colorchannelmixer to apply alpha, scale logo to target size, then overlay
  const filterComplex = [
    `[1:v]scale=${Math.round(logoW)}:${Math.round(logoH)},format=rgba,`,
    `colorchannelmixer=aa=${alphaVal.toFixed(3)}`,
    `[logo];`,
    `[0:v][logo]overlay=x=${Math.round(logoX)}:y=${Math.round(logoY)}:format=auto[v]`
  ].join('');

  const args = [
    '-y',
    '-i', inputPath,
    '-i', logoPath,
    '-filter_complex', filterComplex,
    '-map', '[v]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-crf', '17',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    outputPath
  ];

  return new Promise((resolve) => {
    let stderr = '';
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      try { fs.unlinkSync(logoPath); } catch (_) {}
      if (tempInputCreated) { try { fs.unlinkSync(inputPath); } catch (_) {} }
      if (code === 0 && fs.existsSync(outputPath)) {
        const outBuf = fs.readFileSync(outputPath);
        try { fs.unlinkSync(outputPath); } catch (_) {}
        resolve({ success: true, buffer: outBuf });
      } else {
        try { fs.unlinkSync(outputPath); } catch (_) {}
        resolve({ success: false, error: `FFmpeg overlay error (code ${code}): ${stderr.slice(-400)}` });
      }
    });
    proc.on('error', (err) => {
      try { fs.unlinkSync(logoPath); } catch (_) {}
      if (tempInputCreated) { try { fs.unlinkSync(inputPath); } catch (_) {} }
      resolve({ success: false, error: err.message });
    });
  });
});

// ── IPC: Process video natively with FFmpeg ──────────────────────────────────
ipcMain.handle('process-video', async (event, { sourcePath, buffer, watermarkRect, width, height }) => {
  const os = require('os');
  const fs = require('fs');
  const { spawn } = require('child_process');
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  const ffmpegPath = ffmpegInstaller.path;

  const tmpDir = os.tmpdir();
  let inputPath = sourcePath && fs.existsSync(sourcePath) ? sourcePath : null;
  let tempInputCreated = false;

  if (!inputPath) {
    inputPath = path.join(tmpDir, `gemini_in_${Date.now()}.mp4`);
    fs.writeFileSync(inputPath, Buffer.from(buffer));
    tempInputCreated = true;
  }

  const outputPath = path.join(tmpDir, `gemini_clean_${Date.now()}.mp4`);

  // Ensure coordinates are even numbers for YUV420p compliance
  const rawX = Math.max(0, Math.round(watermarkRect?.x ?? (width - 80)));
  const rawY = Math.max(0, Math.round(watermarkRect?.y ?? (height - 80)));
  const rawW = Math.max(16, Math.min(width - rawX, Math.round(watermarkRect?.w ?? 56)));
  const rawH = Math.max(16, Math.min(height - rawY, Math.round(watermarkRect?.h ?? 56)));

  const x = Math.floor(rawX / 2) * 2;
  const y = Math.floor(rawY / 2) * 2;
  const w = Math.min(width - x, Math.ceil(rawW / 2) * 2);
  const h = Math.min(height - y, Math.ceil(rawH / 2) * 2);

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', `delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0`,
    '-c:v', 'libx264',
    '-crf', '17',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    outputPath
  ];

  return new Promise((resolve) => {
    let stderr = '';
    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        const outBuf = fs.readFileSync(outputPath);
        try { fs.unlinkSync(outputPath); } catch (_) {}
        if (tempInputCreated) { try { fs.unlinkSync(inputPath); } catch (_) {} }
        resolve({ success: true, buffer: outBuf });
      } else {
        if (tempInputCreated) { try { fs.unlinkSync(inputPath); } catch (_) {} }
        resolve({ success: false, error: `Lỗi FFmpeg (code ${code}): ${stderr.slice(-300)}` });
      }
    });

    proc.on('error', (err) => {
      if (tempInputCreated) { try { fs.unlinkSync(inputPath); } catch (_) {} }
      resolve({ success: false, error: err.message });
    });
  });
});

// ── IPC: Select files for conversion ─────────────────────────────────────────
ipcMain.handle('select-convert-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn file chuyển đổi (Đa phương tiện hoặc Tài liệu Word)',
    filters: [
      { name: 'Tất cả file hỗ trợ', extensions: ['docx', 'doc', 'png', 'jpg', 'jpeg', 'webp', 'ico', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'gif', 'mp3', 'wav', 'aac'] },
      { name: 'Tài liệu Word', extensions: ['docx', 'doc'] },
      { name: 'Video', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'gif'] },
      { name: 'Hình ảnh', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico'] },
      { name: 'Âm thanh', extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac'] }
    ],
    properties: ['openFile', 'multiSelections']
  });
  return result;
});

// ── IPC: Convert Word (.docx, .doc) to PDF natively via Word COM ─────────────
ipcMain.handle('convert-docx-to-pdf', async (event, { sourcePath, buffer, originalName }) => {
  const os = require('os');
  const fs = require('fs');
  const { execFile } = require('child_process');

  const tmpDir = os.tmpdir();
  const ts = Date.now();
  let inputDocPath = sourcePath && fs.existsSync(sourcePath) ? sourcePath : null;
  let tempCreated = false;

  if (!inputDocPath) {
    const ext = (originalName && originalName.endsWith('.doc')) ? '.doc' : '.docx';
    inputDocPath = path.join(tmpDir, `doc_in_${ts}${ext}`);
    fs.writeFileSync(inputDocPath, Buffer.from(buffer));
    tempCreated = true;
  }

  const outputPdfPath = path.join(tmpDir, `doc_out_${ts}.pdf`);

  const psScript = `
$ErrorActionPreference = 'Stop'
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $doc = $word.Documents.Open('${inputDocPath.replace(/'/g, "''")}')
  $doc.SaveAs([ref]'${outputPdfPath.replace(/'/g, "''")}', [ref]17)
  $doc.Close()
  $word.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
  Write-Output 'OK'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;

  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 60000 }, (error, stdout, stderr) => {
      if (tempCreated) {
        try { fs.unlinkSync(inputDocPath); } catch (_) {}
      }

      if (error || !fs.existsSync(outputPdfPath)) {
        const errMsg = stderr || error?.message || 'Không thể chuyển đổi Word sang PDF. Vui lòng đảm bảo Microsoft Word đã được cài đặt trên máy.';
        resolve({ success: false, error: errMsg });
      } else {
        try {
          const pdfBuffer = fs.readFileSync(outputPdfPath);
          try { fs.unlinkSync(outputPdfPath); } catch (_) {}
          resolve({ success: true, buffer: pdfBuffer });
        } catch (readErr) {
          resolve({ success: false, error: readErr.message });
        }
      }
    });
  });
});

// ── IPC: Convert media formats via native FFmpeg ─────────────────────────────
ipcMain.handle('convert-media', async (event, { sourcePath, buffer, targetFormat, options = {} }) => {
  const os = require('os');
  const fs = require('fs');
  const { spawn } = require('child_process');
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  const ffmpegPath = ffmpegInstaller.path;

  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const fmt = (targetFormat || 'mp4').toLowerCase().replace(/^\./, '');

  let inputPath = sourcePath && fs.existsSync(sourcePath) ? sourcePath : null;
  let tempCreated = false;
  if (!inputPath) {
    inputPath = path.join(tmpDir, `conv_in_${ts}_media`);
    fs.writeFileSync(inputPath, Buffer.from(buffer));
    tempCreated = true;
  }

  const outputPath = path.join(tmpDir, `conv_out_${ts}.${fmt}`);
  let args = ['-y', '-i', inputPath];

  // Configure format-specific conversion flags
  if (fmt === 'mp4') {
    const scale = options.resolution ? `scale=${options.resolution}` : null;
    const fps = options.fps ? `fps=${options.fps}` : null;
    const vfParts = [scale, fps].filter(Boolean);
    if (vfParts.length) args.push('-vf', vfParts.join(','));
    args.push('-c:v', 'libx264', '-crf', options.crf ? String(options.crf) : '20', '-preset', 'fast', '-pix_fmt', 'yuv420p');
    args.push('-c:a', 'aac', '-b:a', '192k');
  } else if (fmt === 'webm') {
    const scale = options.resolution ? `scale=${options.resolution}` : null;
    const fps = options.fps ? `fps=${options.fps}` : null;
    const vfParts = [scale, fps].filter(Boolean);
    if (vfParts.length) args.push('-vf', vfParts.join(','));
    args.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0');
    args.push('-c:a', 'libopus');
  } else if (fmt === 'gif') {
    const fps = options.fps || 15;
    const scaleW = options.scaleWidth || 480;
    const filter = `[0:v]fps=${fps},scale=${scaleW}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
    args.push('-vf', filter);
  } else if (fmt === 'mp3') {
    const bitrate = options.audioBitrate || '192k';
    args.push('-vn', '-c:a', 'libmp3lame', '-b:a', bitrate);
  } else if (fmt === 'wav') {
    args.push('-vn', '-c:a', 'pcm_s16le');
  } else if (fmt === 'aac' || fmt === 'm4a') {
    const bitrate = options.audioBitrate || '192k';
    args.push('-vn', '-c:a', 'aac', '-b:a', bitrate);
  } else if (fmt === 'ico') {
    args.push('-vf', 'scale=256:256');
  } else if (fmt === 'jpg' || fmt === 'jpeg') {
    const q = options.quality ? Math.round((100 - options.quality) / 3.3) : 2;
    args.push('-q:v', String(Math.max(1, Math.min(31, q))));
  } else if (fmt === 'webp') {
    const q = options.quality || 85;
    args.push('-quality', String(q));
  }

  args.push(outputPath);

  return new Promise((resolve) => {
    let stderr = '';
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (tempCreated) { try { fs.unlinkSync(inputPath); } catch (_) {} }
      if (code === 0 && fs.existsSync(outputPath)) {
        try {
          const outBuf = fs.readFileSync(outputPath);
          try { fs.unlinkSync(outputPath); } catch (_) {}
          resolve({ success: true, buffer: outBuf, format: fmt });
        } catch (rErr) {
          resolve({ success: false, error: rErr.message });
        }
      } else {
        try { fs.unlinkSync(outputPath); } catch (_) {}
        resolve({ success: false, error: `Lỗi chuyển đổi (code ${code}): ${stderr.slice(-300)}` });
      }
    });
    proc.on('error', (err) => {
      if (tempCreated) { try { fs.unlinkSync(inputPath); } catch (_) {} }
      resolve({ success: false, error: err.message });
    });
  });
});

// ── IPC: AI Background Removal (Diverse: Person, Product, Pet, Objects) ──────
ipcMain.handle('remove-background', async (event, { sourcePath, buffer, mimeType, options = {} }) => {
  const { removeBackground } = require('@imgly/background-removal-node');
  const sharp = require('sharp');
  const fs = require('fs');

  try {
    let inputBuf = buffer;
    if (!inputBuf && sourcePath && fs.existsSync(sourcePath)) {
      inputBuf = fs.readFileSync(sourcePath);
    }
    if (!inputBuf) {
      return { success: false, error: 'Không tìm thấy dữ liệu ảnh' };
    }

    const mime = mimeType || 'image/png';
    const inputBlob = new Blob([inputBuf], { type: mime });

    // Execute neural background segmentation
    const resultBlob = await removeBackground(inputBlob);
    let outBuffer = Buffer.from(await resultBlob.arrayBuffer());

    // If user specified a solid replacement background color (not transparent)
    if (options.bgColor && options.bgColor !== 'transparent') {
      outBuffer = await sharp(outBuffer)
        .flatten({ background: options.bgColor })
        .png()
        .toBuffer();
    }

    return { success: true, buffer: outBuffer };
  } catch (err) {
    console.error('remove-background error:', err);
    return { success: false, error: err.message || 'Lỗi xử lý xóa phông' };
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
