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
};

function getHostname() {
  const hostname = window.location.hostname;
  for (const domain of Object.keys(LOGIN_SELECTORS)) {
    if (hostname.includes(domain.replace('*.', ''))) {
      return domain;
    }
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
    simulateInput(emailField, credentials.email);
    console.log('[GroupBuy] Email entered');

    await new Promise(resolve => setTimeout(resolve, 500));

    const passwordField = await waitForElement(selectors.passwordField);
    simulateInput(passwordField, credentials.password);
    console.log('[GroupBuy] Password entered');

    await new Promise(resolve => setTimeout(resolve, 500));

    const submitButton = await waitForElement(selectors.submitButton);
    submitButton.click();
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
    
    if (!hostname) {
      console.log('[GroupBuy] Unknown website, cannot auto-login');
      sendResponse({ success: false, error: 'Unknown website' });
      return;
    }

    const selectors = LOGIN_SELECTORS[hostname];
    
    performLogin(message.credentials, selectors)
      .then(success => {
        sendResponse({ success });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }

  if (message.type === 'CHECK_LOGIN_PAGE') {
    const hostname = getHostname();
    if (!hostname) {
      sendResponse({ isLoginPage: false });
      return;
    }

    const selectors = LOGIN_SELECTORS[hostname];
    const isLoginPage = !!document.querySelector(selectors.loginPageIndicator) ||
                        !!document.querySelector(selectors.emailField);
    
    sendResponse({ isLoginPage, hostname });
  }
});

(async function() {
  const hostname = getHostname();
  if (!hostname) return;

  const stored = await chrome.storage.local.get(['pendingLogin', 'currentProduct']);
  
  if (stored.pendingLogin && stored.pendingLogin.productId === stored.currentProduct) {
    const selectors = LOGIN_SELECTORS[hostname];
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const isLoginPage = !!document.querySelector(selectors.loginPageIndicator) ||
                        !!document.querySelector(selectors.emailField);
    
    if (isLoginPage) {
      console.log('[GroupBuy] Detected login page, attempting auto-login...');
      
      const success = await performLogin(stored.pendingLogin.credentials, selectors);
      
      if (success) {
        await chrome.storage.local.remove(['pendingLogin']);
      }
    }
  }
})();
