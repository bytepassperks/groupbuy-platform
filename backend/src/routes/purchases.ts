import express, { Response } from 'express';
import { db } from '../lib/db';
import { generateAccessCode, hashAccessCode } from '../lib/encryption';
import { sendEmail, emailTemplates } from '../lib/email';
import { authMiddleware } from '../middleware/auth';
import { AuthenticatedRequest, Purchase, Product, User } from '../types';

const router = express.Router();

router.get('/my-purchases', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await db.query(
      `SELECT p.id, p.purchase_date, p.price_paid, p.access_code, p.starts_at, p.expires_at, 
              p.auto_renew, p.status,
              prod.id as product_id, prod.name as product_name, prod.slug as product_slug,
              prod.icon_url as product_icon, prod.category as product_category,
              prod.login_url as product_login_url
       FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    const purchases = result.rows.map((row: any) => ({
      id: row.id,
      purchaseDate: row.purchase_date,
      pricePaid: parseFloat(row.price_paid),
      accessCode: row.access_code,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      autoRenew: row.auto_renew,
      status: row.status,
      product: {
        id: row.product_id,
        name: row.product_name,
        slug: row.product_slug,
        iconUrl: row.product_icon,
        category: row.product_category,
        loginUrl: row.product_login_url,
      }
    }));

    res.json({ purchases });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

router.get('/my-purchases/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await db.query(
      `SELECT p.*, prod.name as product_name, prod.slug as product_slug,
              prod.icon_url as product_icon, prod.category as product_category,
              prod.login_url as product_login_url, prod.description as product_description
       FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.id = $1 AND p.user_id = $2`,
      [id, req.user.id]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Purchase not found' });
      return;
    }

    res.json({
      purchase: {
        id: row.id,
        purchaseDate: row.purchase_date,
        pricePaid: parseFloat(row.price_paid),
        accessCode: row.access_code,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        autoRenew: row.auto_renew,
        status: row.status,
        product: {
          id: row.product_id,
          name: row.product_name,
          slug: row.product_slug,
          iconUrl: row.product_icon,
          category: row.product_category,
          loginUrl: row.product_login_url,
          description: row.product_description,
        }
      }
    });
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Failed to fetch purchase' });
  }
});

router.post('/create', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { productId, paymentId } = req.body;

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!productId) {
      res.status(400).json({ error: 'Product ID is required' });
      return;
    }

    const productResult = await db.query<Product>(
      'SELECT * FROM products WHERE id = $1 AND status = $2',
      [productId, 'active']
    );

    const product = productResult.rows[0];
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const existingPurchase = await db.query<Purchase>(
      `SELECT id FROM purchases 
       WHERE user_id = $1 AND product_id = $2 AND status = 'active' AND expires_at > NOW()`,
      [req.user.id, productId]
    );

    if (existingPurchase.rows.length > 0) {
      res.status(400).json({ error: 'You already have an active subscription to this product' });
      return;
    }

    if (paymentId) {
      const paymentResult = await db.query(
        'SELECT * FROM payments WHERE payment_gateway_id = $1 AND status = $2',
        [paymentId, 'completed']
      );

      if (paymentResult.rows.length === 0) {
        res.status(400).json({ error: 'Payment not completed' });
        return;
      }
    }

    const accessCode = generateAccessCode();
    const accessCodeHash = hashAccessCode(accessCode);

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const purchaseResult = await db.query<Purchase>(
      `INSERT INTO purchases
       (user_id, product_id, price_paid, payment_id, payment_status, access_code, access_code_hash, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, access_code, expires_at`,
      [
        req.user.id,
        productId,
        product.price,
        paymentId || null,
        paymentId ? 'completed' : 'pending',
        accessCode,
        accessCodeHash,
        expiresAt,
        'active'
      ]
    );

    const purchase = purchaseResult.rows[0];

    // Get user details for email
    const userResult = await db.query<User>(
      'SELECT name, email FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    if (user && purchase) {
      const expiresDate = new Date(purchase.expires_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Send purchase confirmation email
      sendEmail(
        user.email,
        emailTemplates.purchaseConfirmation(
          user.name,
          product.name,
          purchase.access_code,
          `$${product.price}`,
          expiresDate
        )
      ).catch(err => {
        console.error('Failed to send purchase confirmation email:', err);
      });
    }

    res.status(201).json({
      success: true,
      message: 'Purchase successful!',
      purchase: {
        id: purchase?.id,
        accessCode: purchase?.access_code,
        expiresAt: purchase?.expires_at,
        productName: product.name,
      }
    });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ error: 'Purchase failed' });
  }
});

router.put('/my-purchases/:id/auto-renew', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { autoRenew } = req.body;

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await db.query<Purchase>(
      `UPDATE purchases 
       SET auto_renew = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, auto_renew`,
      [autoRenew, id, req.user.id]
    );

    const purchase = result.rows[0];
    if (!purchase) {
      res.status(404).json({ error: 'Purchase not found' });
      return;
    }

    res.json({
      success: true,
      message: `Auto-renew ${autoRenew ? 'enabled' : 'disabled'}`,
      autoRenew: purchase.auto_renew
    });
  } catch (error) {
    console.error('Error updating auto-renew:', error);
    res.status(500).json({ error: 'Failed to update auto-renew' });
  }
});

router.post('/my-purchases/:id/regenerate-code', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const existingResult = await db.query<Purchase>(
      'SELECT * FROM purchases WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      res.status(404).json({ error: 'Purchase not found' });
      return;
    }

    const newAccessCode = generateAccessCode();
    const newAccessCodeHash = hashAccessCode(newAccessCode);

    await db.query(
      `UPDATE purchases 
       SET access_code = $1, access_code_hash = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newAccessCode, newAccessCodeHash, id]
    );

    await db.query(
      'DELETE FROM session_tokens WHERE purchase_id = $1',
      [id]
    );

    // Get user and product details for email
    const detailsResult = await db.query(
      `SELECT u.name, u.email, p.name as product_name
       FROM users u
       JOIN purchases pu ON pu.user_id = u.id
       JOIN products p ON pu.product_id = p.id
       WHERE pu.id = $1`,
      [id]
    );
    const details = detailsResult.rows[0];

    if (details) {
      sendEmail(
        details.email,
        emailTemplates.accessCodeDelivery(details.name, details.product_name, newAccessCode)
      ).catch(err => {
        console.error('Failed to send access code email:', err);
      });
    }

    res.json({
      success: true,
      message: 'Access code regenerated successfully',
      accessCode: newAccessCode
    });
  } catch (error) {
    console.error('Error regenerating access code:', error);
    res.status(500).json({ error: 'Failed to regenerate access code' });
  }
});

export default router;
