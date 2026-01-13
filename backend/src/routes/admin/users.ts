import express, { Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../../lib/db';
import { authMiddleware, adminOnly } from '../../middleware/auth';
import { AuthenticatedRequest, User } from '../../types';

const router = express.Router();

router.get('/', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, role, search, page = '1', limit = '20' } = req.query;
    
    let query = `
      SELECT id, email, username, name, avatar_url, phone, country, role, status, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (role) {
      query += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (search) {
      query += ` AND (email ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`;
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

    const countResult = await db.query('SELECT COUNT(*) as total FROM users');

    res.json({
      users: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/:id', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await db.query<User>(
      `SELECT id, email, username, name, avatar_url, phone, country, role, status, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );

    const user = result.rows[0];
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const purchasesResult = await db.query(
      `SELECT p.*, prod.name as product_name, prod.icon_url as product_icon
       FROM purchases p
       JOIN products prod ON p.product_id = prod.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [id]
    );

    const paymentsResult = await db.query(
      `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [id]
    );

    res.json({
      user,
      purchases: purchasesResult.rows,
      recentPayments: paymentsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.put('/:id', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, phone, country, role, status } = req.body;

  try {
    const existingResult = await db.query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }

    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex}`);
      params.push(phone);
      paramIndex++;
    }

    if (country !== undefined) {
      updates.push(`country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }

    if (role !== undefined) {
      updates.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `
      UPDATE users SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, name, phone, country, role, status
    `;

    const result = await db.query<User>(query, params);
    const user = result.rows[0];

    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user?.id,
        'USER_UPDATED',
        'user',
        id,
        JSON.stringify({ role: existing.role, status: existing.status }),
        JSON.stringify({ role: user?.role, status: user?.status }),
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      success: true,
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.post('/', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, role, phone, country } = req.body;

  try {
    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    const existingUser = await db.query<User>(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await db.query<User>(
      `INSERT INTO users (email, password_hash, name, phone, country, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, role, status, created_at`,
      [email.toLowerCase(), passwordHash, name, phone || null, country || null, role || 'customer', 'active']
    );

    const user = result.rows[0];

    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id,
        'USER_CREATED',
        'user',
        user?.id,
        JSON.stringify({ email: user?.email, role: user?.role }),
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.delete('/:id', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const idStr = Array.isArray(id) ? id[0] : id;

  try {
    if (req.user?.id === parseInt(idStr || '0', 10)) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    const existingResult = await db.query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await db.query(
      'UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['suspended', id]
    );

    await db.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, old_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id,
        'USER_SUSPENDED',
        'user',
        id,
        JSON.stringify({ email: existing.email }),
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      success: true,
      message: 'User suspended successfully'
    });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

export default router;
