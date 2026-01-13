const API_URL = 'http://localhost:5000/api';

let currentSubscriptions = [];
let selectedSubscription = null;
let currentAccessCode = null;

document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const loginForm = document.getElementById('loginForm');
  const subscriptions = document.getElementById('subscriptions');

  const stored = await chrome.storage.local.get(['accessCode', 'subscriptions', 'userEmail']);
  
  if (stored.accessCode && stored.subscriptions) {
    currentAccessCode = stored.accessCode;
    currentSubscriptions = stored.subscriptions;
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

    await chrome.storage.local.set({
      accessCode,
      subscriptions: data.subscriptions,
      userEmail: data.user?.email,
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
