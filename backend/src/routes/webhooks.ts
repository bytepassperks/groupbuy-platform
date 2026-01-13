import express from 'express';
import Stripe from 'stripe';
import { db } from '../lib/db';
import { generateAccessCode, hashAccessCode } from '../lib/encryption';

const router = express.Router();

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    console.error('Stripe not configured');
    res.status(500).json({ error: 'Stripe not configured' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook Error: ${err.message}` });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log('Checkout session completed:', session.id);

        const userId = session.metadata?.userId;
        const productId = session.metadata?.productId;

        if (!userId || !productId) {
          console.error('Missing metadata in checkout session');
          break;
        }

        await db.query(
          `UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE payment_gateway_id = $2`,
          ['completed', session.id]
        );

        const existingPurchase = await db.query(
          `SELECT id FROM purchases 
           WHERE user_id = $1 AND product_id = $2 AND status = 'active' AND expires_at > NOW()`,
          [userId, productId]
        );

        if (existingPurchase.rows.length > 0) {
          console.log('User already has active purchase');
          break;
        }

        const productResult = await db.query(
          'SELECT price FROM products WHERE id = $1',
          [productId]
        );

        const product = productResult.rows[0];
        if (!product) {
          console.error('Product not found');
          break;
        }

        const accessCode = generateAccessCode();
        const accessCodeHash = hashAccessCode(accessCode);

        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        const purchaseResult = await db.query(
          `INSERT INTO purchases
           (user_id, product_id, price_paid, payment_id, payment_status, access_code, access_code_hash, expires_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            userId,
            productId,
            product.price,
            session.payment_intent,
            'completed',
            accessCode,
            accessCodeHash,
            expiresAt,
            'active'
          ]
        );

        const purchase = purchaseResult.rows[0];

        await db.query(
          'UPDATE payments SET purchase_id = $1 WHERE payment_gateway_id = $2',
          [purchase?.id, session.id]
        );

        console.log('Purchase created:', purchase?.id);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment intent succeeded:', paymentIntent.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment failed:', paymentIntent.id);

        await db.query(
          `UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE payment_gateway_id = $2`,
          ['failed', paymentIntent.id]
        );
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.post('/razorpay', async (req, res) => {
  const { event, payload } = req.body;

  try {
    console.log('Razorpay webhook received:', event);

    switch (event) {
      case 'payment.captured': {
        const payment = payload.payment.entity;
        const orderId = payment.order_id;

        await db.query(
          `UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE payment_gateway_id = $2`,
          ['completed', orderId]
        );

        console.log('Payment captured:', payment.id);
        break;
      }

      case 'payment.failed': {
        const payment = payload.payment.entity;
        const orderId = payment.order_id;

        await db.query(
          `UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE payment_gateway_id = $2`,
          ['failed', orderId]
        );

        console.log('Payment failed:', payment.id);
        break;
      }

      default:
        console.log(`Unhandled Razorpay event: ${event}`);
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing Razorpay webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
