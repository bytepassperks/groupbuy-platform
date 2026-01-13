import express from 'express';
import { db } from '../lib/db';
import { decrypt, hashAccessCode, generateSecureToken, hashToken, generateOneTimeToken, encryptWithPublicKey } from '../lib/encryption';
import { rateLimit } from '../lib/rate-limit';

const router = express.Router();

// In-memory store for one-time tokens (in production, use Redis)
const oneTimeTokens = new Map<string, { expiresAt: Date; used: boolean; accessCodeHash: string }>();

// Clean up expired tokens every minute
setInterval(() => {
  const now = new Date();
  for (const [hash, data] of oneTimeTokens.entries()) {
    if (data.expiresAt < now || data.used) {
      oneTimeTokens.delete(hash);
    }
  }
}, 60 * 1000);

// In-memory store for device bindings (in production, use database)
const deviceBindings = new Map<string, string>(); // accessCodeHash -> deviceFingerprint

// Request a one-time token for secure credential fetching
router.post('/request-token', async (req, res) => {
  const { accessCode, deviceFingerprint } = req.body;

  try {
    const rateLimitKey = `extension-token:${req.ip}`;
    const isLimited = await rateLimit(rateLimitKey, { max: 20, window: 60 });

    if (isLimited) {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }

    if (!accessCode) {
      res.status(400).json({ error: 'Access code is required' });
      return;
    }

    if (!deviceFingerprint) {
      res.status(400).json({ error: 'Device fingerprint is required' });
      return;
    }

    const accessCodeHash = hashAccessCode(accessCode);

    // Verify the access code is valid
    const purchaseResult = await db.query(
      `SELECT p.id FROM purchases p WHERE p.access_code_hash = $1 AND p.status = $2 AND p.expires_at > NOW()`,
      [accessCodeHash, 'active']
    );

    if (purchaseResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid or expired access code' });
      return;
    }

    // Check device binding
    const boundDevice = deviceBindings.get(accessCodeHash);
    if (boundDevice && boundDevice !== deviceFingerprint) {
      console.warn('Access code used from different device');
      res.status(403).json({ 
        error: 'This access code is bound to a different device. Contact support if you need to transfer it.' 
      });
      return;
    }

    // Bind device if not already bound
    if (!boundDevice) {
      deviceBindings.set(accessCodeHash, deviceFingerprint);
      console.log('Device bound to access code');
    }

    // Generate one-time token
    const { token, hash, expiresAt } = generateOneTimeToken();
    
    // Store token with access code hash for verification
    oneTimeTokens.set(hash, { 
      expiresAt, 
      used: false, 
      accessCodeHash 
    });

    res.json({
      success: true,
      token,
      expiresIn: 30 // seconds
    });
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify-code', async (req, res) => {
  const { accessCode } = req.body;

  try {
    if (!accessCode) {
      res.status(400).json({ success: false, error: 'Access code is required' });
      return;
    }

    const accessCodeHash = hashAccessCode(accessCode);

    const result = await db.query(
      `SELECT p.*, prod.name as product_name, prod.login_url FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.access_code_hash = $1 AND p.status = $2 AND p.expires_at > NOW()`,
      [accessCodeHash, 'active']
    );

    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Invalid or expired access code' });
      return;
    }

    const purchase = result.rows[0];

    const subscriptions = await db.query(
      `SELECT prod.id as product_id, prod.name as product_name, prod.login_url, p.expires_at FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.user_id = $1 AND p.status = $2 AND p.expires_at > NOW()`,
      [purchase.user_id, 'active']
    );

    const userResult = await db.query(
      'SELECT email, role FROM users WHERE id = $1',
      [purchase.user_id]
    );

    const user = userResult.rows[0];

    // If user is admin, also fetch all products for cookie capture
    let products: any[] = [];
    if (user && user.role === 'admin') {
      const productsResult = await db.query(
        'SELECT id, name, login_domain, service_url, session_expires_at FROM products WHERE status = $1 ORDER BY name',
        ['active']
      );
      products = productsResult.rows;
    }

    res.json({
      success: true,
      user: user ? { email: user.email, role: user.role } : null,
      subscriptions: subscriptions.rows.map((row: any) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        login_url: row.login_url,
        expires_at: row.expires_at
      })),
      products: user?.role === 'admin' ? products : undefined
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/get-credentials', async (req, res) => {
  const { accessCode, product, deviceFingerprint } = req.body;

  try {
    const rateLimitKey = `extension-creds:${req.ip}`;
    const isLimited = await rateLimit(rateLimitKey, { max: 10, window: 60 });

    if (isLimited) {
      console.warn('Rate limit exceeded for IP:', req.ip);
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }

    if (!accessCode) {
      res.status(400).json({ error: 'Access code is required' });
      return;
    }

    const accessCodeHash = hashAccessCode(accessCode);

    const purchaseResult = await db.query(
      `SELECT p.*, prod.id as prod_id, prod.name as prod_name, prod.encrypted_session_cookies, 
              prod.session_expires_at, prod.max_concurrent_users, prod.service_url, prod.login_url, prod.login_domain
       FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.access_code_hash = $1 AND p.status = $2`,
      [accessCodeHash, 'active']
    );

    if (purchaseResult.rows.length === 0) {
      console.warn('Invalid access code attempted');
      res.status(401).json({ error: 'Invalid access code' });
      return;
    }

    const purchase = purchaseResult.rows[0];

    if (new Date() > new Date(purchase.expires_at)) {
      console.warn('Subscription expired');
      res.status(403).json({ error: 'Subscription expired' });
      return;
    }

    if (product) {
      const productMatch = purchase.login_url?.includes(product) || 
                          purchase.service_url?.includes(product) ||
                          purchase.login_domain?.includes(product) ||
                          purchase.prod_name.toLowerCase().includes(product.toLowerCase());
      if (!productMatch) {
        const otherPurchase = await db.query(
          `SELECT p.*, prod.encrypted_session_cookies, prod.session_expires_at, prod.service_url, prod.login_url, prod.login_domain, prod.name as prod_name
           FROM purchases p
           JOIN products prod ON p.product_id = prod.id
           WHERE p.user_id = $1 AND p.status = $2 AND p.expires_at > NOW()
           AND (prod.login_url ILIKE $3 OR prod.service_url ILIKE $3 OR prod.login_domain ILIKE $3 OR prod.name ILIKE $3)`,
          [purchase.user_id, 'active', `%${product}%`]
        );

        if (otherPurchase.rows.length > 0) {
          const other = otherPurchase.rows[0];
          purchase.encrypted_session_cookies = other.encrypted_session_cookies;
          purchase.session_expires_at = other.session_expires_at;
          purchase.service_url = other.service_url;
          purchase.login_url = other.login_url;
          purchase.login_domain = other.login_domain;
          purchase.prod_name = other.prod_name;
          purchase.prod_id = other.product_id;
          purchase.id = other.id;
        }
      }
    }

    const activeSessions = await db.query(
      `SELECT COUNT(*) as count FROM access_logs
       WHERE product_id = $1 AND logout_time IS NULL
       AND login_time > NOW() - INTERVAL '24 hours'`,
      [purchase.prod_id]
    );

    const currentUsers = parseInt(activeSessions.rows[0]?.count || '0', 10);

    if (currentUsers >= purchase.max_concurrent_users) {
      console.warn('Concurrent user limit reached');
      res.status(403).json({
        error: `Maximum concurrent users (${purchase.max_concurrent_users}) reached. Please try again later.`
      });
      return;
    }

    // Check if session cookies are configured
    if (!purchase.encrypted_session_cookies) {
      res.status(404).json({ error: 'Session cookies not configured for this product. Please contact admin.' });
      return;
    }

    // Check if session has expired
    if (purchase.session_expires_at && new Date() > new Date(purchase.session_expires_at)) {
      res.status(403).json({ error: 'Product session has expired. Please contact admin to refresh.' });
      return;
    }

    console.log('Decrypting session cookies...');

    let sessionCookies;
    try {
      const decrypted = decrypt(purchase.encrypted_session_cookies);
      sessionCookies = JSON.parse(decrypted);
    } catch (e) {
      console.error('Failed to decrypt session cookies:', e);
      res.status(500).json({ error: 'Failed to decrypt session cookies' });
      return;
    }

    console.log('Session cookies decrypted successfully');

    const sessionToken = generateSecureToken(32);
    const sessionTokenHash = hashToken(sessionToken);

    await db.query(
      `INSERT INTO session_tokens
       (user_id, purchase_id, product_id, token, token_hash, device_fingerprint, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        purchase.user_id,
        purchase.id,
        purchase.prod_id,
        sessionToken,
        sessionTokenHash,
        deviceFingerprint || null,
        req.ip,
        req.headers['user-agent'],
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      ]
    );

    await db.query(
      `INSERT INTO access_logs
       (user_id, product_id, purchase_id, action, ip_address, device_fingerprint, login_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        purchase.user_id,
        purchase.prod_id,
        purchase.id,
        'session_access',
        req.ip,
        deviceFingerprint || null,
        new Date(),
        'success'
      ]
    );

    res.json({
      success: true,
      sessionCookies: sessionCookies,
      productName: purchase.prod_name,
      serviceUrl: purchase.service_url,
      loginUrl: purchase.login_url,
      loginDomain: purchase.login_domain,
      sessionExpiresAt: purchase.session_expires_at,
      purchaseExpiresAt: purchase.expires_at,
      sessionToken: sessionToken
    });

    console.log('Session cookies sent to extension');
  } catch (error: any) {
    console.error('Error in get-credentials:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Secure credential endpoint with one-time token and RSA encryption
router.post('/get-credentials-secure', async (req, res) => {
  const { oneTimeToken, publicKey, product, deviceFingerprint } = req.body;

  try {
    const rateLimitKey = `extension-creds-secure:${req.ip}`;
    const isLimited = await rateLimit(rateLimitKey, { max: 10, window: 60 });

    if (isLimited) {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }

    if (!oneTimeToken) {
      res.status(400).json({ error: 'One-time token is required' });
      return;
    }

    if (!publicKey) {
      res.status(400).json({ error: 'Public key is required for secure transfer' });
      return;
    }

    if (!deviceFingerprint) {
      res.status(400).json({ error: 'Device fingerprint is required' });
      return;
    }

    // Verify one-time token
    const tokenHash = hashToken(oneTimeToken);
    const tokenData = oneTimeTokens.get(tokenHash);

    if (!tokenData) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    if (tokenData.used) {
      res.status(401).json({ error: 'Token has already been used' });
      return;
    }

    if (new Date() > tokenData.expiresAt) {
      oneTimeTokens.delete(tokenHash);
      res.status(401).json({ error: 'Token has expired' });
      return;
    }

    // Mark token as used immediately
    tokenData.used = true;

    // Verify device binding
    const boundDevice = deviceBindings.get(tokenData.accessCodeHash);
    if (boundDevice && boundDevice !== deviceFingerprint) {
      res.status(403).json({ error: 'Device mismatch' });
      return;
    }

    // Get purchase and session cookies using the access code hash from the token
    const purchaseResult = await db.query(
      `SELECT p.*, prod.id as prod_id, prod.name as prod_name, prod.encrypted_session_cookies, 
              prod.session_expires_at, prod.max_concurrent_users, prod.service_url, prod.login_url, prod.login_domain
       FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.access_code_hash = $1 AND p.status = $2`,
      [tokenData.accessCodeHash, 'active']
    );

    if (purchaseResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid access' });
      return;
    }

    const purchase = purchaseResult.rows[0];

    if (new Date() > new Date(purchase.expires_at)) {
      res.status(403).json({ error: 'Subscription expired' });
      return;
    }

    // Check concurrent users - count UNIQUE users, not all access attempts
    const activeSessions = await db.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM access_logs
       WHERE product_id = $1 AND logout_time IS NULL
       AND login_time > NOW() - INTERVAL '24 hours'`,
      [purchase.prod_id]
    );

    const currentUsers = parseInt(activeSessions.rows[0]?.count || '0', 10);

    // Check if THIS user already has an active session (don't count them twice)
    const userHasActiveSession = await db.query(
      `SELECT 1 FROM access_logs
       WHERE product_id = $1 AND user_id = $2 AND logout_time IS NULL
       AND login_time > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [purchase.prod_id, purchase.user_id]
    );

    const isNewUser = userHasActiveSession.rows.length === 0;

    // Only check limit if this is a new user trying to access
    if (isNewUser && currentUsers >= purchase.max_concurrent_users) {
      res.status(403).json({
        error: `Maximum concurrent users (${purchase.max_concurrent_users}) reached. Please try again later.`
      });
      return;
    }

    // Check if session cookies are configured
    if (!purchase.encrypted_session_cookies) {
      res.status(404).json({ error: 'Session cookies not configured for this product.' });
      return;
    }

    // Check if session has expired
    if (purchase.session_expires_at && new Date() > new Date(purchase.session_expires_at)) {
      res.status(403).json({ error: 'Product session has expired. Please contact admin.' });
      return;
    }

    // Decrypt session cookies
    let sessionCookies;
    try {
      const decrypted = decrypt(purchase.encrypted_session_cookies);
      sessionCookies = JSON.parse(decrypted);
    } catch (e) {
      console.error('Failed to decrypt session cookies:', e);
      res.status(500).json({ error: 'Failed to decrypt session cookies' });
      return;
    }

    // Encrypt session cookies with client's public key
    const cookiesPayload = JSON.stringify({
      sessionCookies,
      serviceUrl: purchase.service_url,
      loginUrl: purchase.login_url,
      loginDomain: purchase.login_domain,
      timestamp: Date.now(),
      nonce: generateSecureToken(16)
    });

    let encryptedCookies: string;
    try {
      encryptedCookies = encryptWithPublicKey(cookiesPayload, publicKey);
    } catch (error) {
      res.status(400).json({ error: 'Invalid public key format' });
      return;
    }

    // Create session token
    const sessionToken = generateSecureToken(32);
    const sessionTokenHash = hashToken(sessionToken);

    await db.query(
      `INSERT INTO session_tokens
       (user_id, purchase_id, product_id, token, token_hash, device_fingerprint, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        purchase.user_id,
        purchase.id,
        purchase.prod_id,
        sessionToken,
        sessionTokenHash,
        deviceFingerprint,
        req.ip,
        req.headers['user-agent'],
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      ]
    );

    // Log access
    await db.query(
      `INSERT INTO access_logs
       (user_id, product_id, purchase_id, action, ip_address, device_fingerprint, login_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        purchase.user_id,
        purchase.prod_id,
        purchase.id,
        'secure_session_access',
        req.ip,
        deviceFingerprint,
        new Date(),
        'success'
      ]
    );

    // Clean up used token
    oneTimeTokens.delete(tokenHash);

    res.json({
      success: true,
      encryptedCookies,
      productName: purchase.prod_name,
      serviceUrl: purchase.service_url,
      loginUrl: purchase.login_url,
      loginDomain: purchase.login_domain,
      sessionToken,
      sessionExpiresAt: purchase.session_expires_at,
      purchaseExpiresAt: purchase.expires_at
    });

    console.log('Secure session cookies sent (encrypted)');
  } catch (error: any) {
    console.error('Error in get-credentials-secure:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/log-access', async (req, res) => {
  const { accessCode, action, product, deviceFingerprint } = req.body;

  try {
    if (!accessCode) {
      res.status(400).json({ error: 'Access code is required' });
      return;
    }

    const accessCodeHash = hashAccessCode(accessCode);

    const purchaseResult = await db.query(
      `SELECT p.*, prod.id as prod_id FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.access_code_hash = $1`,
      [accessCodeHash]
    );

    if (purchaseResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid access code' });
      return;
    }

    const purchase = purchaseResult.rows[0];

    await db.query(
      `INSERT INTO access_logs
       (user_id, product_id, purchase_id, action, device_fingerprint, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [purchase.user_id, purchase.prod_id, purchase.id, action, deviceFingerprint || null, req.ip, new Date()]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error logging access:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', async (req, res) => {
  const { sessionToken, accessCode } = req.body;

  try {
    if (sessionToken) {
      const tokenHash = hashToken(sessionToken);
      
      const sessionResult = await db.query(
        'SELECT * FROM session_tokens WHERE token_hash = $1',
        [tokenHash]
      );

      if (sessionResult.rows.length > 0) {
        const session = sessionResult.rows[0];

        await db.query(
          `UPDATE access_logs 
           SET logout_time = NOW(), 
               duration_seconds = EXTRACT(EPOCH FROM (NOW() - login_time))
           WHERE user_id = $1 AND product_id = $2 AND logout_time IS NULL
           ORDER BY login_time DESC LIMIT 1`,
          [session.user_id, session.product_id]
        );

        await db.query('DELETE FROM session_tokens WHERE token_hash = $1', [tokenHash]);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/check-session', async (req, res) => {
  const { sessionToken } = req.query;

  try {
    if (!sessionToken) {
      res.status(400).json({ valid: false, error: 'Session token is required' });
      return;
    }

    const tokenHash = hashToken(sessionToken as string);

    const result = await db.query(
      `SELECT st.*, p.expires_at as purchase_expires_at
       FROM session_tokens st
       JOIN purchases p ON st.purchase_id = p.id
       WHERE st.token_hash = $1 AND st.expires_at > NOW() AND p.status = 'active'`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.json({ valid: false });
      return;
    }

    await db.query(
      'UPDATE session_tokens SET last_used_at = NOW() WHERE token_hash = $1',
      [tokenHash]
    );

    res.json({ valid: true });
  } catch (error) {
    console.error('Error checking session:', error);
    res.status(500).json({ valid: false, error: 'Server error' });
  }
});

// Get login selectors for a domain (used by extension for dynamic configuration)
router.get('/selectors/:domain', async (req, res) => {
  const { domain } = req.params;

  try {
    if (!domain) {
      res.status(400).json({ error: 'Domain is required' });
      return;
    }

    // Find product by domain (exact match or partial match)
    const result = await db.query(
      `SELECT id, name, login_url, login_domain, email_selector, password_selector, 
              submit_selector, login_page_indicator
       FROM products 
       WHERE status = 'active' 
       AND (login_domain = $1 OR login_domain LIKE $2 OR login_url LIKE $2)
       LIMIT 1`,
      [domain, `%${domain}%`]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ 
        error: 'No configuration found for this domain',
        supported: false 
      });
      return;
    }

    const product = result.rows[0];

    // Return selectors (may be null if not configured)
    res.json({
      supported: true,
      productId: product.id,
      productName: product.name,
      loginUrl: product.login_url,
      selectors: {
        email: product.email_selector,
        password: product.password_selector,
        submit: product.submit_selector,
        loginPageIndicator: product.login_page_indicator
      }
    });
  } catch (error) {
    console.error('Error fetching selectors:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all supported domains (for extension to know which sites to activate on)
router.get('/supported-domains', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT login_domain, login_url, name
       FROM products 
       WHERE status = 'active' AND login_domain IS NOT NULL`,
      []
    );

    const domains = result.rows.map((row: any) => ({
      domain: row.login_domain,
      loginUrl: row.login_url,
      productName: row.name
    }));

    res.json({ domains });
  } catch (error) {
    console.error('Error fetching supported domains:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
