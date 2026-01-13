import express, { Response } from 'express';
import { db } from '../lib/db';
import { AuthenticatedRequest, Product } from '../types';
import { optionalAuth } from '../middleware/auth';

const router = express.Router();

router.get('/', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, search, page = '1', limit = '20' } = req.query;
    
    let query = `
      SELECT id, name, slug, category, icon_url, description, price, renewal_period,
             max_concurrent_users, login_url, status
      FROM products
      WHERE status = 'active'
    `;
    const params: any[] = [];
    let paramIndex = 1;

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

    query += ` ORDER BY name ASC`;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await db.query(query, params);

    const countQuery = `SELECT COUNT(*) as total FROM products WHERE status = 'active'`;
    const countResult = await db.query(countQuery);

    res.json({
      products: result.rows.map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        iconUrl: p.icon_url,
        description: p.description,
        price: parseFloat(p.price),
        renewalPeriod: p.renewal_period,
        maxConcurrentUsers: p.max_concurrent_users,
        loginUrl: p.login_url,
      })),
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

router.get('/categories', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT category, COUNT(*) as count
       FROM products
       WHERE status = 'active'
       GROUP BY category
       ORDER BY category`
    );

    const categories = [
      { value: 'seo', label: 'SEO Tools', icon: 'search' },
      { value: 'design', label: 'Design Tools', icon: 'palette' },
      { value: 'writing', label: 'Writing Tools', icon: 'edit' },
      { value: 'marketing', label: 'Marketing', icon: 'trending-up' },
      { value: 'development', label: 'Development', icon: 'code' },
    ];

    const categoriesWithCount = categories.map(cat => {
      const found = result.rows.find((r: any) => r.category === cat.value);
      return {
        ...cat,
        count: found ? parseInt(found.count, 10) : 0,
      };
    });

    res.json({ categories: categoriesWithCount });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.get('/:slug', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { slug } = req.params;

  try {
    const result = await db.query<Product>(
      `SELECT id, name, slug, category, icon_url, description, price, renewal_period,
              max_concurrent_users, login_url, status
       FROM products WHERE slug = $1 AND status = 'active'`,
      [slug]
    );

    const product = result.rows[0];
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    let userHasPurchased = false;
    if (req.user) {
      const purchaseResult = await db.query(
        `SELECT id FROM purchases 
         WHERE user_id = $1 AND product_id = $2 AND status = 'active' AND expires_at > NOW()`,
        [req.user.id, product.id]
      );
      userHasPurchased = purchaseResult.rows.length > 0;
    }

    res.json({
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        iconUrl: product.icon_url,
        description: product.description,
        price: parseFloat(product.price as unknown as string),
        renewalPeriod: product.renewal_period,
        maxConcurrentUsers: product.max_concurrent_users,
        loginUrl: product.login_url,
      },
      userHasPurchased,
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

export default router;
