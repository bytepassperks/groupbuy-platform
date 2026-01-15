const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer-core');

app.disableHardwareAcceleration();

const API_BASE_URL = 'http://165.22.2.0/api';
const APP_NAME = 'GroupBuy Chrome';

// Default blocked URL patterns for settings/billing pages (comprehensive)
const DEFAULT_BLOCKED_PATTERNS = [
  // Path-based patterns (works for any domain)
  /\/settings/i,
  /\/account/i,
  /\/billing/i,
  /\/subscription/i,
  /\/payment/i,
  /\/profile/i,
  /\/preferences/i,
  /\/my-account/i,
  /\/my-profile/i,
  /\/my-settings/i,
  /\/user\/settings/i,
  /\/user\/account/i,
  /\/user\/profile/i,
  /\/user\/billing/i,
  /\/users\/settings/i,
  /\/users\/account/i,
  /\/manage-account/i,
  /\/manage-subscription/i,
  /\/account-settings/i,
  /\/billing-settings/i,
  /\/payment-methods/i,
  /\/payment-history/i,
  /\/invoices/i,
  /\/receipts/i,
  /\/plans/i,
  /\/upgrade/i,
  /\/downgrade/i,
  /\/cancel/i,
  /\/membership/i,
  /\/team/i,
  /\/teams/i,
  /\/organization/i,
  /\/admin/i,
  /\/dashboard\/settings/i,
  /\/dashboard\/account/i,
  /\/dashboard\/billing/i,
  // Subdomain-based patterns
  /^https?:\/\/account\./i,
  /^https?:\/\/billing\./i,
  /^https?:\/\/settings\./i,
  /^https?:\/\/my\./i,
  /^https?:\/\/profile\./i,
  /^https?:\/\/payments\./i,
  /^https?:\/\/subscription\./i,
  /^https?:\/\/manage\./i,
  // Query parameter patterns
  /[?&]tab=account/i,
  /[?&]tab=billing/i,
  /[?&]tab=settings/i,
  /[?&]tab=profile/i,
  /[?&]view=account/i,
  /[?&]view=billing/i,
  /[?&]view=settings/i,
  /[?&]section=account/i,
  /[?&]section=billing/i,
  /[?&]section=settings/i,
];

let loginWindow = null;
let browser = null;
let browserWsEndpoint = null;
let userSession = {
  accessCode: null,
  productId: null,
  productName: null,
  sessionToken: null,
  serviceUrl: null,
  blockedUrls: []
};
let userDataDir = null;
let urlMonitorInterval = null;

function isBlockedUrl(url) {
  // Check default patterns
  if (DEFAULT_BLOCKED_PATTERNS.some(pattern => pattern.test(url))) {
    return true;
  }
  
  // Check product-specific blocked URLs from server
  if (userSession.blockedUrls && userSession.blockedUrls.length > 0) {
    for (const pattern of userSession.blockedUrls) {
      try {
        // Support both string patterns and regex strings
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) {
          return true;
        }
      } catch (e) {
        // If regex is invalid, try simple string match
        if (url.toLowerCase().includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }
  }
  
  return false;
}

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
      devtools: false,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--disable-extensions',
        '--disable-dev-shm-usage'
      ]
    });

    console.log('[GroupBuy] Chrome launched successfully');

    // Save WebSocket endpoint for later monitoring
    browserWsEndpoint = browser.wsEndpoint();

    // Get the first page
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    // Fix viewport to use full window size
    // defaultViewport: null doesn't always work, so we explicitly set it
    try {
      const { width, height } = await page.evaluate(() => ({
        width: window.screen.availWidth || window.innerWidth || 1920,
        height: window.screen.availHeight || window.innerHeight || 1080
      }));
      await page.setViewport({ width, height });
      console.log(`[GroupBuy] Viewport set to ${width}x${height}`);
    } catch (vpErr) {
      // Fallback to a reasonable default
      await page.setViewport({ width: 1920, height: 1080 });
      console.log('[GroupBuy] Viewport set to default 1920x1080');
    }

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

    // Store the service URL for redirecting back
    userSession.serviceUrl = productUrl;

    // Disconnect puppeteer but keep browser open
    browser.disconnect();
    console.log('[GroupBuy] Puppeteer disconnected, browser running independently');

    // Monitor for browser close and blocked URLs
    const checkInterval = setInterval(async () => {
      let testBrowser = null;
      try {
        testBrowser = await puppeteer.connect({ browserWSEndpoint: browserWsEndpoint });
        
        // Check all pages for blocked URLs
        const pages = await testBrowser.pages();
        for (const p of pages) {
          try {
            const currentUrl = p.url();
            if (isBlockedUrl(currentUrl)) {
              console.log(`[GroupBuy] Blocked URL detected: ${currentUrl}`);
              console.log(`[GroupBuy] Redirecting to: ${userSession.serviceUrl}`);
              await p.goto(userSession.serviceUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
            }
          } catch (pageErr) {
            // Page might have been closed, ignore
          }
        }
        
        testBrowser.disconnect();
      } catch (err) {
        console.log('[GroupBuy] Browser closed detected, cleaning up...');
        if (urlMonitorInterval) {
          clearInterval(urlMonitorInterval);
          urlMonitorInterval = null;
        }
        clearInterval(checkInterval);
        browser = null;
        browserWsEndpoint = null;
        
        // Clear session on server
        if (userSession.accessCode || userSession.sessionToken) {
          try {
            console.log('[GroupBuy] Logging out session...');
            await axios.post(`${API_BASE_URL}/extension/logout`, {
              accessCode: userSession.accessCode,
              sessionToken: userSession.sessionToken
            });
            console.log('[GroupBuy] Session logged out successfully');
          } catch (logoutErr) {
            console.error('[GroupBuy] Logout error:', logoutErr.message);
          }
        }
        userSession = { accessCode: null, productId: null, productName: null, sessionToken: null, serviceUrl: null, blockedUrls: [] };
        
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
      userSession = { 
        accessCode, 
        productId, 
        productName,
        sessionToken: response.data.sessionToken || null,
        serviceUrl: response.data.serviceUrl || response.data.loginUrl,
        blockedUrls: response.data.blockedUrls || []
      };
      
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
