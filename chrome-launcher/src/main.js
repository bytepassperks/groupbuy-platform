const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const puppeteer = require('puppeteer-core');
const axios = require('axios');
const fs = require('fs');
const os = require('os');

app.disableHardwareAcceleration();

const API_BASE_URL = 'http://165.22.2.0/api';
const APP_NAME = 'GroupBuy Chrome';

let loginWindow = null;
let browser = null;
let userSession = {
  accessCode: null,
  productId: null,
  productName: null
};

const BLOCKED_PATTERNS = [
  /\/settings/i, /\/account/i, /\/billing/i, /\/subscription/i,
  /\/payment/i, /\/profile/i, /\/preferences/i, /\/admin/i,
  /\/manage/i, /\/plan/i, /\/upgrade/i, /\/cancel/i,
  /\/delete-account/i, /\/security/i, /\/password/i,
  /\/help/i, /\/support/i, /\/contact/i, /\/faq/i,
  /\/privacy/i, /\/terms/i, /\/legal/i
];

const BLOCKED_DOMAIN_PATTERNS = [
  /^support\./i, /^help\./i, /^faq\./i, /^contact\./i,
  /intercom/i, /zendesk/i, /freshdesk/i, /helpscout/i, /crisp/i, /drift/i
];

let allowedDomain = null;

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

function isBlockedUrl(url) {
  try {
    const urlObj = new URL(url);
    const fullPath = urlObj.pathname + urlObj.search;
    return BLOCKED_PATTERNS.some(pattern => pattern.test(fullPath));
  } catch {
    return false;
  }
}

function isExternalDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    if (!allowedDomain) return true;
    const allowed = allowedDomain.toLowerCase();
    if (hostname === allowed || hostname === `www.${allowed}`) return false;
    if (hostname.endsWith(`.${allowed}`)) {
      if (BLOCKED_DOMAIN_PATTERNS.some(pattern => pattern.test(hostname))) return true;
      return false;
    }
    return true;
  } catch {
    return true;
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
    if (!browser) {
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

  allowedDomain = extractMainDomain(productUrl);
  const userDataDir = path.join(os.tmpdir(), 'groupbuy-chrome-profile-' + Date.now());

  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false,
      defaultViewport: null,
      userDataDir: userDataDir,
      args: [
        '--start-maximized',
        '--disable-infobars',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        `--window-name=GroupBuy - ${productName}`
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    for (const cookie of cookies) {
      try {
        await page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || 'Lax'
        });
      } catch (err) {
        console.error(`Failed to set cookie ${cookie.name}:`, err.message);
      }
    }

    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      const resourceType = request.resourceType();

      if (['image', 'stylesheet', 'font', 'media', 'script', 'xhr', 'fetch', 'websocket'].includes(resourceType)) {
        request.continue();
        return;
      }

      if (isBlockedUrl(url)) {
        console.log(`Blocked restricted URL: ${url}`);
        request.abort('blockedbyclient');
        return;
      }

      if (isExternalDomain(url) && resourceType === 'document') {
        console.log(`Blocked external domain: ${url}`);
        request.abort('blockedbyclient');
        return;
      }

      request.continue();
    });

    await page.goto(productUrl, { waitUntil: 'networkidle2' });

    browser.on('disconnected', async () => {
      browser = null;
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
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to clean up profile:', err.message);
      }

      if (loginWindow) {
        loginWindow.show();
      } else {
        createLoginWindow();
      }
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
  if (!browser) {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      console.error('Error closing browser:', err.message);
    }
  }
});
