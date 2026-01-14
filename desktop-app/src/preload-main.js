const { contextBridge, ipcRenderer } = require('electron');

// Minimal API for the main browser window
// We intentionally limit what's exposed for security
contextBridge.exposeInMainWorld('groupbuyAPI', {
  logout: () => ipcRenderer.invoke('logout'),
  getAppInfo: () => ({ name: 'GroupBuy', version: '1.0.0' })
});

// Disable right-click context menu to prevent "Inspect Element"
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Disable keyboard shortcuts for DevTools
document.addEventListener('keydown', (e) => {
  // F12
  if (e.key === 'F12') {
    e.preventDefault();
  }
  // Ctrl+Shift+I or Cmd+Shift+I
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
    e.preventDefault();
  }
  // Ctrl+Shift+J or Cmd+Shift+J
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
    e.preventDefault();
  }
  // Ctrl+U or Cmd+U (View Source)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')) {
    e.preventDefault();
  }
});
