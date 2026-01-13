import express, { Response } from 'express';
import Stripe from 'stripe';
import { db } from '../lib/db';
import { generateAccessCode, hashAccessCode } from '../lib/encryption';
import { authMiddleware } from '../middleware/auth';
import { AuthenticatedRequest, Product } from '../types';

const router = express.Router();

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

router.post('/create-checkout-session', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { productId, successUrl, cancelUrl } = req.body;

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!stripe) {
      res.status(500).json({ error: 'Payment system not configured' });
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

    const existingPurchase = await db.query(
      `SELECT id FROM purchases 
       WHERE user_id = $1 AND product_id = $2 AND status = 'active' AND expires_at > NOW()`,
      [req.user.id, productId]
    );

    if (existingPurchase.rows.length > 0) {
      res.status(400).json({ error: 'You already have an active subscription to this product' });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'inr',
            product_data: {
              name: product.name,
              description: product.description || `Access to ${product.name}`,
            },
            unit_amount: Math.round(parseFloat(product.price as unknown as string) * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/products/${product.slug}?payment=cancelled`,
      metadata: {
        userId: req.user.id.toString(),
        productId: productId.toString(),
        userEmail: req.user.email,
      },
    });

    await db.query(
      `INSERT INTO payments (user_id, product_id, amount, currency, payment_method, payment_gateway_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, productId, product.price, 'INR', 'stripe', session.id, 'pending']
    );

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
});

router.post('/create-razorpay-order', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { productId } = req.body;

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret) {
      res.status(500).json({ error: 'Razorpay not configured' });
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

    const existingPurchase = await db.query(
      `SELECT id FROM purchases 
       WHERE user_id = $1 AND product_id = $2 AND status = 'active' AND expires_at > NOW()`,
      [req.user.id, productId]
    );

    if (existingPurchase.rows.length > 0) {
      res.status(400).json({ error: 'You already have an active subscription to this product' });
      return;
    }

    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(parseFloat(product.price as unknown as string) * 100),
      currency: 'INR',
      receipt: `order_${Date.now()}`,
      notes: {
        userId: req.user.id.toString(),
        productId: productId.toString(),
        userEmail: req.user.email,
      },
    });

    await db.query(
      `INSERT INTO payments (user_id, product_id, amount, currency, payment_method, payment_gateway_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, productId, product.price, 'INR', 'razorpay', order.id, 'pending']
    );

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId,
    });
  } catch (error: any) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ error: error.message || 'Failed to create order' });
  }
});

router.post('/verify-razorpay', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { orderId, paymentId, signature } = req.body;

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeySecret) {
      res.status(500).json({ error: 'Razorpay not configured' });
      return;
    }

    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSignature !== signature) {
      res.status(400).json({ error: 'Invalid payment signature' });
      return;
    }

    const paymentResult = await db.query(
      'SELECT * FROM payments WHERE payment_gateway_id = $1',
      [orderId]
    );

    const payment = paymentResult.rows[0];
    if (!payment) {
      res.status(404).json({ error: 'Payment not found' });
      return;
    }

    await db.query(
      `UPDATE payments SET status = $1, payment_gateway_id = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      ['completed', paymentId, payment.id]
    );

    const accessCode = generateAccessCode();
    const accessCodeHash = hashAccessCode(accessCode);

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const purchaseResult = await db.query(
      `INSERT INTO purchases
       (user_id, product_id, price_paid, payment_id, payment_status, access_code, access_code_hash, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, access_code, expires_at`,
      [
        payment.user_id,
        payment.product_id,
        payment.amount,
        paymentId,
        'completed',
        accessCode,
        accessCodeHash,
        expiresAt,
        'active'
      ]
    );

    const purchase = purchaseResult.rows[0];

    await db.query(
      'UPDATE payments SET purchase_id = $1 WHERE id = $2',
      [purchase?.id, payment.id]
    );

    const productResult = await db.query<Product>(
      'SELECT name FROM products WHERE id = $1',
      [payment.product_id]
    );

    res.json({
      success: true,
      message: 'Payment verified successfully',
      purchase: {
        id: purchase?.id,
        accessCode: purchase?.access_code,
        expiresAt: purchase?.expires_at,
        productName: productResult.rows[0]?.name,
      }
    });
  } catch (error: any) {
    console.error('Error verifying Razorpay payment:', error);
    res.status(500).json({ error: error.message || 'Payment verification failed' });
  }
});

router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await db.query(
      `SELECT p.*, prod.name as product_name
       FROM payments p
       LEFT JOIN products prod ON p.product_id = prod.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    res.json({
      payments: result.rows.map((row: any) => ({
        id: row.id,
        amount: parseFloat(row.amount),
        currency: row.currency,
        paymentMethod: row.payment_method,
        status: row.status,
        productName: row.product_name,
        createdAt: row.created_at,
      }))
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

export default router;
