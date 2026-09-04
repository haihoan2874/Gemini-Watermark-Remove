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
    title: 'Gemini Watermark Remover - TRỊNH HẢI HOÀN',
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
              title: 'Chọn ảnh cần xóa watermark',
              filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
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
              title: 'Gemini Watermark Remover',
              message: 'Gemini Watermark Remover v1.0.0',
              detail: 'Tool xóa icon ✦ watermark khỏi ảnh AI từ Gemini.\n\nXử lý hoàn toàn cục bộ — ảnh không bao giờ rời máy bạn.',
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
    `[1:v]scale=${Math.round(logoW)}:${Math.round(logoH)},`,
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
