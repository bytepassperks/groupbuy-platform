const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  verifyAccessCode: (accessCode) => ipcRenderer.invoke('verify-access-code', accessCode),
  launchProduct: (data) => ipcRenderer.invoke('launch-product', data),
  checkChrome: () => ipcRenderer.invoke('check-chrome')
});
