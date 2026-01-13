import express, { Response } from 'express';
import { encrypt, decrypt } from '../../lib/encryption';
import { db } from '../../lib/db';
import { authMiddleware, adminOnly } from '../../middleware/auth';
import { AuthenticatedRequest, Product } from '../../types';

const router = express.Router();

router.post('/add', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { name, category, price, email, password, maxUsers, loginUrl, description, iconUrl, twoFaCodes, emailSelector, passwordSelector, submitSelector, loginPageIndicator } = req.body;

  try {
    if (!name || !category || !price || !email || !password) {
      res.status(400).json({ error: 'Name, category, price, email, and password are required' });
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

    console.log('Encrypting credentials...');
    const encryptedEmail = encrypt(email);
    const encryptedPassword = encrypt(password);
    const encrypted2faCodes = twoFaCodes ? encrypt(twoFaCodes) : null;

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Extract domain from login URL for easier lookup
    let loginDomain = null;
    if (loginUrl) {
      try {
        const url = new URL(loginUrl);
        loginDomain = url.hostname;
      } catch (e) {
        // Invalid URL, skip domain extraction
      }
    }

    const result = await db.query<Product>(
      `INSERT INTO products
       (name, slug, category, price, encrypted_email, encrypted_password, encrypted_2fa_codes,
        max_concurrent_users, login_url, login_domain, email_selector, password_selector, submit_selector, login_page_indicator, description, icon_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, name, slug, category, price, max_concurrent_users, login_url, login_domain, email_selector, password_selector, submit_selector, login_page_indicator, status, created_at`,
      [
        name,
        slug,
        category,
        price,
        encryptedEmail,
        encryptedPassword,
        encrypted2faCodes,
        maxUsers || 5,
        loginUrl || null,
        loginDomain,
        emailSelector || null,
        passwordSelector || null,
        submitSelector || null,
        loginPageIndicator || null,
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
        maxConcurrentUsers: product.max_concurrent_users,
        loginUrl: product.login_url,
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
             max_concurrent_users, current_concurrent_users, login_url, login_domain,
             email_selector, password_selector, submit_selector, login_page_indicator,
             status, created_at, updated_at
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
              max_concurrent_users, current_concurrent_users, login_url, login_domain,
              email_selector, password_selector, submit_selector, login_page_indicator,
              status, created_at, updated_at
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

    res.json({
      product,
      activePurchases: parseInt(purchaseCount.rows[0]?.count || '0', 10),
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.put('/:id', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, category, price, email, password, maxUsers, loginUrl, description, iconUrl, status, twoFaCodes, emailSelector, passwordSelector, submitSelector, loginPageIndicator } = req.body;

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

    if (email !== undefined) {
      updates.push(`encrypted_email = $${paramIndex}`);
      params.push(encrypt(email));
      paramIndex++;
    }

    if (password !== undefined) {
      updates.push(`encrypted_password = $${paramIndex}`);
      params.push(encrypt(password));
      paramIndex++;
    }

    if (twoFaCodes !== undefined) {
      updates.push(`encrypted_2fa_codes = $${paramIndex}`);
      params.push(twoFaCodes ? encrypt(twoFaCodes) : null);
      paramIndex++;
    }

    if (maxUsers !== undefined) {
      updates.push(`max_concurrent_users = $${paramIndex}`);
      params.push(maxUsers);
      paramIndex++;
    }

    if (loginUrl !== undefined) {
      updates.push(`login_url = $${paramIndex}`);
      params.push(loginUrl);
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

    if (emailSelector !== undefined) {
      updates.push(`email_selector = $${paramIndex}`);
      params.push(emailSelector || null);
      paramIndex++;
    }

    if (passwordSelector !== undefined) {
      updates.push(`password_selector = $${paramIndex}`);
      params.push(passwordSelector || null);
      paramIndex++;
    }

    if (submitSelector !== undefined) {
      updates.push(`submit_selector = $${paramIndex}`);
      params.push(submitSelector || null);
      paramIndex++;
    }

    if (loginPageIndicator !== undefined) {
      updates.push(`login_page_indicator = $${paramIndex}`);
      params.push(loginPageIndicator || null);
      paramIndex++;
    }

    // Update login_domain if loginUrl changed
    if (loginUrl !== undefined) {
      let loginDomain = null;
      if (loginUrl) {
        try {
          const url = new URL(loginUrl);
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
      RETURNING id, name, slug, category, price, max_concurrent_users, login_url, status
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

router.get('/:id/credentials', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await db.query<Product>(
      'SELECT encrypted_email, encrypted_password, encrypted_2fa_codes FROM products WHERE id = $1',
      [id]
    );

    const product = result.rows[0];
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const email = decrypt(product.encrypted_email);
    const password = decrypt(product.encrypted_password);
    const twoFaCodes = product.encrypted_2fa_codes ? decrypt(product.encrypted_2fa_codes) : null;

    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user?.id,
        'CREDENTIALS_VIEWED',
        'product',
        id,
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      email,
      password,
      twoFaCodes
    });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

export default router;
