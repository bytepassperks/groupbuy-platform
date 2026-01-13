import { Request } from 'express';

export interface User {
  id: number;
  email: string;
  username: string | null;
  password_hash: string;
  name: string;
  avatar_url: string | null;
  phone: string | null;
  country: string | null;
  role: 'customer' | 'admin';
  status: 'active' | 'inactive' | 'suspended';
  created_at: Date;
  updated_at: Date;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon_url: string | null;
  description: string | null;
  encrypted_email: string;
  encrypted_password: string;
  encrypted_2fa_codes: string | null;
  encryption_key_version: number;
  price: number;
  renewal_period: string;
  max_concurrent_users: number;
  current_concurrent_users: number;
  login_url: string | null;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}

export interface Purchase {
  id: number;
  user_id: number;
  product_id: number;
  purchase_date: Date;
  price_paid: number;
  payment_id: string | null;
  payment_status: string | null;
  access_code: string;
  access_code_hash: string | null;
  starts_at: Date;
  expires_at: Date;
  auto_renew: boolean;
  status: 'active' | 'expired' | 'cancelled';
  created_at: Date;
  updated_at: Date;
}

export interface AccessLog {
  id: number;
  user_id: number;
  product_id: number;
  purchase_id: number | null;
  action: string;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  device_fingerprint: string | null;
  login_time: Date | null;
  logout_time: Date | null;
  duration_seconds: number | null;
  status: string | null;
  error_message: string | null;
  created_at: Date;
}

export interface SessionToken {
  id: number;
  user_id: number;
  purchase_id: number;
  product_id: number | null;
  token: string;
  token_hash: string | null;
  device_fingerprint: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  expires_at: Date;
  last_used_at: Date | null;
}

export interface Payment {
  id: number;
  user_id: number | null;
  purchase_id: number | null;
  product_id: number | null;
  amount: number;
  currency: string;
  payment_method: string | null;
  payment_gateway_id: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  receipt_url: string | null;
  invoice_number: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: number;
  admin_id: number | null;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  old_value: string | null;
  new_value: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: 'customer' | 'admin';
  };
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: 'customer' | 'admin';
}

export interface RefreshTokenPayload {
  userId: number;
  tokenId: string;
}
