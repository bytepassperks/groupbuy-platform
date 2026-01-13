import express, { Response } from 'express';
import { db } from '../../lib/db';
import { authMiddleware, adminOnly } from '../../middleware/auth';
import { AuthenticatedRequest } from '../../types';

const router = express.Router();

router.get('/dashboard', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const usersCount = await db.query(
      'SELECT COUNT(*) as total FROM users WHERE status = $1',
      ['active']
    );

    const productsCount = await db.query(
      'SELECT COUNT(*) as total FROM products WHERE status = $1',
      ['active']
    );

    const activePurchases = await db.query(
      `SELECT COUNT(*) as total FROM purchases 
       WHERE status = 'active' AND expires_at > NOW()`
    );

    const totalRevenue = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'`
    );

    const recentPurchases = await db.query(
      `SELECT p.id, p.price_paid, p.created_at, 
              u.name as user_name, u.email as user_email,
              prod.name as product_name
       FROM purchases p
       JOIN users u ON p.user_id = u.id
       JOIN products prod ON p.product_id = prod.id
       ORDER BY p.created_at DESC
       LIMIT 10`
    );

    const recentUsers = await db.query(
      `SELECT id, name, email, role, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 10`
    );

    const monthlyRevenue = await db.query(
      `SELECT 
         DATE_TRUNC('month', created_at) as month,
         SUM(amount) as revenue,
         COUNT(*) as transactions
       FROM payments
       WHERE status = 'completed' AND created_at > NOW() - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month DESC`
    );

    const topProducts = await db.query(
      `SELECT prod.id, prod.name, prod.price,
              COUNT(p.id) as purchase_count,
              SUM(p.price_paid) as total_revenue
       FROM products prod
       LEFT JOIN purchases p ON prod.id = p.product_id AND p.status = 'active'
       WHERE prod.status = 'active'
       GROUP BY prod.id, prod.name, prod.price
       ORDER BY purchase_count DESC
       LIMIT 5`
    );

    res.json({
      stats: {
        totalUsers: parseInt(usersCount.rows[0]?.total || '0', 10),
        totalProducts: parseInt(productsCount.rows[0]?.total || '0', 10),
        activePurchases: parseInt(activePurchases.rows[0]?.total || '0', 10),
        totalRevenue: parseFloat(totalRevenue.rows[0]?.total || '0'),
      },
      recentPurchases: recentPurchases.rows,
      recentUsers: recentUsers.rows,
      monthlyRevenue: monthlyRevenue.rows,
      topProducts: topProducts.rows,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

router.get('/access-logs', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, productId, action, page = '1', limit = '50' } = req.query;

    let query = `
      SELECT al.*, u.name as user_name, u.email as user_email, prod.name as product_name
      FROM access_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN products prod ON al.product_id = prod.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND al.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (productId) {
      query += ` AND al.product_id = $${paramIndex}`;
      params.push(productId);
      paramIndex++;
    }

    if (action) {
      query += ` AND al.action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    query += ` ORDER BY al.created_at DESC`;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await db.query(query, params);

    const countResult = await db.query('SELECT COUNT(*) as total FROM access_logs');

    res.json({
      logs: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      }
    });
  } catch (error) {
    console.error('Error fetching access logs:', error);
    res.status(500).json({ error: 'Failed to fetch access logs' });
  }
});

router.get('/audit-logs', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { adminId, action, resourceType, page = '1', limit = '50' } = req.query;

    let query = `
      SELECT al.*, u.name as admin_name, u.email as admin_email
      FROM audit_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (adminId) {
      query += ` AND al.admin_id = $${paramIndex}`;
      params.push(adminId);
      paramIndex++;
    }

    if (action) {
      query += ` AND al.action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (resourceType) {
      query += ` AND al.resource_type = $${paramIndex}`;
      params.push(resourceType);
      paramIndex++;
    }

    query += ` ORDER BY al.created_at DESC`;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await db.query(query, params);

    const countResult = await db.query('SELECT COUNT(*) as total FROM audit_logs');

    res.json({
      logs: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.get('/purchases', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, productId, userId, page = '1', limit = '20' } = req.query;

    let query = `
      SELECT p.*, u.name as user_name, u.email as user_email, prod.name as product_name
      FROM purchases p
      JOIN users u ON p.user_id = u.id
      JOIN products prod ON p.product_id = prod.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (productId) {
      query += ` AND p.product_id = $${paramIndex}`;
      params.push(productId);
      paramIndex++;
    }

    if (userId) {
      query += ` AND p.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    query += ` ORDER BY p.created_at DESC`;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await db.query(query, params);

    const countResult = await db.query('SELECT COUNT(*) as total FROM purchases');

    res.json({
      purchases: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      }
    });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

export default router;
