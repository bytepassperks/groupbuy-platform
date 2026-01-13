const API_URL = 'http://165.22.2.0/api';

// Security: Clear any sensitive data on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('[GroupBuy] Extension installed/updated');
  // Clear any cached credentials on install/update for security
  chrome.storage.local.remove(['cachedCredentials']);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  
  const stored = await chrome.storage.local.get(['sessionToken', 'currentProduct', 'accessCode']);
  
  if (!stored.sessionToken || !stored.currentProduct) return;

  const supportedDomains = [
    'semrush.com',
    'ahrefs.com',
    'canva.com',
    'netflix.com',
    'blinkist.com',
  ];

  const url = new URL(tab.url || '');
  const isSupported = supportedDomains.some(domain => url.hostname.includes(domain));

  if (!isSupported) return;

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'CHECK_LOGIN_PAGE' });
    
    if (response && response.isLoginPage) {
      console.log('[GroupBuy] Login page detected on', response.hostname);
    }
  } catch (error) {
    console.log('[GroupBuy] Content script not ready yet');
  }
});

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
