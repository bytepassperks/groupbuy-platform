const API_URL = 'http://165.22.2.0/api';

// Track tabs that are on supported domains (for auto-logout on tab close)
const activeTabs = new Map(); // tabId -> { domain, productName }

// Security: Clear any sensitive data on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('[GroupBuy] Extension installed/updated');
  // Clear any cached credentials on install/update for security
  chrome.storage.local.remove(['cachedCredentials']);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  
  const stored = await chrome.storage.local.get(['sessionToken', 'currentProduct', 'accessCode']);

  const supportedDomains = [
    'semrush.com',
    'ahrefs.com',
    'canva.com',
    'netflix.com',
    'blinkist.com',
  ];

  const url = new URL(tab.url);
  const matchedDomain = supportedDomains.find(domain => url.hostname.includes(domain));

  if (matchedDomain) {
    // Track this tab as being on a supported domain
    activeTabs.set(tabId, { 
      domain: url.hostname, 
      baseDomain: matchedDomain,
      url: tab.url 
    });
    console.log('[GroupBuy] Tracking tab', tabId, 'on domain:', matchedDomain);
  } else {
    // Tab navigated away from supported domain, remove from tracking
    if (activeTabs.has(tabId)) {
      console.log('[GroupBuy] Tab', tabId, 'navigated away from supported domain');
      activeTabs.delete(tabId);
    }
    return;
  }

  if (!stored.sessionToken || !stored.currentProduct) return;

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'CHECK_LOGIN_PAGE' });
    
    if (response && response.isLoginPage) {
      console.log('[GroupBuy] Login page detected on', response.hostname);
    }
  } catch (error) {
    console.log('[GroupBuy] Content script not ready yet');
  }
});

// Auto-logout when tab is closed: Clear cookies for the domain
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const tabInfo = activeTabs.get(tabId);
  
  if (!tabInfo) {
    return; // Tab wasn't on a supported domain
  }
  
  console.log('[GroupBuy] Tab closed on supported domain:', tabInfo.baseDomain);
  activeTabs.delete(tabId);
  
  // Clear all cookies for this domain to log the user out
  try {
    await clearCookiesForDomain(tabInfo.baseDomain);
    console.log('[GroupBuy] Cleared cookies for', tabInfo.baseDomain, '- user logged out');
    
    // Also notify backend about logout
    const stored = await chrome.storage.local.get(['accessCode', 'sessionToken']);
    if (stored.accessCode) {
      await fetch(`${API_URL}/extension/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          accessCode: stored.accessCode,
          sessionToken: stored.sessionToken,
          domain: tabInfo.baseDomain
        }),
      }).catch(err => console.log('[GroupBuy] Failed to notify backend of logout:', err));
    }
  } catch (error) {
    console.error('[GroupBuy] Error clearing cookies on tab close:', error);
  }
});

// Helper function to clear all cookies for a domain
async function clearCookiesForDomain(baseDomain) {
  console.log('[GroupBuy] Clearing cookies for domain:', baseDomain);
  
  // Get all cookies for this domain
  const cookies = await chrome.cookies.getAll({ domain: baseDomain });
  
  // Also get cookies for the parent domain (e.g., .blinkist.com)
  const parentDomainCookies = await chrome.cookies.getAll({ domain: '.' + baseDomain });
  
  const allCookies = [...cookies, ...parentDomainCookies];
  
  // Remove duplicates based on name and domain
  const uniqueCookies = allCookies.filter((cookie, index, self) =>
    index === self.findIndex(c => c.name === cookie.name && c.domain === cookie.domain)
  );
  
  console.log('[GroupBuy] Found', uniqueCookies.length, 'cookies to clear');
  
  for (const cookie of uniqueCookies) {
    const protocol = cookie.secure ? 'https' : 'http';
    const url = `${protocol}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
    
    try {
      await chrome.cookies.remove({ url, name: cookie.name });
      console.log('[GroupBuy] Removed cookie:', cookie.name);
    } catch (error) {
      console.error('[GroupBuy] Failed to remove cookie:', cookie.name, error);
    }
  }
  
  return uniqueCookies.length;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CREDENTIALS') {
    handleGetCredentials(message)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === 'LOG_ACCESS') {
    handleLogAccess(message)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === 'CHECK_SESSION') {
    handleCheckSession()
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  // Handle secure credential fetch from content script (bypasses Mixed Content)
  if (message.type === 'FETCH_CREDENTIALS_SECURE') {
    handleSecureCredentialFetch(message)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Handle session cookies fetch and injection
  if (message.type === 'FETCH_SESSION_COOKIES') {
    handleFetchSessionCookies(message)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Handle cookie injection
  if (message.type === 'INJECT_COOKIES') {
    handleInjectCookies(message)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Handle one-time token request from content script
  if (message.type === 'REQUEST_TOKEN') {
    handleRequestToken(message)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Handle log access from content script
  if (message.type === 'LOG_ACCESS_FROM_CONTENT') {
    handleLogAccessFromContent(message)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Handle fetch selectors from content script (for dynamic configuration)
  if (message.type === 'FETCH_SELECTORS') {
    handleFetchSelectors(message)
      .then(sendResponse)
      .catch(error => sendResponse({ supported: false, error: error.message }));
    return true;
  }
});

async function handleGetCredentials(message) {
  const stored = await chrome.storage.local.get(['accessCode']);
  
  if (!stored.accessCode) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_URL}/extension/get-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessCode: stored.accessCode,
      productId: message.productId,
      deviceFingerprint: message.deviceFingerprint,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to get credentials');
  }

  await chrome.storage.local.set({
    sessionToken: data.sessionToken,
    currentProduct: message.productId,
  });

  return data;
}

async function handleLogAccess(message) {
  const stored = await chrome.storage.local.get(['accessCode']);
  
  if (!stored.accessCode) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_URL}/extension/log-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessCode: stored.accessCode,
      productId: message.productId,
      action: message.action,
      deviceFingerprint: message.deviceFingerprint,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to log access');
  }

  return data;
}

async function handleCheckSession() {
  const stored = await chrome.storage.local.get(['sessionToken', 'accessCode']);
  
  if (!stored.sessionToken || !stored.accessCode) {
    return { valid: false };
  }

  try {
    const response = await fetch(`${API_URL}/extension/check-session`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stored.sessionToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      await chrome.storage.local.remove(['sessionToken', 'currentProduct']);
      return { valid: false };
    }

    return { valid: true, ...data };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

setInterval(async () => {
  const stored = await chrome.storage.local.get(['sessionToken']);
  
  if (stored.sessionToken) {
    const result = await handleCheckSession();
    
    if (!result.valid) {
      console.log('[GroupBuy] Session expired, clearing local data');
      await chrome.storage.local.remove(['sessionToken', 'currentProduct']);
    }
  }
}, 5 * 60 * 1000);

// Handler for requesting one-time token (called from content script)
async function handleRequestToken(message) {
  const stored = await chrome.storage.local.get(['accessCode']);
  
  if (!stored.accessCode) {
    throw new Error('No access code stored');
  }

  console.log('[GroupBuy Background] Requesting one-time token...');
  
  const response = await fetch(`${API_URL}/extension/request-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessCode: stored.accessCode,
      deviceFingerprint: message.deviceFingerprint,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to get token');
  }

  return { success: true, token: data.token };
}

// Handler for secure credential fetch (called from content script)
async function handleSecureCredentialFetch(message) {
  console.log('[GroupBuy Background] Fetching encrypted credentials...');
  
  const response = await fetch(`${API_URL}/extension/get-credentials-secure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      oneTimeToken: message.oneTimeToken,
      publicKey: message.publicKey,
      product: message.product,
      deviceFingerprint: message.deviceFingerprint,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to get credentials');
  }

  // Store session token
  if (data.sessionToken) {
    await chrome.storage.local.set({
      sessionToken: data.sessionToken,
      currentProduct: message.product,
    });
  }

  return { 
    success: true, 
    encryptedCredentials: data.encryptedCredentials,
    sessionToken: data.sessionToken 
  };
}

// Handler for fetching selectors from backend (for dynamic configuration)
async function handleFetchSelectors(message) {
  console.log('[GroupBuy Background] Fetching selectors for domain:', message.domain);
  
  try {
    const response = await fetch(`${API_URL}/extension/selectors/${encodeURIComponent(message.domain)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      console.log('[GroupBuy Background] No selectors found for domain:', message.domain);
      return { supported: false };
    }

    console.log('[GroupBuy Background] Selectors found for:', data.productName);
    return {
      supported: true,
      productName: data.productName,
      loginUrl: data.loginUrl,
      selectors: data.selectors,
    };
  } catch (error) {
    console.error('[GroupBuy Background] Error fetching selectors:', error);
    return { supported: false, error: error.message };
  }
}

// Handler for logging access from content script
async function handleLogAccessFromContent(message) {
  const stored = await chrome.storage.local.get(['accessCode']);
  
  if (!stored.accessCode) {
    throw new Error('No access code stored');
  }

  const response = await fetch(`${API_URL}/extension/log-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessCode: stored.accessCode,
      action: message.action,
      product: message.product,
      deviceFingerprint: message.deviceFingerprint,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to log access');
  }

  return { success: true };
}

// Handler for fetching session cookies from backend
async function handleFetchSessionCookies(message) {
  const stored = await chrome.storage.local.get(['accessCode']);
  
  if (!stored.accessCode) {
    throw new Error('No access code stored');
  }

  console.log('[GroupBuy Background] Fetching session cookies...');
  
  const response = await fetch(`${API_URL}/extension/get-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessCode: stored.accessCode,
      product: message.product,
      deviceFingerprint: message.deviceFingerprint,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to get session cookies');
  }

  // Store session token
  if (data.sessionToken) {
    await chrome.storage.local.set({
      sessionToken: data.sessionToken,
      currentProduct: message.product,
    });
  }

  return { 
    success: true, 
    sessionCookies: data.sessionCookies,
    serviceUrl: data.serviceUrl,
    loginUrl: data.loginUrl,
    loginDomain: data.loginDomain,
    sessionToken: data.sessionToken,
    productName: data.productName,
  };
}

// Handler for injecting cookies into the browser
async function handleInjectCookies(message) {
  const { cookies, domain } = message;
  
  if (!cookies || !Array.isArray(cookies)) {
    throw new Error('Invalid cookies format');
  }

  console.log('[GroupBuy Background] Injecting', cookies.length, 'cookies for domain:', domain);
  
  const results = [];
  
  for (const cookie of cookies) {
    try {
      // Construct the URL for the cookie
      const protocol = cookie.secure ? 'https' : 'http';
      const cookieDomain = cookie.domain || domain;
      const url = `${protocol}://${cookieDomain.replace(/^\./, '')}${cookie.path || '/'}`;
      
      const cookieDetails = {
        url: url,
        name: cookie.name,
        value: cookie.value,
        domain: cookieDomain,
        path: cookie.path || '/',
        secure: cookie.secure || false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'lax',
      };
      
      // Set expiration if provided
      if (cookie.expirationDate) {
        cookieDetails.expirationDate = cookie.expirationDate;
      } else {
        // Default to 30 days from now
        cookieDetails.expirationDate = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      }
      
      await chrome.cookies.set(cookieDetails);
      results.push({ name: cookie.name, success: true });
      console.log('[GroupBuy Background] Cookie set:', cookie.name);
    } catch (error) {
      console.error('[GroupBuy Background] Failed to set cookie:', cookie.name, error);
      results.push({ name: cookie.name, success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log('[GroupBuy Background] Injected', successCount, 'of', cookies.length, 'cookies');
  
  return { 
    success: successCount > 0, 
    results,
    injectedCount: successCount,
    totalCount: cookies.length,
  };
}
