const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  verifyAccessCode: (accessCode) => ipcRenderer.invoke('verify-access-code', accessCode),
  launchProduct: (data) => ipcRenderer.invoke('launch-product', data),
  logout: () => ipcRenderer.invoke('logout')
});
