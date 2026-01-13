import express from 'express';
import { db } from '../lib/db';
import { decrypt, hashAccessCode, generateSecureToken, hashToken } from '../lib/encryption';
import { rateLimit } from '../lib/rate-limit';

const router = express.Router();

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
      `SELECT prod.name as product_name, prod.login_url, p.expires_at FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.user_id = $1 AND p.status = $2 AND p.expires_at > NOW()`,
      [purchase.user_id, 'active']
    );

    res.json({
      success: true,
      subscriptions: subscriptions.rows.map((row: any) => ({
        productName: row.product_name,
        loginUrl: row.login_url,
        expiresAt: row.expires_at
      }))
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
      `SELECT p.*, prod.id as prod_id, prod.name as prod_name, prod.encrypted_email, 
              prod.encrypted_password, prod.max_concurrent_users, prod.login_url
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
                          purchase.prod_name.toLowerCase().includes(product.toLowerCase());
      if (!productMatch) {
        const otherPurchase = await db.query(
          `SELECT p.*, prod.encrypted_email, prod.encrypted_password, prod.login_url, prod.name as prod_name
           FROM purchases p
           JOIN products prod ON p.product_id = prod.id
           WHERE p.user_id = $1 AND p.status = $2 AND p.expires_at > NOW()
           AND (prod.login_url ILIKE $3 OR prod.name ILIKE $3)`,
          [purchase.user_id, 'active', `%${product}%`]
        );

        if (otherPurchase.rows.length > 0) {
          const other = otherPurchase.rows[0];
          purchase.encrypted_email = other.encrypted_email;
          purchase.encrypted_password = other.encrypted_password;
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

    console.log('Decrypting credentials...');

    const email = decrypt(purchase.encrypted_email);
    const password = decrypt(purchase.encrypted_password);

    if (!email || !password) {
      throw new Error('Failed to decrypt credentials');
    }

    console.log('Credentials decrypted successfully');

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
        'login_attempted',
        req.ip,
        deviceFingerprint || null,
        new Date(),
        'success'
      ]
    );

    res.json({
      success: true,
      credentials: {
        email: email,
        password: password,
        productName: purchase.prod_name,
        expiresAt: purchase.expires_at
      },
      sessionToken: sessionToken
    });

    console.log('Credentials sent to extension');
  } catch (error: any) {
    console.error('Error in get-credentials:', error);
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

export default router;
