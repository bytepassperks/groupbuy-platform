const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const os = require('os');

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
let tempExtensionDir = null;

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

function createTempExtension(cookies, productUrl, allowedDomain) {
  const extDir = path.join(os.tmpdir(), 'groupbuy-ext-' + Date.now());
  fs.mkdirSync(extDir, { recursive: true });

  const manifest = {
    manifest_version: 3,
    name: "GroupBuy Session",
    version: "1.0",
    permissions: ["cookies", "storage", "webNavigation", "tabs"],
    host_permissions: ["<all_urls>"],
    background: {
      service_worker: "background.js"
    }
  };

  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const blockedPatterns = [
    '/settings', '/account', '/billing', '/subscription', '/payment',
    '/profile', '/preferences', '/admin', '/manage', '/plan',
    '/upgrade', '/cancel', '/delete-account', '/security', '/password',
    '/help', '/support', '/contact', '/faq', '/privacy', '/terms', '/legal'
  ];

  const blockedDomains = [
    'support.', 'help.', 'faq.', 'contact.',
    'intercom', 'zendesk', 'freshdesk', 'helpscout', 'crisp', 'drift'
  ];

  const backgroundJs = `
const CONFIG = {
  cookies: ${JSON.stringify(cookies)},
  productUrl: ${JSON.stringify(productUrl)},
  allowedDomain: ${JSON.stringify(allowedDomain)},
  blockedPatterns: ${JSON.stringify(blockedPatterns)},
  blockedDomains: ${JSON.stringify(blockedDomains)}
};

let cookiesInjected = false;

function isBlockedUrl(url) {
  try {
    const urlObj = new URL(url);
    const fullPath = urlObj.pathname.toLowerCase();
    return CONFIG.blockedPatterns.some(pattern => fullPath.includes(pattern));
  } catch {
    return false;
  }
}

function isExternalDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const allowed = CONFIG.allowedDomain.toLowerCase();
    
    if (hostname === allowed || hostname === 'www.' + allowed) return false;
    if (hostname.endsWith('.' + allowed)) {
      if (CONFIG.blockedDomains.some(d => hostname.includes(d))) return true;
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function injectCookies() {
  if (cookiesInjected) return;
  cookiesInjected = true;
  
  for (const cookie of CONFIG.cookies) {
    try {
      const cookieDetails = {
        url: 'https://' + cookie.domain.replace(/^\\./, '') + '/',
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure !== false,
        httpOnly: cookie.httpOnly || false
      };
      
      if (cookie.sameSite) {
        cookieDetails.sameSite = cookie.sameSite.toLowerCase();
      }
      
      await chrome.cookies.set(cookieDetails);
    } catch (err) {
      console.error('Failed to set cookie:', cookie.name, err);
    }
  }
  
  setTimeout(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: CONFIG.productUrl });
      } else {
        chrome.tabs.create({ url: CONFIG.productUrl });
      }
    });
  }, 500);
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  
  const url = details.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url === 'about:blank') return;
  
  if (isBlockedUrl(url) || isExternalDomain(url)) {
    chrome.tabs.update(details.tabId, { url: CONFIG.productUrl });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  injectCookies();
});

injectCookies();
`;

  fs.writeFileSync(path.join(extDir, 'background.js'), backgroundJs);

  return extDir;
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

  const allowedDomain = extractMainDomain(productUrl);
  const userDataDir = path.join(os.tmpdir(), 'groupbuy-chrome-profile-' + Date.now());
  
  tempExtensionDir = createTempExtension(cookies, productUrl, allowedDomain);

  const args = [
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
    `--load-extension=${tempExtensionDir}`,
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
        if (tempExtensionDir) {
          fs.rmSync(tempExtensionDir, { recursive: true, force: true });
          tempExtensionDir = null;
        }
        fs.rmSync(userDataDir, { recursive: true, force: true });
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
