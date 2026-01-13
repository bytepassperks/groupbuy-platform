import express, { Response } from 'express';
import { encrypt, decrypt } from '../../lib/encryption';
import { db } from '../../lib/db';
import { authMiddleware, adminOnly } from '../../middleware/auth';
import { AuthenticatedRequest, Product } from '../../types';

const router = express.Router();

router.post('/add', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { name, category, price, maxUsers, serviceUrl, loginUrl, description, iconUrl, sessionCookies, sessionExpiresAt, renewalPeriod } = req.body;

  try {
    if (!name || !category || !price) {
      res.status(400).json({ error: 'Name, category, and price are required' });
      return;
    }

    const existingProduct = await db.query<Product>(
      'SELECT id FROM products WHERE name = $1',
      [name]
    );

    if (existingProduct.rows.length > 0) {
      res.status(400).json({ error: 'Product with this name already exists' });
      return;
    }

    // Encrypt session cookies if provided
    const encryptedSessionCookies = sessionCookies ? encrypt(JSON.stringify(sessionCookies)) : null;

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Extract domain from service URL or login URL for easier lookup
    let loginDomain = null;
    const urlToUse = serviceUrl || loginUrl;
    if (urlToUse) {
      try {
        const url = new URL(urlToUse);
        loginDomain = url.hostname;
      } catch (e) {
        // Invalid URL, skip domain extraction
      }
    }

    const result = await db.query<Product>(
      `INSERT INTO products
       (name, slug, category, price, renewal_period, max_concurrent_users, service_url, login_url, login_domain,
        encrypted_session_cookies, session_expires_at, session_last_updated, description, icon_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, name, slug, category, price, renewal_period, max_concurrent_users, service_url, login_url, login_domain,
                 session_expires_at, session_last_updated, status, created_at`,
      [
        name,
        slug,
        category,
        price,
        renewalPeriod || 'month',
        maxUsers || 5,
        serviceUrl || null,
        loginUrl || null,
        loginDomain,
        encryptedSessionCookies,
        sessionExpiresAt ? new Date(sessionExpiresAt) : null,
        sessionCookies ? new Date() : null,
        description || null,
        iconUrl || null,
        'active'
      ]
    );

    const product = result.rows[0];
    if (!product) {
      res.status(500).json({ error: 'Failed to create product' });
      return;
    }

    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id,
        'PRODUCT_ADDED',
        'product',
        product.id,
        JSON.stringify({
          name: product.name,
          price: product.price,
          category: category
        }),
        req.ip,
        req.headers['user-agent']
      ]
    );

    console.log(`Product added: ${product.id}`);

    res.status(201).json({
      success: true,
      message: `Product "${name}" added successfully`,
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        price: product.price,
        renewalPeriod: product.renewal_period,
        maxConcurrentUsers: product.max_concurrent_users,
        serviceUrl: product.service_url,
        loginUrl: product.login_url,
        sessionExpiresAt: product.session_expires_at,
        status: product.status,
      }
    });

  } catch (error: any) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: error.message || 'Failed to add product' });
  }
});

router.get('/', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, category, search, page = '1', limit = '20' } = req.query;
    
    let query = `
      SELECT id, name, slug, category, icon_url, description, price, renewal_period,
             max_concurrent_users, current_concurrent_users, service_url, login_url, login_domain,
             session_expires_at, session_last_updated, status, created_at, updated_at
      FROM products
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await db.query(query, params);

    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM products WHERE status != $1',
      ['deleted']
    );

    res.json({
      products: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/:id', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await db.query<Product>(
      `SELECT id, name, slug, category, icon_url, description, price, renewal_period,
              max_concurrent_users, current_concurrent_users, service_url, login_url, login_domain,
              session_expires_at, session_last_updated, status, created_at, updated_at
       FROM products WHERE id = $1`,
      [id]
    );

    const product = result.rows[0];
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const purchaseCount = await db.query(
      'SELECT COUNT(*) as count FROM purchases WHERE product_id = $1 AND status = $2',
      [id, 'active']
    );

    // Check if session is expired
    const sessionExpired = product.session_expires_at && new Date(product.session_expires_at) < new Date();

    res.json({
      product: {
        ...product,
        sessionExpired,
      },
      activePurchases: parseInt(purchaseCount.rows[0]?.count || '0', 10),
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.put('/:id', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, category, price, maxUsers, serviceUrl, loginUrl, description, iconUrl, status, sessionCookies, sessionExpiresAt, renewalPeriod } = req.body;

  try {
    const existingResult = await db.query<Product>(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      updates.push(`slug = $${paramIndex}`);
      params.push(slug);
      paramIndex++;
    }

    if (category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (price !== undefined) {
      updates.push(`price = $${paramIndex}`);
      params.push(price);
      paramIndex++;
    }

    if (renewalPeriod !== undefined) {
      updates.push(`renewal_period = $${paramIndex}`);
      params.push(renewalPeriod);
      paramIndex++;
    }

    if (maxUsers !== undefined) {
      updates.push(`max_concurrent_users = $${paramIndex}`);
      params.push(maxUsers);
      paramIndex++;
    }

    if (serviceUrl !== undefined) {
      updates.push(`service_url = $${paramIndex}`);
      params.push(serviceUrl || null);
      paramIndex++;
    }

    if (loginUrl !== undefined) {
      updates.push(`login_url = $${paramIndex}`);
      params.push(loginUrl || null);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }

    if (iconUrl !== undefined) {
      updates.push(`icon_url = $${paramIndex}`);
      params.push(iconUrl);
      paramIndex++;
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // Handle session cookies update
    if (sessionCookies !== undefined) {
      const encryptedSessionCookies = sessionCookies ? encrypt(JSON.stringify(sessionCookies)) : null;
      updates.push(`encrypted_session_cookies = $${paramIndex}`);
      params.push(encryptedSessionCookies);
      paramIndex++;

      // Update session_last_updated when cookies are updated
      if (sessionCookies) {
        updates.push(`session_last_updated = $${paramIndex}`);
        params.push(new Date());
        paramIndex++;
      }
    }

    if (sessionExpiresAt !== undefined) {
      updates.push(`session_expires_at = $${paramIndex}`);
      params.push(sessionExpiresAt ? new Date(sessionExpiresAt) : null);
      paramIndex++;
    }

    // Update login_domain if serviceUrl or loginUrl changed
    if (serviceUrl !== undefined || loginUrl !== undefined) {
      let loginDomain = null;
      const urlToUse = serviceUrl || loginUrl || existing.service_url || existing.login_url;
      if (urlToUse) {
        try {
          const url = new URL(urlToUse);
          loginDomain = url.hostname;
        } catch (e) {
          // Invalid URL, skip domain extraction
        }
      }
      updates.push(`login_domain = $${paramIndex}`);
      params.push(loginDomain);
      paramIndex++;
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `
      UPDATE products SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, slug, category, price, renewal_period, max_concurrent_users, service_url, login_url, session_expires_at, status
    `;

    const result = await db.query<Product>(query, params);
    const product = result.rows[0];

    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user?.id,
        'PRODUCT_UPDATED',
        'product',
        id,
        JSON.stringify({ name: existing.name, price: existing.price }),
        JSON.stringify({ name: product?.name, price: product?.price }),
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/:id', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const existingResult = await db.query<Product>(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const activePurchases = await db.query(
      'SELECT COUNT(*) as count FROM purchases WHERE product_id = $1 AND status = $2',
      [id, 'active']
    );

    if (parseInt(activePurchases.rows[0]?.count || '0', 10) > 0) {
      await db.query(
        'UPDATE products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['inactive', id]
      );

      res.json({
        success: true,
        message: 'Product deactivated (has active purchases)',
        deactivated: true
      });
      return;
    }

    await db.query('DELETE FROM products WHERE id = $1', [id]);

    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, old_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id,
        'PRODUCT_DELETED',
        'product',
        id,
        JSON.stringify({ name: existing.name }),
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Endpoint for admin extension to save captured cookies
router.post('/:id/capture-cookies', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { cookies, domain, sessionExpiresAt } = req.body;

  try {
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      res.status(400).json({ error: 'Cookies array is required' });
      return;
    }

    // Verify product exists
    const productResult = await db.query<Product>(
      'SELECT id, name FROM products WHERE id = $1',
      [id]
    );

    const product = productResult.rows[0];
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Encrypt and save cookies
    const encryptedCookies = encrypt(JSON.stringify(cookies));

    await db.query(
      `UPDATE products SET
        encrypted_session_cookies = $1,
        session_expires_at = $2,
        session_last_updated = $3,
        login_domain = COALESCE($4, login_domain),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [
        encryptedCookies,
        sessionExpiresAt ? new Date(sessionExpiresAt) : null,
        new Date(),
        domain,
        id
      ]
    );

    // Log the action
    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id,
        'SESSION_COOKIES_CAPTURED',
        'product',
        id,
        JSON.stringify({ cookieCount: cookies.length, domain }),
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      success: true,
      message: `Successfully saved ${cookies.length} cookies for ${product.name}`,
      cookieCount: cookies.length
    });
  } catch (error) {
    console.error('Error saving captured cookies:', error);
    res.status(500).json({ error: 'Failed to save cookies' });
  }
});

router.get('/:id/session', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await db.query<Product>(
      'SELECT encrypted_session_cookies, session_expires_at, session_last_updated FROM products WHERE id = $1',
      [id]
    );

    const product = result.rows[0];
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    let sessionCookies = null;
    if (product.encrypted_session_cookies) {
      try {
        const decrypted = decrypt(product.encrypted_session_cookies);
        sessionCookies = JSON.parse(decrypted);
      } catch (e) {
        console.error('Error decrypting session cookies:', e);
      }
    }

    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user?.id,
        'SESSION_VIEWED',
        'product',
        id,
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      sessionCookies,
      sessionExpiresAt: product.session_expires_at,
      sessionLastUpdated: product.session_last_updated,
      sessionExpired: product.session_expires_at && new Date(product.session_expires_at) < new Date()
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// ============ MULTI-ACCOUNT MANAGEMENT ENDPOINTS ============

// Get all accounts for a product
router.get('/:id/accounts', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT id, account_name, account_email, is_active, current_users, max_users_per_account,
              session_expires_at, session_last_updated, created_at
       FROM product_accounts
       WHERE product_id = $1
       ORDER BY id`,
      [id]
    );

    res.json({
      accounts: result.rows,
      totalAccounts: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching product accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Add a new account slot for a product
router.post('/:id/accounts', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { accountName, accountEmail, maxUsersPerAccount } = req.body;

  try {
    // Verify product exists
    const productResult = await db.query<Product>(
      'SELECT id, name FROM products WHERE id = $1',
      [id]
    );

    if (productResult.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Count existing accounts to generate default name
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM product_accounts WHERE product_id = $1',
      [id]
    );
    const accountNumber = parseInt(countResult.rows[0].count, 10) + 1;

    const result = await db.query(
      `INSERT INTO product_accounts (product_id, account_name, account_email, max_users_per_account)
       VALUES ($1, $2, $3, $4)
       RETURNING id, account_name, account_email, is_active, current_users, max_users_per_account`,
      [
        id,
        accountName || `Account ${accountNumber}`,
        accountEmail || null,
        maxUsersPerAccount || 5
      ]
    );

    // Log the action
    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id,
        'ACCOUNT_CREATED',
        'product_account',
        result.rows[0].id,
        JSON.stringify({ productId: id, accountName: result.rows[0].account_name }),
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      success: true,
      account: result.rows[0],
      message: `Account "${result.rows[0].account_name}" created successfully`
    });
  } catch (error) {
    console.error('Error creating product account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Update an account
router.put('/:id/accounts/:accountId', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id, accountId } = req.params;
  const { accountName, accountEmail, maxUsersPerAccount, isActive } = req.body;

  try {
    const result = await db.query(
      `UPDATE product_accounts SET
        account_name = COALESCE($1, account_name),
        account_email = COALESCE($2, account_email),
        max_users_per_account = COALESCE($3, max_users_per_account),
        is_active = COALESCE($4, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND product_id = $6
       RETURNING *`,
      [accountName, accountEmail, maxUsersPerAccount, isActive, accountId, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json({
      success: true,
      account: result.rows[0],
      message: 'Account updated successfully'
    });
  } catch (error) {
    console.error('Error updating product account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete an account
router.delete('/:id/accounts/:accountId', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id, accountId } = req.params;

  try {
    // Check if account has active users
    const accountResult = await db.query(
      'SELECT current_users FROM product_accounts WHERE id = $1 AND product_id = $2',
      [accountId, id]
    );

    if (accountResult.rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    if (accountResult.rows[0].current_users > 0) {
      res.status(400).json({ error: 'Cannot delete account with active users. Deactivate it instead.' });
      return;
    }

    await db.query(
      'DELETE FROM product_accounts WHERE id = $1 AND product_id = $2',
      [accountId, id]
    );

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Capture cookies for a specific account
router.post('/:id/accounts/:accountId/capture-cookies', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id, accountId } = req.params;
  const { cookies, domain, sessionExpiresAt } = req.body;

  try {
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      res.status(400).json({ error: 'Cookies array is required' });
      return;
    }

    // Verify account exists
    const accountResult = await db.query(
      `SELECT pa.id, pa.account_name, p.name as product_name
       FROM product_accounts pa
       JOIN products p ON pa.product_id = p.id
       WHERE pa.id = $1 AND pa.product_id = $2`,
      [accountId, id]
    );

    if (accountResult.rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const account = accountResult.rows[0];

    // Encrypt and save cookies
    const encryptedCookies = encrypt(JSON.stringify(cookies));

    await db.query(
      `UPDATE product_accounts SET
        encrypted_session_cookies = $1,
        session_expires_at = $2,
        session_last_updated = $3,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [
        encryptedCookies,
        sessionExpiresAt ? new Date(sessionExpiresAt) : null,
        new Date(),
        accountId
      ]
    );

    // Also update the product's login_domain if provided
    if (domain) {
      await db.query(
        'UPDATE products SET login_domain = $1 WHERE id = $2',
        [domain, id]
      );
    }

    // Log the action
    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id,
        'ACCOUNT_COOKIES_CAPTURED',
        'product_account',
        accountId,
        JSON.stringify({ cookieCount: cookies.length, domain, accountName: account.account_name }),
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      success: true,
      message: `Successfully saved ${cookies.length} cookies for ${account.account_name} (${account.product_name})`,
      cookieCount: cookies.length
    });
  } catch (error) {
    console.error('Error saving captured cookies for account:', error);
    res.status(500).json({ error: 'Failed to save cookies' });
  }
});

export default router;
