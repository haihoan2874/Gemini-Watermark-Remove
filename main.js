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
