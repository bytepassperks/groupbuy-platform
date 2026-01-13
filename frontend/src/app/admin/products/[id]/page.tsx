'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import Button from '@/components/ui/Button';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { ArrowLeft, Save, Trash2, Eye, EyeOff } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon_url?: string;
  description?: string;
  price: string;
  renewal_period: string;
  max_concurrent_users: number;
  login_url?: string;
  status: string;
}

export default function AdminProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuthStore();
  const [showCredentials, setShowCredentials] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    maxUsers: '',
    loginUrl: '',
    description: '',
    iconUrl: '',
    status: 'active',
    email: '',
    password: '',
    twoFaCodes: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const productId = parseInt(params.id as string, 10);

  const { data: productData, isLoading } = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: () => adminApi.products.get(productId),
    enabled: !!productId && !authLoading && user?.role === 'admin',
  });

  const { data: credentialsData, refetch: refetchCredentials } = useQuery({
    queryKey: ['admin-product-credentials', productId],
    queryFn: () => adminApi.products.getCredentials(productId),
    enabled: showCredentials && !!productId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => adminApi.products.update(productId, data),
    onSuccess: () => {
      setSuccess('Product updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to update product');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.products.delete(productId),
    onSuccess: () => {
      router.push('/admin/products');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to delete product');
    },
  });

  useEffect(() => {
    if (productData?.data?.product) {
      const p = productData.data.product;
      setFormData({
        name: p.name || '',
        category: p.category || '',
        price: p.price?.toString() || '',
        maxUsers: p.max_concurrent_users?.toString() || '',
        loginUrl: p.login_url || '',
        description: p.description || '',
        iconUrl: p.icon_url || '',
        status: p.status || 'active',
        email: '',
        password: '',
        twoFaCodes: '',
      });
    }
  }, [productData]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated && !authLoading && (!user || user.role !== 'admin')) {
      router.push('/login');
    }
  }, [isHydrated, user, authLoading, router]);

  if (!isHydrated || authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  const product: Product | undefined = productData?.data?.product;

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-gray-500">Product not found</p>
            <Button onClick={() => router.push('/admin/products')} className="mt-4">
              Back to Products
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const updateData: any = {
      name: formData.name,
      category: formData.category,
      price: parseFloat(formData.price),
      maxUsers: parseInt(formData.maxUsers, 10),
      loginUrl: formData.loginUrl,
      description: formData.description,
      iconUrl: formData.iconUrl,
      status: formData.status,
    };

    if (formData.email) {
      updateData.email = formData.email;
    }
    if (formData.password) {
      updateData.password = formData.password;
    }
    if (formData.twoFaCodes) {
      updateData.twoFaCodes = formData.twoFaCodes;
    }

    updateMutation.mutate(updateData);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  const handleShowCredentials = () => {
    setShowCredentials(true);
    refetchCredentials();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <button
          onClick={() => router.push('/admin/products')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Products
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Edit Product</h1>
          <Button variant="outline" onClick={handleDelete} className="text-red-600 border-red-600 hover:bg-red-50">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Product Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Category</option>
                  <option value="seo">SEO Tools</option>
                  <option value="design">Design Tools</option>
                  <option value="writing">Writing Tools</option>
                  <option value="marketing">Marketing</option>
                  <option value="development">Development</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Concurrent Users</label>
                <Input
                  type="number"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData({ ...formData, maxUsers: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Login URL</label>
              <Input
                type="url"
                value={formData.loginUrl}
                onChange={(e) => setFormData({ ...formData, loginUrl: e.target.value })}
                placeholder="https://example.com/login"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Icon URL</label>
              <Input
                type="url"
                value={formData.iconUrl}
                onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value })}
                placeholder="https://example.com/icon.png"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Credentials (Encrypted)</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleShowCredentials}
              >
                {showCredentials ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showCredentials ? 'Hide' : 'Show'} Current
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {showCredentials && credentialsData?.data && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                <p className="text-sm text-yellow-800 font-medium mb-2">Current Credentials:</p>
                <p className="text-sm text-yellow-700">Email: {credentialsData.data.email}</p>
                <p className="text-sm text-yellow-700">Password: {credentialsData.data.password}</p>
                {credentialsData.data.twoFaCodes && (
                  <p className="text-sm text-yellow-700">2FA Codes: {credentialsData.data.twoFaCodes}</p>
                )}
              </div>
            )}

            <p className="text-sm text-gray-500">Leave blank to keep existing credentials. Fill in to update.</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (leave blank to keep current)</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="account@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password (leave blank to keep current)</label>
              <Input
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter new password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">2FA Backup Codes (leave blank to keep current)</label>
              <textarea
                value={formData.twoFaCodes}
                onChange={(e) => setFormData({ ...formData, twoFaCodes: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter backup codes, one per line"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
