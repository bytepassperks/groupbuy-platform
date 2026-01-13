'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { adminApi } from '@/lib/api';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function AddProductPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    email: '',
    password: '',
    maxUsers: '5',
    loginUrl: '',
    description: '',
    iconUrl: '',
    twoFaCodes: '',
  });

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== 'admin')) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, user, router]);

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => adminApi.products.create({
      name: data.name,
      category: data.category,
      price: parseFloat(data.price),
      email: data.email,
      password: data.password,
      maxUsers: parseInt(data.maxUsers),
      loginUrl: data.loginUrl || undefined,
      description: data.description || undefined,
      iconUrl: data.iconUrl || undefined,
      twoFaCodes: data.twoFaCodes || undefined,
    }),
    onSuccess: () => {
      router.push('/admin/products');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to create product');
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name || !formData.category || !formData.price || !formData.email || !formData.password) {
      setError('Please fill in all required fields');
      return;
    }

    createMutation.mutate(formData);
  };

  if (authLoading || !isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const categories = ['SEO Tools', 'Design Tools', 'Marketing', 'Development', 'Streaming', 'Productivity', 'Other'];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <Link href="/admin/products" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Products
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Add New Product</h1>
        <p className="text-gray-600 mt-2">Add a new product with encrypted credentials.</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Product Details</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                id="name"
                name="name"
                label="Product Name *"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Semrush Pro"
                required
              />

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <Input
                id="price"
                name="price"
                label="Price (USD) *"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={handleChange}
                placeholder="99.99"
                required
              />

              <Input
                id="maxUsers"
                name="maxUsers"
                label="Max Concurrent Users"
                type="number"
                min="1"
                value={formData.maxUsers}
                onChange={handleChange}
              />
            </div>

            <div className="border-t pt-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Account Credentials</h3>
              <p className="text-sm text-gray-500 mb-4">
                These credentials will be encrypted with AES-256 and stored securely.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  id="email"
                  name="email"
                  label="Account Email *"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="account@example.com"
                  required
                />

                <Input
                  id="password"
                  name="password"
                  label="Account Password *"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter account password"
                  required
                />
              </div>

              <div className="mt-4">
                <label htmlFor="twoFaCodes" className="block text-sm font-medium text-gray-700 mb-1">
                  2FA Backup Codes (optional)
                </label>
                <textarea
                  id="twoFaCodes"
                  name="twoFaCodes"
                  value={formData.twoFaCodes}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter backup codes, one per line"
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Additional Information</h3>

              <div className="space-y-4">
                <Input
                  id="loginUrl"
                  name="loginUrl"
                  label="Login URL"
                  type="url"
                  value={formData.loginUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/login"
                />

                <Input
                  id="iconUrl"
                  name="iconUrl"
                  label="Icon URL"
                  type="url"
                  value={formData.iconUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/icon.png"
                />

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Brief description of the product"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 pt-4">
              <Link href="/admin/products">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" isLoading={createMutation.isPending}>
                Create Product
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
