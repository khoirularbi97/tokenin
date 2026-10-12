// Jembatan aman antara aplikasi web dan Electron.
// Web hanya mendapat info dasar; tidak ada akses Node.js langsung.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tokeninDesktop', {
  platform: process.platform, // 'win32' | 'darwin' | 'linux'
  version: ipcRenderer.sendSync('tokenin:version'),
});
