'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import Button from '@/components/ui/Button';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { ArrowLeft, Save, Trash2, Eye, EyeOff, Plus, Users, RefreshCw } from 'lucide-react';

interface ProductAccount {
  id: number;
  account_name: string;
  account_email?: string;
  is_active: boolean;
  current_users: number;
  max_users_per_account: number;
  session_expires_at?: string;
  session_last_updated?: string;
}

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
    serviceUrl: '',
    description: '',
    iconUrl: '',
    status: 'active',
    sessionCookies: '',
    sessionExpiresAt: '',
    renewalPeriod: 'annual',
    blockedUrls: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [accounts, setAccounts] = useState<ProductAccount[]>([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountMaxUsers, setNewAccountMaxUsers] = useState('5');

  const productId = parseInt(params.id as string, 10);

  const { data: productData, isLoading } = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: () => adminApi.products.get(productId),
    enabled: !!productId && !authLoading && user?.role === 'admin',
  });

  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ['admin-product-session', productId],
    queryFn: () => adminApi.products.getSession(productId),
    enabled: showCredentials && !!productId,
  });

  const { data: accountsData, refetch: refetchAccounts } = useQuery({
    queryKey: ['admin-product-accounts', productId],
    queryFn: () => adminApi.products.getAccounts(productId),
    enabled: !!productId && !authLoading && user?.role === 'admin',
  });

  // Update accounts state when data changes
  useEffect(() => {
    if (accountsData?.data?.accounts) {
      setAccounts(accountsData.data.accounts);
    }
  }, [accountsData]);

  const addAccountMutation = useMutation({
    mutationFn: (data: { accountName?: string; maxUsersPerAccount?: number }) => 
      adminApi.products.addAccount(productId, data),
    onSuccess: () => {
      setSuccess('Account added successfully');
      setNewAccountName('');
      setNewAccountMaxUsers('5');
      refetchAccounts();
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to add account');
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: number) => adminApi.products.deleteAccount(productId, accountId),
    onSuccess: () => {
      setSuccess('Account deleted successfully');
      refetchAccounts();
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to delete account');
    },
  });

  const toggleAccountMutation = useMutation({
    mutationFn: ({ accountId, isActive }: { accountId: number; isActive: boolean }) => 
      adminApi.products.updateAccount(productId, accountId, { isActive }),
    onSuccess: () => {
      refetchAccounts();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to update account');
    },
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
        serviceUrl: p.service_url || '',
        description: p.description || '',
        iconUrl: p.icon_url || '',
        status: p.status || 'active',
        sessionCookies: '',
        sessionExpiresAt: p.session_expires_at ? new Date(p.session_expires_at).toISOString().slice(0, 16) : '',
        renewalPeriod: p.renewal_period || 'annual',
        blockedUrls: p.blocked_urls ? p.blocked_urls.join('\n') : '',
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
      serviceUrl: formData.serviceUrl,
      description: formData.description,
      iconUrl: formData.iconUrl,
      status: formData.status,
      renewalPeriod: formData.renewalPeriod,
      blockedUrls: formData.blockedUrls ? formData.blockedUrls.split('\n').map(u => u.trim()).filter(u => u) : [],
    };

    if (formData.sessionCookies) {
      try {
        updateData.sessionCookies = JSON.parse(formData.sessionCookies);
      } catch {
        setError('Invalid JSON format for session cookies');
        return;
      }
    }
    if (formData.sessionExpiresAt) {
      updateData.sessionExpiresAt = formData.sessionExpiresAt;
    }

    updateMutation.mutate(updateData);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  const handleShowSession = () => {
    setShowCredentials(true);
    refetchSession();
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
            <CardTitle>Blocked URLs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-medium mb-2">URL Blocking for Buyers</p>
              <p className="text-sm text-blue-700">
                Add URL patterns (one per line) to block buyers from accessing sensitive pages like settings, billing, or account pages. 
                The Chrome Launcher will automatically redirect users back to the main product page if they try to access these URLs.
              </p>
              <p className="text-sm text-blue-700 mt-2">
                <strong>Examples:</strong> /settings, /account, /billing, canva.com/brand-kit
              </p>
              <p className="text-sm text-blue-700 mt-1">
                <strong>Note:</strong> Common patterns like /settings, /account, /billing are already blocked by default. 
                Add product-specific patterns here for additional protection.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Blocked URL Patterns (one per line)</label>
              <textarea
                value={formData.blockedUrls}
                onChange={(e) => setFormData({ ...formData, blockedUrls: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="/brand-kit&#10;/teams&#10;/organization&#10;example.com/custom-settings"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Session Cookies (Encrypted)</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleShowSession}
              >
                {showCredentials ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showCredentials ? 'Hide' : 'Show'} Current
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {showCredentials && sessionData?.data && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                <p className="text-sm text-yellow-800 font-medium mb-2">Current Session Cookies:</p>
                <pre className="text-xs text-yellow-700 overflow-auto max-h-40">
                  {JSON.stringify(sessionData.data.sessionCookies, null, 2)}
                </pre>
                {sessionData.data.sessionExpiresAt && (
                  <p className="text-sm text-yellow-700 mt-2">
                    Expires: {new Date(sessionData.data.sessionExpiresAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-medium mb-2">How to capture session cookies:</p>
              <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
                <li>Log into the service in Chrome</li>
                <li>Open DevTools (F12) and go to Application tab</li>
                <li>Click on Cookies in the left sidebar</li>
                <li>Select the domain and copy all cookies as JSON</li>
              </ol>
            </div>

            <p className="text-sm text-gray-500">Leave blank to keep existing session. Fill in to update.</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Cookies (JSON format)</label>
              <textarea
                value={formData.sessionCookies}
                onChange={(e) => setFormData({ ...formData, sessionCookies: e.target.value })}
                rows={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder='[{"name": "session_id", "value": "abc123", "domain": ".example.com", "path": "/", "secure": true, "httpOnly": true}]'
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session Expires At</label>
                <Input
                  type="datetime-local"
                  value={formData.sessionExpiresAt}
                  onChange={(e) => setFormData({ ...formData, sessionExpiresAt: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Period</label>
                <select
                  value={formData.renewalPeriod}
                  onChange={(e) => setFormData({ ...formData, renewalPeriod: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Yearly</option>
                  <option value="lifetime">Lifetime</option>
                </select>
              </div>
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

      {/* Multi-Account Management Section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Multi-Account Rotation
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetchAccounts()}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 font-medium mb-2">How Multi-Account Rotation Works:</p>
            <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
              <li>Add multiple accounts for this product (e.g., Account 1, Account 2, etc.)</li>
              <li>Each account can have its own session cookies captured via the extension</li>
              <li>Users are automatically assigned to accounts in round-robin fashion</li>
              <li>User 1 gets Account 1, User 2 gets Account 2, and so on</li>
            </ul>
          </div>

          {/* Add New Account Form */}
          <div className="flex items-end gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
              <Input
                type="text"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="e.g., Account 1"
              />
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Users</label>
              <Input
                type="number"
                value={newAccountMaxUsers}
                onChange={(e) => setNewAccountMaxUsers(e.target.value)}
                min="1"
              />
            </div>
            <Button
              type="button"
              onClick={() => addAccountMutation.mutate({
                accountName: newAccountName || undefined,
                maxUsersPerAccount: parseInt(newAccountMaxUsers, 10) || 5
              })}
              disabled={addAccountMutation.isPending}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Account
            </Button>
          </div>

          {/* Accounts List */}
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No accounts configured yet.</p>
              <p className="text-sm">Add accounts above to enable multi-account rotation.</p>
              <p className="text-sm mt-2">Without accounts, the product will use the legacy single-session mode.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`p-4 border rounded-lg ${account.is_active ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">{account.account_name}</h4>
                        {!account.is_active && (
                          <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">Inactive</span>
                        )}
                        {account.session_last_updated && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                            Cookies Set
                          </span>
                        )}
                        {!account.session_last_updated && (
                          <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                            No Cookies
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-500 flex items-center gap-4">
                        <span>
                          Users: {account.current_users}/{account.max_users_per_account}
                        </span>
                        {account.session_expires_at && (
                          <span>
                            Expires: {new Date(account.session_expires_at).toLocaleDateString()}
                          </span>
                        )}
                        {account.session_last_updated && (
                          <span>
                            Updated: {new Date(account.session_last_updated).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAccountMutation.mutate({
                          accountId: account.id,
                          isActive: !account.is_active
                        })}
                      >
                        {account.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => {
                          if (window.confirm(`Delete ${account.account_name}? This cannot be undone.`)) {
                            deleteAccountMutation.mutate(account.id);
                          }
                        }}
                        disabled={account.current_users > 0}
                        title={account.current_users > 0 ? 'Cannot delete account with active users' : ''}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 font-medium">To capture cookies for each account:</p>
            <ol className="text-sm text-yellow-700 list-decimal list-inside mt-2 space-y-1">
              <li>Log into the service with the account credentials</li>
              <li>Open the GroupBuy extension (as admin)</li>
              <li>Go to the &quot;Capture Cookies&quot; tab</li>
              <li>Select this product and the specific account slot</li>
              <li>Click &quot;Capture &amp; Save Cookies&quot;</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
