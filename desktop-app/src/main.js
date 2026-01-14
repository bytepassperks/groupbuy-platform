const { app, BrowserWindow, session, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');

// Disable hardware acceleration BEFORE app is ready (must be called early)
app.disableHardwareAcceleration();

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://165.22.2.0/api';
const APP_NAME = 'GroupBuy';

// Store for user session
let userSession = {
  accessCode: null,
  productId: null,
  productName: null,
  productUrl: null,
  allowedDomain: null, // Store the allowed domain for strict navigation control
  cookies: [],
  isLoggedIn: false
};

// Blocked URL patterns (settings, billing, account pages)
const BLOCKED_PATTERNS = [
  /\/settings/i,
  /\/account/i,
  /\/billing/i,
  /\/subscription/i,
  /\/payment/i,
  /\/profile/i,
  /\/preferences/i,
  /\/admin/i,
  /\/manage/i,
  /\/plan/i,
  /\/upgrade/i,
  /\/cancel/i,
  /\/delete-account/i,
  /\/security/i,
  /\/password/i,
  /\/email-settings/i,
  /\/notifications-settings/i,
  /\/help/i,
  /\/support/i,
  /\/contact/i,
  /\/faq/i,
  /\/privacy/i,
  /\/terms/i,
  /\/legal/i
];

// Blocked external domains (help centers, support sites, etc.)
const BLOCKED_DOMAIN_PATTERNS = [
  /^support\./i,
  /^help\./i,
  /^faq\./i,
  /^contact\./i,
  /intercom/i,
  /zendesk/i,
  /freshdesk/i,
  /helpscout/i,
  /crisp/i,
  /drift/i
];

let mainWindow;
let loginWindow;

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 450,
    height: 600,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: APP_NAME,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: false // Disable DevTools
    }
  });

  // Remove menu bar
  loginWindow.setMenuBarVisibility(false);
  Menu.setApplicationMenu(null);

  loginWindow.loadFile(path.join(__dirname, 'login.html'));

  // Prevent DevTools from opening
  loginWindow.webContents.on('devtools-opened', () => {
    loginWindow.webContents.closeDevTools();
  });
}

function createMainWindow(productUrl) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: `${APP_NAME} - ${userSession.productName || 'Product'}`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-main.js'),
      devTools: false, // Disable DevTools
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  // Remove menu bar
  mainWindow.setMenuBarVisibility(false);
  Menu.setApplicationMenu(null);

  // Prevent DevTools from opening via keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    if (
      input.key === 'F12' ||
      (input.control && input.shift && (input.key === 'I' || input.key === 'i')) ||
      (input.control && input.shift && (input.key === 'J' || input.key === 'j')) ||
      (input.control && (input.key === 'U' || input.key === 'u'))
    ) {
      event.preventDefault();
    }
  });

  // Prevent DevTools from opening
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  // Block navigation to restricted pages and external domains
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // First check if it's an external domain
    if (isExternalDomain(url)) {
      event.preventDefault();
      showBlockedPageDialog('external');
      return;
    }
    // Then check if it's a blocked URL pattern
    if (isBlockedUrl(url)) {
      event.preventDefault();
      showBlockedPageDialog('restricted');
    }
  });

  // Block ALL new window requests - never allow opening external windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Check if it's an external domain
    if (isExternalDomain(url)) {
      showBlockedPageDialog('external');
      return { action: 'deny' };
    }
    // Check if it's a blocked URL pattern
    if (isBlockedUrl(url)) {
      showBlockedPageDialog('restricted');
      return { action: 'deny' };
    }
    // Even for allowed URLs, open them in the same window instead of a new one
    // This prevents any possibility of opening external browser
    mainWindow.loadURL(url);
    return { action: 'deny' };
  });

  // Inject cookies before loading the page
  injectCookies(productUrl).then(() => {
    mainWindow.loadURL(productUrl);
  });

  // Handle window close - logout user
  mainWindow.on('closed', () => {
    logoutUser();
    mainWindow = null;
    // Show login window again
    if (!loginWindow) {
      createLoginWindow();
    }
  });
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
    
    // If no allowed domain is set, block everything
    if (!userSession.allowedDomain) {
      return true;
    }
    
    const allowedDomain = userSession.allowedDomain.toLowerCase();
    
    // Check if it's the exact allowed domain or www. version
    if (hostname === allowedDomain || hostname === `www.${allowedDomain}`) {
      return false;
    }
    
    // Check if hostname ends with the allowed domain (for subdomains like app.blinkist.com)
    // But block support/help subdomains
    if (hostname.endsWith(`.${allowedDomain}`)) {
      // Check if it's a blocked subdomain pattern
      if (BLOCKED_DOMAIN_PATTERNS.some(pattern => pattern.test(hostname))) {
        return true;
      }
      return false;
    }
    
    // Any other domain is external
    return true;
  } catch {
    return true;
  }
}

function showBlockedPageDialog(reason = 'restricted') {
  const messages = {
    restricted: {
      message: 'This page is not accessible',
      detail: 'Settings, billing, and account pages are restricted for security reasons. Please contact support if you need assistance.'
    },
    external: {
      message: 'External links are blocked',
      detail: 'For security reasons, you cannot navigate to external websites. Please use the product within this application only.'
    }
  };
  
  const msg = messages[reason] || messages.restricted;
  
  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Access Restricted',
    message: msg.message,
    detail: msg.detail,
    buttons: ['OK']
  });
}

async function injectCookies(productUrl) {
  if (!userSession.cookies || userSession.cookies.length === 0) {
    return;
  }

  const urlObj = new URL(productUrl);
  const domain = urlObj.hostname;

  for (const cookie of userSession.cookies) {
    try {
      const cookieDetails = {
        url: productUrl,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || domain,
        path: cookie.path || '/',
        secure: cookie.secure || urlObj.protocol === 'https:',
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'lax'
      };

      if (cookie.expirationDate) {
        cookieDetails.expirationDate = cookie.expirationDate;
      }

      await session.defaultSession.cookies.set(cookieDetails);
    } catch (err) {
      console.error('Failed to set cookie:', cookie.name, err.message);
    }
  }
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function verifyAccessCode(accessCode) {
  try {
    const response = await makeRequest(`${API_BASE_URL}/extension/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode })
    });

    if (response.status === 200 && response.data.success) {
      // Map subscriptions to products format expected by the UI
      const products = (response.data.subscriptions || []).map(sub => ({
        id: sub.product_id,
        name: sub.product_name,
        service_url: sub.login_url,
        icon_url: sub.icon_url,
        expires_at: sub.expires_at
      }));
      
      return {
        success: true,
        products
      };
    } else {
      return {
        success: false,
        error: response.data.error || 'Invalid access code'
      };
    }
  } catch (err) {
    return {
      success: false,
      error: 'Failed to connect to server: ' + err.message
    };
  }
}

async function getSessionCookies(accessCode, productId) {
  try {
    // Use the existing get-credentials endpoint which returns session cookies
    const response = await makeRequest(`${API_BASE_URL}/extension/get-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        accessCode, 
        productId,
        deviceFingerprint: `desktop-${app.getVersion()}-${process.platform}`
      })
    });

    if (response.status === 200 && response.data.success) {
      return {
        success: true,
        cookies: response.data.sessionCookies || [],
        productUrl: response.data.serviceUrl || response.data.loginUrl,
        productName: response.data.productName
      };
    } else {
      return {
        success: false,
        error: response.data.error || 'Failed to get session'
      };
    }
  } catch (err) {
    return {
      success: false,
      error: 'Failed to connect to server: ' + err.message
    };
  }
}

async function logoutUser() {
  if (userSession.accessCode) {
    try {
      await makeRequest(`${API_BASE_URL}/extension/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          accessCode: userSession.accessCode,
          productId: userSession.productId
        })
      });
    } catch (err) {
      console.error('Logout error:', err.message);
    }
  }

  // Clear session cookies
  try {
    const cookies = await session.defaultSession.cookies.get({});
    for (const cookie of cookies) {
      const url = `${cookie.secure ? 'https' : 'http'}://${cookie.domain}${cookie.path}`;
      await session.defaultSession.cookies.remove(url, cookie.name);
    }
  } catch (err) {
    console.error('Failed to clear cookies:', err.message);
  }

  // Reset session
  userSession = {
    accessCode: null,
    productId: null,
    productName: null,
    productUrl: null,
    allowedDomain: null,
    cookies: [],
    isLoggedIn: false
  };
}

// IPC Handlers
ipcMain.handle('verify-access-code', async (event, accessCode) => {
  return await verifyAccessCode(accessCode);
});

ipcMain.handle('launch-product', async (event, { accessCode, productId, productName }) => {
  const result = await getSessionCookies(accessCode, productId);
  
  if (result.success) {
    // Extract the main domain from the product URL for strict navigation control
    let allowedDomain = null;
    try {
      const urlObj = new URL(result.productUrl);
      // Get the main domain (e.g., blinkist.com from www.blinkist.com or app.blinkist.com)
      const hostParts = urlObj.hostname.split('.');
      if (hostParts.length >= 2) {
        allowedDomain = hostParts.slice(-2).join('.');
      } else {
        allowedDomain = urlObj.hostname;
      }
    } catch (err) {
      console.error('Failed to parse product URL:', err.message);
    }
    
    userSession = {
      accessCode,
      productId,
      productName: result.productName || productName,
      productUrl: result.productUrl,
      allowedDomain: allowedDomain,
      cookies: result.cookies,
      isLoggedIn: true
    };

    // Close login window and open main window
    if (loginWindow) {
      loginWindow.close();
      loginWindow = null;
    }

    createMainWindow(result.productUrl);
    return { success: true };
  } else {
    return { success: false, error: result.error };
  }
});

ipcMain.handle('logout', async () => {
  await logoutUser();
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
  if (!loginWindow) {
    createLoginWindow();
  }
  return { success: true };
});

// App lifecycle
app.whenReady().then(() => {
  createLoginWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLoginWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new windows from being created with node integration
app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences) => {
    // Strip away preload scripts
    delete webPreferences.preload;
    // Disable Node.js integration
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });
});
