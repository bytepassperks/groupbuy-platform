const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const http = require('http');
const WebSocket = require('ws');

app.disableHardwareAcceleration();

const API_BASE_URL = 'http://165.22.2.0/api';
const APP_NAME = 'GroupBuy Chrome';

let loginWindow = null;
let chromeProcess = null;
let userSession = {
  accessCode: null,
  productId: null,
  productName: null
};
let userDataDir = null;

function findChrome() {
  const platform = os.platform();
  const possiblePaths = [];

  if (platform === 'win32') {
    possiblePaths.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (platform === 'darwin') {
    possiblePaths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    possiblePaths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge'
    );
  }

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  return null;
}

async function getDebuggerUrl(port, retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      if (response && response.length > 0) {
        return response[0].webSocketDebuggerUrl;
      }
    } catch (err) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return null;
}

async function injectCookiesViaCDP(wsUrl, cookies, productUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let messageId = 1;
    
    ws.on('open', async () => {
      try {
        for (const cookie of cookies) {
          const cookieParams = {
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: cookie.secure !== false,
            httpOnly: cookie.httpOnly || false
          };
          
          if (cookie.sameSite) {
            cookieParams.sameSite = cookie.sameSite;
          }
          
          ws.send(JSON.stringify({
            id: messageId++,
            method: 'Network.setCookie',
            params: cookieParams
          }));
        }
        
        await new Promise(r => setTimeout(r, 500));
        
        ws.send(JSON.stringify({
          id: messageId++,
          method: 'Page.navigate',
          params: { url: productUrl }
        }));
        
        await new Promise(r => setTimeout(r, 1000));
        
        ws.close();
        resolve(true);
      } catch (err) {
        ws.close();
        reject(err);
      }
    });
    
    ws.on('error', (err) => {
      reject(err);
    });
    
    setTimeout(() => {
      ws.close();
      resolve(false);
    }, 10000);
  });
}

function extractMainDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostParts = urlObj.hostname.split('.');
    if (hostParts.length >= 2) {
      return hostParts.slice(-2).join('.');
    }
    return urlObj.hostname;
  } catch {
    return null;
  }
}

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 450,
    height: 550,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: APP_NAME,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  loginWindow.setMenuBarVisibility(false);
  loginWindow.loadFile(path.join(__dirname, 'login.html'));

  loginWindow.on('closed', () => {
    loginWindow = null;
    if (!chromeProcess) {
      app.quit();
    }
  });
}

async function launchChrome(productUrl, cookies, productName) {
  const chromePath = findChrome();
  if (!chromePath) {
    dialog.showErrorBox('Chrome Not Found', 
      'Google Chrome or Microsoft Edge is required.\n\nPlease install Chrome from:\nhttps://www.google.com/chrome/');
    return false;
  }

  userDataDir = path.join(os.tmpdir(), 'groupbuy-chrome-profile-' + Date.now());
  const debugPort = 9222 + Math.floor(Math.random() * 1000);

  const args = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
    'about:blank'
  ];

  try {
    chromeProcess = spawn(chromePath, args, {
      detached: false,
      stdio: 'ignore'
    });

    chromeProcess.on('close', async (code) => {
      chromeProcess = null;
      
      if (userSession.accessCode) {
        try {
          await axios.post(`${API_BASE_URL}/extension/logout`, {
            accessCode: userSession.accessCode,
            productId: userSession.productId
          });
        } catch (err) {
          console.error('Logout error:', err.message);
        }
      }
      userSession = { accessCode: null, productId: null, productName: null };
      
      try {
        if (userDataDir) {
          fs.rmSync(userDataDir, { recursive: true, force: true });
          userDataDir = null;
        }
      } catch (err) {
        console.error('Failed to clean up:', err.message);
      }

      if (loginWindow) {
        loginWindow.show();
      } else {
        createLoginWindow();
      }
    });

    chromeProcess.on('error', (err) => {
      console.error('Chrome process error:', err.message);
      dialog.showErrorBox('Launch Error', `Failed to launch Chrome: ${err.message}`);
    });

    const wsUrl = await getDebuggerUrl(debugPort);
    if (wsUrl) {
      try {
        await injectCookiesViaCDP(wsUrl, cookies, productUrl);
      } catch (err) {
        console.error('CDP injection error:', err.message);
      }
    } else {
      console.error('Could not get debugger URL');
    }

    return true;
  } catch (err) {
    console.error('Failed to launch Chrome:', err.message);
    dialog.showErrorBox('Launch Error', `Failed to launch Chrome: ${err.message}`);
    return false;
  }
}

ipcMain.handle('verify-access-code', async (event, accessCode) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/extension/verify-code`, { accessCode });
    if (response.data.success) {
      const products = (response.data.subscriptions || []).map(sub => ({
        id: sub.product_id,
        name: sub.product_name,
        serviceUrl: sub.login_url,
        iconUrl: sub.icon_url,
        expiresAt: sub.expires_at
      }));
      return { success: true, products };
    }
    return { success: false, error: response.data.error || 'Invalid access code' };
  } catch (err) {
    return { success: false, error: 'Failed to connect to server' };
  }
});

ipcMain.handle('launch-product', async (event, { accessCode, productId, productName }) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/extension/get-credentials`, {
      accessCode,
      productId,
      deviceFingerprint: `chrome-launcher-${os.platform()}-${os.hostname()}`
    });

    if (response.data.success) {
      userSession = { accessCode, productId, productName };
      
      const success = await launchChrome(
        response.data.serviceUrl || response.data.loginUrl,
        response.data.sessionCookies || [],
        productName
      );

      if (success && loginWindow) {
        loginWindow.hide();
      }

      return { success };
    }
    return { success: false, error: response.data.error || 'Failed to get session' };
  } catch (err) {
    return { success: false, error: 'Failed to connect to server' };
  }
});

ipcMain.handle('check-chrome', async () => {
  const chromePath = findChrome();
  return { found: !!chromePath, path: chromePath };
});

app.whenReady().then(() => {
  createLoginWindow();
});

app.on('window-all-closed', () => {
  if (!chromeProcess) {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (chromeProcess) {
    try {
      chromeProcess.kill();
    } catch (err) {
      console.error('Error killing Chrome:', err.message);
    }
  }
});
