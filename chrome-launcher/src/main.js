const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer-core');

app.disableHardwareAcceleration();

const API_BASE_URL = 'http://165.22.2.0/api';
const APP_NAME = 'GroupBuy Chrome';

let loginWindow = null;
let browser = null;
let browserWsEndpoint = null;
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

// No longer needed - using puppeteer-core instead of raw CDP

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

  userDataDir = path.join(os.tmpdir(), 'groupbuy-chrome-profile-' + Date.now());

  console.log(`[GroupBuy] Launching Chrome with puppeteer-core...`);
  console.log(`[GroupBuy] Product URL: ${productUrl}`);
  console.log(`[GroupBuy] Cookies to inject: ${cookies.length}`);

  try {
    // Launch Chrome with puppeteer-core
    // Key flags to avoid automation detection:
    // - disable-blink-features=AutomationControlled removes navigator.webdriver
    // - ignoreDefaultArgs removes --enable-automation flag
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false,
      userDataDir: userDataDir,
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars'
      ]
    });

    console.log('[GroupBuy] Chrome launched successfully');

    // Save WebSocket endpoint for later monitoring
    browserWsEndpoint = browser.wsEndpoint();

    // Get the first page
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    // Set cookies before navigating
    console.log(`[GroupBuy] Setting ${cookies.length} cookies...`);
    
    // Convert cookies to puppeteer format
    const puppeteerCookies = cookies.map(cookie => {
      const c = {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure !== false,
        httpOnly: cookie.httpOnly || false
      };
      
      if (cookie.sameSite) {
        const sameSite = cookie.sameSite.toLowerCase();
        if (sameSite === 'strict') c.sameSite = 'Strict';
        else if (sameSite === 'lax') c.sameSite = 'Lax';
        else if (sameSite === 'none' || sameSite === 'no_restriction') c.sameSite = 'None';
      }
      
      if (cookie.expirationDate) {
        c.expires = cookie.expirationDate;
      }
      
      return c;
    });

    // Set all cookies
    await page.setCookie(...puppeteerCookies);
    console.log('[GroupBuy] Cookies set successfully');

    // Navigate to the product URL
    console.log(`[GroupBuy] Navigating to ${productUrl}...`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('[GroupBuy] Navigation complete');

    // Disconnect puppeteer but keep browser open
    browser.disconnect();
    console.log('[GroupBuy] Puppeteer disconnected, browser running independently');

    // Monitor for browser close
    const checkInterval = setInterval(async () => {
      try {
        const testBrowser = await puppeteer.connect({ browserWSEndpoint: browserWsEndpoint });
        testBrowser.disconnect();
      } catch (err) {
        console.log('[GroupBuy] Browser closed detected, cleaning up...');
        clearInterval(checkInterval);
        browser = null;
        browserWsEndpoint = null;
        
        // Clear session on server
        if (userSession.accessCode) {
          try {
            console.log('[GroupBuy] Logging out session...');
            await axios.post(`${API_BASE_URL}/extension/logout`, {
              accessCode: userSession.accessCode,
              productId: userSession.productId
            });
            console.log('[GroupBuy] Session logged out successfully');
          } catch (logoutErr) {
            console.error('[GroupBuy] Logout error:', logoutErr.message);
          }
        }
        userSession = { accessCode: null, productId: null, productName: null };
        
        // Clean up temp profile
        try {
          if (userDataDir) {
            fs.rmSync(userDataDir, { recursive: true, force: true });
            userDataDir = null;
          }
        } catch (cleanupErr) {
          console.error('[GroupBuy] Failed to clean up:', cleanupErr.message);
        }

        // Notify renderer to reset UI and show login window
        if (loginWindow) {
          loginWindow.webContents.send('browser-closed');
          loginWindow.show();
        } else {
          createLoginWindow();
        }
      }
    }, 3000);

    return true;
  } catch (err) {
    console.error('[GroupBuy] Failed to launch Chrome:', err.message);
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
