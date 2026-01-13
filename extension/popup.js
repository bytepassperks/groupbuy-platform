const API_URL = 'http://165.22.2.0/api';

let currentSubscriptions = [];
let selectedSubscription = null;
let currentAccessCode = null;
let isAdmin = false;
let products = [];
let capturedCookies = [];
let currentDomain = '';
let authToken = null;

document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const loginForm = document.getElementById('loginForm');
  const subscriptions = document.getElementById('subscriptions');

  const stored = await chrome.storage.local.get(['accessCode', 'subscriptions', 'userEmail', 'userRole', 'products', 'authToken']);
  
  if (stored.accessCode && stored.subscriptions) {
    currentAccessCode = stored.accessCode;
    currentSubscriptions = stored.subscriptions;
    isAdmin = stored.userRole === 'admin';
    products = stored.products || [];
    authToken = stored.authToken;
    showSubscriptions(stored.userEmail);
  } else {
    showLoginForm();
  }

  document.getElementById('verifyBtn').addEventListener('click', verifyCode);
  document.getElementById('accessCode').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyCode();
  });
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('autoLoginBtn').addEventListener('click', performAutoLogin);
  
  // Admin-specific event listeners
  document.getElementById('captureBtn').addEventListener('click', captureCookies);
  document.getElementById('saveCookiesBtn').addEventListener('click', saveCookiesToProduct);
  
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  // Get current tab domain
  updateCurrentDomain();
});

function showLoginForm() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('loginForm').classList.add('active');
  document.getElementById('subscriptions').classList.remove('active');
}

function showSubscriptions(email) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('loginForm').classList.remove('active');
  document.getElementById('subscriptions').classList.add('active');
  document.getElementById('userEmail').textContent = email || 'User';
  
  // Show admin badge and tabs if user is admin
  if (isAdmin) {
    document.getElementById('adminBadge').style.display = 'inline-block';
    document.getElementById('adminTabs').style.display = 'flex';
    populateProductSelect();
  }
  
  renderSubscriptions();
}

function showError(message) {
  const error = document.getElementById('error');
  error.textContent = message;
  error.classList.add('show');
  setTimeout(() => error.classList.remove('show'), 5000);
}

async function verifyCode() {
  const accessCode = document.getElementById('accessCode').value.trim();
  const verifyBtn = document.getElementById('verifyBtn');
  
  if (!accessCode) {
    showError('Please enter your access code');
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying...';

  try {
    const response = await fetch(`${API_URL}/extension/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Verification failed');
    }

    currentAccessCode = accessCode;
    currentSubscriptions = data.subscriptions;
    isAdmin = data.user?.role === 'admin';
    products = data.products || [];

    await chrome.storage.local.set({
      accessCode,
      subscriptions: data.subscriptions,
      userEmail: data.user?.email,
      userRole: data.user?.role,
      products: data.products,
    });

    showSubscriptions(data.user?.email);
  } catch (error) {
    showError(error.message);
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify Code';
  }
}

function renderSubscriptions() {
  const list = document.getElementById('subscriptionList');
  const autoLoginBtn = document.getElementById('autoLoginBtn');

  if (currentSubscriptions.length === 0) {
    list.innerHTML = '<div class="no-subscriptions">No active subscriptions</div>';
    autoLoginBtn.style.display = 'none';
    return;
  }

  list.innerHTML = currentSubscriptions.map((sub, index) => {
    const expiresDate = new Date(sub.expires_at);
    const isExpired = expiresDate < new Date();
    const statusClass = isExpired ? 'status-expired' : 'status-active';
    const statusText = isExpired ? 'Expired' : 'Active';

    return `
      <div class="subscription-item ${selectedSubscription === index ? 'active' : ''}" data-index="${index}">
        <div class="subscription-name">${sub.product_name}</div>
        <div class="subscription-expires">Expires: ${expiresDate.toLocaleDateString()}</div>
        <span class="subscription-status ${statusClass}">${statusText}</span>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.subscription-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      selectedSubscription = index;
      renderSubscriptions();
    });
  });

  autoLoginBtn.style.display = selectedSubscription !== null ? 'block' : 'none';
}

async function performAutoLogin() {
  if (selectedSubscription === null) return;

  const subscription = currentSubscriptions[selectedSubscription];
  const autoLoginBtn = document.getElementById('autoLoginBtn');

  autoLoginBtn.disabled = true;
  autoLoginBtn.textContent = 'Logging in...';

  try {
    const deviceFingerprint = await getDeviceFingerprint();

    const response = await fetch(`${API_URL}/extension/get-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessCode: currentAccessCode,
        productId: subscription.product_id,
        deviceFingerprint,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get credentials');
    }

    await chrome.storage.local.set({
      sessionToken: data.sessionToken,
      currentProduct: subscription.product_id,
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && data.loginUrl) {
      await chrome.tabs.update(tab.id, { url: data.loginUrl });
      
      setTimeout(async () => {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'AUTO_LOGIN',
          credentials: data.credentials,
          loginUrl: data.loginUrl,
        });
      }, 2000);
    }

    await fetch(`${API_URL}/extension/log-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessCode: currentAccessCode,
        productId: subscription.product_id,
        action: 'login_initiated',
        deviceFingerprint,
      }),
    });

    window.close();
  } catch (error) {
    showError(error.message);
  } finally {
    autoLoginBtn.disabled = false;
    autoLoginBtn.textContent = 'Auto-Login to Selected Tool';
  }
}

async function logout() {
  try {
    if (currentAccessCode) {
      await fetch(`${API_URL}/extension/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: currentAccessCode }),
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  }

  await chrome.storage.local.clear();
  currentAccessCode = null;
  currentSubscriptions = [];
  selectedSubscription = null;
  showLoginForm();
}

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

// Admin functions for cookie capture

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  
  if (tabName === 'user') {
    document.getElementById('userTab').style.display = 'block';
    document.getElementById('adminTab').classList.remove('active');
  } else {
    document.getElementById('userTab').style.display = 'none';
    document.getElementById('adminTab').classList.add('active');
    updateCurrentDomain();
  }
}

async function updateCurrentDomain() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      currentDomain = url.hostname;
      document.getElementById('currentDomain').textContent = currentDomain;
      
      // Get cookie count for this domain
      const cookies = await chrome.cookies.getAll({ domain: currentDomain });
      document.getElementById('cookieCount').textContent = `${cookies.length} cookies found`;
    }
  } catch (error) {
    document.getElementById('currentDomain').textContent = 'Unable to detect';
    console.error('Error getting current domain:', error);
  }
}

function populateProductSelect() {
  const select = document.getElementById('productSelect');
  select.innerHTML = '<option value="">Select a product...</option>';
  
  products.forEach(product => {
    const option = document.createElement('option');
    option.value = product.id;
    option.textContent = product.name;
    if (product.login_domain) {
      option.textContent += ` (${product.login_domain})`;
    }
    select.appendChild(option);
  });
}

async function captureCookies() {
  const captureBtn = document.getElementById('captureBtn');
  const cookiePreview = document.getElementById('cookiePreview');
  const saveCookiesBtn = document.getElementById('saveCookiesBtn');
  const adminError = document.getElementById('adminError');
  
  captureBtn.disabled = true;
  captureBtn.textContent = 'Capturing...';
  adminError.classList.remove('show');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      throw new Error('Unable to access current tab');
    }
    
    const url = new URL(tab.url);
    currentDomain = url.hostname;
    
    // Get all cookies for this domain (including parent domains)
    const domainParts = currentDomain.split('.');
    let allCookies = [];
    
    // Get cookies for the exact domain
    const exactCookies = await chrome.cookies.getAll({ domain: currentDomain });
    allCookies = [...exactCookies];
    
    // Get cookies for parent domains (e.g., .blinkist.com for www.blinkist.com)
    if (domainParts.length > 2) {
      const parentDomain = '.' + domainParts.slice(-2).join('.');
      const parentCookies = await chrome.cookies.getAll({ domain: parentDomain });
      
      // Add parent cookies that aren't already in the list
      parentCookies.forEach(pc => {
        if (!allCookies.find(c => c.name === pc.name && c.domain === pc.domain)) {
          allCookies.push(pc);
        }
      });
    }
    
    if (allCookies.length === 0) {
      throw new Error('No cookies found for this domain. Make sure you are logged in.');
    }
    
    // Format cookies for storage
    capturedCookies = allCookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate
    }));
    
    // Show preview
    cookiePreview.style.display = 'block';
    cookiePreview.textContent = `Captured ${capturedCookies.length} cookies:\n` + 
      capturedCookies.map(c => `- ${c.name} (${c.domain})`).join('\n');
    
    saveCookiesBtn.style.display = 'block';
    
    document.getElementById('cookieCount').textContent = `${capturedCookies.length} cookies captured`;
    
  } catch (error) {
    adminError.textContent = error.message;
    adminError.classList.add('show');
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = 'Capture Cookies from Current Page';
  }
}

async function saveCookiesToProduct() {
  const productSelect = document.getElementById('productSelect');
  const saveCookiesBtn = document.getElementById('saveCookiesBtn');
  const adminError = document.getElementById('adminError');
  const successMsg = document.getElementById('successMsg');
  
  const productId = productSelect.value;
  
  if (!productId) {
    adminError.textContent = 'Please select a product to save cookies to';
    adminError.classList.add('show');
    return;
  }
  
  if (capturedCookies.length === 0) {
    adminError.textContent = 'No cookies captured. Please capture cookies first.';
    adminError.classList.add('show');
    return;
  }
  
  saveCookiesBtn.disabled = true;
  saveCookiesBtn.textContent = 'Saving...';
  adminError.classList.remove('show');
  successMsg.classList.remove('show');
  
  try {
    // We need to authenticate as admin to save cookies
    // First, get auth token by logging in
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'harryroger798@gmail.com',
        password: '007JamesBond@@'
      }),
    });
    
    if (!loginResponse.ok) {
      throw new Error('Failed to authenticate as admin');
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.accessToken;
    
    // Now save the cookies
    const response = await fetch(`${API_URL}/admin/products/${productId}/capture-cookies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        cookies: capturedCookies,
        domain: currentDomain
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to save cookies');
    }
    
    successMsg.textContent = data.message || `Successfully saved ${capturedCookies.length} cookies!`;
    successMsg.classList.add('show');
    
    // Reset state
    capturedCookies = [];
    document.getElementById('cookiePreview').style.display = 'none';
    saveCookiesBtn.style.display = 'none';
    
  } catch (error) {
    adminError.textContent = error.message;
    adminError.classList.add('show');
  } finally {
    saveCookiesBtn.disabled = false;
    saveCookiesBtn.textContent = 'Save Cookies to Product';
  }
}
