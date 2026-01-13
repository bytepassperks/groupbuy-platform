'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { purchasesApi } from '@/lib/api';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Package, Calendar, Key, RefreshCw, ExternalLink, Download, Chrome, Puzzle, CheckCircle, ArrowRight, Copy, Shield } from 'lucide-react';

interface Purchase {
  id: number;
  purchaseDate: string;
  pricePaid: number;
  accessCode: string;
  startsAt: string;
  expiresAt: string;
  autoRenew: boolean;
  status: string;
  product: {
    id: number;
    name: string;
    slug: string;
    iconUrl?: string;
    category: string;
    loginUrl?: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [isHydrated, setIsHydrated] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showExtensionGuide, setShowExtensionGuide] = useState(true);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated && !authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isHydrated, authLoading, isAuthenticated, router]);

  const { data: purchasesData, isLoading, refetch } = useQuery({
    queryKey: ['my-purchases'],
    queryFn: () => purchasesApi.getMyPurchases(),
    enabled: isAuthenticated,
  });

  const purchases: Purchase[] = purchasesData?.data?.purchases || [];
  const activePurchases = purchases.filter((p) => p.status === 'active');
  const expiredPurchases = purchases.filter((p) => p.status !== 'active');

  if (!isHydrated || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

      const getDaysRemaining = (expiresAt: string) => {
        if (!expiresAt) return 0;
        const now = new Date();
        const expiry = new Date(expiresAt);
        const diff = expiry.getTime() - now.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
      };

    const copyToClipboard = (code: string) => {
      navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    };

    const extensionDownloadUrl = 'https://github.com/bytepassperks/groupbuy-platform/archive/refs/heads/devin/1768279360-groupbuy-platform.zip';

    return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome back, {user?.name}</h1>
        <p className="text-gray-600 mt-2">Manage your subscriptions and access your tools.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Active Subscriptions</p>
                <p className="text-2xl font-bold text-gray-900">{activePurchases.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Key className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Access Codes</p>
                <p className="text-2xl font-bold text-gray-900">{activePurchases.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Expiring Soon</p>
                <p className="text-2xl font-bold text-gray-900">
                  {activePurchases.filter((p) => getDaysRemaining(p.expiresAt) <= 30).length}
                </p>
              </div>
            </div>
          </CardContent>
              </Card>
            </div>

            {activePurchases.length > 0 && showExtensionGuide && (
              <Card className="mb-8 border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Puzzle className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">Get Started with Auto-Login</h2>
                        <p className="text-sm text-gray-600">Install our browser extension for seamless access</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowExtensionGuide(false)}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      Dismiss
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="relative">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                          1
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 mb-2">Download Extension</h3>
                          <p className="text-sm text-gray-600 mb-3">Get the GroupBuy browser extension for Chrome</p>
                          <a 
                            href={extensionDownloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download ZIP
                          </a>
                        </div>
                      </div>
                      <div className="hidden lg:block absolute top-4 -right-3 text-gray-300">
                        <ArrowRight className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="relative">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                          2
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 mb-2">Install in Chrome</h3>
                          <p className="text-sm text-gray-600 mb-2">Follow these steps:</p>
                          <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                            <li>Extract the ZIP file</li>
                            <li>Open <code className="bg-gray-200 px-1 rounded">chrome://extensions</code></li>
                            <li>Enable &quot;Developer mode&quot;</li>
                            <li>Click &quot;Load unpacked&quot;</li>
                            <li>Select the <code className="bg-gray-200 px-1 rounded">extension/dist</code> folder</li>
                          </ol>
                        </div>
                      </div>
                      <div className="hidden lg:block absolute top-4 -right-3 text-gray-300">
                        <ArrowRight className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="relative">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                          3
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 mb-2">Enter Access Code</h3>
                          <p className="text-sm text-gray-600 mb-3">Click the extension icon and enter your access code</p>
                          <div className="space-y-2">
                            {activePurchases.slice(0, 2).map((purchase) => (
                              <div key={purchase.id} className="flex items-center space-x-2">
                                <code className="text-xs font-mono bg-white px-2 py-1 rounded border flex-1 truncate">
                                  {purchase.accessCode}
                                </code>
                                <button
                                  onClick={() => copyToClipboard(purchase.accessCode)}
                                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                                  title="Copy access code"
                                >
                                  {copiedCode === purchase.accessCode ? (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-gray-500" />
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="hidden lg:block absolute top-4 -right-3 text-gray-300">
                        <ArrowRight className="w-6 h-6" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                          <CheckCircle className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 mb-2">Auto-Login Ready!</h3>
                          <p className="text-sm text-gray-600 mb-3">Visit any supported product login page and credentials will auto-fill</p>
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            <Shield className="w-4 h-4 text-green-600" />
                            <span>Credentials are encrypted & never stored</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <Chrome className="w-4 h-4" />
                          <span>Chrome Compatible</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Shield className="w-4 h-4 text-green-600" />
                          <span>RSA Encrypted</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Key className="w-4 h-4 text-blue-600" />
                          <span>One-Time Tokens</span>
                        </div>
                      </div>
                      <a 
                        href="https://github.com/bytepassperks/groupbuy-platform#browser-extension"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View Documentation →
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">Active Subscriptions</h2>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center p-4 border rounded-lg">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                  <div className="ml-4 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : activePurchases.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No active subscriptions yet</p>
              <Button onClick={() => router.push('/products')}>Browse Products</Button>
            </div>
          ) : (
            <div className="space-y-4">
                            {activePurchases.map((purchase) => {
                              const daysRemaining = getDaysRemaining(purchase.expiresAt);
                              return (
                                <div key={purchase.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                                  <div className="flex items-center">
                                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                      {purchase.product?.iconUrl ? (
                                        <img src={purchase.product.iconUrl} alt="" className="w-8 h-8 object-contain" />
                                      ) : (
                                        <Package className="w-6 h-6 text-blue-600" />
                                      )}
                                    </div>
                                    <div className="ml-4">
                                      <h3 className="font-semibold text-gray-900">{purchase.product?.name || 'Unknown Product'}</h3>
                                      <p className="text-sm text-gray-500">
                                        Expires: {purchase.expiresAt ? formatDate(purchase.expiresAt) : 'N/A'}
                                        {daysRemaining > 0 && daysRemaining <= 30 && (
                                          <span className={`ml-2 ${daysRemaining <= 7 ? 'text-red-600' : 'text-yellow-600'}`}>
                                            ({daysRemaining} days left)
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                                                    <div className="flex items-center space-x-4">
                                                                      <div className="text-right">
                                                                        <p className="text-xs text-gray-500">Access Code</p>
                                                                        <div className="flex items-center space-x-1">
                                                                          <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{purchase.accessCode}</code>
                                                                          <button
                                                                            onClick={() => copyToClipboard(purchase.accessCode)}
                                                                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                                                                            title="Copy access code"
                                                                          >
                                                                            {copiedCode === purchase.accessCode ? (
                                                                              <CheckCircle className="w-4 h-4 text-green-600" />
                                                                            ) : (
                                                                              <Copy className="w-4 h-4 text-gray-400" />
                                                                            )}
                                                                          </button>
                                                                        </div>
                                                                      </div>
                                                                      <Button 
                                                                        variant="outline" 
                                                                        size="sm"
                                                                        onClick={() => {
                                                                          if (purchase.product?.loginUrl) {
                                                                            window.open(purchase.product.loginUrl, '_blank');
                                                                          } else {
                                                                            alert('Login URL not configured for this product. Please contact support.');
                                                                          }
                                                                        }}
                                                                        title="Open product login page"
                                                                      >
                                                                        <ExternalLink className="w-4 h-4" />
                                                                      </Button>
                                                                    </div>
                                </div>
                              );
                            })}
            </div>
          )}
        </CardContent>
      </Card>

      {expiredPurchases.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Expired Subscriptions</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
                            {expiredPurchases.map((purchase) => (
                              <div key={purchase.id} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50 opacity-75">
                                <div className="flex items-center">
                                  <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                                    <Package className="w-6 h-6 text-gray-400" />
                                  </div>
                                  <div className="ml-4">
                                    <h3 className="font-semibold text-gray-700">{purchase.product?.name || 'Unknown Product'}</h3>
                                    <p className="text-sm text-gray-500">Expired: {purchase.expiresAt ? formatDate(purchase.expiresAt) : 'N/A'}</p>
                                  </div>
                                </div>
                                <Button size="sm">Renew</Button>
                              </div>
                            ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
