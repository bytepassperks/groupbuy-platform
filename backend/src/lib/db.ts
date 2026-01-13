import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const db = {
  query: async <T extends Record<string, any> = any>(text: string, params?: any[]): Promise<QueryResult<T>> => {
    return pool.query<T>(text, params);
  },
  
  getClient: () => pool.connect(),
  
  end: () => pool.end(),
};

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100) UNIQUE,
        password_hash VARCHAR(500) NOT NULL,
        name VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(500),
        phone VARCHAR(20),
        country VARCHAR(100),
        role VARCHAR(50) DEFAULT 'customer',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        category VARCHAR(100) NOT NULL,
        icon_url VARCHAR(500),
        description TEXT,
        encrypted_email VARCHAR(500) NOT NULL,
        encrypted_password VARCHAR(500) NOT NULL,
        encrypted_2fa_codes VARCHAR(2000),
        encryption_key_version INTEGER DEFAULT 1,
        price DECIMAL(10,2) NOT NULL,
        renewal_period VARCHAR(50) DEFAULT 'annual',
        max_concurrent_users INTEGER DEFAULT 5,
        current_concurrent_users INTEGER DEFAULT 0,
        login_url VARCHAR(500),
        login_domain VARCHAR(255),
        email_selector VARCHAR(500),
        password_selector VARCHAR(500),
        submit_selector VARCHAR(500),
        login_page_indicator VARCHAR(500),
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
      CREATE INDEX IF NOT EXISTS idx_products_domain ON products(login_domain);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        price_paid DECIMAL(10,2) NOT NULL,
        payment_id VARCHAR(255),
        payment_status VARCHAR(50),
        access_code VARCHAR(50) UNIQUE NOT NULL,
        access_code_hash VARCHAR(500),
        starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        auto_renew BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_product ON purchases(product_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
      CREATE INDEX IF NOT EXISTS idx_purchases_access_code ON purchases(access_code_hash);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS access_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        purchase_id INTEGER REFERENCES purchases(id),
        action VARCHAR(50),
        device_type VARCHAR(50),
        browser VARCHAR(100),
        os VARCHAR(100),
        ip_address VARCHAR(50),
        device_fingerprint VARCHAR(500),
        login_time TIMESTAMP,
        logout_time TIMESTAMP,
        duration_seconds INTEGER,
        status VARCHAR(50),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_access_logs_user ON access_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS session_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        token VARCHAR(500) UNIQUE NOT NULL,
        token_hash VARCHAR(500),
        device_fingerprint VARCHAR(500),
        ip_address VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        last_used_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_session_tokens_user ON session_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_session_tokens_token ON session_tokens(token_hash);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        purchase_id INTEGER REFERENCES purchases(id),
        product_id INTEGER REFERENCES products(id),
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'INR',
        payment_method VARCHAR(50),
        payment_gateway_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        receipt_url VARCHAR(500),
        invoice_number VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id),
        action VARCHAR(100),
        resource_type VARCHAR(50),
        resource_id INTEGER,
        old_value TEXT,
        new_value TEXT,
        ip_address VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(500) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

export default db;
