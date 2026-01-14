const API_URL = 'http://165.22.2.0/api';

// Cache for dynamically fetched selectors
let cachedSelectors = null;
let cachedHostname = null;

// ============================================
// BLOCKED PAGES PROTECTION
// ============================================

// URL patterns that should be blocked (settings, billing, account, etc.)
const BLOCKED_URL_PATTERNS = [
  // Settings pages
  /\/settings/i,
  /\/account[-_]?settings/i,
  /\/preferences/i,
  /\/options/i,
  
  // Billing and payment pages
  /\/billing/i,
  /\/payment/i,
  /\/subscription/i,
  /\/invoices?/i,
  /\/pricing/i,
  /\/upgrade/i,
  /\/plans?/i,
  /\/checkout/i,
  
  // Account and profile pages
  /\/account(?!\/login)/i,
  /\/profile/i,
  /\/my[-_]?account/i,
  /\/user[-_]?settings/i,
  
  // Security pages
  /\/security/i,
  /\/password/i,
  /\/change[-_]?password/i,
  /\/two[-_]?factor/i,
  /\/2fa/i,
  /\/mfa/i,
  
  // Personal info pages
  /\/personal[-_]?info/i,
  /\/edit[-_]?profile/i,
  /\/notifications[-_]?settings/i,
  
  // API and developer pages (may contain keys)
  /\/api[-_]?keys/i,
  /\/developer/i,
  /\/tokens/i,
  /\/integrations/i,
];

// Keywords in link text that indicate blocked pages
const BLOCKED_LINK_KEYWORDS = [
  'settings', 'billing', 'payment', 'subscription', 'account',
  'profile', 'security', 'password', 'preferences', 'invoices',
  'upgrade', 'plan', 'personal', 'notifications', 'api key',
  'developer', 'integrations', 'my account', 'edit profile'
];

// Check if a URL matches any blocked pattern
function isBlockedUrl(url) {
  try {
    const urlObj = new URL(url, window.location.origin);
    const pathname = urlObj.pathname.toLowerCase();
    const hash = urlObj.hash.toLowerCase();
    const fullPath = pathname + hash;
    
    for (const pattern of BLOCKED_URL_PATTERNS) {
      if (pattern.test(fullPath)) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Check if link text suggests a blocked page
function isBlockedLinkText(text) {
  const lowerText = text.toLowerCase().trim();
  return BLOCKED_LINK_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// Create and show the blocked page overlay
function showBlockedPageOverlay() {
  // Remove existing overlay if any
  const existingOverlay = document.getElementById('groupbuy-blocked-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'groupbuy-blocked-overlay';
  overlay.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    ">
      <div style="
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 60px;
        max-width: 500px;
        text-align: center;
        backdrop-filter: blur(10px);
      ">
        <div style="
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 30px;
          box-shadow: 0 10px 40px rgba(239, 68, 68, 0.3);
        ">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        </div>
        
        <h1 style="
          color: #ffffff;
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 15px;
          letter-spacing: -0.5px;
        ">Access Restricted</h1>
        
        <p style="
          color: rgba(255, 255, 255, 0.7);
          font-size: 16px;
          line-height: 1.6;
          margin: 0 0 30px;
        ">
          Settings, billing, and account pages are not accessible with shared accounts. 
          This restriction protects the account owner's personal information.
        </p>
        
        <button id="groupbuy-go-back-btn" style="
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border: none;
          padding: 14px 40px;
          font-size: 16px;
          font-weight: 600;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);
        ">
          Go Back
        </button>
        
        <p style="
          color: rgba(255, 255, 255, 0.4);
          font-size: 12px;
          margin-top: 25px;
        ">
          Protected by GroupBuy Security
        </p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Add click handler for go back button
  const goBackBtn = document.getElementById('groupbuy-go-back-btn');
  if (goBackBtn) {
    goBackBtn.addEventListener('click', () => {
      // Try to go back in history, or redirect to main page
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = window.location.origin;
      }
    });

    // Add hover effect
    goBackBtn.addEventListener('mouseenter', () => {
      goBackBtn.style.transform = 'translateY(-2px)';
      goBackBtn.style.boxShadow = '0 6px 25px rgba(59, 130, 246, 0.4)';
    });
    goBackBtn.addEventListener('mouseleave', () => {
      goBackBtn.style.transform = 'translateY(0)';
      goBackBtn.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.3)';
    });
  }

  console.log('[GroupBuy] Blocked page overlay shown - access to settings/billing/account pages is restricted');
}

// Check current page and block if necessary
function checkAndBlockCurrentPage() {
  if (isBlockedUrl(window.location.href)) {
    showBlockedPageOverlay();
    return true;
  }
  return false;
}

// Intercept clicks on links that lead to blocked pages
function interceptBlockedLinks() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Check if the URL is blocked
    if (isBlockedUrl(href)) {
      event.preventDefault();
      event.stopPropagation();
      showBlockedPageOverlay();
      console.log('[GroupBuy] Blocked navigation to restricted page:', href);
      return;
    }

    // Check if the link text suggests a blocked page
    const linkText = link.textContent || link.innerText || '';
    if (isBlockedLinkText(linkText) && href !== '#') {
      // Double-check by examining the href more carefully
      const lowerHref = href.toLowerCase();
      if (BLOCKED_LINK_KEYWORDS.some(keyword => lowerHref.includes(keyword.replace(' ', '')))) {
        event.preventDefault();
        event.stopPropagation();
        showBlockedPageOverlay();
        console.log('[GroupBuy] Blocked navigation based on link text:', linkText);
        return;
      }
    }
  }, true); // Use capture phase to intercept before other handlers
}

// Monitor URL changes (for single-page applications)
function monitorUrlChanges() {
  // Monitor pushState
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    setTimeout(() => checkAndBlockCurrentPage(), 100);
  };

  // Monitor replaceState
  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    setTimeout(() => checkAndBlockCurrentPage(), 100);
  };

  // Monitor popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    setTimeout(() => checkAndBlockCurrentPage(), 100);
  });

  // Monitor hashchange
  window.addEventListener('hashchange', () => {
    setTimeout(() => checkAndBlockCurrentPage(), 100);
  });
}

// Initialize blocked pages protection
function initBlockedPagesProtection() {
  // Check current page immediately
  if (checkAndBlockCurrentPage()) {
    return; // Page is blocked, no need to continue
  }

  // Set up click interception
  interceptBlockedLinks();

  // Monitor URL changes for SPAs
  monitorUrlChanges();

  console.log('[GroupBuy] Blocked pages protection initialized');
}

// ============================================
// END BLOCKED PAGES PROTECTION
// ============================================

// Fetch selectors from backend for dynamic configuration
async function fetchSelectorsFromBackend(hostname) {
  try {
    // Use background script to fetch selectors (bypasses Mixed Content)
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_SELECTORS',
      domain: hostname,
    });

    if (response && response.supported) {
      return {
        emailField: response.selectors.email || 'input[type="email"], input[name="email"]',
        passwordField: response.selectors.password || 'input[type="password"], input[name="password"]',
        submitButton: response.selectors.submit || 'button[type="submit"], input[type="submit"]',
        loginPageIndicator: response.selectors.loginPageIndicator || 'form',
      };
    }
    return null;
  } catch (error) {
    console.error('[GroupBuy] Error fetching selectors:', error);
    return null;
  }
}

// RSA key generation for secure credential transfer
async function generateRSAKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
  return keyPair;
}

async function exportPublicKeyToPEM(publicKey) {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  const exportedAsBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  const pemExported = `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  return pemExported;
}

async function decryptWithPrivateKey(encryptedBase64, privateKey) {
  const encryptedData = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedData
  );
  return new TextDecoder().decode(decrypted);
}

const LOGIN_SELECTORS = {
  'semrush.com': {
    emailField: 'input[name="email"], input[type="email"]',
    passwordField: 'input[name="password"], input[type="password"]',
    submitButton: 'button[type="submit"], input[type="submit"]',
    loginPageIndicator: '.srf-login-form, [data-test="login-form"]',
  },
  'ahrefs.com': {
    emailField: 'input[name="email"], input[type="email"], #email',
    passwordField: 'input[name="password"], input[type="password"], #password',
    submitButton: 'button[type="submit"], input[type="submit"]',
    loginPageIndicator: '.login-form, [data-test="login"]',
  },
  'canva.com': {
    emailField: 'input[name="email"], input[type="email"]',
    passwordField: 'input[name="password"], input[type="password"]',
    submitButton: 'button[type="submit"], [data-testid="submit-button"]',
    loginPageIndicator: '[data-testid="login-page"]',
  },
  'netflix.com': {
    emailField: 'input[name="userLoginId"], input[name="email"], #id_userLoginId',
    passwordField: 'input[name="password"], #id_password',
    submitButton: 'button[type="submit"], .login-button',
    loginPageIndicator: '.login-form, [data-uia="login-page-container"]',
  },
  'blinkist.com': {
    emailField: 'input[name="login[email]"], input[name="email"], input[type="email"]',
    passwordField: 'input[name="login[password]"], input[name="password"], input[type="password"]',
    submitButton: 'input[type="submit"][name="commit"], button[type="submit"]',
    loginPageIndicator: 'form input[name="login[email]"], h1',
  },
};

function getHostname() {
  // Return the actual hostname for dynamic lookup
  return window.location.hostname;
}

// Check if we have selectors for this hostname (either hardcoded or from backend)
async function getSelectorsForHostname(hostname) {
  // First check hardcoded selectors (for backward compatibility)
  for (const domain of Object.keys(LOGIN_SELECTORS)) {
    if (hostname.includes(domain.replace('*.', ''))) {
      return { selectors: LOGIN_SELECTORS[domain], matchedDomain: domain };
    }
  }
  
  // If not found in hardcoded list, try to fetch from backend
  const dynamicSelectors = await fetchSelectorsFromBackend(hostname);
  if (dynamicSelectors) {
    return { selectors: dynamicSelectors, matchedDomain: hostname };
  }
  
  return null;
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

function isInOverlay(el) {
  if (!el) return false;
  return el.closest('[role="dialog"], .cookie-banner, .modal, .overlay, [class*="cookie"], [class*="consent"], [class*="popup"], [class*="banner"]') != null;
}

function clickCookieButtons() {
  const buttons = Array.from(document.querySelectorAll('button, a, span'));
  
  for (const btn of buttons) {
    const text = btn.textContent.toLowerCase();
    if ((text.includes('accept') && (text.includes('cookie') || text.includes('all'))) ||
        text.includes('allow all') ||
        text.includes('agree') ||
        text === 'accept' ||
        text === 'ok') {
      
      if (btn.offsetParent !== null) {
        console.log('[GroupBuy] Clicking cookie accept button:', btn.textContent.trim());
        btn.click();
        return true;
      }
    }
  }
  return false;
}

function simulateInput(element, value) {
  element.focus();
  element.value = value;
  
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

async function performLogin(credentials, selectors) {
  try {
    console.log('[GroupBuy] Starting auto-login...');

    const emailField = await waitForElement(selectors.emailField);
    
    if (isInOverlay(emailField)) {
      console.log('[GroupBuy] Email field is in an overlay, skipping');
      return false;
    }

    const form = emailField.closest('form');
    if (!form) {
      console.log('[GroupBuy] Warning: Email field is not inside a form element');
    }

    simulateInput(emailField, credentials.email);
    console.log('[GroupBuy] Email entered');

    await new Promise(resolve => setTimeout(resolve, 500));

    const passwordField = await waitForElement(selectors.passwordField);
    
    if (isInOverlay(passwordField)) {
      console.log('[GroupBuy] Password field is in an overlay, skipping');
      return false;
    }

    simulateInput(passwordField, credentials.password);
    console.log('[GroupBuy] Password entered');

    await new Promise(resolve => setTimeout(resolve, 500));

    const submitButton = await waitForElement(selectors.submitButton);
    
    if (isInOverlay(submitButton)) {
      console.log('[GroupBuy] Submit button is in an overlay, skipping');
      return false;
    }

    if (form) {
      const formSubmitButton = form.querySelector(selectors.submitButton);
      if (formSubmitButton && !isInOverlay(formSubmitButton)) {
        console.log('[GroupBuy] Clicking form submit button');
        formSubmitButton.click();
      } else {
        console.log('[GroupBuy] Clicking detected submit button');
        submitButton.click();
      }
    } else {
      submitButton.click();
    }
    
    console.log('[GroupBuy] Login submitted');

    return true;
  } catch (error) {
    console.error('[GroupBuy] Auto-login failed:', error);
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTO_LOGIN') {
    const hostname = getHostname();
    
    // Get selectors dynamically
    getSelectorsForHostname(hostname).then(selectorResult => {
      if (!selectorResult) {
        console.log('[GroupBuy] Unknown website, cannot auto-login');
        sendResponse({ success: false, error: 'Unknown website' });
        return;
      }

      const { selectors, matchedDomain } = selectorResult;
      
      performLogin(message.credentials, selectors)
        .then(success => {
          sendResponse({ success });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
    });

    return true;
  }

  if (message.type === 'CHECK_LOGIN_PAGE') {
    const hostname = getHostname();
    
    // Get selectors dynamically
    getSelectorsForHostname(hostname).then(selectorResult => {
      if (!selectorResult) {
        sendResponse({ isLoginPage: false });
        return;
      }

      const { selectors, matchedDomain } = selectorResult;
      const isLoginPage = !!document.querySelector(selectors.loginPageIndicator) ||
                          !!document.querySelector(selectors.emailField);
      
      sendResponse({ isLoginPage, hostname: matchedDomain });
    });
    
    return true;
  }
});

async function getDeviceFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('fingerprint', 2, 2);
  const canvasData = canvas.toDataURL();

  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvasData.slice(-50),
  ].join('|');

  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchSessionCookiesAndInject(hostname) {
  try {
    console.log('[GroupBuy] Starting session cookie injection...');
    
    const stored = await chrome.storage.local.get(['accessCode']);
    
    if (!stored.accessCode) {
      console.log('[GroupBuy] No access code found. Please enter your access code in the extension popup.');
      return false;
    }

    const deviceFingerprint = await getDeviceFingerprint();

    // Step 1: Fetch session cookies via background script
    console.log('[GroupBuy] Fetching session cookies via background script...');
    const cookieResponse = await chrome.runtime.sendMessage({
      type: 'FETCH_SESSION_COOKIES',
      product: hostname,
      deviceFingerprint,
    });

    if (!cookieResponse || !cookieResponse.success) {
      console.error('[GroupBuy] Failed to get session cookies:', cookieResponse?.error || 'Unknown error');
      return false;
    }

    const { sessionCookies, serviceUrl, loginDomain, productName } = cookieResponse;

    if (!sessionCookies || !Array.isArray(sessionCookies) || sessionCookies.length === 0) {
      console.error('[GroupBuy] No session cookies available for this product');
      return false;
    }

    console.log('[GroupBuy] Got', sessionCookies.length, 'session cookies for', productName);

    // Step 2: Inject cookies via background script (chrome.cookies.set requires background)
    console.log('[GroupBuy] Injecting cookies...');
    const injectResponse = await chrome.runtime.sendMessage({
      type: 'INJECT_COOKIES',
      cookies: sessionCookies,
      domain: loginDomain || hostname,
    });

    if (!injectResponse || !injectResponse.success) {
      console.error('[GroupBuy] Failed to inject cookies:', injectResponse?.error || 'Unknown error');
      return false;
    }

    console.log('[GroupBuy] Successfully injected', injectResponse.injectedCount, 'of', injectResponse.totalCount, 'cookies');

    // Step 3: Log access
    await chrome.runtime.sendMessage({
      type: 'LOG_ACCESS_FROM_CONTENT',
      action: 'session_injected',
      product: hostname,
      deviceFingerprint,
    });

    // Step 4: Redirect to service URL if available
    if (serviceUrl) {
      console.log('[GroupBuy] Redirecting to service URL:', serviceUrl);
      window.location.href = serviceUrl;
    } else {
      // Reload the page to apply cookies
      console.log('[GroupBuy] Reloading page to apply cookies...');
      window.location.reload();
    }

    return true;
  } catch (error) {
    console.error('[GroupBuy] Error in session cookie injection:', error);
    return false;
  }
}

// Legacy function for backward compatibility (credential-based login)
async function fetchCredentialsAndLogin(hostname, selectors) {
  // Now redirects to session-based approach
  return fetchSessionCookiesAndInject(hostname);
}

(async function() {
  const hostname = getHostname();
  if (!hostname) return;

  console.log('[GroupBuy] Extension loaded on', hostname);

  // Initialize blocked pages protection FIRST (before any other logic)
  // This ensures settings/billing/account pages are blocked immediately
  initBlockedPagesProtection();

  // Check if we already injected cookies for this domain in this session
  const injectionKey = `groupbuy_injected_${hostname}`;
  if (sessionStorage.getItem(injectionKey)) {
    console.log('[GroupBuy] Cookies already injected for this session, skipping');
    return;
  }

  // Wait for page to fully load
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Try to click cookie consent buttons
  clickCookieButtons();

  await new Promise(resolve => setTimeout(resolve, 500));

  // Check if we have an access code stored
  const stored = await chrome.storage.local.get(['accessCode', 'autoLoginEnabled']);
  
  if (!stored.accessCode) {
    console.log('[GroupBuy] No access code stored. Please enter your access code in the extension popup.');
    return;
  }

  if (stored.autoLoginEnabled === false) {
    console.log('[GroupBuy] Auto-login is disabled');
    return;
  }

  // Check if this domain is supported by fetching from backend
  console.log('[GroupBuy] Checking if domain is supported:', hostname);
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_SELECTORS',
      domain: hostname,
    });

    if (!response || !response.supported) {
      console.log('[GroupBuy] Domain not supported:', hostname);
      return;
    }

    console.log('[GroupBuy] Domain supported, product:', response.productName);

    // Mark as injected BEFORE injecting to prevent loops
    sessionStorage.setItem(injectionKey, 'true');

    // Use session-based cookie injection
    await fetchSessionCookiesAndInject(hostname);
    
  } catch (error) {
    console.log('[GroupBuy] Error checking domain support:', error.message);
    // Remove the injection flag if there was an error so user can retry
    sessionStorage.removeItem(injectionKey);
  }
})();
