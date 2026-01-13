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
  const [isHydrated, setIsHydrated] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    maxUsers: '5',
    serviceUrl: '',
    loginUrl: '',
    description: '',
    iconUrl: '',
    sessionCookies: '',
    sessionExpiresAt: '',
    renewalPeriod: 'month',
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated && !authLoading && (!isAuthenticated || user?.role !== 'admin')) {
      router.push('/login');
    }
  }, [isHydrated, authLoading, isAuthenticated, user, router]);

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => {
      // Parse session cookies from JSON string
      let parsedCookies = null;
      if (data.sessionCookies) {
        try {
          parsedCookies = JSON.parse(data.sessionCookies);
        } catch (e) {
          throw new Error('Invalid JSON format for session cookies');
        }
      }
      
      return adminApi.products.create({
        name: data.name,
        category: data.category,
        price: parseFloat(data.price),
        maxUsers: parseInt(data.maxUsers),
        serviceUrl: data.serviceUrl || undefined,
        loginUrl: data.loginUrl || undefined,
        description: data.description || undefined,
        iconUrl: data.iconUrl || undefined,
        sessionCookies: parsedCookies,
        sessionExpiresAt: data.sessionExpiresAt || undefined,
        renewalPeriod: data.renewalPeriod || 'month',
      });
    },
    onSuccess: () => {
      router.push('/admin/products');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || err.message || 'Failed to create product');
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name || !formData.category || !formData.price) {
      setError('Please fill in all required fields (name, category, price)');
      return;
    }

    // Validate session cookies JSON if provided
    if (formData.sessionCookies) {
      try {
        JSON.parse(formData.sessionCookies);
      } catch (e) {
        setError('Session cookies must be valid JSON format');
        return;
      }
    }

    createMutation.mutate(formData);
  };

  if (!isHydrated || authLoading || !isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const categories= ['SEO Tools', 'Design Tools', 'Marketing', 'Development', 'Streaming', 'Productivity', 'Other'];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <Link href="/admin/products" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Products
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Add New Product</h1>
        <p className="text-gray-600 mt-2">Add a new product with session-based authentication.</p>
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
              <h3 className="text-md font-semibold text-gray-900 mb-4">Service URLs</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure the URLs for this product. The service URL is where users will be redirected after session injection.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  id="serviceUrl"
                  name="serviceUrl"
                  label="Service URL (main app URL)"
                  type="url"
                  value={formData.serviceUrl}
                  onChange={handleChange}
                  placeholder="https://app.example.com/dashboard"
                />

                <Input
                  id="loginUrl"
                  name="loginUrl"
                  label="Login URL (optional)"
                  type="url"
                  value={formData.loginUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/login"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div>
                  <label htmlFor="renewalPeriod" className="block text-sm font-medium text-gray-700 mb-1">
                    Renewal Period
                  </label>
                  <select
                    id="renewalPeriod"
                    name="renewalPeriod"
                    value={formData.renewalPeriod}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Session Cookies (for auto-login)</h3>
              <p className="text-sm text-gray-500 mb-4">
                Paste the session cookies from the logged-in browser session. The extension will inject these cookies to automatically log users in.
              </p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="sessionCookies" className="block text-sm font-medium text-gray-700 mb-1">
                    Session Cookies (JSON format)
                  </label>
                  <textarea
                    id="sessionCookies"
                    name="sessionCookies"
                    value={formData.sessionCookies}
                    onChange={handleChange}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder='[{"name": "session_id", "value": "abc123", "domain": ".example.com", "path": "/"}]'
                  />
                </div>

                <Input
                  id="sessionExpiresAt"
                  name="sessionExpiresAt"
                  label="Session Expires At (optional)"
                  type="datetime-local"
                  value={formData.sessionExpiresAt}
                  onChange={handleChange}
                />

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                  <strong>How to capture session cookies:</strong>
                  <ol className="list-decimal ml-4 mt-2 space-y-1">
                    <li>Log into the service in Chrome</li>
                    <li>Open DevTools (F12) and go to Application tab</li>
                    <li>Click on Cookies in the left sidebar</li>
                    <li>Select the domain and copy all relevant cookies</li>
                    <li>Format as JSON array with name, value, domain, and path for each cookie</li>
                  </ol>
                  <p className="mt-2">Example format:</p>
                  <code className="block bg-blue-100 p-2 rounded mt-1 text-xs overflow-x-auto">
                    {`[{"name": "session", "value": "xyz", "domain": ".site.com", "path": "/"}]`}
                  </code>
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Additional Information</h3>

              <div className="space-y-4">

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
