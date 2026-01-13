# GroupBuy Platform

A complete Group Buy SaaS Platform that allows admins to add products with encrypted credentials, customers to purchase products with unique access codes, and a browser extension to auto-login users to shared accounts without ever showing credentials.

## Features

- **Secure Credential Storage**: AES-256 encryption for all credentials with random IVs
- **JWT Authentication**: Access tokens (15 min) + refresh tokens (7 days)
- **Browser Extension**: Auto-login to supported services without exposing credentials
- **Payment Integration**: Stripe and Razorpay support
- **Admin Panel**: Manage products, users, and view analytics
- **Customer Dashboard**: View subscriptions and access codes
- **Concurrent User Limits**: Enforce maximum concurrent users per product
- **Comprehensive Audit Logging**: Track all admin actions and user access

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, PostgreSQL
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Browser Extension**: Chrome Manifest V3
- **Deployment**: Docker, Docker Compose, Nginx

## Project Structure

```
groupbuy-platform/
├── backend/           # Express API server
├── frontend/          # Next.js frontend
├── extension/         # Browser extension
├── nginx/             # Nginx configuration
├── docker-compose.yml # Docker orchestration
└── .env.example       # Environment variables template
```

## Deployment to DigitalOcean Droplet

### Prerequisites

- DigitalOcean account
- Domain name (optional, but recommended for SSL)
- GitHub account

### Step 1: Create a DigitalOcean Droplet

1. Log in to DigitalOcean
2. Create a new Droplet:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic - $6/month (1 GB RAM, 1 vCPU, 25 GB SSD) - cheapest option
   - **Region**: Choose closest to your users
   - **Authentication**: SSH keys (recommended)

### Step 2: Initial Server Setup

SSH into your droplet:

```bash
ssh root@your-droplet-ip
```

Update the system and install Docker:

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose git
systemctl enable docker
systemctl start docker
```

### Step 3: Clone the Repository

```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/groupbuy-platform.git
cd groupbuy-platform
```

### Step 4: Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Update the following variables:

```env
# Generate secure values
POSTGRES_PASSWORD=your-secure-db-password
JWT_SECRET=your-super-secret-jwt-key
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
ACCESS_CODE_SALT=$(openssl rand -hex 16)

# Set your domain
FRONTEND_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com/api

# Payment keys (optional)
STRIPE_SECRET_KEY=sk_live_...
RAZORPAY_KEY_ID=rzp_live_...
```

### Step 5: Deploy with Docker Compose

```bash
docker-compose up -d --build
```

This will start:
- PostgreSQL database
- Backend API server
- Frontend Next.js server
- Nginx reverse proxy

### Step 6: Set Up SSL (Optional but Recommended)

Install Certbot:

```bash
apt install -y certbot
certbot certonly --standalone -d your-domain.com
```

Update nginx configuration to use SSL certificates.

### Step 7: Verify Deployment

- Frontend: http://your-droplet-ip (or https://your-domain.com)
- API: http://your-droplet-ip/api (or https://your-domain.com/api)

### Step 8: Create Admin User

Connect to the database and create an admin user:

```bash
docker exec -it groupbuy-db psql -U postgres -d groupbuy
```

```sql
UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
```

## Local Development

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Update .env with your local database URL
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Browser Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` folder

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - List all products
- `GET /api/products/:slug` - Get product by slug

### Purchases
- `GET /api/purchases/my-purchases` - Get user's purchases
- `POST /api/purchases/create` - Create purchase

### Payments
- `POST /api/payments/create-checkout-session` - Create Stripe session
- `POST /api/payments/create-razorpay-order` - Create Razorpay order
- `POST /api/payments/verify-razorpay` - Verify Razorpay payment

### Extension API
- `POST /api/extension/verify-code` - Verify access code
- `POST /api/extension/get-credentials` - Get credentials for auto-login
- `POST /api/extension/log-access` - Log access attempt

### Admin
- `GET /api/admin/products` - List products (admin)
- `POST /api/admin/products/add` - Add product
- `PUT /api/admin/products/:id` - Update product
- `DELETE /api/admin/products/:id` - Delete product
- `GET /api/admin/users` - List users
- `GET /api/admin/analytics/dashboard` - Dashboard stats

## Security Features

- AES-256-CBC encryption with random IVs for credentials
- bcrypt password hashing (12 rounds)
- JWT with short-lived access tokens
- HTTP-only cookies for refresh tokens
- Rate limiting on all endpoints
- CORS configuration
- Helmet security headers
- Parameterized SQL queries (SQL injection prevention)
- Device fingerprinting for session tracking

## License

MIT
