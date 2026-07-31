/**
 * preload.js — Electron Preload Script
 * Exposes safe IPC APIs to the renderer via contextBridge.
 * Renderer code uses window.electronAPI.xxx() to call main process.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Trigger native Save dialog and write file
  saveFile: (options) => ipcRenderer.invoke('save-file-dialog', options),
  saveZip: () => ipcRenderer.invoke('save-zip-dialog'),
  selectFolder: () => ipcRenderer.invoke('select-folder-dialog'),
  writeFile: (filePath, buffer) => ipcRenderer.invoke('write-file', { filePath, buffer }),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),

  // Listen for "Open Image" triggered from native menu
  onOpenFiles: (callback) => ipcRenderer.on('open-files', (_event, filePaths) => callback(filePaths)),
});
