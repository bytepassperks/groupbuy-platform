import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const response = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        const { accessToken } = response.data;
        
        Cookies.set('accessToken', accessToken, { expires: 1/96 });
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        
        return api(originalRequest);
      } catch (refreshError) {
        Cookies.remove('accessToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data: { email: string; password: string; name: string; phone?: string; country?: string }) =>
    api.post('/auth/register', data),
  
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  
  logout: () => api.post('/auth/logout'),
  
  getMe: () => api.get('/auth/me'),
  
  updateProfile: (data: { name?: string; phone?: string; country?: string; avatar_url?: string }) =>
    api.put('/auth/profile', data),
  
  updatePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/password', data),
};

export const productsApi = {
  getAll: (params?: { category?: string; search?: string; page?: number; limit?: number }) =>
    api.get('/products', { params }),
  
  getBySlug: (slug: string) => api.get(`/products/${slug}`),
  
  getCategories: () => api.get('/products/categories'),
};

export const purchasesApi = {
  getMyPurchases: () => api.get('/purchases/my-purchases'),
  
  getPurchase: (id: number) => api.get(`/purchases/my-purchases/${id}`),
  
  create: (data: { productId: number; paymentId?: string }) =>
    api.post('/purchases/create', data),
  
  toggleAutoRenew: (id: number, autoRenew: boolean) =>
    api.put(`/purchases/my-purchases/${id}/auto-renew`, { autoRenew }),
  
  regenerateCode: (id: number) =>
    api.post(`/purchases/my-purchases/${id}/regenerate-code`),
};

export const paymentsApi = {
  createCheckoutSession: (data: { productId: number; successUrl?: string; cancelUrl?: string }) =>
    api.post('/payments/create-checkout-session', data),
  
  createRazorpayOrder: (data: { productId: number }) =>
    api.post('/payments/create-razorpay-order', data),
  
  verifyRazorpay: (data: { orderId: string; paymentId: string; signature: string }) =>
    api.post('/payments/verify-razorpay', data),
  
  getHistory: () => api.get('/payments/history'),
};

export const adminApi = {
  getDashboard: () => api.get('/admin/analytics/dashboard'),
  
  getAccessLogs: (params?: { userId?: number; productId?: number; action?: string; page?: number; limit?: number }) =>
    api.get('/admin/analytics/access-logs', { params }),
  
  getAuditLogs: (params?: { adminId?: number; action?: string; resourceType?: string; page?: number; limit?: number }) =>
    api.get('/admin/analytics/audit-logs', { params }),
  
  getPurchases: (params?: { status?: string; productId?: number; userId?: number; page?: number; limit?: number }) =>
    api.get('/admin/analytics/purchases', { params }),
  
  products: {
    getAll: (params?: { status?: string; category?: string; search?: string; page?: number; limit?: number }) =>
      api.get('/admin/products', { params }),
    
    get: (id: number) => api.get(`/admin/products/${id}`),
    
    create: (data: {
      name: string;
      category: string;
      price: number;
      email: string;
      password: string;
      maxUsers?: number;
      loginUrl?: string;
      description?: string;
      iconUrl?: string;
      twoFaCodes?: string;
    }) => api.post('/admin/products/add', data),
    
    update: (id: number, data: Partial<{
      name: string;
      category: string;
      price: number;
      email: string;
      password: string;
      maxUsers: number;
      loginUrl: string;
      description: string;
      iconUrl: string;
      status: string;
      twoFaCodes: string;
    }>) => api.put(`/admin/products/${id}`, data),
    
    delete: (id: number) => api.delete(`/admin/products/${id}`),
    
    getCredentials: (id: number) => api.get(`/admin/products/${id}/credentials`),
  },
  
  users: {
    getAll: (params?: { status?: string; role?: string; search?: string; page?: number; limit?: number }) =>
      api.get('/admin/users', { params }),
    
    get: (id: number) => api.get(`/admin/users/${id}`),
    
    create: (data: { email: string; password: string; name: string; role?: string; phone?: string; country?: string }) =>
      api.post('/admin/users', data),
    
    update: (id: number, data: Partial<{ name: string; phone: string; country: string; role: string; status: string }>) =>
      api.put(`/admin/users/${id}`, data),
    
    delete: (id: number) => api.delete(`/admin/users/${id}`),
  },
};

export default api;
